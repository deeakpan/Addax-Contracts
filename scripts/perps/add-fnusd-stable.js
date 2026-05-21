/**
 * Add FnUSD as short collateral on deployed LiteForge perps (gov only).
 *
 * FnUSD: 0x219F2AC287458cD58aB46ABd3cfbe451728323f4
 * DIA:   USDC/USD (FnUSD has no LitVM feed; peg treated as ~$1 stable)
 *
 * Usage (from contracts/):
 *   npm run perps:add-fnusd
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const litvm = require("../../perps/addax/config/litvm");

const { ethers } = hre;

const FNUSD = "0x219F2AC287458cD58aB46ABd3cfbe451728323f4";
const FNUSD_DIA_KEY = "USDC/USD";
const SYMBOL = "fnUSD";

const deploymentsPath = path.join(__dirname, "../../deployments/liteforge-perps.json");

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
];

async function main() {
  if (!fs.existsSync(deploymentsPath)) {
    throw new Error("Missing deployments/liteforge-perps.json — run npm run deploy:perps:ltc first");
  }
  const deployed = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));

  const [signer] = await ethers.getSigners();
  const token = ethers.utils.getAddress(FNUSD);
  const erc20 = new ethers.Contract(token, ERC20_ABI, signer);

  let decimals;
  let onChainSymbol;
  let onChainName;
  try {
    decimals = await erc20.decimals();
    onChainSymbol = await erc20.symbol();
    onChainName = await erc20.name();
  } catch (e) {
    throw new Error(
      `Could not read FnUSD at ${token}. Set PERPS_STABLE_DECIMALS manually. ${e.message}`,
    );
  }

  console.log("Signer:", signer.address);
  console.log("Token:", onChainName, `(${onChainSymbol})`, token);
  console.log("Decimals:", decimals);
  console.log("DIA key:", FNUSD_DIA_KEY, "(strict stable ~$1)");

  const vault = await ethers.getContractAt("Vault", deployed.contracts.Vault);
  const priceFeed = await ethers.getContractAt(
    "VaultPriceFeedDia",
    deployed.contracts.VaultPriceFeedDia,
  );

  const vaultGov = await vault.gov();
  const feedGov = await priceFeed.gov();
  if (vaultGov.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`Signer is not Vault gov (gov=${vaultGov})`);
  }
  if (feedGov.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`Signer is not VaultPriceFeedDia gov (gov=${feedGov})`);
  }

  // Price feed first — Vault.setTokenConfig calls getMaxPrice() and reverts without dia key
  const tx1 = await priceFeed.setTokenConfigDia(
    token,
    FNUSD_DIA_KEY,
    litvm.diaPriceDecimals,
    true,
  );
  await tx1.wait();
  console.log("ok: VaultPriceFeedDia.setTokenConfigDia");

  const already = await vault.whitelistedTokens(token);
  if (already) {
    console.log("FnUSD already whitelisted on Vault");
  } else {
    const tx2 = await vault.setTokenConfig(token, decimals, 10000, 75, 0, true, false);
    await tx2.wait();
    console.log("ok: vault.setTokenConfig (isStable=true, isShortable=false)");
  }

  deployed.tokens = deployed.tokens || {};
  deployed.tokens[SYMBOL] = token;
  deployed.tokens.diaKeys = deployed.tokens.diaKeys || {};
  deployed.tokens.diaKeys[SYMBOL] = FNUSD_DIA_KEY;
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployed, null, 2));
  console.log("Updated", deploymentsPath);

  console.log("\nShort LTC with FnUSD margin:");
  console.log("  indexToken:", deployed.tokens.wzkLTC);
  console.log("  collateralToken:", token);
  console.log("  isLong: false");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
