import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

const rpcUrl = process.env.ETH_RPC_URL?.trim() || 'https://eth.llamarpc.com';
const provider = new ethers.JsonRpcProvider(rpcUrl);

const CONTRACT1 = "0xB3AAeb69b630f0299791679c063d68d6687481d1";
const ABI = [
  "function additionalAgents(address) view returns (bool)",
  "function agentMerkleRoot() view returns (bytes32)",
  "function isAuthorizedAgent(address, string, bytes32[]) view returns (bool)",
  "function getHighestPayoutPercentage(address) view returns (uint256)",
  "function maxActiveJobsPerAgent() view returns (uint256)",
  "function agentBond() view returns (uint256)",
  "function agiToken() view returns (address)",
];

const contract    = new ethers.Contract(CONTRACT1, ABI, provider);
const agentAddress = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY?.trim()).address;

// Extract just the label from full ENS name (e.g. "emperoros.alpha.agent.agi.eth" → "emperoros")
const rawSubdomain = process.env.AGENT_SUBDOMAIN?.trim() || "";
const label = rawSubdomain.includes(".") ? rawSubdomain.split(".")[0] : rawSubdomain;

console.log("RPC URL      :", rpcUrl);
console.log("Agent address:", agentAddress);
console.log("ENS label    :", label);
console.log("");

// 1. Whitelist
const isWhitelisted = await contract.additionalAgents(agentAddress);
console.log("additionalAgents whitelist :", isWhitelisted);

// 2. ENS auth — pass label only, not full name
try {
  const isAuthorized = await contract.isAuthorizedAgent(agentAddress, label, []);
  console.log("ENS authorized             :", isAuthorized);
} catch(e) {
  console.log("ENS check failed           :", e.shortMessage || e.message);
}

// 3. Merkle root
const merkleRoot = await contract.agentMerkleRoot();
console.log("agentMerkleRoot            :", merkleRoot);
console.log("Merkle root empty          :", merkleRoot === ethers.ZeroHash);

// 4. AGI NFT payout tier
try {
  const pct = await contract.getHighestPayoutPercentage(agentAddress);
  console.log("Payout percentage          :", pct.toString(), "%");
  if (pct === 0n) console.log("  ⚠️  payout=0 → need an AGI NFT assigned to your wallet");
} catch(e) {
  console.log("Payout check failed        :", e.shortMessage || e.message);
}

// 5. $AGIALPHA balance vs bond
try {
  const tokenAddress = await contract.agiToken();
  const tokenABI     = ["function balanceOf(address) view returns (uint256)"];
  const token        = new ethers.Contract(tokenAddress, tokenABI, provider);
  const [balance, bond, maxJobs] = await Promise.all([
    token.balanceOf(agentAddress),
    contract.agentBond(),
    contract.maxActiveJobsPerAgent(),
  ]);
  console.log("$AGIALPHA balance          :", ethers.formatEther(balance));
  console.log("Agent bond required        :", ethers.formatEther(bond));
  console.log("Max active jobs            :", maxJobs.toString());
  const ready = balance >= bond;
  console.log("Balance >= bond            :", ready ? "✅ yes" : "❌ no — need more $AGIALPHA");
} catch(e) {
  console.log("Token/bond check failed    :", e.shortMessage || e.message);
}
