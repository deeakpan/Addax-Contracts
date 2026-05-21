/**
 * Deploy Addax V3 stack using local v3-core (factory/pool) + patched v3-periphery artifacts.
 *
 * NonfungibleTokenPositionDescriptor requires the NFTDescriptor library — we deploy that library
 * first, then replace the linker placeholder in the descriptor bytecode (same as Solidity linker).
 *
 * Fee accounting summary: see ../FEE_SPLIT.txt (quoted from UniswapV3Pool.swap).
 *
 * Env:
 *   ADDAX_FACTORY_ADDRESS — optional. If set, skips factory deploy and only deploys periphery
 *                           (for fixing NPM/routers against an existing factory with pools).
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const PATCH_ROOT = path.join(__dirname, "..", "patched-v3-periphery-artifacts");

function loadPatchedArt(rel) {
  const p = path.join(PATCH_ROOT, rel);
  if (!fs.existsSync(p)) {
    throw new Error(
      `Missing ${p}. Run: npx hardhat compile && node scripts/patch-periphery-pool-init-hash.js`,
    );
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const SWAP_ROUTER_ART = loadPatchedArt("contracts/SwapRouter.sol/SwapRouter.json");
const QUOTER_V2_ART = loadPatchedArt("contracts/lens/QuoterV2.sol/QuoterV2.json");
const NFT_TOKEN_DESCRIPTOR_ART = loadPatchedArt(
  "contracts/NonfungibleTokenPositionDescriptor.sol/NonfungibleTokenPositionDescriptor.json",
);
const NPM_ART = loadPatchedArt("contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json");

const TICK_LENS_ART = require("@uniswap/v3-periphery/artifacts/contracts/lens/TickLens.sol/TickLens.json");
const MULTICALL_ART = require("@uniswap/v3-periphery/artifacts/contracts/lens/UniswapInterfaceMulticall.sol/UniswapInterfaceMulticall.json");
const NFT_DESCRIPTOR_LIB_ART = require("@uniswap/v3-periphery/artifacts/contracts/libraries/NFTDescriptor.sol/NFTDescriptor.json");

/** Solidity linker placeholder for NFTDescriptor inside NonfungibleTokenPositionDescriptor bytecode */
const NFT_DESCRIPTOR_PLACEHOLDER = "__$cea9be979eee3d87fb124d6cbb244bb0b5$__";

function linkDescriptorBytecode(bytecode, libraryAddress) {
  const addr = libraryAddress.replace(/^0x/i, "").toLowerCase();
  if (addr.length !== 40) {
    throw new Error(`Invalid library address for linking: ${libraryAddress}`);
  }
  if (!bytecode.includes(NFT_DESCRIPTOR_PLACEHOLDER)) {
    throw new Error("Descriptor bytecode missing expected NFTDescriptor placeholder");
  }
  return bytecode.split(NFT_DESCRIPTOR_PLACEHOLDER).join(addr);
}

async function deployArtifact(ethers, signer, artifact, args = []) {
  const factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    signer,
  );
  const c = await factory.deploy(...args);
  await c.deployed();
  return c;
}

async function main() {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const connectedNetwork = await ethers.provider.getNetwork();
  const timestamp = new Date().toISOString();

  const wzkLTC =
    process.env.WZK_LTC_ADDRESS?.trim() ||
    "0x60A84eBC3483fEFB251B76Aea5B8458026Ef4bea";

  const nativeLabel =
    process.env.NATIVE_CURRENCY_LABEL?.trim() || "zkLTC";
  const nativeCurrencyLabelBytes = ethers.utils.formatBytes32String(nativeLabel);

  const existingFactory = process.env.ADDAX_FACTORY_ADDRESS?.trim();
  let addaxV3Factory;
  if (existingFactory) {
    const fa = ethers.utils.getAddress(existingFactory);
    console.log("Using existing AddaxV3Factory (periphery-only deploy):", fa);
    addaxV3Factory = { address: fa };
  } else {
    const AddaxV3FactoryFactory = await ethers.getContractFactory("UniswapV3Factory");
    addaxV3Factory = await AddaxV3FactoryFactory.connect(deployer).deploy();
    await addaxV3Factory.deployed();
  }

  const addaxV3SwapRouter = await deployArtifact(
    ethers,
    deployer,
    SWAP_ROUTER_ART,
    [addaxV3Factory.address, wzkLTC],
  );

  const addaxV3QuoterV2 = await deployArtifact(ethers, deployer, QUOTER_V2_ART, [
    addaxV3Factory.address,
    wzkLTC,
  ]);

  const addaxV3TickLens = await deployArtifact(ethers, deployer, TICK_LENS_ART);
  const addaxV3Multicall = await deployArtifact(
    ethers,
    deployer,
    MULTICALL_ART,
  );

  const nftDescriptorLib = await deployArtifact(
    ethers,
    deployer,
    NFT_DESCRIPTOR_LIB_ART,
  );

  const linkedDescriptorBytecode = linkDescriptorBytecode(
    NFT_TOKEN_DESCRIPTOR_ART.bytecode,
    nftDescriptorLib.address,
  );
  const DescFactory = new ethers.ContractFactory(
    NFT_TOKEN_DESCRIPTOR_ART.abi,
    linkedDescriptorBytecode,
    deployer,
  );
  const addaxV3TokenDescriptor = await DescFactory.deploy(
    wzkLTC,
    nativeCurrencyLabelBytes,
  );
  await addaxV3TokenDescriptor.deployed();

  const addaxV3PositionManager = await deployArtifact(ethers, deployer, NPM_ART, [
    addaxV3Factory.address,
    wzkLTC,
    addaxV3TokenDescriptor.address,
  ]);

  const deployment = {
    project: "addax",
    protocol: "v3",
    networkName: "LitVM LiteForge",
    chainId: Number(connectedNetwork.chainId),
    gasToken: "zkLTC",
    rpcHttp: "https://liteforge.rpc.caldera.xyz/http",
    rpcWebSocket: "wss://liteforge.rpc.caldera.xyz/ws",
    blockExplorer: "https://liteforge.explorer.caldera.xyz",
    deployedAt: timestamp,
    deployer: deployer.address,
    contracts: {
      AddaxV3Factory: addaxV3Factory.address,
      AddaxV3SwapRouter: addaxV3SwapRouter.address,
      AddaxV3QuoterV2: addaxV3QuoterV2.address,
      AddaxV3NonfungiblePositionManager: addaxV3PositionManager.address,
      AddaxV3NonfungibleTokenPositionDescriptor: addaxV3TokenDescriptor.address,
      AddaxV3NFTDescriptorLibrary: nftDescriptorLib.address,
      AddaxV3TickLens: addaxV3TickLens.address,
      AddaxV3InterfaceMulticall: addaxV3Multicall.address,
      wzkLTC,
    },
    notes: {
      pools:
        "Create pools: AddaxV3Factory.createPool(tokenA, tokenB, fee). Typical fees: 500, 3000, 10000.",
      liquidity:
        "Mint/adjust LP positions via AddaxV3NonfungiblePositionManager (NFT positions).",
      quotes: "Off-chain quotes: AddaxV3QuoterV2 (staticcall, not a swap).",
      feeSplit: "See contracts/FEE_SPLIT.txt (UniswapV3Pool.swap fee + optional protocol cut).",
    },
  };

  const outputDir = path.join(__dirname, "..", "deployments");
  const outputPath = path.join(outputDir, "liteforge.json");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(deployment, null, 2));

  console.log(`Deployment JSON written to ${outputPath}`);
  console.log(JSON.stringify(deployment, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
