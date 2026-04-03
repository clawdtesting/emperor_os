import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

const rpcUrl   = process.env.ETH_RPC_URL?.trim() || 'https://eth.llamarpc.com';
const provider = new ethers.JsonRpcProvider(rpcUrl);

const ENS_NAME = "emperoros.alpha.agent.agi.eth";
const AGENT    = process.env.AGENT_PRIVATE_KEY?.trim()
  ? new ethers.Wallet(process.env.AGENT_PRIVATE_KEY.trim()).address
  : null;

const node = ethers.namehash(ENS_NAME);
console.log("ENS name  :", ENS_NAME);
console.log("Namehash  :", node);
if (AGENT) console.log("Agent addr:", AGENT);
console.log("");

// ENS registry
const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
const registryAbi  = [
  "function resolver(bytes32 node) view returns (address)",
  "function owner(bytes32 node) view returns (address)",
];
const registry = new ethers.Contract(ENS_REGISTRY, registryAbi, provider);

const resolverAddr = await registry.resolver(node);
const ensOwner     = await registry.owner(node);

console.log("ENS owner   :", ensOwner);
console.log("Resolver    :", resolverAddr);

if (resolverAddr === ethers.ZeroAddress) {
  console.log("\n❌ No resolver set for this name.");
  console.log("   You need to set a resolver and ETH address record via the ENS app or NameWrapper.");
  process.exit(1);
}

// Check addr record on resolver
const resolverAbi = [
  "function addr(bytes32 node) view returns (address)",
];
const resolver = new ethers.Contract(resolverAddr, resolverAbi, provider);

let resolved;
try {
  resolved = await resolver.addr(node);
} catch (e) {
  console.log("\n❌ addr() call failed:", e.shortMessage || e.message);
  process.exit(1);
}

console.log("Resolved addr:", resolved);

if (!AGENT) {
  console.log("\n(set AGENT_PRIVATE_KEY to compare against agent address)");
} else if (resolved.toLowerCase() === AGENT.toLowerCase()) {
  console.log("\n✅ ENS resolves correctly to agent address.");
  console.log("   The isAuthorizedAgent revert is likely a contract-side issue — contact protocol team.");
} else if (resolved === ethers.ZeroAddress) {
  console.log("\n❌ No ETH address record set.");
  console.log("   Fix: set addr record for", ENS_NAME, "to", AGENT);
  console.log("   via ENS app (app.ens.domains) or NameWrapper.");
} else {
  console.log("\n❌ Resolves to WRONG address.");
  console.log("   Expected:", AGENT);
  console.log("   Got     :", resolved);
  console.log("   Fix: update addr record via ENS app or NameWrapper.");
}
