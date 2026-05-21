import fs from "fs";
import { ethers } from "ethers";

const d = JSON.parse(fs.readFileSync("deployments/liteforge-perps.json", "utf8"));
const provider = new ethers.providers.JsonRpcProvider(
  process.env.PONDER_RPC_URL ?? "https://liteforge.rpc.caldera.xyz/http",
);
const vault = new ethers.Contract(
  d.contracts.Vault,
  [
    "function tokenDecimals(address) view returns (uint256)",
    "function getAumInUsdg(bool) view returns (uint256)",
  ],
  provider,
);
const gm = new ethers.Contract(
  d.contracts.GlpManager,
  ["function getAumInUsdg(bool) view returns (uint256)"],
  provider,
);
for (const [n, a] of [
  ["aUSDC", d.tokens.aUSDC],
  ["fnUSD", d.tokens.fnUSD],
  ["wzkLTC", d.tokens.wzkLTC],
]) {
  console.log(n, "vault decimals", (await vault.tokenDecimals(a)).toString());
}
console.log("glpManager aum max", (await gm.getAumInUsdg(true)).toString());
