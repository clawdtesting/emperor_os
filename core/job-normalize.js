// ./agent/job-normalize.js
function pick(obj, keys, fallback = undefined) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null) {
      return obj[key];
    }
  }
  return fallback;
}

export function normalizeJob(raw) {
  if (!raw || typeof raw !== "object") return null;

  const jobId = pick(raw, ["jobId", "id"]);
  const payout = pick(raw, ["payout", "payoutAGIALPHA", "payoutAmount"]);
  const details = pick(raw, ["details", "description", "summary"], "");
  const assignedAgent = pick(raw, ["assignedAgent", "agent", "agentAddress"], null);
  const status = pick(raw, ["status", "jobStatus"], null);
  const jobSpecURI = pick(raw, ["jobSpecURI", "specURI", "metadataURI"], null);
  const completionURI = pick(raw, ["completionURI"], null);

  return {
    raw,
    jobId,
    payout,
    details,
    assignedAgent,
    status,
    jobSpecURI,
    completionURI
  };
}

export function parsePayoutNumber(value) {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/AGIALPHA/gi, "").replace(/,/g, "").trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function isAssignedToAddress(job, address) {
  if (!address) return false;
  const assigned = String(job.assignedAgent ?? "").toLowerCase();
  return !!assigned && assigned === address.toLowerCase();
}