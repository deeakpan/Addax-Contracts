/**
 * Full Addax redeploy:
 *   1. Wrappers     — WzkLTC (40 000 bootstrap) + aUSDC (legacy USDC wrapper)
 *   2. V3 periphery — SwapRouter, QuoterV2, NPM, Descriptor, TickLens, Multicall
 *                     (reuses existing factory — factory has no wzkLTC dependency)
 *   3. AddaxAggregatorV3 — allowlists the new SwapRouter automatically
 *
 * Run:
 *   npx hardhat run --config hardhat.addax.config.js scripts/deploy-addax.js --network liteforge
 */

const fs   = require("fs");
const path = require("path");
const hre  = require("hardhat");

// ── Patched V3 periphery artifacts (pre-compiled, pool-init-hash patched) ──

const PATCH_ROOT = path.join(__dirname, "..", "patched-v3-periphery-artifacts");

function loadPatched(rel) {
  const p = path.join(PATCH_ROOT, rel);
  if (!fs.existsSync(p)) {
    throw new Error(`Missing ${p}.\nRun: npx hardhat compile && node scripts/patch-periphery-pool-init-hash.js`);
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const ART_SWAP_ROUTER   = loadPatched("contracts/SwapRouter.sol/SwapRouter.json");
const ART_QUOTER_V2     = loadPatched("contracts/lens/QuoterV2.sol/QuoterV2.json");
const ART_NFT_DESC      = loadPatched("contracts/NonfungibleTokenPositionDescriptor.sol/NonfungibleTokenPositionDescriptor.json");
const ART_NPM           = loadPatched("contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json");

const ART_TICK_LENS     = require("@uniswap/v3-periphery/artifacts/contracts/lens/TickLens.sol/TickLens.json");
const ART_MULTICALL     = require("@uniswap/v3-periphery/artifacts/contracts/lens/UniswapInterfaceMulticall.sol/UniswapInterfaceMulticall.json");
const ART_NFT_DESC_LIB  = require("@uniswap/v3-periphery/artifacts/contracts/libraries/NFTDescriptor.sol/NFTDescriptor.json");

const NFT_DESC_PLACEHOLDER = "__$cea9be979eee3d87fb124d6cbb244bb0b5$__";

// ── Helpers ──────────────────────────────────────────────────────────────────

function linkDescriptor(bytecode, libAddr) {
  const addr = libAddr.replace(/^0x/i, "").toLowerCase();
  if (!bytecode.includes(NFT_DESC_PLACEHOLDER))
    throw new Error("Descriptor bytecode missing NFTDescriptor placeholder");
  return bytecode.split(NFT_DESC_PLACEHOLDER).join(addr);
}

async function deployArtifact(ethers, signer, artifact, args = []) {
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
  const c = await factory.deploy(...args);
  await c.deployed();
  console.log(`  ✓ ${artifact.contractName ?? "contract"} → ${c.address}`);
  return c;
}

function readDeployment(outputPath) {
  if (!fs.existsSync(outputPath)) return {};
  try { return JSON.parse(fs.readFileSync(outputPath, "utf8")); } catch { return {}; }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const network    = await ethers.provider.getNetwork();
  const timestamp  = new Date().toISOString();

  const outputDir  = path.join(__dirname, "..", "deployments");
  const outputPath = path.join(outputDir, "liteforge.json");
  fs.mkdirSync(outputDir, { recursive: true });

  const existing = readDeployment(outputPath);

  // Factory: reuse existing — it has no wzkLTC dependency
  const factoryAddress = (
    process.env.ADDAX_FACTORY_ADDRESS?.trim() ||
    existing?.contracts?.AddaxV3Factory
  );
  if (!factoryAddress) {
    throw new Error("No factory address found. Set ADDAX_FACTORY_ADDRESS or run deploy.js first.");
  }
  const factory = { address: ethers.utils.getAddress(factoryAddress) };
  console.log(`\nReusing AddaxV3Factory: ${factory.address}`);

  // ── Step 1: wrappers ────────────────────────────────────────────────────────
  console.log("\n── Step 1: wrappers ──");
  const LEGACY_USDC = "0xd5118dEe968d1533B2A57aB66C266010AD8957fa";
  const LEGACY_WZKLTC = "0x60A84eBC3483fEFB251B76Aea5B8458026Ef4bea";
  const BTC_USD_FEED = "0x25B9aEC897909b8da13c3B00b0c7f41B76152589";
  const ETH_USD_FEED = "0xEc873ccFdb5579b7006EeD61CC7bE42cDC8c2d0b";
  const bootstrapMint = ethers.utils.parseEther("40000");
  const WzkLTCFactory = await ethers.getContractFactory("WzkLTC");
  const wzkLTCContract = await WzkLTCFactory.connect(deployer).deploy(bootstrapMint);
  await wzkLTCContract.deployed();
  const wzkLTC = wzkLTCContract.address;
  console.log(`  ✓ WzkLTC (new)    → ${wzkLTC}`);
  console.log(`  ✓ WzkLTC (legacy) → ${LEGACY_WZKLTC}`);
  console.log(`  Bootstrap minted: ${ethers.utils.formatEther(bootstrapMint)} wzkLTC`);

  const AUSDCFactory = await ethers.getContractFactory("AUSDC");
  const aUSDCContract = await AUSDCFactory.connect(deployer).deploy(LEGACY_USDC);
  await aUSDCContract.deployed();
  const aUSDC = aUSDCContract.address;
  console.log(`  ✓ aUSDC (new)     → ${aUSDC}`);
  console.log(`  ✓ USDC (legacy)   → ${LEGACY_USDC}`);

  const WETHFactory = await ethers.getContractFactory("WETH");
  const wETHContract = await WETHFactory.connect(deployer).deploy(aUSDC, ETH_USD_FEED);
  await wETHContract.deployed();
  const wETH = wETHContract.address;
  console.log(`  ✓ wETH            → ${wETH}`);
  console.log(`  ✓ Oracle feed     → ETH/USD ${ETH_USD_FEED}`);
  console.log(`  ✓ Mint source     → aUSDC ${aUSDC}`);

  const WBTCFactory = await ethers.getContractFactory("WBTC");
  const wBTCContract = await WBTCFactory.connect(deployer).deploy(aUSDC, BTC_USD_FEED);
  await wBTCContract.deployed();
  const wBTC = wBTCContract.address;
  console.log(`  ✓ wBTC            → ${wBTC}`);
  console.log(`  ✓ Oracle feed     → BTC/USD ${BTC_USD_FEED}`);
  console.log(`  ✓ Mint source     → aUSDC ${aUSDC}`);

  // ── Step 2: V3 periphery ────────────────────────────────────────────────────
  console.log("\n── Step 2: V3 periphery ──");
  const nativeLabelBytes = ethers.utils.formatBytes32String("zkLTC");

  const swapRouter  = await deployArtifact(ethers, deployer, ART_SWAP_ROUTER,  [factory.address, wzkLTC]);
  const quoterV2    = await deployArtifact(ethers, deployer, ART_QUOTER_V2,    [factory.address, wzkLTC]);
  const tickLens    = await deployArtifact(ethers, deployer, ART_TICK_LENS);
  const multicall   = await deployArtifact(ethers, deployer, ART_MULTICALL);
  const nftDescLib  = await deployArtifact(ethers, deployer, ART_NFT_DESC_LIB);

  const linkedBytecode = linkDescriptor(ART_NFT_DESC.bytecode, nftDescLib.address);
  const DescFactory    = new ethers.ContractFactory(ART_NFT_DESC.abi, linkedBytecode, deployer);
  const tokenDescriptor = await DescFactory.deploy(wzkLTC, nativeLabelBytes);
  await tokenDescriptor.deployed();
  console.log(`  ✓ NonfungibleTokenPositionDescriptor → ${tokenDescriptor.address}`);

  const positionManager = await deployArtifact(ethers, deployer, ART_NPM, [
    factory.address,
    wzkLTC,
    tokenDescriptor.address,
  ]);

  // ── Step 3: AddaxAggregatorV3 ────────────────────────────────────────────────
  console.log("\n── Step 3: AddaxAggregatorV3 ──");
  const AggFactory  = await ethers.getContractFactory("AddaxAggregatorV3");
  const aggregator  = await AggFactory.connect(deployer).deploy();
  await aggregator.deployed();
  console.log(`  ✓ AddaxAggregatorV3 → ${aggregator.address}`);

  // Allowlist the new SwapRouter
  const tx = await aggregator.addRouter(swapRouter.address);
  await tx.wait();
  console.log(`  ✓ SwapRouter allowlisted on aggregator`);

  // ── Write deployment ─────────────────────────────────────────────────────────
  const deployment = {
    ...existing,
    project:     "addax",
    protocol:    "v3",
    networkName: "LitVM LiteForge",
    chainId:     Number(network.chainId),
    gasToken:    "zkLTC",
    rpcHttp:     "https://liteforge.rpc.caldera.xyz/http",
    rpcWebSocket:"wss://liteforge.rpc.caldera.xyz/ws",
    blockExplorer:"https://liteforge.explorer.caldera.xyz",
    deployedAt:  timestamp,
    deployer:    deployer.address,
    contracts: {
      ...(existing.contracts ?? {}),
      AddaxV3Factory:                            factory.address,
      AddaxV3SwapRouter:                         swapRouter.address,
      AddaxV3QuoterV2:                           quoterV2.address,
      AddaxV3NonfungiblePositionManager:         positionManager.address,
      AddaxV3NonfungibleTokenPositionDescriptor: tokenDescriptor.address,
      AddaxV3NFTDescriptorLibrary:               nftDescLib.address,
      AddaxV3TickLens:                           tickLens.address,
      AddaxV3InterfaceMulticall:                 multicall.address,
      wzkLTC,
      wzkLTCLegacy:                              LEGACY_WZKLTC,
      aUSDC,
      wETH,
      wBTC,
      usdcLegacy:                                LEGACY_USDC,
      AddaxAggregatorV3:                         aggregator.address,
    },
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(deployment, null, 2)}\n`);
  console.log(`\nDeployment written to ${outputPath}`);
  console.log(JSON.stringify(deployment.contracts, null, 2));
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
