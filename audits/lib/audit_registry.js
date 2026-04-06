// audits/lib/audit_registry.js
// Registers all audit families and runners.
// Enables run_all.js to discover and execute audits cleanly.

import { AUDITS_ROOT, AUDIT_FAMILIES } from "./constants.js";
import path from "path";

const AUDIT_META = {
  static: {
    label: "Static Checks",
    description: "Fast code/config inspection without running the system",
    blocking: true,
    profile: ["fast", "full"],
  },
  safety: {
    label: "Safety Checks",
    description: "Prove the worker cannot do forbidden on-chain actions",
    blocking: true,
    profile: ["fast", "full", "presign"],
  },
  protocol: {
    label: "Protocol Checks",
    description: "Smart-contract/package correctness validation",
    blocking: true,
    profile: ["fast", "full", "presign"],
  },
  presign: {
    label: "Pre-Sign Checks",
    description: "Final transaction safety gate before human signs",
    blocking: true,
    profile: ["presign"],
  },
  functional: {
    label: "Functional Checks",
    description: "Behavioral audit — system can do its job end-to-end",
    blocking: false,
    profile: ["full"],
  },
  recovery: {
    label: "Recovery Checks",
    description: "Ensure crashes do not corrupt state or create duplicates",
    blocking: false,
    profile: ["full"],
  },
  artifact: {
    label: "Artifact Checks",
    description: "Output completeness, reviewability, and hash integrity",
    blocking: false,
    profile: ["full"],
  },
  doctrine: {
    label: "Doctrine Checks",
    description: "Ensure repo stays aligned with declared operating law",
    blocking: true,
    profile: ["fast", "full"],
  },
  integration: {
    label: "Integration Checks",
    description: "External dependency readiness (MCP, RPC, IPFS)",
    blocking: false,
    profile: ["full", "runtime"],
  },
  determinism: {
    label: "Determinism Checks",
    description: "Prove same input = same output",
    blocking: false,
    profile: ["full"],
  },
  performance: {
    label: "Performance Checks",
    description: "Measure competitiveness and efficiency",
    blocking: false,
    profile: ["full"],
  },
  economics: {
    label: "Economics Checks",
    description: "Avoid technically correct but unprofitable behavior",
    blocking: false,
    profile: ["full"],
  },
};

export function getAuditFamilies() {
  return AUDIT_FAMILIES;
}

export function getAuditMeta(family) {
  return AUDIT_META[family] || null;
}

export function getEnabledFamilies(profile) {
  if (!profile || profile === "all") return AUDIT_FAMILIES;
  return AUDIT_FAMILIES.filter(f => {
    const meta = AUDIT_META[f];
    return meta && meta.profile.includes(profile);
  });
}

export function getAuditRunnerPath(family) {
  return path.join(AUDITS_ROOT, family, "run.js");
}

export function getAllAuditPaths() {
  return AUDIT_FAMILIES.map(f => getAuditRunnerPath(f));
}

export function isBlockingAudit(family) {
  const meta = AUDIT_META[family];
  return meta ? meta.blocking : false;
}
