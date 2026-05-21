import fs from "fs";
import { ethers } from "ethers";

const d = JSON.parse(fs.readFileSync("deployments/liteforge-perps.json", "utf8"));
const provider = new ethers.providers.JsonRpcProvider(
  process.env.PONDER_RPC_URL ?? "https://liteforge.rpc.caldera.xyz/http",
);
const vault = new ethers.Contract(
  d.contracts.Vault,
  [
    "function poolAmounts(address) view returns (uint256)",
    "function usdgAmounts(address) view returns (uint256)",
  ],
  provider,
);
const erc20 = ["function balanceOf(address) view returns (uint256)"];
const v = d.contracts.Vault;
for (const [n, a] of [
  ["aUSDC", d.tokens.aUSDC],
  ["fnUSD", d.tokens.fnUSD],
  ["wzkLTC", d.tokens.wzkLTC],
]) {
  const t = new ethers.Contract(a, erc20, provider);
  console.log(n, {
    pool: (await vault.poolAmounts(a)).toString(),
    usdg: (await vault.usdgAmounts(a)).toString(),
    vaultBal: (await t.balanceOf(v)).toString(),
  });
}
