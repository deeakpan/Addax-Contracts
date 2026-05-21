require("@nomiclabs/hardhat-ethers");
require("dotenv").config({ path: require("path").join(__dirname, ".env") });
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { PRIVATE_KEY } = process.env;

/** @type import("hardhat/config").HardhatUserConfig */
module.exports = {
  paths: {
    sources: "./perps",
  },
  solidity: {
    version: "0.6.12",
    settings: {
      // Low runs shrinks bytecode (Vault / PositionRouter exceed 24kB at runs: 200).
      optimizer: { enabled: true, runs: 10 },
    },
  },
  networks: {
    liteforge: {
      url: process.env.PONDER_RPC_URL ?? "https://liteforge.rpc.caldera.xyz/http",
      chainId: 4441,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
};
