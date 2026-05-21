/**
 * Verify aUSDC on LiteForge Blockscout (single-file).
 *
 * Usage (from contracts/):
 *   node scripts/verify-ausdc-blockscout.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const AUSDC = "0x72F4efAC9133d28fa05aEbc9edCd8fC3dE14BB50";
const LEGACY_USDC = "0xd5118dEe968d1533B2A57aB66C266010AD8957fa";
const EXPLORER_API = "https://liteforge.explorer.caldera.xyz/api";
const SOURCE = path.join(__dirname, "../src/addax/AUSDC.sol");

const compilerVersion = "v0.8.20+commit.a1b79de6";

async function checkVerified() {
  const res = await fetch(
    `https://liteforge.explorer.caldera.xyz/api/v2/smart-contracts/${AUSDC}`,
  );
  if (!res.ok) return false;
  const data = await res.json();
  return Boolean(data.is_verified);
}

async function submitVerify() {
  const sourceCode = fs.readFileSync(SOURCE, "utf8");
  const constructorArguements = ethers.utils.defaultAbiCoder
    .encode(["address"], [LEGACY_USDC])
    .slice(2);

  const params = new URLSearchParams({
    module: "contract",
    action: "verifysourcecode",
    codeformat: "solidity-single-file",
    contractaddress: AUSDC,
    contractname: "AUSDC",
    compilerversion: compilerVersion,
    optimizationUsed: "1",
    runs: "200",
    constructorArguements,
    evmversion: "paris",
    sourceCode,
  });

  const res = await fetch(`${EXPLORER_API}?${params.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response: ${text.slice(0, 500)}`);
  }
  return json;
}

async function pollGuid(guid) {
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(
      `${EXPLORER_API}?module=contract&action=checkverifystatus&guid=${guid}`,
    );
    const json = await res.json();
    console.log("  poll:", json.message ?? json.result);
    if (json.status === "1" && json.result === "Pass - Verified") {
      return true;
    }
    if (json.result?.includes?.("Fail") || json.result?.includes?.("Error")) {
      throw new Error(json.result);
    }
  }
  return false;
}

async function main() {
  console.log("Contract:", AUSDC);
  console.log("Constructor arg (underlying USDC):", LEGACY_USDC);

  if (await checkVerified()) {
    console.log("Already verified on Blockscout.");
    return;
  }

  console.log("Submitting verification...");
  const submit = await submitVerify();
  console.log("Submit response:", submit);

  if (submit.status !== "1") {
    throw new Error(submit.result || submit.message || "verify submit failed");
  }

  const guid = submit.result;
  console.log("GUID:", guid);
  const ok = await pollGuid(guid);
  if (ok) {
    console.log("Verified:", `https://liteforge.explorer.caldera.xyz/address/${AUSDC}#code`);
  } else {
    console.log("Timed out — check explorer manually with GUID", guid);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
