import { fileURLToPath } from "url";
import path from "path";
import { createRequire } from "module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

function loadAbi() {
  return require("./abi/AGIJobDiscoveryPrime.json");
}

const abi = loadAbi();
console.log("Number of ABI items:", abi.length);
console.log("First item:", JSON.stringify(abi[0], null, 2));
const functions = abi.filter(item => item.type === "function");
console.log("Function names:", functions.map(f => f.name));

// Now try to create an interface
const { Interface } = require("ethers");
const iface = new Interface(abi);
console.log("Interface fragments:");
iface.fragments.forEach(f => {
  console.log(f.type, f.name);
});