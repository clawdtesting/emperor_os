import { ethers } from "ethers";
import { PRIME_CONTRACT, AGIALPHA_TOKEN } from "./prime-client.js";
import { CONFIG } from "./config.js";
import primeAbi from "./abi/AGIJobDiscoveryPrime.json" with { type: "json" };
import agiJobManagerAbi from "../core/AGIJobManager.json" with { type: "json" };

const PRIME_IFACE = new ethers.Interface(primeAbi);
const JOB_IFACE = new ethers.Interface(agiJobManagerAbi);

const SELECTOR_ALLOWLIST = {
  commitApplication: new Set([PRIME_IFACE.getFunction("commitApplication").selector.toLowerCase()]),
  revealApplication: new Set([PRIME_IFACE.getFunction("revealApplication").selector.toLowerCase()]),
  acceptFinalist: new Set([PRIME_IFACE.getFunction("acceptFinalist").selector.toLowerCase()]),
  submitTrial: new Set([PRIME_IFACE.getFunction("submitTrial").selector.toLowerCase()]),
  approve: new Set(["0x095ea7b3"]),
  requestJobCompletion: new Set([JOB_IFACE.getFunction("requestJobCompletion").selector.toLowerCase()]),
  scoreCommit: new Set(),
  scoreReveal: new Set(),
};

export function validatePrimeUnsignedTxPackage(unsignedPkg) {
  if (!unsignedPkg || typeof unsignedPkg !== "object") throw new Error("unsigned package missing");
  if (Number(unsignedPkg.chainId) !== Number(CONFIG.CHAIN_ID)) throw new Error(`unexpected chainId: ${unsignedPkg.chainId}`);
  if (unsignedPkg.schema !== "emperor-os/prime-unsigned-tx/v1") throw new Error(`unexpected schema: ${unsignedPkg.schema}`);

  const fn = String(unsignedPkg.function ?? "");
  const selector = String(unsignedPkg.calldata ?? "").slice(0, 10).toLowerCase();
  const allowed = SELECTOR_ALLOWLIST[fn];
  if (!allowed) throw new Error(`no selector policy for function=${fn}`);
  if (allowed.size > 0 && !allowed.has(selector)) throw new Error(`unexpected selector ${selector} for ${fn}`);

  const to = String(unsignedPkg.target ?? "").toLowerCase();
  if (["commitApplication", "revealApplication", "acceptFinalist", "submitTrial"].includes(fn)) {
    if (to !== PRIME_CONTRACT.toLowerCase()) throw new Error(`target mismatch for ${fn}`);
  }
  if (fn === "approve") {
    if (to !== AGIALPHA_TOKEN.toLowerCase()) throw new Error("approve target must be AGIALPHA token");
  }
  if (fn === "requestJobCompletion") {
    if (to !== String(CONFIG.CONTRACT).toLowerCase()) throw new Error("requestJobCompletion target mismatch");
  }

  return { ok: true, selector, functionName: fn, target: unsignedPkg.target };
}
