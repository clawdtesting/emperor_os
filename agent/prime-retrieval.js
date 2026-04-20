// prime-retrieval.js
// Shared retrieval/extraction flywheel for Prime + v1 execution.
// SAFETY CONTRACT: File I/O only. No signing. No broadcasting.

import { promises as fs } from "fs";
import path from "path";
import { CONFIG } from "./config.js";
import { ensureProcSubdir, writeJson, readJson } from "./prime-state.js";

export const ARCHIVE_ROOT = path.join(CONFIG.WORKSPACE_ROOT, "archive");
export const ARCHIVE_INDEX = path.join(ARCHIVE_ROOT, "index.json");
export const ARCHIVE_ITEMS = path.join(ARCHIVE_ROOT, "items");
export const RETRIEVAL_PACKET_FILENAME = "retrieval_packet.json";
export const COMPLETION_ARCHIVE_RECORD_FILENAME = "completion_archive_record.json";

async function ensureArchive() {
  await fs.mkdir(ARCHIVE_ROOT, { recursive: true });
  await fs.mkdir(ARCHIVE_ITEMS, { recursive: true });
}

async function loadArchiveIndex() {
  const data = await readJson(ARCHIVE_INDEX, null);
  return data ?? { entries: [], updatedAt: null };
}

async function saveArchiveIndex(index) {
  await writeJson(ARCHIVE_INDEX, { ...index, updatedAt: new Date().toISOString() });
}

function scoreArchiveEntry(entry, keywords = []) {
  const keywordList = Array.isArray(keywords) ? keywords : [];
  const text = [
    entry.title ?? "",
    entry.summary ?? "",
    ...(entry.tags ?? []),
    entry.phase ?? "",
    entry.domain ?? "",
    entry.deliverableType ?? "",
  ].join(" ").toLowerCase();

  const keywordScore = keywordList.reduce((acc, kw) => (
    text.includes(String(kw).toLowerCase()) ? acc + 1 : acc
  ), 0);

  const acceptedBoost = entry.wasAccepted === true ? 5 : 0;
  const qualityScore = Number.isFinite(entry.qualityScore)
    ? Number(entry.qualityScore)
    : (Number.isFinite(entry.outcomeScore) ? Number(entry.outcomeScore) : 0);
  const qualityBoost = Math.max(0, qualityScore) * 2;

  return {
    keywordScore,
    rankingScore: keywordScore + acceptedBoost + qualityBoost,
  };
}

export async function searchArchive({ phase, keywords, maxResults = 5 }) {
  await ensureArchive();
  const index = await loadArchiveIndex();
  if (!index.entries?.length) return [];

  const filtered = index.entries
    .filter((e) => !phase || e.phase === phase || e.tags?.includes(phase));

  const ranked = filtered
    .map((entry) => {
      const { keywordScore, rankingScore } = scoreArchiveEntry(entry, keywords);
      return { ...entry, _keywordScore: keywordScore, _score: rankingScore };
    })
    .filter((entry) => entry._keywordScore > 0 || entry.wasAccepted === true || Number(entry.qualityScore ?? 0) > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, maxResults);

  return ranked;
}

export async function createRetrievalPacket({ procurementId, phase, keywords }) {
  const dir = await ensureProcSubdir(procurementId, "retrieval");
  const cleanedKeywords = (keywords ?? []).map((k) => String(k).toLowerCase()).filter(Boolean);

  const results = await searchArchive({ phase, keywords: cleanedKeywords });
  const items = results.map((r) => ({
    archiveId: r.id,
    title: r.title,
    summary: r.summary,
    phase: r.phase,
    tags: r.tags ?? [],
    artifactPath: r.artifactPath ?? null,
    sourceArtifactPath: r.sourceArtifactPath ?? null,
    qualityScore: r.qualityScore ?? r.outcomeScore ?? null,
    wasAccepted: r.wasAccepted ?? null,
    relevanceScore: r._score,
  }));

  const packet = {
    schema: "emperor-os/retrieval-packet/v2",
    entityType: "procurement",
    entityId: String(procurementId),
    procurementId: String(procurementId),
    phase,
    keywords: cleanedKeywords,
    searchedAt: new Date().toISOString(),
    resultsFound: items.length,
    retrievalStatus: items.length > 0 ? "found" : "empty",
    noResultsReason: items.length > 0 ? null : "no_archive_matches",
    items,
    results: items,
    useDecision: null,
    decisionNote: null,
    decisionAt: null,
  };

  await writeJson(path.join(dir, RETRIEVAL_PACKET_FILENAME), packet);
  await writeJson(path.join(dir, `retrieval_packet_${phase}.json`), packet);
  return packet;
}

export async function ensureRetrievalPacketForProc({ procurementId, phase, keywords, noResultsReason = null }) {
  const packet = await createRetrievalPacket({ procurementId, phase, keywords });
  if (packet.resultsFound > 0) return packet;

  const dir = await ensureProcSubdir(procurementId, "retrieval");
  const canonical = {
    ...packet,
    retrievalStatus: "empty",
    noResultsReason: noResultsReason ?? packet.noResultsReason ?? "no_archive_matches",
  };
  await writeJson(path.join(dir, RETRIEVAL_PACKET_FILENAME), canonical);
  await writeJson(path.join(dir, `retrieval_packet_${phase}.json`), canonical);
  return canonical;
}

export async function writeRetrievalDecision({ procurementId, phase, decision, selectedArchiveId, note }) {
  const dir = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${procurementId}`, "retrieval");
  const pktPath = path.join(dir, `retrieval_packet_${phase}.json`);

  const existing = await readJson(pktPath, null);
  if (!existing) throw new Error(`No retrieval packet found for proc ${procurementId} phase ${phase}`);

  const updated = {
    ...existing,
    useDecision: decision,
    selectedArchiveId: selectedArchiveId ?? null,
    decisionNote: note ?? null,
    decisionAt: new Date().toISOString(),
  };

  await writeJson(pktPath, updated);
}

export async function extractSteppingStone({
  source,
  procurementId,
  jobId,
  phase,
  artifactPath,
  metadata,
  primitive,
  title,
  summary,
  tags,
}) {
  await ensureArchive();

  const effectiveSource = source ?? (String(procurementId ?? "").startsWith("job_") ? "v1" : "prime");
  const effectiveProcurementId = procurementId ?? (jobId ? `job_${jobId}` : null);
  if (!effectiveProcurementId) {
    throw new Error("extractSteppingStone requires procurementId or jobId");
  }

  const safePhase = String(phase ?? "unknown").replace(/[^a-z0-9_-]/gi, "_");
  const id = `${effectiveSource}_${effectiveProcurementId}_${safePhase}_${Date.now()}`;

  const derivedArtifactPath = artifactPath ?? primitive?.artifactPath ?? null;
  const payload = {
    schema: "emperor-os/archive-item/v2",
    id,
    source: effectiveSource,
    procurementId: String(effectiveProcurementId),
    jobId: jobId ?? primitive?.jobId ?? null,
    phase,
    title: title ?? `Artifact ${effectiveProcurementId}`,
    summary: summary ?? "",
    tags: tags ?? [],
    domain: metadata?.domain ?? primitive?.domain ?? null,
    deliverableType: metadata?.deliverableType ?? primitive?.deliverableType ?? null,
    content: primitive ?? {},
    artifactPath: path.join(ARCHIVE_ITEMS, `${id}.json`),
    sourceArtifactPath: derivedArtifactPath,
    qualityScore: metadata?.qualityScore ?? primitive?.outcomeScore ?? null,
    wasAccepted: metadata?.wasAccepted ?? null,
    outcomeStatus: primitive?.outcomeStatus ?? null,
    outcomeScore: primitive?.outcomeScore ?? null,
    timestamp: metadata?.timestamp ?? new Date().toISOString(),
    extractedAt: new Date().toISOString(),
  };

  const archiveItemPath = path.join(ARCHIVE_ITEMS, `${id}.json`);
  await writeJson(archiveItemPath, payload);

  const retrievalDir = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${effectiveProcurementId}`, "retrieval");
  await fs.mkdir(retrievalDir, { recursive: true });
  await writeJson(path.join(retrievalDir, `stepping_stone_${safePhase}.json`), {
    archiveId: id,
    source: effectiveSource,
    phase,
    title: payload.title,
    summary: payload.summary,
    tags: payload.tags,
    artifactPath: archiveItemPath,
    sourceArtifactPath: derivedArtifactPath,
    extractedAt: payload.extractedAt,
  });

  const index = await loadArchiveIndex();
  index.entries = index.entries ?? [];
  index.entries.push({
    id,
    source: effectiveSource,
    procurementId: String(effectiveProcurementId),
    jobId: payload.jobId,
    phase,
    title: payload.title,
    summary: payload.summary,
    tags: payload.tags,
    domain: payload.domain,
    deliverableType: payload.deliverableType,
    artifactPath: archiveItemPath,
    sourceArtifactPath: derivedArtifactPath,
    qualityScore: payload.qualityScore,
    wasAccepted: payload.wasAccepted,
    outcomeStatus: payload.outcomeStatus,
    outcomeScore: payload.outcomeScore,
    addedAt: new Date().toISOString(),
  });
  await saveArchiveIndex(index);

  log(`Stepping stone extracted: ${id} — "${payload.title}"`);
  return id;
}

function getCanonicalRetrievalPacketCandidates({ source, procurementId, jobId, retrievalPacketPath }) {
  if (retrievalPacketPath) return [retrievalPacketPath];

  const candidates = [];
  if (procurementId) {
    candidates.push(path.join(
      CONFIG.WORKSPACE_ROOT,
      "artifacts",
      `proc_${String(procurementId)}`,
      "retrieval",
      RETRIEVAL_PACKET_FILENAME,
    ));
  }

  if (jobId) {
    candidates.push(path.join(
      CONFIG.WORKSPACE_ROOT,
      "artifacts",
      `proc_job_${String(jobId)}`,
      "retrieval",
      RETRIEVAL_PACKET_FILENAME,
    ));
    if (String(source ?? "").toLowerCase() === "v1") {
      candidates.push(path.join(
        CONFIG.WORKSPACE_ROOT,
        "artifacts",
        `job_${String(jobId)}`,
        "retrieval",
        RETRIEVAL_PACKET_FILENAME,
      ));
    }
  }

  return [...new Set(candidates)];
}

async function resolveCanonicalRetrievalPacketPath(args) {
  const candidates = getCanonicalRetrievalPacketCandidates(args);
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Continue searching candidate paths.
    }
  }

  const scopedEntity = args.procurementId
    ? `procurement ${String(args.procurementId)}`
    : (args.jobId ? `job ${String(args.jobId)}` : "terminal entity");
  throw new Error(
    `Terminal completion blocked: canonical retrieval packet missing for ${scopedEntity}. ` +
    `Checked: ${candidates.length ? candidates.join(", ") : "<no-candidate-paths>"}. ` +
    `Ensure retrieval runs before terminal compounding.`
  );
}

export async function ensureTerminalCompoundingArtifacts({
  source,
  procurementId,
  jobId,
  phase,
  artifactPath,
  completionRecordPath,
  completionURI = "",
  deliverableURI = "",
  title,
  summary,
  tags,
  metadata,
  primitive,
  retrievalPacketPath,
}) {
  // Enforce canonical retrieval packet existence before any terminal completion.
  await resolveCanonicalRetrievalPacketPath({ source, procurementId, jobId, retrievalPacketPath });

  const recordPath = completionRecordPath
    ?? (source === "v1" && jobId
      ? path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `job_${jobId}`, COMPLETION_ARCHIVE_RECORD_FILENAME)
      : path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${procurementId}`, "completion", COMPLETION_ARCHIVE_RECORD_FILENAME));

  const existing = await readJson(recordPath, null);
  if (existing?.archiveId) return existing;

  const archiveId = await extractSteppingStone({
    source,
    procurementId,
    jobId,
    phase,
    artifactPath,
    metadata,
    primitive,
    title,
    summary,
    tags,
  });

  const index = await loadArchiveIndex();
  const inIndex = (index.entries ?? []).some((entry) => entry.id === archiveId);
  if (!inIndex) {
    throw new Error(`archive index missing extracted id ${archiveId}`);
  }

  const record = {
    schema: "emperor-os/completion-archive-record/v2",
    source: source ?? null,
    procurementId: procurementId ? String(procurementId) : null,
    jobId: jobId ? String(jobId) : null,
    phase: String(phase ?? "completion"),
    archiveId,
    completionURI,
    deliverableURI,
    sourceArtifact: artifactPath ?? null,
    recordedAt: new Date().toISOString(),
  };

  await fs.mkdir(path.dirname(recordPath), { recursive: true });
  await writeJson(recordPath, record);
  return record;
}

export async function updateArchiveOutcome({ archiveId, qualityScore, wasAccepted, outcomeStatus }) {
  await ensureArchive();
  const index = await loadArchiveIndex();

  let updated = false;
  index.entries = (index.entries ?? []).map((entry) => {
    if (entry.id !== archiveId) return entry;
    updated = true;
    return {
      ...entry,
      qualityScore: Number.isFinite(qualityScore) ? qualityScore : entry.qualityScore ?? null,
      wasAccepted: typeof wasAccepted === "boolean" ? wasAccepted : entry.wasAccepted ?? null,
      outcomeStatus: outcomeStatus ?? entry.outcomeStatus ?? null,
      updatedAt: new Date().toISOString(),
    };
  });
  if (!updated) return false;
  await saveArchiveIndex(index);

  const itemPath = path.join(ARCHIVE_ITEMS, `${archiveId}.json`);
  const item = await readJson(itemPath, null);
  if (item) {
    await writeJson(itemPath, {
      ...item,
      qualityScore: Number.isFinite(qualityScore) ? qualityScore : item.qualityScore ?? null,
      wasAccepted: typeof wasAccepted === "boolean" ? wasAccepted : item.wasAccepted ?? null,
      outcomeStatus: outcomeStatus ?? item.outcomeStatus ?? null,
      updatedAt: new Date().toISOString(),
    });
  }

  return true;
}

export async function seedPrimeArchive() {
  await ensureArchive();
  const index = await loadArchiveIndex();
  if (index.entries?.length > 0) return;

  const templates = [
    {
      phase: "application",
      title: "Prime Application Structure",
      summary: "Concrete markdown structure for procurement applications.",
      tags: ["application", "prime", "structure"],
      content: { sections: ["Summary", "Approach", "Capabilities", "Delivery Method"] },
    },
    {
      phase: "trial",
      title: "Prime Trial Deliverable Structure",
      summary: "Concrete trial format with findings, implementation plan, and verification notes.",
      tags: ["trial", "prime", "structure"],
      content: { sections: ["Context", "Plan", "Execution", "Verification"] },
    },
  ];

  for (const t of templates) {
    await extractSteppingStone({
      source: "prime",
      procurementId: "seed",
      phase: t.phase,
      primitive: t.content,
      title: t.title,
      summary: t.summary,
      tags: t.tags,
      metadata: { domain: "general", deliverableType: "template", timestamp: new Date().toISOString() },
    });
  }
}

export function extractSearchKeywords(jobSpec) {
  if (!jobSpec) return [];

  const title = typeof jobSpec === "object" ? (jobSpec.title ?? "") : "";
  const deliverableType = typeof jobSpec === "object"
    ? (jobSpec.deliverableType ?? jobSpec.category ?? "")
    : "";
  const specText = typeof jobSpec === "string"
    ? jobSpec
    : [jobSpec.description, jobSpec.details, jobSpec.requirements, jobSpec.deliverables, jobSpec.goal]
        .filter(Boolean)
        .join(" ");

  const text = [title, deliverableType, specText].join(" ");

  const STOP = new Set([
    "the","a","an","in","of","to","and","or","for","with","that","this","is","are",
    "was","were","be","been","has","have","had","it","its","from","as","by","on",
    "at","we","our","your","their","will","can","do","not","but","all","any","if",
    "into","than","more","also","each","when","which","who","what","how","may",
    "per","use","used","using","make","made","set","get","up","so","they","them",
    "then","no","he","she","his","her","new","one","two","three","should","must",
    "would","could","please","need","needs","provide","including","based","create",
    "write","build","develop","produce","generate",
  ]);

  const seen = new Set();
  const keywords = [];
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 4 || STOP.has(raw) || seen.has(raw)) continue;
    seen.add(raw);
    keywords.push(raw);
    if (keywords.length >= 12) break;
  }

  return keywords;
}

function log(msg) {
  console.log(`[prime-retrieval] ${msg}`);
}
