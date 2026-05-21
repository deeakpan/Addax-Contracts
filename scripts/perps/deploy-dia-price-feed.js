/**
 * Deploy Addax DIA oracle stack for GMX-style perps on LiteForge.
 *
 * Env:
 *   DIA_ORACLE_ADDRESS — live DIAOracleV2 (if unset, deploys MockDIAOracle for dev)
 *   PERPS_PRICE_TOKENS — comma-separated token addresses
 *   PERPS_DIA_KEYS — comma-separated DIA keys (same order), e.g. LTC/USD,BTC/USD
 *   PERPS_DIA_DECIMALS — optional, default 8 for all
 *
 * Usage (from contracts/):
 *   npm run deploy:perps:dia
 */
const hre = require("hardhat");
const litvm = require("../../perps/addax/config/litvm");

const DIA_DECIMALS = litvm.diaPriceDecimals;
const MAX_AGE_SEC = litvm.maxPriceAgeSeconds;
const DEFAULT_DIA_ORACLE = litvm.diaOracle;

const DEV_MOCK_PRICES = {
  "LTC/USD": 9500000000n,
  "BTC/USD": 650000000000n,
  "ETH/USD": 350000000000n,
};

function parseList(envValue) {
  if (!envValue || !envValue.trim()) return [];
  return envValue.split(",").map((s) => s.trim()).filter(Boolean);
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  let diaOracle = process.env.DIA_ORACLE_ADDRESS || DEFAULT_DIA_ORACLE;
  if (!diaOracle) {
    const Mock = await hre.ethers.getContractFactory("MockDIAOracle");
    const mock = await Mock.deploy();
    await mock.deployed();
    diaOracle = mock.address;
    console.log("MockDIAOracle:", diaOracle);
    for (const [key, price] of Object.entries(DEV_MOCK_PRICES)) {
      await mock.setValue(key, price);
      console.log("  setValue", key, price.toString());
    }
  } else {
    console.log("DIA_ORACLE_ADDRESS:", diaOracle);
  }

  const VaultPriceFeedDia = await hre.ethers.getContractFactory("VaultPriceFeedDia");
  const priceFeed = await VaultPriceFeedDia.deploy();
  await priceFeed.deployed();
  console.log("VaultPriceFeedDia:", priceFeed.address);

  await (await priceFeed.setDiaOracle(diaOracle)).wait();
  await (await priceFeed.setMaxPriceAge(MAX_AGE_SEC)).wait();

  const tokens = parseList(process.env.PERPS_PRICE_TOKENS);
  const keys = parseList(process.env.PERPS_DIA_KEYS);
  const decimalsList = parseList(process.env.PERPS_DIA_DECIMALS);

  if (tokens.length > 0) {
    if (keys.length !== tokens.length) {
      throw new Error("PERPS_DIA_KEYS must have the same length as PERPS_PRICE_TOKENS");
    }
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const key = keys[i];
      const decimals = decimalsList[i]
        ? parseInt(decimalsList[i], 10)
        : DIA_DECIMALS;
      await (await priceFeed.setTokenConfigDia(token, key, decimals, false)).wait();
      console.log("setTokenConfigDia", token, key, decimals);
    }
  } else {
    console.log(
      "No PERPS_PRICE_TOKENS set — configure tokens with setTokenConfigDia / setDiaKey on",
      priceFeed.address,
    );
  }

  console.log("\nPoint GMX Vault.priceFeed to VaultPriceFeedDia:", priceFeed.address);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
