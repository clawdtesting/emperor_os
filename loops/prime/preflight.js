// save as preflight.js in agi-agent/
import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.ETH_RPC_URL);
const CONTRACT1 = "0xB3AAeb69b630f0299791679c063d68d6687481d1";

const ABI = [
  "function additionalAgents(address) view returns (bool)",
  "function isAuthorizedAgent(address, string, bytes32[]) view returns (bool)",
  "function getHighestPayoutPercentage(address) view returns (uint256)",
  "function agentMerkleRoot() view returns (bytes32)",
  "function agiTypes(uint256) view returns (address nftAddress, uint256 payoutPercentage)",
  "function maxActiveJobsPerAgent() view returns (uint256)",
  "function agentBond() view returns (uint256)",
  "function agiToken() view returns (address)"
];

const contract = new ethers.Contract(CONTRACT1, ABI, provider);
const wallet   = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY);
const agent    = wallet.address;

console.log("\n=== Emperor_OS Pre-flight Check ===");
console.log("Agent address  :", agent);
console.log("Subdomain      : lobster0");

// 1. ENS auth
try {
  const auth = await contract.isAuthorizedAgent(agent, "lobster0", []);
  console.log("\n✅ ENS authorized      :", auth);
} catch(e) {
  console.log("\n❌ ENS auth failed     :", e.message);
}

// 2. AGI NFT payout tier
try {
  const pct = await contract.getHighestPayoutPercentage(agent);
  console.log("✅ Payout percentage   :", pct.toString(), "%");
  if (pct === 0n) console.log("   ⚠️  Will revert IneligibleAgentPayout — need an AGI NFT");
} catch(e) {
  console.log("❌ Payout check failed :", e.message);
}

// 3. AGI token + balance
const tokenAddress = await contract.agiToken();
const tokenABI = ["function balanceOf(address) view returns (uint256)"];
const token = new ethers.Contract(tokenAddress, tokenABI, provider);
const balance = await token.balanceOf(agent);
console.log("✅ $AGIALPHA balance   :", ethers.formatEther(balance), "AGIALPHA");

// 4. Agent bond required
const bond = await contract.agentBond();
console.log("✅ Agent bond required :", ethers.formatEther(bond), "AGIALPHA");

// 5. Max active jobs
const maxJobs = await contract.maxActiveJobsPerAgent();
console.log("✅ Max active jobs     :", maxJobs.toString());

console.log("\n=== Summary ===");
console.log("If ENS=true + payout>0 + balance>bond → ready to applyForJob()");
console.log("If payout=0 → contact alpha.agi.eth to get AGI NFT assigned to your wallet");
