import { ethers } from "ethers";
import { PRIME_CONTRACT, AGIALPHA_TOKEN } from "./prime-client.js";
import { CONFIG } from "./config.js";
import primeAbi from "./abi/AGIJobDiscoveryPrime.json" with { type: "json" };
import agiJobManagerAbi from "./abi/AGIJobManager.json" with { type: "json" };

const PRIME_IFACE = new ethers.Interface(primeAbi);
const JOB_IFACE = new ethers.Interface(agiJobManagerAbi);
function selectorOrNull(iface, fnName) {
  try {
    return iface.getFunction(fnName).selector.toLowerCase();
  } catch {
    return null;
  }
}

const SELECTOR_ALLOWLIST = {
  commitApplication: new Set([selectorOrNull(PRIME_IFACE, "commitApplication")].filter(Boolean)),
  revealApplication: new Set([selectorOrNull(PRIME_IFACE, "revealApplication")].filter(Boolean)),
  acceptFinalist: new Set([selectorOrNull(PRIME_IFACE, "acceptFinalist")].filter(Boolean)),
  submitTrial: new Set([selectorOrNull(PRIME_IFACE, "submitTrial")].filter(Boolean)),
  approve: new Set(["0x095ea7b3"]),
  requestJobCompletion: new Set([selectorOrNull(JOB_IFACE, "requestJobCompletion")].filter(Boolean)),
  scoreCommit: new Set([selectorOrNull(PRIME_IFACE, "scoreCommit")].filter(Boolean)),
  scoreReveal: new Set([selectorOrNull(PRIME_IFACE, "scoreReveal")].filter(Boolean)),
};

export function validatePrimeUnsignedTxPackage(unsignedPkg) {
  if (!unsignedPkg || typeof unsignedPkg !== "object") throw new Error("unsigned package missing");
  if (Number(unsignedPkg.chainId) !== Number(CONFIG.CHAIN_ID)) throw new Error(`unexpected chainId: ${unsignedPkg.chainId}`);
  if (unsignedPkg.schema !== "emperor-os/prime-unsigned-tx/v1") throw new Error(`unexpected schema: ${unsignedPkg.schema}`);

  const fn = String(unsignedPkg.function ?? "");
  const selector = String(unsignedPkg.calldata ?? "").slice(0, 10).toLowerCase();
  const allowed = SELECTOR_ALLOWLIST[fn];
  if (!allowed) throw new Error(`no selector policy for function=${fn}`);
  if (allowed.size === 0) throw new Error(`selector allowlist is empty for ${fn}`);
  if (!allowed.has(selector)) throw new Error(`unexpected selector ${selector} for ${fn}`);

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
  const expiresAtMs = Date.parse(String(unsignedPkg.expiresAt ?? ""));
  if (!Number.isFinite(expiresAtMs)) throw new Error("unsigned package missing valid expiresAt");
  if (expiresAtMs <= Date.now()) throw new Error(`unsigned package expired at ${unsignedPkg.expiresAt}`);

  return { ok: true, selector, functionName: fn, target: unsignedPkg.target };
}
