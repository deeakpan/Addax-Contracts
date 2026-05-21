require("@nomiclabs/hardhat-ethers");
require("dotenv").config();
const { PRIVATE_KEY } = process.env;

/** @type import("hardhat/config").HardhatUserConfig */
module.exports = {
  paths: {
    sources: "./v3-core/contracts",
  },
  solidity: {
    version: "0.7.6",
    settings: {
      optimizer: { enabled: true, runs: 1 },
      metadata: {
        bytecodeHash: "none",
      },
      debug: {
        revertStrings: "strip",
      },
    },
  },
  networks: {
    liteforge: {
      url: "https://liteforge.rpc.caldera.xyz/http",
      chainId: 4441,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
};
