/**
 * v3-periphery artifacts embed PoolAddress.POOL_INIT_CODE_HASH (Uniswap canonical pool bytecode).
 * Addax uses locally built UniswapV3Pool — keccak256(creationBytecode) differs.
 * This script copies selected periphery artifacts from node_modules and replaces the hash in bytecode.
 *
 * Run from contracts/:  node scripts/patch-periphery-pool-init-hash.js
 * Hash is read from Hardhat output: artifacts/v3-core/contracts/UniswapV3Pool.sol/UniswapV3Pool.json
 */
const fs = require("fs");
const path = require("path");
const { keccak256 } = require("ethers").utils;

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "patched-v3-periphery-artifacts");

const STANDARD =
  "e34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54";

const ARTIFACTS = [
  "contracts/SwapRouter.sol/SwapRouter.json",
  "contracts/lens/QuoterV2.sol/QuoterV2.json",
  "contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json",
  "contracts/NonfungibleTokenPositionDescriptor.sol/NonfungibleTokenPositionDescriptor.json",
];

function loadPoolInitHashFromCoreBuild() {
  const poolArt = path.join(
    ROOT,
    "artifacts",
    "v3-core",
    "contracts",
    "UniswapV3Pool.sol",
    "UniswapV3Pool.json",
  );
  const j = JSON.parse(fs.readFileSync(poolArt, "utf8"));
  if (!j.bytecode) throw new Error("Missing UniswapV3Pool bytecode");
  const h = keccak256(j.bytecode).replace(/^0x/, "");
  return h;
}

function main() {
  const newHash = loadPoolInitHashFromCoreBuild();
  if (newHash === STANDARD) {
    console.warn(
      "Pool bytecode hash matches standard Uniswap — patch would be a no-op.",
    );
  }

  const nm = path.join(ROOT, "node_modules", "@uniswap", "v3-periphery", "artifacts");
  let total = 0;

  for (const rel of ARTIFACTS) {
    const src = path.join(nm, rel);
    const dst = path.join(OUT_DIR, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    const raw = fs.readFileSync(src, "utf8");
    const count = raw.split(STANDARD).length - 1;
    if (count === 0) {
      console.warn(`No standard hash in ${rel} — skipped or already patched?`);
    }
    const patched = raw.split(STANDARD).join(newHash);
    fs.writeFileSync(dst, patched);
    total += count;
    console.log(`Patched ${rel} (${count} replacements)`);
  }

  console.log(`\nDone. ${total} total replacements. New POOL_INIT_CODE_HASH 0x${newHash}`);
  console.log(`Output: ${OUT_DIR}`);
}

main();
