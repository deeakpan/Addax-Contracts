/**
 * Deploy GMX v1-style perps for LiteForge: LTC (wzkLTC) + aUSDC, DIA oracle pricing.
 *
 * Trades are **instant** via `Router.increasePosition` / `decreasePosition` (no PositionRouter queue).
 * Set PERPS_DEPLOY_POSITION_ROUTER=true only if you want delayed keeper-style orders.
 *
 * Usage (from contracts/):
 *   npm run deploy:perps:ltc
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const litvm = require("../../perps/addax/config/litvm");
const { errors } = require("../../perps/gmx-contracts/test/core/Vault/helpers");

const { ethers } = hre;

const ERC20_DECIMALS_ABI = ["function decimals() view returns (uint8)"];

async function readDecimals(tokenAddress, label) {
  const erc20 = new ethers.Contract(tokenAddress, ERC20_DECIMALS_ABI, ethers.provider);
  const decimals = await erc20.decimals();
  console.log(`  ${label} on-chain decimals:`, decimals);
  return decimals;
}

function toUsd(value) {
  const normalizedValue = parseInt(value * Math.pow(10, 10), 10);
  return ethers.BigNumber.from(normalizedValue).mul(ethers.BigNumber.from(10).pow(20));
}

async function deploy(name, args = [], opts = {}) {
  const factory = await ethers.getContractFactory(name, opts.libraries ? { libraries: opts.libraries } : undefined);
  const contract = await factory.deploy(...args);
  const receipt = await contract.deployTransaction.wait();
  console.log(`${name}:`, contract.address, `(block ${receipt.blockNumber})`);
  return { contract, deployBlock: receipt.blockNumber };
}

async function send(label, txPromise) {
  const tx = await txPromise;
  await tx.wait();
  console.log("  ok:", label);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const deployQueuedRouter = process.env.PERPS_DEPLOY_POSITION_ROUTER === "true";
  const keeper = process.env.PERPS_KEEPER_ADDRESS || deployer.address;

  console.log("Deployer:", deployer.address);
  console.log("DIA oracle:", litvm.diaOracle);
  console.log("maxPriceAge:", litvm.maxPriceAgeSeconds, "s");
  console.log("Trading mode:", deployQueuedRouter ? "queued (PositionRouter)" : "instant (Router)");

  const wzkLTC = litvm.tokens.wzkLTC;
  const aUSDC = litvm.tokens.aUSDC;
  const fnUSD = litvm.tokens.fnUSD;

  const wzkLtcDecimals = await readDecimals(wzkLTC, "wzkLTC");
  const ausdcDecimals = await readDecimals(aUSDC, "aUSDC");
  const fnusdDecimals = await readDecimals(fnUSD, "fnUSD");
  if (Number(ausdcDecimals) !== 6) {
    throw new Error(`aUSDC must be 6 decimals on-chain, got ${ausdcDecimals}`);
  }

  const { contract: vaultPriceFeed, deployBlock: priceFeedBlock } = await deploy("VaultPriceFeedDia");
  await send("setDiaOracle", vaultPriceFeed.setDiaOracle(litvm.diaOracle));
  await send("setMaxPriceAge", vaultPriceFeed.setMaxPriceAge(litvm.maxPriceAgeSeconds));
  await send(
    "setTokenConfigDia wzkLTC",
    vaultPriceFeed.setTokenConfigDia(wzkLTC, litvm.diaKeys.LTC, litvm.diaPriceDecimals, false),
  );
  await send(
    "setTokenConfigDia aUSDC",
    vaultPriceFeed.setTokenConfigDia(aUSDC, litvm.diaKeys.USDC, litvm.diaPriceDecimals, true),
  );
  await send(
    "setTokenConfigDia fnUSD",
    vaultPriceFeed.setTokenConfigDia(fnUSD, litvm.diaKeys.USDC, litvm.diaPriceDecimals, true),
  );

  const { contract: vault, deployBlock: vaultDeployBlock } = await deploy("Vault");
  const { contract: usdg } = await deploy("USDG", [vault.address]);
  const { contract: router } = await deploy("Router", [vault.address, usdg.address, wzkLTC]);
  const { contract: glp } = await deploy("GLP");
  await send("glp.setInPrivateTransferMode", glp.setInPrivateTransferMode(true));
  const { contract: shortsTracker } = await deploy("ShortsTracker", [vault.address]);
  const { contract: glpManager } = await deploy("GlpManager", [
    vault.address,
    usdg.address,
    glp.address,
    shortsTracker.address,
    15 * 60,
  ]);
  await send("glpManager.setInPrivateMode", glpManager.setInPrivateMode(true));
  await send("glp.setMinter", glp.setMinter(glpManager.address, true));
  await send("usdg.addVault", usdg.addVault(glpManager.address));

  await send(
    "vault.initialize",
    vault.initialize(router.address, usdg.address, vaultPriceFeed.address, toUsd(2), 100, 100),
  );
  await send("vault.setFundingRate", vault.setFundingRate(60 * 60, 100, 100));
  await send("vault.setInManagerMode", vault.setInManagerMode(true));
  await send("vault.setManager", vault.setManager(glpManager.address, true));
  await send(
    "vault.setFees",
    vault.setFees(10, 5, 20, 20, 1, 10, toUsd(2), 24 * 60 * 60, true),
  );

  const { contract: vaultErrorController } = await deploy("VaultErrorController");
  await send("vault.setErrorController", vault.setErrorController(vaultErrorController.address));
  await send("setErrors", vaultErrorController.setErrors(vault.address, errors));

  const { contract: vaultUtils } = await deploy("VaultUtils", [vault.address]);
  await send("vault.setVaultUtils", vault.setVaultUtils(vaultUtils.address));

  const wzkLtcConfig = [wzkLTC, wzkLtcDecimals, 10000, 75, 0, false, true];
  const ausdcConfig = [aUSDC, ausdcDecimals, 10000, 75, 0, true, false];
  const fnusdConfig = [fnUSD, fnusdDecimals, 10000, 75, 0, true, false];
  await send("vault.setTokenConfig wzkLTC", vault.setTokenConfig(...wzkLtcConfig));
  await send("vault.setTokenConfig aUSDC", vault.setTokenConfig(...ausdcConfig));
  await send("vault.setTokenConfig fnUSD", vault.setTokenConfig(...fnusdConfig));

  const { contract: reader } = await deploy("Reader");

  const contracts = {
    VaultPriceFeedDia: vaultPriceFeed.address,
    Vault: vault.address,
    USDG: usdg.address,
    Router: router.address,
    GLP: glp.address,
    GlpManager: glpManager.address,
    ShortsTracker: shortsTracker.address,
    VaultUtils: vaultUtils.address,
    Reader: reader.address,
  };

  if (deployQueuedRouter) {
    const { contract: referralStorage } = await deploy("ReferralStorage");
    const { contract: positionUtils } = await deploy("PositionUtils");
    const minExecutionFee = ethers.utils.parseEther("0.001");
    const { contract: positionRouter } = await deploy(
      "PositionRouter",
      [vault.address, router.address, wzkLTC, shortsTracker.address, 30, minExecutionFee],
      { libraries: { PositionUtils: positionUtils.address } },
    );
    await send("referralStorage.setHandler", referralStorage.setHandler(positionRouter.address, true));
    await send("positionRouter.setReferralStorage", positionRouter.setReferralStorage(referralStorage.address));
    await send("shortsTracker.setHandler", shortsTracker.setHandler(positionRouter.address, true));
    await send("router.addPlugin", router.addPlugin(positionRouter.address));
    await send("positionRouter.setDelayValues", positionRouter.setDelayValues(0, 180, 30 * 60));
    await send("positionRouter.setPositionKeeper", positionRouter.setPositionKeeper(keeper, true));
    await send("positionRouter.setIsLeverageEnabled", positionRouter.setIsLeverageEnabled(true));
    Object.assign(contracts, {
      ReferralStorage: referralStorage.address,
      PositionRouter: positionRouter.address,
      PositionUtils: positionUtils.address,
    });
    console.log("\nQueued mode: run perps-keepers position bot OR use createIncreasePosition on PositionRouter.");
  } else {
    console.log("\nInstant mode: UI calls Router.increasePosition / decreasePosition (same tx opens position).");
    console.log("No position-keeper bot required.");
  }

  const out = {
    network: "liteforge",
    chainId: litvm.chainId,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    vaultDeployBlock,
    priceFeedDeployBlock: priceFeedBlock,
    trading: {
      mode: deployQueuedRouter ? "queued" : "instant",
      entrypoint: deployQueuedRouter ? "PositionRouter" : "Router",
      methods: deployQueuedRouter
        ? ["createIncreasePosition", "createDecreasePosition"]
        : ["increasePosition", "decreasePosition"],
    },
    dia: {
      oracle: litvm.diaOracle,
      maxPriceAgeSeconds: litvm.maxPriceAgeSeconds,
      heartbeatSeconds: litvm.diaHeartbeatSeconds,
    },
    contracts,
    tokens: {
      wzkLTC,
      aUSDC,
      fnUSD,
      decimals: {
        wzkLTC: Number(wzkLtcDecimals),
        aUSDC: Number(ausdcDecimals),
        fnUSD: Number(fnusdDecimals),
      },
      diaKeys: {
        wzkLTC: litvm.diaKeys.LTC,
        aUSDC: litvm.diaKeys.USDC,
        fnUSD: litvm.diaKeys.USDC,
      },
    },
    superseded: {
      note: "Previous liteforge-perps.json backed up to liteforge-perps.prev.json on this deploy",
    },
  };

  const outPath = path.join(__dirname, "../../deployments/liteforge-perps.json");
  const prevPath = path.join(__dirname, "../../deployments/liteforge-perps.prev.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  if (fs.existsSync(outPath)) {
    fs.copyFileSync(outPath, prevPath);
    console.log("Backed up previous deployment to liteforge-perps.prev.json");
  }
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log("\nWrote", outPath);
  console.log("Fund GLP via GlpManager, then trade through Router (instant).");
  console.log(`Set PERPS_VAULT_DEPLOY_BLOCK=${vaultDeployBlock} for liquidation keeper sync.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
