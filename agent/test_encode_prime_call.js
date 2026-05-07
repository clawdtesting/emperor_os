import { encodePrimeCall } from "./prime-client.js";

console.log("Testing encodePrimeCall for revealApplication...");

try {
  const { to, data } = encodePrimeCall("revealApplication", [
    BigInt(1001),
    "fixture-agent",
    ["0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"],
    "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    "ipfs://bafybeih5d6o6w6l7k3m2n1o0p9z8x7v6u5t4s3r2q1p0o9n8m7l6k5j4i3h2g1f0e"
  ]);
  console.log("Success!");
  console.log("to:", to);
  console.log("data:", data);
} catch (e) {
  console.error("Error in encodePrimeCall:", e.message);
  console.error("Error stack:", e.stack);
}