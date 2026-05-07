import { loadAbi } from "./prime-client.js";
import { ethers } from "ethers";

console.log("Loading ABI...");
const abi = loadAbi();
console.log("ABI loaded, length:", abi.length);

// Let's see if the ABI is valid by trying to create an Interface
console.log("Creating Interface...");
let iface;
try {
  iface = new ethers.Interface(abi);
  console.log("Interface created successfully.");
} catch (e) {
  console.error("Failed to create Interface:", e.message);
  process.exit(1);
}

// Now list the functions in the interface
console.log("Interface functions:");
iface.fragments.forEach(f => {
  if (f.type === "function") {
    console.log(f.name);
  }
});

// Now try to encode revealApplication with the same args as before
console.log("\nTrying to encode revealApplication...");
try {
  const data = iface.encodeFunctionData("revealApplication", [
    BigInt(1001),
    "fixture-agent",
    ["0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"],
    "0xsalt1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab",
    "ipfs://bafybeigdyrzt5wfp7ud7aghu7q4tfy5t3sa6rllghx62e6n2qgz6fudaaq/application.md"
  ]);
  console.log("Success! data:", data);
} catch (e) {
  console.error("Failed to encode revealApplication:", e.message);
  console.error("Error details:", e);
}