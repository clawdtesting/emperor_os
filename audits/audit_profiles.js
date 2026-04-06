// audits/audit_profiles.js
// Defines audit profiles — which families run under which conditions.
// Profiles: fast, full, presign, runtime.

import { getEnabledFamilies } from "./lib/audit_registry.js";

export const PROFILES = {
  // Fast audit — runs before deploy, before starting worker, on repo change
  // Target: very fast, seconds only
  fast: {
    label: "Fast Audit",
    description: "Quick confidence check — runs on every code change, before deploy, before worker startup",
    families: getEnabledFamilies("fast"),
    timeoutMs: 30000,
    blocking: true,
  },

  // Full audit — runs nightly, pre-release, manual operator review
  // Target: deep confidence, minutes
  full: {
    label: "Full Audit",
    description: "Deep confidence check — runs nightly, pre-release, or on manual operator command",
    families: getEnabledFamilies("full"),
    timeoutMs: 300000,
    blocking: false,
  },

  // Pre-sign audit — runs immediately before human signs an on-chain action
  // Target: absolute transaction safety, strict and blocking
  presign: {
    label: "Pre-Sign Audit",
    description: "Final transaction safety gate — runs immediately before human signs any on-chain action",
    families: getEnabledFamilies("presign"),
    timeoutMs: 60000,
    blocking: true,
  },

  // Runtime audit — runs during active operation
  // Target: integration health, rpc/mcp/lock checks
  runtime: {
    label: "Runtime Audit",
    description: "Health checks during active operation — integration, RPC, MCP, lock status",
    families: getEnabledFamilies("runtime"),
    timeoutMs: 15000,
    blocking: false,
  },
};

export function getProfile(name) {
  return PROFILES[name] || null;
}

export function getAllProfileNames() {
  return Object.keys(PROFILES);
}

export function getDefaultProfile() {
  return "fast";
}
