/**
 * Add a stablecoin as short collateral on an existing perps deploy (gov only).
 *
 * Env:
 *   PERPS_STABLE_ADDRESS  — ERC-20 contract address (required)
 *   PERPS_STABLE_DIA_KEY  — DIA key, e.g. USDT/USD (default: USDT/USD)
 *   PERPS_STABLE_DECIMALS — token decimals (default: 18)
 *
 * Usage (from contracts/):
 *   PERPS_STABLE_ADDRESS=0xYourToken npm run perps:add-stable
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const litvm = require("../../perps/addax/config/litvm");

const { ethers } = hre;

const deploymentsPath = path.join(__dirname, "../../deployments/liteforge-perps.json");

async function main() {
  const stable = process.env.PERPS_STABLE_ADDRESS;
  if (!stable) {
    throw new Error("Set PERPS_STABLE_ADDRESS to the stablecoin contract address");
  }

  const diaKey =
    process.env.PERPS_STABLE_DIA_KEY ||
    litvm.diaKeys.USDT ||
    "USDT/USD";
  const decimals = parseInt(process.env.PERPS_STABLE_DECIMALS ?? "18", 10);

  if (!fs.existsSync(deploymentsPath)) {
    throw new Error("Missing deployments/liteforge-perps.json — deploy perps first");
  }
  const deployed = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));

  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);
  console.log("Stable:", stable);
  console.log("DIA key:", diaKey);
  console.log("Decimals:", decimals);

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

  const tx1 = await priceFeed.setTokenConfigDia(
    stable,
    diaKey,
    litvm.diaPriceDecimals,
    true,
  );
  await tx1.wait();
  console.log("ok: VaultPriceFeedDia.setTokenConfigDia (strict stable)");

  const tx2 = await vault.setTokenConfig(stable, decimals, 10000, 75, 0, true, false);
  await tx2.wait();
  console.log("ok: vault.setTokenConfig (isStable=true, isShortable=false)");

  deployed.tokens = deployed.tokens || {};
  const symbol = process.env.PERPS_STABLE_SYMBOL || "stable";
  deployed.tokens[symbol] = stable;
  deployed.tokens.diaKeys = deployed.tokens.diaKeys || {};
  deployed.tokens.diaKeys[symbol] = diaKey;
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployed, null, 2));
  console.log("Updated", deploymentsPath);

  console.log("\nShort LTC can now use this stable as collateral:");
  console.log("  indexToken = wzkLTC", deployed.tokens.wzkLTC);
  console.log("  collateralToken =", stable);
  console.log("  isLong = false");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
