const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const ONMI_FUN_ROUTER = "0xe351c47c3b96844f46e9808a7d5bba8101bffb57";

async function main() {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const deploymentPath = path.join(__dirname, "..", "deployments", "liteforge.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const aggregatorAddress = deployment?.contracts?.AddaxAggregatorV3;
  if (!aggregatorAddress) throw new Error("AddaxAggregatorV3 missing from deployments/liteforge.json");

  const agg = await ethers.getContractAt("AddaxAggregatorV3", aggregatorAddress, deployer);
  const allowed = await agg.allowedRouters(ONMI_FUN_ROUTER);
  console.log(`Aggregator: ${aggregatorAddress}`);
  console.log(`Onmi router: ${ONMI_FUN_ROUTER}`);
  console.log(`Already allowlisted: ${allowed}`);
  if (allowed) return;

  const tx = await agg.addRouter(ONMI_FUN_ROUTER);
  await tx.wait();
  console.log(`Allowlisted in tx: ${tx.hash}`);

  deployment.contracts = deployment.contracts ?? {};
  deployment.contracts.OnmiFunRouter = ONMI_FUN_ROUTER;
  fs.writeFileSync(deploymentPath, `${JSON.stringify(deployment, null, 2)}\n`);
  console.log(`Updated ${deploymentPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
