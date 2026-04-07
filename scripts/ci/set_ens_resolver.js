import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

const rpcUrl   = process.env.ETH_RPC_URL?.trim() || 'https://eth.llamarpc.com';
const provider = new ethers.JsonRpcProvider(rpcUrl);
const wallet   = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY?.trim(), provider);

const ENS_NAME        = "emperoros.alpha.agent.agi.eth";
const node            = ethers.namehash(ENS_NAME);
const NAME_WRAPPER    = "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401";
const PUBLIC_RESOLVER = "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63";
const AGENT_ADDRESS   = wallet.address;

console.log("Agent    :", AGENT_ADDRESS);
console.log("ENS name :", ENS_NAME);
console.log("Node     :", node);
console.log("Resolver :", PUBLIC_RESOLVER);
console.log("");

const nameWrapperAbi = [
  "function setResolver(bytes32 node, address resolver) external",
];
const resolverAbi = [
  "function setAddr(bytes32 node, address addr) external",
  "function addr(bytes32 node) view returns (address)",
];

const nameWrapper = new ethers.Contract(NAME_WRAPPER, nameWrapperAbi, wallet);
const resolver    = new ethers.Contract(PUBLIC_RESOLVER, resolverAbi, wallet);

// Step 1: set resolver
console.log("Step 1: setting resolver via NameWrapper...");
const tx1 = await nameWrapper.setResolver(node, PUBLIC_RESOLVER);
console.log("  tx:", tx1.hash);
await tx1.wait();
console.log("  confirmed ✓");

// Step 2: set addr record
console.log("Step 2: setting ETH address record on resolver...");
const tx2 = await resolver.setAddr(node, AGENT_ADDRESS);
console.log("  tx:", tx2.hash);
await tx2.wait();
console.log("  confirmed ✓");

// Step 3: verify
console.log("Step 3: verifying...");
const resolved = await resolver.addr(node);
if (resolved.toLowerCase() === AGENT_ADDRESS.toLowerCase()) {
  console.log("\n✅ ENS resolves correctly:", resolved);
  console.log("   Re-run check_auth workflow to verify authorization.");
} else {
  console.log("\n❌ Verification failed. Resolved:", resolved);
  process.exit(1);
}
