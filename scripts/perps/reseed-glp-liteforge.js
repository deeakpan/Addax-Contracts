/**
 * 1) Pull GLP liquidity (handler + removeLiquidityForAccount)
 * 2) Fix Vault aUSDC decimals (18 -> 6)
 * 3) Re-deposit default seed amounts
 *
 * Usage (from contracts/):
 *   npm run perps:reseed-glp
 *
 * Phases: PERPS_RESEED_PHASE=pull|fix|seed|all (default all)
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const litvm = require("../../perps/addax/config/litvm");

const { ethers } = hre;

const deploymentsPath = path.join(__dirname, "../../deployments/liteforge-perps.json");

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];

function parseHuman(amountStr, decimals) {
  return ethers.utils.parseUnits(String(amountStr), decimals);
}

async function loadDeployed() {
  if (!fs.existsSync(deploymentsPath)) {
    throw new Error("Missing deployments/liteforge-perps.json");
  }
  return JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
}

async function ensureHandler(glpManager, handler) {
  if (await glpManager.isHandler(handler)) return;
  const gov = await glpManager.gov();
  if (gov.toLowerCase() !== handler.toLowerCase()) {
    throw new Error(`Not GlpManager gov (gov=${gov})`);
  }
  const tx = await glpManager.setHandler(handler, true);
  await tx.wait();
  console.log("ok: setHandler");
}

async function ensureGov(contract, signer, label) {
  const gov = await contract.gov();
  if (gov.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`Not ${label} gov (gov=${gov})`);
  }
}

async function maxGlpBurnForToken(glpManager, vault, glp, token, glpBalance) {
  const aum = await glpManager.getAumInUsdg(false);
  const supply = await glp.totalSupply();
  if (supply.isZero() || aum.isZero() || glpBalance.isZero()) {
    return ethers.BigNumber.from(0);
  }
  const collateralUsd = await vault.getRedemptionCollateralUsd(token);
  if (collateralUsd.isZero()) {
    return ethers.BigNumber.from(0);
  }
  let burn = glpBalance.mul(collateralUsd).div(aum);
  if (burn.gt(glpBalance)) burn = glpBalance;
  return burn;
}

async function pullLiquidity(deployed, signer) {
  const glpManager = await ethers.getContractAt(
    "GlpManager",
    deployed.contracts.GlpManager,
  );
  const glp = await ethers.getContractAt("GLP", deployed.contracts.GLP);
  const vault = await ethers.getContractAt("Vault", deployed.contracts.Vault);

  const tokens = [
    { token: deployed.tokens.aUSDC, label: "aUSDC" },
    { token: deployed.tokens.fnUSD, label: "fnUSD" },
    { token: deployed.tokens.wzkLTC, label: "wzkLTC" },
  ];
  const recipient = signer.address;

  await ensureGov(glpManager, signer, "GlpManager");
  await ensureHandler(glpManager, signer.address);

  const cooldown = await glpManager.cooldownDuration();
  if (!cooldown.isZero()) {
    const tx = await glpManager.setCooldownDuration(0);
    await tx.wait();
    console.log("ok: setCooldownDuration(0)");
  }

  let remaining = await glp.balanceOf(recipient);
  if (remaining.isZero()) {
    console.log("No GLP to remove — skip pull");
    return;
  }

  console.log("GLP to burn:", ethers.utils.formatEther(remaining));

  for (let round = 0; round < 12 && !remaining.isZero(); round++) {
    let progressed = false;
    for (const { token, label } of tokens) {
      remaining = await glp.balanceOf(recipient);
      if (remaining.isZero()) break;

      const burn = await maxGlpBurnForToken(
        glpManager,
        vault,
        glp,
        token,
        remaining,
      );
      if (burn.isZero()) continue;

      const poolBefore = await vault.poolAmounts(token);
      const tx = await glpManager.removeLiquidityForAccount(
        recipient,
        token,
        burn,
        0,
        recipient,
      );
      const receipt = await tx.wait();
      progressed = true;
      console.log(
        `ok: removeLiquidity ${label}`,
        ethers.utils.formatEther(burn),
        "GLP",
        `(block ${receipt.blockNumber}, pool before ${poolBefore.toString()})`,
      );
    }
    if (!progressed) {
      throw new Error("Could not remove more GLP — check vault pool / AUM");
    }
    remaining = await glp.balanceOf(recipient);
  }

  remaining = await glp.balanceOf(recipient);
  if (!remaining.isZero()) {
    console.warn("Warning: GLP remaining after pull:", ethers.utils.formatEther(remaining));
  }

  const supplyAfter = await glp.totalSupply();
  console.log("GLP supply after pull:", ethers.utils.formatEther(supplyAfter));
}

async function fixVaultDecimals(deployed, signer) {
  const vault = await ethers.getContractAt("Vault", deployed.contracts.Vault);
  await ensureGov(vault, signer, "Vault");

  const aUSDC = deployed.tokens.aUSDC;
  const onChain = await vault.tokenDecimals(aUSDC);
  console.log("Vault aUSDC decimals (before):", onChain.toString());

  if (onChain.eq(6)) {
    console.log("aUSDC already 6 decimals on Vault — skip fix");
    return;
  }

  const weight = await vault.tokenWeights(aUSDC);
  const minProfit = await vault.minProfitBasisPoints(aUSDC);
  const maxUsdg = await vault.maxUsdgAmounts(aUSDC);
  const isStable = await vault.stableTokens(aUSDC);
  const isShortable = await vault.shortableTokens(aUSDC);

  const tx = await vault.setTokenConfig(
    aUSDC,
    6,
    weight,
    minProfit,
    maxUsdg,
    isStable,
    isShortable,
  );
  await tx.wait();
  console.log("ok: vault.setTokenConfig(aUSDC, decimals=6)");

  const after = await vault.tokenDecimals(aUSDC);
  console.log("Vault aUSDC decimals (after):", after.toString());
}

async function seedLiquidity(deployed, signer) {
  const ausdcHuman = process.env.PERPS_GLP_AUSDC || "200000";
  const fnusdHuman = process.env.PERPS_GLP_FNUSD || "200000";
  const wzkltcHuman = process.env.PERPS_GLP_WZKLTC || "3700";

  const glpManager = await ethers.getContractAt(
    "GlpManager",
    deployed.contracts.GlpManager,
  );
  const glp = await ethers.getContractAt("GLP", deployed.contracts.GLP);

  const wzkLTC = deployed.tokens.wzkLTC;
  const aUSDC = deployed.tokens.aUSDC;
  const fnUSD = deployed.tokens.fnUSD;
  const recipient = signer.address;

  await ensureHandler(glpManager, signer.address);

  const ausdc = new ethers.Contract(aUSDC, ERC20_ABI, signer);
  const fnusd = new ethers.Contract(fnUSD, ERC20_ABI, signer);
  const ltc = new ethers.Contract(wzkLTC, ERC20_ABI, signer);

  const amounts = {
    aUSDC: parseHuman(ausdcHuman, await ausdc.decimals()),
    fnUSD: parseHuman(fnusdHuman, await fnusd.decimals()),
    wzkLTC: parseHuman(wzkltcHuman, await ltc.decimals()),
  };

  for (const [label, token, amt] of [
    ["aUSDC", ausdc, amounts.aUSDC],
    ["fnUSD", fnusd, amounts.fnUSD],
    ["wzkLTC", ltc, amounts.wzkLTC],
  ]) {
    const bal = await token.balanceOf(signer.address);
    if (bal.lt(amt)) {
      throw new Error(`Insufficient ${label} for reseed`);
    }
    const allowance = await token.allowance(signer.address, glpManager.address);
    if (allowance.lt(amt)) {
      const tx = await token.approve(glpManager.address, ethers.constants.MaxUint256);
      await tx.wait();
      console.log(`ok: approve ${label}`);
    }
  }

  const glpBefore = await glp.balanceOf(recipient);
  const aumBefore = await glpManager.getAumInUsdg(true);

  for (const [label, tokenAddr, amt] of [
    ["aUSDC", aUSDC, amounts.aUSDC],
    ["fnUSD", fnUSD, amounts.fnUSD],
    ["wzkLTC", wzkLTC, amounts.wzkLTC],
  ]) {
    const tx = await glpManager.addLiquidityForAccount(
      signer.address,
      recipient,
      tokenAddr,
      amt,
      0,
      0,
    );
    await tx.wait();
    console.log(`ok: addLiquidity ${label}`, amt.toString());
  }

  const glpAfter = await glp.balanceOf(recipient);
  const aumAfter = await glpManager.getAumInUsdg(true);
  console.log("GLP minted:", ethers.utils.formatEther(glpAfter.sub(glpBefore)));
  console.log("GLP balance:", ethers.utils.formatEther(glpAfter));
  console.log("AUM (max) after:", ethers.utils.formatEther(aumAfter));
  console.log("AUM (max) before:", ethers.utils.formatEther(aumBefore));
}

async function main() {
  const phase = (process.env.PERPS_RESEED_PHASE || "all").toLowerCase();
  const deployed = await loadDeployed();
  const [signer] = await ethers.getSigners();

  console.log("Signer:", signer.address);
  console.log("Phase:", phase);

  if (phase === "fix" || phase === "all") {
    console.log("\n--- Fix vault decimals ---");
    await fixVaultDecimals(deployed, signer);
  }
  if (phase === "pull" || phase === "all") {
    console.log("\n--- Pull liquidity ---");
    await pullLiquidity(deployed, signer);
  }
  if (phase === "seed" || phase === "all") {
    if (phase === "seed") {
      console.log("\n--- Fix vault decimals (before seed) ---");
      await fixVaultDecimals(deployed, signer);
    }
    console.log("\n--- Seed liquidity ---");
    await seedLiquidity(deployed, signer);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
