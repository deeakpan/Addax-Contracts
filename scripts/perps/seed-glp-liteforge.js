/**
 * Seed GLP liquidity on LiteForge (gov + GlpManager handler).
 * GlpManager is in private mode — uses addLiquidityForAccount.
 *
 * Defaults: 200k aUSDC, 200k fnUSD, 3700 wzkLTC (human amounts).
 * Override: PERPS_GLP_AUSDC, PERPS_GLP_FNUSD, PERPS_GLP_WZKLTC
 *
 * Usage (from contracts/):
 *   npm run perps:seed-glp
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

function expandDecimals(n, decimals) {
  return ethers.BigNumber.from(n).mul(ethers.BigNumber.from(10).pow(decimals));
}

function parseHuman(amountStr, decimals) {
  return ethers.utils.parseUnits(String(amountStr), decimals);
}

async function ensureHandler(glpManager, handler) {
  const isHandler = await glpManager.isHandler(handler);
  if (isHandler) {
    console.log("Handler already set:", handler);
    return;
  }
  const gov = await glpManager.gov();
  if (gov.toLowerCase() !== handler.toLowerCase()) {
    throw new Error(`Signer is not GlpManager gov (gov=${gov}); cannot setHandler`);
  }
  const tx = await glpManager.setHandler(handler, true);
  await tx.wait();
  console.log("ok: glpManager.setHandler(self, true)");
}

async function approveIfNeeded(token, spender, owner, needed) {
  const current = await token.allowance(owner, spender);
  if (current.gte(needed)) return;
  const tx = await token.approve(spender, ethers.constants.MaxUint256);
  await tx.wait();
  console.log(`ok: approve ${await token.symbol()} -> GlpManager`);
}

async function addLiquidity(glpManager, funding, account, tokenAddr, amount, label) {
  if (amount.isZero()) {
    console.log(`skip ${label}: amount 0`);
    return ethers.BigNumber.from(0);
  }
  const tx = await glpManager.addLiquidityForAccount(
    funding,
    account,
    tokenAddr,
    amount,
    0,
    0,
  );
  const receipt = await tx.wait();
  console.log(`ok: addLiquidity ${label}`, amount.toString(), `(block ${receipt.blockNumber})`);
  return amount;
}

async function main() {
  if (!fs.existsSync(deploymentsPath)) {
    throw new Error("Missing deployments/liteforge-perps.json — run deploy:perps:ltc first");
  }
  const deployed = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));

  const ausdcHuman = process.env.PERPS_GLP_AUSDC || "200000";
  const fnusdHuman = process.env.PERPS_GLP_FNUSD || "200000";
  const wzkltcHuman = process.env.PERPS_GLP_WZKLTC || "3700";
  const glpRecipient = process.env.PERPS_GLP_RECIPIENT;

  const [signer] = await ethers.getSigners();
  const recipient = glpRecipient ? ethers.utils.getAddress(glpRecipient) : signer.address;

  const wzkLTC = deployed.tokens.wzkLTC || litvm.tokens.wzkLTC;
  const aUSDC = deployed.tokens.aUSDC || litvm.tokens.aUSDC;
  const fnUSD = deployed.tokens.fnUSD || litvm.tokens.fnUSD;

  const glpManager = await ethers.getContractAt(
    "GlpManager",
    deployed.contracts.GlpManager,
  );
  const glp = await ethers.getContractAt("GLP", deployed.contracts.GLP);

  const gov = await glpManager.gov();
  if (gov.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`Signer is not GlpManager gov (gov=${gov})`);
  }

  console.log("Signer / funder:", signer.address);
  console.log("GLP recipient:", recipient);
  console.log("GlpManager:", glpManager.address);
  console.log("Amounts:", { aUSDC: ausdcHuman, fnUSD: fnusdHuman, wzkLTC: wzkltcHuman });

  await ensureHandler(glpManager, signer.address);

  const ausdc = new ethers.Contract(aUSDC, ERC20_ABI, signer);
  const fnusd = new ethers.Contract(fnUSD, ERC20_ABI, signer);
  const ltc = new ethers.Contract(wzkLTC, ERC20_ABI, signer);

  const ausdcDecimals = await ausdc.decimals();
  const fnusdDecimals = await fnusd.decimals();
  const ltcDecimals = await ltc.decimals();

  const amounts = {
    aUSDC: parseHuman(ausdcHuman, ausdcDecimals),
    fnUSD: parseHuman(fnusdHuman, fnusdDecimals),
    wzkLTC: parseHuman(wzkltcHuman, ltcDecimals),
  };

  for (const [label, token, amt] of [
    ["aUSDC", ausdc, amounts.aUSDC],
    ["fnUSD", fnusd, amounts.fnUSD],
    ["wzkLTC", ltc, amounts.wzkLTC],
  ]) {
    const bal = await token.balanceOf(signer.address);
    console.log(`Balance ${label}:`, ethers.utils.formatUnits(bal, await token.decimals()));
    if (bal.lt(amt)) {
      throw new Error(`Insufficient ${label}: need ${amt.toString()}, have ${bal.toString()}`);
    }
  }

  const glpBefore = await glp.balanceOf(recipient);
  const aumBefore = await glpManager.getAumInUsdg(true);
  console.log("GLP before:", ethers.utils.formatEther(glpBefore));
  console.log("AUM (USDG, maximise) before:", ethers.utils.formatEther(aumBefore));

  await approveIfNeeded(ausdc, glpManager.address, signer.address, amounts.aUSDC);
  await approveIfNeeded(fnusd, glpManager.address, signer.address, amounts.fnUSD);
  await approveIfNeeded(ltc, glpManager.address, signer.address, amounts.wzkLTC);

  await addLiquidity(glpManager, signer.address, recipient, aUSDC, amounts.aUSDC, "aUSDC");
  await addLiquidity(glpManager, signer.address, recipient, fnUSD, amounts.fnUSD, "fnUSD");
  await addLiquidity(glpManager, signer.address, recipient, wzkLTC, amounts.wzkLTC, "wzkLTC");

  const glpAfter = await glp.balanceOf(recipient);
  const aumAfter = await glpManager.getAumInUsdg(true);
  console.log("\nGLP minted:", ethers.utils.formatEther(glpAfter.sub(glpBefore)));
  console.log("GLP balance:", ethers.utils.formatEther(glpAfter));
  console.log("AUM (USDG, maximise) after:", ethers.utils.formatEther(aumAfter));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
