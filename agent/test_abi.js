import { loadAbi } from "./prime-client.js";
import { ethers } from "ethers";

const abi = loadAbi();
console.log("ABI loaded:");
console.log(JSON.stringify(abi, null, 2));

const iface = new ethers.Interface(abi);
console.log("\nInterface functions:");
iface.fragments.forEach(f => {
  if (f.type === "function") {
    console.log(f.name);
  }
});

console.log("\nTrying to encode revealApplication...");
try {
  const data = iface.encodeFunctionData("revealApplication", [
    BigInt(1001),
    "test-agent",
    ["0x1111111111111111111111111111111111111111111111111111111111111111"],
    "0x3333333333333333333333333333333333333333333333333333333333333333",
    "ipfs://bafybeigdyrzt5wfp7ud7aghu7q4tfy5t3sa6rllghx62e6n2qgz6fudaaq/application.md"
  ]);
  console.log("Success:", data);
} catch (e) {
  console.error("Error:", e.message);
}