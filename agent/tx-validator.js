// ./agent/tx-validator.js
import { getAllowedContracts, getInterfaceForAddress } from "./abi-registry.js";
import { CONFIG } from "./config.js";

const UNSIGNED_TX_SCHEMA = "emperor-os/unsigned-tx/v1";

const EXPECTED_SELECTORS = {
  requestJobApplication: {
    AGI_JOB_MANAGER: new Set(["0x327c1255"]),
    AGIALPHA_TOKEN: new Set(["0x095ea7b3"])
  },
  requestJobCompletion: {
    AGI_JOB_MANAGER: new Set(["0x8d1bc00f"])
  }
};

function normalizeAddress(address) {
  return String(address ?? "").toLowerCase();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getSelector(data) {
  return String(data ?? "").slice(0, 10).toLowerCase();
}

function normalizeValueString(value) {
  return String(value ?? "0").trim();
}

function parseDecodedArgs(fragment, decoded) {
  const args = {};
  for (let i = 0; i < fragment.inputs.length; i += 1) {
    const input = fragment.inputs[i];
    const value = decoded[i];
    args[input.name || `arg${i}`] =
      typeof value === "bigint" ? value.toString() : value;
  }
  return args;
}

export async function validateUnsignedTxPackage(unsignedPkg, reviewContext = {}) {
  assert(unsignedPkg && typeof unsignedPkg === "object", "unsigned package missing");
  assert(unsignedPkg.schema === UNSIGNED_TX_SCHEMA, `unexpected schema: ${unsignedPkg.schema}`);
  assert(Number(unsignedPkg.chainId) === CONFIG.CHAIN_ID, `unexpected chainId: ${unsignedPkg.chainId}`);
  assert(unsignedPkg.to, "missing tx.to");
  assert(unsignedPkg.data, "missing tx.data");
  assert(unsignedPkg.kind, "missing tx.kind");
  assert(unsignedPkg.jobId != null, "missing jobId");

  const allowedContracts = await getAllowedContracts();
  const target = normalizeAddress(unsignedPkg.to);

  assert(allowedContracts.has(target), `target not allowlisted: ${unsignedPkg.to}`);

  if (normalizeValueString(unsignedPkg.value) !== "0") {
    throw new Error(`unexpected nonzero value: ${unsignedPkg.value}`);
  }

  const { contractKey, iface } = await getInterfaceForAddress(unsignedPkg.to);
  const selector = getSelector(unsignedPkg.data);

  const allowedSelectors = EXPECTED_SELECTORS[unsignedPkg.kind]?.[contractKey];
  assert(allowedSelectors, `no selector policy for kind=${unsignedPkg.kind} contract=${contractKey}`);
  assert(allowedSelectors.has(selector), `unexpected selector ${selector} for ${unsignedPkg.kind}/${contractKey}`);

  const parsed = iface.parseTransaction({
    data: unsignedPkg.data,
    value: unsignedPkg.value ?? "0"
  });

  assert(parsed, "failed to parse calldata");

  const decodedArgs = parseDecodedArgs(parsed.fragment, parsed.args);

  if (unsignedPkg.kind === "requestJobCompletion") {
    const expectedJobId = String(reviewContext.jobId ?? unsignedPkg.jobId);
    const expectedUri = String(reviewContext.jobCompletionUri ?? unsignedPkg.jobCompletionURI ?? "");

    assert(String(decodedArgs._jobId ?? decodedArgs.jobId ?? decodedArgs.arg0) === expectedJobId,
      `decoded jobId mismatch: expected ${expectedJobId}`);

    assert(String(decodedArgs._jobCompletionURI ?? decodedArgs.jobCompletionURI ?? decodedArgs.arg1) === expectedUri,
      "decoded jobCompletionURI mismatch");
  }

  if (unsignedPkg.kind === "requestJobApplication" && contractKey === "AGI_JOB_MANAGER") {
    const expectedJobId = String(reviewContext.jobId ?? unsignedPkg.jobId);
    const expectedSubdomain = String(reviewContext.agentSubdomain ?? unsignedPkg.agentSubdomain ?? "");

    assert(String(decodedArgs._jobId ?? decodedArgs.jobId ?? decodedArgs.arg0) === expectedJobId,
      `decoded jobId mismatch: expected ${expectedJobId}`);

    assert(String(decodedArgs.subdomain ?? decodedArgs._subdomain ?? decodedArgs.arg1) === expectedSubdomain,
      "decoded subdomain mismatch");
  }

  if (unsignedPkg.kind === "requestJobApplication" && contractKey === "AGIALPHA_TOKEN") {
    const spender =
      String(decodedArgs.spender ?? decodedArgs._spender ?? decodedArgs.arg0 ?? "").toLowerCase();

    assert(spender === normalizeAddress(CONFIG.CONTRACT),
      `ERC20 approve spender mismatch: ${spender}`);
  }

  return {
    ok: true,
    contractKey,
    selector,
    functionName: parsed.name,
    decodedArgs
  };
}
