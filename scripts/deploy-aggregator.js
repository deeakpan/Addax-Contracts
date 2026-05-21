/**
 * Standalone aggregator deploy:
 *   1. Deploy AddaxAggregatorV3
 *   2. Allowlist AddaxV3SwapRouter (existing)
 *   3. Allowlist Onmi Fun router
 *   4. Update deployments/liteforge.json
 *
 * Run:
 *   npx hardhat run --config hardhat.addax.config.js scripts/deploy-aggregator.js --network liteforge
 */

const fs   = require("fs");
const path = require("path");
const hre  = require("hardhat");

const ONMI_FUN_ROUTER = "0xe351c47c3b96844f46e9808a7d5bba8101bffb57";

function readDeployment(outputPath) {
  if (!fs.existsSync(outputPath)) return {};
  try { return JSON.parse(fs.readFileSync(outputPath, "utf8")); } catch { return {}; }
}

async function main() {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();

  const outputDir  = path.join(__dirname, "..", "deployments");
  const outputPath = path.join(outputDir, "liteforge.json");
  fs.mkdirSync(outputDir, { recursive: true });

  const existing = readDeployment(outputPath);
  const v3Router = existing?.contracts?.AddaxV3SwapRouter;
  if (!v3Router) throw new Error("AddaxV3SwapRouter not found in liteforge.json. Run deploy-addax.js first.");

  console.log(`\nDeployer:       ${deployer.address}`);
  console.log(`AddaxV3Router:  ${v3Router}`);
  console.log(`OnmiFunRouter:  ${ONMI_FUN_ROUTER}`);

  // ── Deploy aggregator ───────────────────────────────────────────────────────
  console.log("\n── Deploying AddaxAggregatorV3 ──");
  const AggFactory = await ethers.getContractFactory("AddaxAggregatorV3");
  const aggregator = await AggFactory.connect(deployer).deploy();
  await aggregator.deployed();
  console.log(`  ✓ AddaxAggregatorV3 → ${aggregator.address}`);

  // ── Allowlist routers ───────────────────────────────────────────────────────
  console.log("\n── Allowlisting routers ──");

  const tx1 = await aggregator.addRouter(v3Router);
  await tx1.wait();
  console.log(`  ✓ Allowlisted AddaxV3SwapRouter (${v3Router})`);

  const tx2 = await aggregator.addRouter(ONMI_FUN_ROUTER);
  await tx2.wait();
  console.log(`  ✓ Allowlisted OnmiFunRouter (${ONMI_FUN_ROUTER})`);

  // ── Update deployment ────────────────────────────────────────────────────────
  const updated = {
    ...existing,
    contracts: {
      ...(existing.contracts ?? {}),
      AddaxAggregatorV3: aggregator.address,
      OnmiFunRouter:     ONMI_FUN_ROUTER,
    },
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(updated, null, 2)}\n`);
  console.log(`\nDeployment written to ${outputPath}`);
  console.log(`  AddaxAggregatorV3: ${aggregator.address}`);
  console.log(`  OnmiFunRouter:     ${ONMI_FUN_ROUTER}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
