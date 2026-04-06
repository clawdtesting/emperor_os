// audits/lib/constants.js
// Canonical constants used across all audit checks.

import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const AUDITS_ROOT = path.resolve(__dirname, "..");
export const WORKSPACE_ROOT = path.resolve(AUDITS_ROOT, "..");
export const AGENT_ROOT = path.resolve(WORKSPACE_ROOT, "agent");
export const CORE_ROOT = path.resolve(WORKSPACE_ROOT, "core");
export const ARTIFACTS_ROOT = path.resolve(WORKSPACE_ROOT, "artifacts");
export const REPORTS_DIR = path.resolve(AUDITS_ROOT, "reports");
export const LATEST_REPORT_DIR = path.resolve(REPORTS_DIR, "latest");
export const HISTORY_REPORT_DIR = path.resolve(REPORTS_DIR, "history");
export const FIXTURES_DIR = path.resolve(AUDITS_ROOT, "fixtures");

export const MAINNET_CHAIN_ID = 1;
export const BASE_CHAIN_ID = 8453;
export const BASE_SEPOLIA_CHAIN_ID = 84532;

export const AGI_JOB_MANAGER = "0xB3AAeb69b630f0299791679c063d68d6687481d1";
export const AGI_JOB_DISCOVERY_PRIME = "0xd5EF1dde7Ac60488f697ff2A7967a52172A78F29";
export const AGIALPHA_TOKEN = "0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA";

export const FORBIDDEN_SIGNING_PATTERNS = [
  "signTransaction",
  "sendTransaction",
  "sendRawTransaction",
  "signTypedData",
  "personal_sign",
  "eth_sign",
  "wallet.signTransaction",
  "wallet.sendTransaction",
  "signer.sendTransaction",
  "signer.signTransaction",
  "privateKeyToAccount",
  "new Wallet(",
  "fromPrivateKey",
];

export const FORBIDDEN_BROADCAST_PATTERNS = [
  "broadcastTransaction",
  "eth_sendRawTransaction",
  "provider.broadcastTransaction",
  "sendSignedTransaction",
];

export const REQUIRED_DOCTRINE_FILES = [
  "AGENTS.md",
  "SOUL.md",
  "USER.md",
  "TOOLS.md",
];

export const MAX_FRESHNESS_MS = 30 * 60 * 1000; // 30 minutes

export const AUDIT_FAMILIES = [
  "static",
  "safety",
  "protocol",
  "presign",
  "functional",
  "recovery",
  "artifact",
  "doctrine",
  "integration",
  "determinism",
  "performance",
  "economics",
];
