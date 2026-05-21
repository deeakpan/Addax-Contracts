/**
 * Full fresh redeploy:
 *   1. Core wrappers     (new wzkLTC + new aUSDC)
 *   2. UniswapV3Factory  (new)
 *   3. V3 periphery      (new, pointing to new wzkLTC)
 *   4. AddaxAggregatorV3 (new, allowlists SwapRouter + Onmi Fun)
 *
 * Run:
 *   npx hardhat run --config hardhat.config.js scripts/deploy-fresh.js --network liteforge
 */

const fs   = require("fs");
const path = require("path");
const hre  = require("hardhat");

const LEGACY_USDC     = "0xd5118dEe968d1533B2A57aB66C266010AD8957fa";
const BOOTSTRAP_WZKLTC_MINT = "40000";
const LEGACY_WZKLTC   = "0x60A84eBC3483fEFB251B76Aea5B8458026Ef4bea";
const ONMI_FUN_ROUTER = "0xe351c47c3b96844f46e9808a7d5bba8101bffb57";
const BTC_USD_FEED    = "0x25B9aEC897909b8da13c3B00b0c7f41B76152589";
const ETH_USD_FEED    = "0xEc873ccFdb5579b7006EeD61CC7bE42cDC8c2d0b";

const PATCH_ROOT = path.join(__dirname, "..", "patched-v3-periphery-artifacts");
const ART_ROOT   = path.join(__dirname, "..", "artifacts");

function loadPatched(rel) {
  const p = path.join(PATCH_ROOT, rel);
  if (!fs.existsSync(p)) throw new Error(`Missing patched artifact: ${p}`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function loadArtifact(rel) {
  const p = path.join(ART_ROOT, rel);
  if (!fs.existsSync(p)) throw new Error(`Missing artifact: ${p}`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const ART_FACTORY    = loadArtifact("v3-core/contracts/UniswapV3Factory.sol/UniswapV3Factory.json");
const ART_AGGREGATOR = loadArtifact("src/addax/AddaxAggregatorV3.sol/AddaxAggregatorV3.json");

const ART_SWAP_ROUTER = loadPatched("contracts/SwapRouter.sol/SwapRouter.json");
const ART_QUOTER_V2   = loadPatched("contracts/lens/QuoterV2.sol/QuoterV2.json");
const ART_NFT_DESC    = loadPatched("contracts/NonfungibleTokenPositionDescriptor.sol/NonfungibleTokenPositionDescriptor.json");
const ART_NPM         = loadPatched("contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json");

const ART_TICK_LENS   = require("@uniswap/v3-periphery/artifacts/contracts/lens/TickLens.sol/TickLens.json");
const ART_MULTICALL   = require("@uniswap/v3-periphery/artifacts/contracts/lens/UniswapInterfaceMulticall.sol/UniswapInterfaceMulticall.json");
const ART_NFT_DESC_LIB = require("@uniswap/v3-periphery/artifacts/contracts/libraries/NFTDescriptor.sol/NFTDescriptor.json");

const NFT_DESC_PLACEHOLDER = "__$cea9be979eee3d87fb124d6cbb244bb0b5$__";

function linkDescriptor(bytecode, libAddr) {
  const addr = libAddr.replace(/^0x/i, "").toLowerCase();
  if (!bytecode.includes(NFT_DESC_PLACEHOLDER))
    throw new Error("Descriptor bytecode missing NFTDescriptor placeholder");
  return bytecode.split(NFT_DESC_PLACEHOLDER).join(addr);
}

async function deploy(ethers, signer, artifact, args = []) {
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
  const c = await factory.deploy(...args);
  await c.deployed();
  const name = artifact.contractName ?? "contract";
  console.log(`  ✓ ${name} → ${c.address}`);
  return c;
}

function readDeployment(p) {
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return {}; }
}

async function main() {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const network    = await ethers.provider.getNetwork();
  const timestamp  = new Date().toISOString();

  const outputDir  = path.join(__dirname, "..", "deployments");
  const outputPath = path.join(outputDir, "liteforge.json");
  fs.mkdirSync(outputDir, { recursive: true });

  const existing = readDeployment(outputPath);
  console.log(`\nDeployer: ${deployer.address}`);
  // ── 1. Core wrappers ────────────────────────────────────────────────────────
  console.log("\n── 1. Core wrappers ──");
  const bootstrapMint = ethers.utils.parseEther(BOOTSTRAP_WZKLTC_MINT);
  const WzkLTCFactory = await ethers.getContractFactory("WzkLTC");
  const wzkLTCContract = await WzkLTCFactory.connect(deployer).deploy(bootstrapMint);
  await wzkLTCContract.deployed();
  const wzkLTC = wzkLTCContract.address;
  console.log(`  ✓ WzkLTC (new)    → ${wzkLTC}`);
  console.log(`  ✓ WzkLTC (legacy) → ${LEGACY_WZKLTC}`);
  console.log(`  ✓ WzkLTC bootstrap mint: ${ethers.utils.formatEther(bootstrapMint)} wzkLTC`);

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

  // ── 2. Factory ───────────────────────────────────────────────────────────────
  console.log("\n── 2. UniswapV3Factory ──");
  const factory = await deploy(ethers, deployer, ART_FACTORY);

  // ── 3. V3 periphery ─────────────────────────────────────────────────────────
  console.log("\n── 3. V3 periphery ──");
  const nativeLabelBytes = ethers.utils.formatBytes32String("zkLTC");

  const swapRouter      = await deploy(ethers, deployer, ART_SWAP_ROUTER, [factory.address, wzkLTC]);
  const quoterV2        = await deploy(ethers, deployer, ART_QUOTER_V2,   [factory.address, wzkLTC]);
  const tickLens        = await deploy(ethers, deployer, ART_TICK_LENS);
  const multicall       = await deploy(ethers, deployer, ART_MULTICALL);
  const nftDescLib      = await deploy(ethers, deployer, ART_NFT_DESC_LIB);

  const linkedBytecode  = linkDescriptor(ART_NFT_DESC.bytecode, nftDescLib.address);
  const DescFactory     = new ethers.ContractFactory(ART_NFT_DESC.abi, linkedBytecode, deployer);
  const tokenDescriptor = await DescFactory.deploy(wzkLTC, nativeLabelBytes);
  await tokenDescriptor.deployed();
  console.log(`  ✓ NonfungibleTokenPositionDescriptor → ${tokenDescriptor.address}`);

  const positionManager = await deploy(ethers, deployer, ART_NPM, [
    factory.address,
    wzkLTC,
    tokenDescriptor.address,
  ]);

  // ── 4. Aggregator ────────────────────────────────────────────────────────────
  console.log("\n── 4. AddaxAggregatorV3 ──");
  const aggregator = await deploy(ethers, deployer, ART_AGGREGATOR);

  const tx1 = await new ethers.Contract(aggregator.address, ART_AGGREGATOR.abi, deployer)
    .addRouter(swapRouter.address);
  await tx1.wait();
  console.log(`  ✓ Allowlisted AddaxV3SwapRouter`);

  const tx2 = await new ethers.Contract(aggregator.address, ART_AGGREGATOR.abi, deployer)
    .addRouter(ONMI_FUN_ROUTER);
  await tx2.wait();
  console.log(`  ✓ Allowlisted OnmiFunRouter`);

  // ── Write deployment ─────────────────────────────────────────────────────────
  const deployment = {
    ...existing,
    project:      "addax",
    protocol:     "v3",
    networkName:  "LitVM LiteForge",
    chainId:      Number(network.chainId),
    gasToken:     "zkLTC",
    rpcHttp:      "https://liteforge.rpc.caldera.xyz/http",
    rpcWebSocket: "wss://liteforge.rpc.caldera.xyz/ws",
    blockExplorer:"https://liteforge.explorer.caldera.xyz",
    deployedAt:   timestamp,
    deployer:     deployer.address,
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
      OnmiFunRouter:                             ONMI_FUN_ROUTER,
    },
    notes: {
      pools:     "Create pools: AddaxV3Factory.createPool(tokenA, tokenB, fee). Typical fees: 500, 3000, 10000.",
      liquidity: "Mint/adjust LP positions via AddaxV3NonfungiblePositionManager (NFT positions).",
      quotes:    "Off-chain quotes: AddaxV3QuoterV2 (staticcall, not a swap).",
      feeSplit:  "See contracts/FEE_SPLIT.txt (UniswapV3Pool.swap fee + optional protocol cut).",
    },
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(deployment, null, 2)}\n`);
  console.log("\n✓ Deployment written to", outputPath);
  console.log(JSON.stringify(deployment.contracts, null, 2));
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
