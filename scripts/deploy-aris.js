const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

function readJsonOrEmpty(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

async function main() {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const timestamp = new Date().toISOString();

  const protocolFeeOwner = ethers.utils.getAddress(
    process.env.ARIS_PROTOCOL_FEE_OWNER || deployer.address,
  );

  const Permit2Factory = await ethers.getContractFactory("ArisPermit2");
  const permit2 = await Permit2Factory.connect(deployer).deploy();
  await permit2.deployed();

  const DutchFactory = await ethers.getContractFactory("ArisDutchOrderReactor");
  const dutch = await DutchFactory.connect(deployer).deploy(
    permit2.address,
    protocolFeeOwner,
  );
  await dutch.deployed();

  const ExclusiveFactory = await ethers.getContractFactory(
    "ArisExclusiveDutchOrderReactor",
  );
  const exclusive = await ExclusiveFactory.connect(deployer).deploy(
    permit2.address,
    protocolFeeOwner,
  );
  await exclusive.deployed();

  const LimitFactory = await ethers.getContractFactory("ArisLimitOrderReactor");
  const limit = await LimitFactory.connect(deployer).deploy(
    permit2.address,
    protocolFeeOwner,
  );
  await limit.deployed();

  const DcaFactory = await ethers.getContractFactory("ArisDcaOrderReactor");
  const dca = await DcaFactory.connect(deployer).deploy(
    permit2.address,
    protocolFeeOwner,
  );
  await dca.deployed();

  const outputDir = path.join(__dirname, "..", "deployments");
  const outputPath = path.join(outputDir, "liteforge.json");
  fs.mkdirSync(outputDir, { recursive: true });

  const existing = readJsonOrEmpty(outputPath);
  const merged = {
    ...existing,
    project: existing.project || "addax",
    networkName: existing.networkName || "LitVM LiteForge",
    chainId: Number(network.chainId),
    deployedAt: timestamp,
    deployer: deployer.address,
    contracts: {
      ...(existing.contracts || {}),
      ArisPermit2: permit2.address,
      ArisDutchOrderReactor: dutch.address,
      ArisExclusiveDutchOrderReactor: exclusive.address,
      ArisLimitOrderReactor: limit.address,
      ArisDcaOrderReactor: dca.address,
    },
    aris: {
      deployedAt: timestamp,
      protocolFeeOwner,
      contracts: {
        ArisPermit2: permit2.address,
        ArisDutchOrderReactor: dutch.address,
        ArisExclusiveDutchOrderReactor: exclusive.address,
        ArisLimitOrderReactor: limit.address,
        ArisDcaOrderReactor: dca.address,
      },
    },
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(merged, null, 2)}\n`);

  console.log("ARIS deployment complete");
  console.log(JSON.stringify(merged.aris, null, 2));
  console.log(`Updated deployment file: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
