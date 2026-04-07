import { ethers } from "ethers";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const abi = JSON.parse(readFileSync(join(__dirname, "../agent/abi/FreeTrialSubdomainRegistrarIdentity.json"), "utf8"));

const REGISTRAR = "0x7811993CbcCa3b8bb35a3d919F3BA59eeFbeAA9a";
const LABEL     = "emperoros";

const rpcUrl = process.env.ETH_RPC_URL?.trim() || 'https://eth.llamarpc.com';
const provider = new ethers.JsonRpcProvider(rpcUrl);
const wallet   = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY?.trim(), provider);
const contract = new ethers.Contract(REGISTRAR, abi, wallet);

console.log("Agent address :", wallet.address);
console.log("RPC URL       :", rpcUrl);
console.log("Label         :", LABEL);

// Check availability / claimability before sending tx
const preview = await contract.preview(LABEL);
console.log("\n── preview ──────────────────────────────────────");
console.log("validLabel      :", preview.validLabel);
console.log("availableOut    :", preview.availableOut);
console.log("identityExists  :", preview.identityExists);
console.log("registrable     :", preview.registrable);
console.log("claimable       :", preview.claimable);
console.log("tokenOwner      :", preview.tokenOwner);
console.log("wrappedOwner    :", preview.wrappedOwner);
console.log("─────────────────────────────────────────────────\n");

if (!preview.claimable) {
  console.error("ERROR: identity is not claimable.");
  if (preview.registrable) console.log("Hint: name is registrable — run register_agent workflow instead.");
  process.exit(1);
}

console.log("Calling claimIdentity...");
const tx = await contract.claimIdentity(LABEL);
console.log("Tx sent:", tx.hash);
console.log("Waiting for confirmation...");
const receipt = await tx.wait();
console.log("Confirmed in block:", receipt.blockNumber);
console.log("Status:", receipt.status === 1 ? "SUCCESS" : "FAILED");
console.log("Identity claimed:", `${LABEL}.alpha.agent.agi.eth`);
