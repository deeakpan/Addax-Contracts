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

  const outputDir = path.join(__dirname, "..", "deployments");
  const outputPath = path.join(outputDir, "liteforge.json");
  fs.mkdirSync(outputDir, { recursive: true });

  const existing = readJsonOrEmpty(outputPath);
  const permit2FromFile = existing?.contracts?.ArisPermit2;
  const permit2Address = ethers.utils.getAddress(
    process.env.ARIS_PERMIT2_ADDRESS || permit2FromFile || "",
  );
  const protocolFeeOwner = ethers.utils.getAddress(
    process.env.ARIS_PROTOCOL_FEE_OWNER || existing?.aris?.protocolFeeOwner || deployer.address,
  );

  if (!permit2Address) {
    throw new Error(
      "Missing ArisPermit2 address. Set ARIS_PERMIT2_ADDRESS or deploy ARIS core first.",
    );
  }

  const DcaFactory = await ethers.getContractFactory("ArisDcaOrderReactor");
  const dca = await DcaFactory.connect(deployer).deploy(
    permit2Address,
    protocolFeeOwner,
  );
  await dca.deployed();

  const merged = {
    ...existing,
    project: existing.project || "addax",
    networkName: existing.networkName || "LitVM LiteForge",
    chainId: Number(network.chainId),
    deployedAt: timestamp,
    deployer: deployer.address,
    contracts: {
      ...(existing.contracts || {}),
      ArisDcaOrderReactor: dca.address,
    },
    aris: {
      ...(existing.aris || {}),
      deployedAt: timestamp,
      protocolFeeOwner,
      contracts: {
        ...((existing.aris && existing.aris.contracts) || {}),
        ArisDcaOrderReactor: dca.address,
      },
    },
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(merged, null, 2)}\n`);

  console.log("ARIS DCA deployment complete");
  console.log(
    JSON.stringify(
      {
        ArisDcaOrderReactor: dca.address,
        ArisPermit2: permit2Address,
        protocolFeeOwner,
      },
      null,
      2,
    ),
  );
  console.log(`Updated deployment file: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
