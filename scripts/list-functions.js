const fs = require("fs");
const path = require("path");

const dep = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "deployments", "liteforge.json"), "utf8"),
);

const artifacts = {
  AddaxV3Factory: path.join(
    __dirname,
    "..",
    "artifacts",
    "v3-core",
    "contracts",
    "UniswapV3Factory.sol",
    "UniswapV3Factory.json",
  ),
  AddaxV3SwapRouter: require.resolve(
    "@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json",
  ),
  AddaxV3QuoterV2: require.resolve(
    "@uniswap/v3-periphery/artifacts/contracts/lens/QuoterV2.sol/QuoterV2.json",
  ),
  AddaxV3NonfungiblePositionManager: require.resolve(
    "@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json",
  ),
  AddaxV3NonfungibleTokenPositionDescriptor: require.resolve(
    "@uniswap/v3-periphery/artifacts/contracts/NonfungibleTokenPositionDescriptor.sol/NonfungibleTokenPositionDescriptor.json",
  ),
  AddaxV3NFTDescriptorLibrary: require.resolve(
    "@uniswap/v3-periphery/artifacts/contracts/libraries/NFTDescriptor.sol/NFTDescriptor.json",
  ),
  AddaxV3TickLens: require.resolve(
    "@uniswap/v3-periphery/artifacts/contracts/lens/TickLens.sol/TickLens.json",
  ),
  AddaxV3InterfaceMulticall: require.resolve(
    "@uniswap/v3-periphery/artifacts/contracts/lens/UniswapInterfaceMulticall.sol/UniswapInterfaceMulticall.json",
  ),
};

for (const [name, artifactPath] of Object.entries(artifacts)) {
  const abi = JSON.parse(fs.readFileSync(artifactPath, "utf8")).abi;
  const signatures = abi
    .filter((entry) => entry.type === "function")
    .map(
      (fn) => `${fn.name}(${(fn.inputs || []).map((input) => input.type).join(",")})`,
    )
    .sort();

  console.log(`\n${name} ${dep.contracts[name]}`);
  console.log(signatures.join("\n"));
}
