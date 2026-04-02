// prime-retrieval.js
// Retrieval-before-solve scaffolding for Prime procurement phases.
//
// Implements the capability flywheel:
//   "Stepping Stone Extraction → Capability Archive Expansion → Faster/Better Future Solutions"
//
// Before any serious phase (application, trial, completion):
//   1. Search archive for similar prior artifacts
//   2. Write a retrieval_packet.json documenting what was found
//   3. Record use/adapt/reject decision
//
// After phase completion:
//   4. Write a stepping_stone.json extracting reusable primitives
//
// Archive location: .openclaw/workspace/archive/
// Per-procurement retrieval: artifacts/proc_<id>/retrieval/
//
// SAFETY CONTRACT: File I/O only. No signing. No network calls.

import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { CONFIG } from "./config.js";
import { ensureProcSubdir, writeJson, readJson } from "./prime-state.js";

// ── Archive paths ─────────────────────────────────────────────────────────────

export const ARCHIVE_ROOT      = path.join(CONFIG.WORKSPACE_ROOT, "archive");
export const ARCHIVE_INDEX     = path.join(ARCHIVE_ROOT, "index.json");
export const ARCHIVE_PRIMITIVES = path.join(ARCHIVE_ROOT, "primitives");

async function ensureArchive() {
  await fs.mkdir(ARCHIVE_ROOT,      { recursive: true });
  await fs.mkdir(ARCHIVE_PRIMITIVES, { recursive: true });
}

// ── Archive index ─────────────────────────────────────────────────────────────

async function loadArchiveIndex() {
  const data = await readJson(ARCHIVE_INDEX, null);
  return data ?? { entries: [], updatedAt: null };
}

async function saveArchiveIndex(index) {
  await writeJson(ARCHIVE_INDEX, { ...index, updatedAt: new Date().toISOString() });
}

// ── Retrieval search ──────────────────────────────────────────────────────────

/**
 * Searches the archive for artifacts relevant to a given phase/query.
 * Uses simple keyword matching against indexed entries.
 *
 * @param {object} opts
 * @param {string} opts.phase       - "application" | "trial" | "completion"
 * @param {string[]} opts.keywords  - terms to match
 * @param {number} [opts.maxResults]
 * @returns {Promise<ArchiveEntry[]>}
 */
export async function searchArchive({ phase, keywords, maxResults = 5 }) {
  await ensureArchive();
  const index = await loadArchiveIndex();
  if (!index.entries || index.entries.length === 0) return [];

  const kw = keywords.map(k => k.toLowerCase());

  const scored = index.entries
    .filter(e => !phase || e.phase === phase || e.tags?.includes(phase))
    .map(entry => {
      const text = [
        entry.title ?? "",
        entry.summary ?? "",
        ...(entry.tags ?? []),
        entry.phase ?? "",
      ].join(" ").toLowerCase();

      const score = kw.reduce((acc, k) => acc + (text.includes(k) ? 1 : 0), 0);
      return { ...entry, _score: score };
    })
    .filter(e => e._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, maxResults);

  return scored;
}

// ── Retrieval packet ──────────────────────────────────────────────────────────

/**
 * Creates a retrieval_packet.json for a phase.
 * Records what was searched and what was found.
 *
 * @param {object} opts
 * @param {string|number} opts.procurementId
 * @param {string} opts.phase
 * @param {string[]} opts.searchKeywords
 * @returns {Promise<RetrievalPacket>}
 */
export async function createRetrievalPacket({ procurementId, phase, searchKeywords }) {
  const dir = await ensureProcSubdir(procurementId, "retrieval");

  const results = await searchArchive({ phase, keywords: searchKeywords });

  const packet = {
    schema:         "emperor-os/retrieval-packet/v1",
    procurementId:  String(procurementId),
    phase,
    searchKeywords,
    searchedAt:     new Date().toISOString(),
    resultsFound:   results.length,
    results:        results.map(r => ({
      archiveId:   r.id,
      title:       r.title,
      summary:     r.summary,
      phase:       r.phase,
      tags:        r.tags ?? [],
      artifactPath: r.artifactPath ?? null,
      relevanceScore: r._score,
    })),
    useDecision:    null,  // filled in by writeRetrievalDecision()
    decisionNote:   null,
    decisionAt:     null,
  };

  await writeJson(path.join(dir, `retrieval_packet_${phase}.json`), packet);

  return packet;
}

// ── Use/adapt/reject decision ─────────────────────────────────────────────────

/**
 * Records the operator/system decision about retrieved artifacts.
 * @param {object} opts
 * @param {string|number} opts.procurementId
 * @param {string} opts.phase
 * @param {"use"|"adapt"|"reject"|"none"} opts.decision
 * @param {string} [opts.selectedArchiveId]  - which archive entry was used/adapted
 * @param {string} [opts.note]
 */
export async function writeRetrievalDecision({ procurementId, phase, decision, selectedArchiveId, note }) {
  const dir    = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${procurementId}`, "retrieval");
  const pktPath = path.join(dir, `retrieval_packet_${phase}.json`);

  const existing = await readJson(pktPath, null);
  if (!existing) throw new Error(`No retrieval packet found for proc ${procurementId} phase ${phase}`);

  const updated = {
    ...existing,
    useDecision:       decision,
    selectedArchiveId: selectedArchiveId ?? null,
    decisionNote:      note ?? null,
    decisionAt:        new Date().toISOString(),
  };

  await writeJson(pktPath, updated);
}

// ── Stepping stone extraction ─────────────────────────────────────────────────

/**
 * After completing a phase, extracts a reusable stepping stone for the archive.
 *
 * @param {object} opts
 * @param {string|number} opts.procurementId
 * @param {string} opts.phase
 * @param {object} opts.primitive - the extracted primitive content
 * @param {string} opts.title
 * @param {string} opts.summary
 * @param {string[]} opts.tags
 */
export async function extractSteppingStone({ procurementId, phase, primitive, title, summary, tags }) {
  await ensureArchive();

  const id  = `proc_${procurementId}_${phase}_${Date.now()}`;
  const dir = path.join(ARCHIVE_PRIMITIVES, id);
  await fs.mkdir(dir, { recursive: true });

  // Write the primitive content
  const artifactPath = path.join(dir, "primitive.json");
  await writeJson(artifactPath, {
    schema:        "emperor-os/archive-primitive/v1",
    id,
    procurementId: String(procurementId),
    phase,
    title,
    summary,
    tags,
    content:       primitive,
    extractedAt:   new Date().toISOString(),
  });

  // Write stepping stone record in proc retrieval dir
  const retrievalDir = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${procurementId}`, "retrieval");
  await fs.mkdir(retrievalDir, { recursive: true });
  await writeJson(path.join(retrievalDir, `stepping_stone_${phase}.json`), {
    archiveId:    id,
    phase,
    title,
    summary,
    tags,
    extractedAt:  new Date().toISOString(),
  });

  // Update archive index
  const index = await loadArchiveIndex();
  index.entries = index.entries ?? [];
  index.entries.push({
    id,
    phase,
    title,
    summary,
    tags: tags ?? [],
    artifactPath,
    addedAt: new Date().toISOString(),
  });
  await saveArchiveIndex(index);

  log(`Stepping stone extracted: ${id} — "${title}"`);
  return id;
}

// ── Bulk stepping stone templates (Prime-specific primitives to seed archive) ──

/**
 * Seeds the archive with canonical Prime primitives if it is empty.
 * These serve as templates that future procurements can adapt.
 * Only called once at initialization.
 */
export async function seedPrimeArchive() {
  await ensureArchive();
  const index = await loadArchiveIndex();
  if (index.entries && index.entries.length > 0) return; // already seeded

  const templates = [
    {
      phase:   "application",
      title:   "Prime Application Template",
      summary: "Canonical structure for Prime procurement application markdown",
      tags:    ["application", "template", "markdown", "prime"],
      content: {
        sections: [
          "## Agent Identity",
          "## Capability Fit",
          "## Proposed Methodology",
          "## Deliverable Structure",
          "## Timeline Estimate",
          "## Quality Assurance",
        ],
        notes: "Adapt to specific job requirements. Be specific, not generic.",
      },
    },
    {
      phase:   "commit",
      title:   "Commitment Hash Pattern",
      summary: "keccak256(procurementId, agentAddress, applicationURI, salt) — canonical Prime commitment scheme",
      tags:    ["commit", "hash", "keccak256", "salt", "prime"],
      content: {
        formula:   "keccak256(abi.encodePacked(uint256 procurementId, address agent, string appURI, bytes32 salt))",
        saltNotes: "Generate with ethers.hexlify(ethers.randomBytes(32)). Store in commitment_material.json.",
        warning:   "Salt must remain secret until reveal phase.",
      },
    },
    {
      phase:   "reveal",
      title:   "Reveal Verification Pattern",
      summary: "Re-compute commitment hash and compare with on-chain stored commitment before reveal",
      tags:    ["reveal", "verification", "commitment", "prime"],
      content: {
        steps: [
          "Load salt and applicationURI from commitment_material.json",
          "Re-compute commitment hash using same formula as commit",
          "Fetch on-chain commitment from applicationView(procurementId, agentAddress).commitment",
          "Assert re-computed hash === on-chain commitment",
          "Only proceed with reveal if assertion passes",
        ],
      },
    },
    {
      phase:   "trial",
      title:   "Trial Artifact Bundle Template",
      summary: "Canonical structure for Prime trial submission bundle",
      tags:    ["trial", "template", "bundle", "prime"],
      content: {
        requiredFiles: [
          "trial_artifact_manifest.json",
          "publication_record.json",
          "fetchback_verification.json",
          "unsigned_submit_trial_tx.json",
          "review_manifest.json",
        ],
        notes: "Always verify IPFS fetchback before building submit tx.",
      },
    },
    {
      phase:   "monitoring",
      title:   "Prime Deadline Warning Thresholds",
      summary: "Standard urgency thresholds for Prime deadline monitoring",
      tags:    ["monitoring", "deadlines", "urgency", "prime"],
      content: {
        urgentThresholdSecs: 14400,  // 4 hours
        warningThresholdSecs: 86400, // 24 hours
        criticalThresholdSecs: 3600, // 1 hour
        notes: "Check every 60s in monitor loop. Emit warnings to logs.",
      },
    },
    {
      phase:   "publication",
      title:   "IPFS Publication Verification Pattern",
      summary: "Canonical fetch-back verification flow for IPFS-published artifacts",
      tags:    ["ipfs", "publication", "verification", "fetchback"],
      content: {
        steps: [
          "Pin content to Pinata: get IpfsHash",
          "Construct gateway URL: https://ipfs.io/ipfs/<hash>",
          "Fetch from gateway with 30s timeout",
          "Confirm HTTP 200 and content is non-empty",
          "Optionally verify content hash matches original",
          "Write fetchback_verification.json with verified=true/false",
        ],
      },
    },
  ];

  for (const t of templates) {
    const procId = "seed";
    await extractSteppingStone({
      procurementId: procId,
      phase:   t.phase,
      primitive: t.content,
      title:   t.title,
      summary: t.summary,
      tags:    t.tags,
    });
  }

  log(`Archive seeded with ${templates.length} Prime primitive templates.`);
}

// ── Search keyword extraction ─────────────────────────────────────────────────

/**
 * Derives search keywords from a job spec for archive retrieval.
 * Extracts meaningful domain terms, filtering stopwords and short tokens.
 *
 * @param {object|string} jobSpec
 * @returns {string[]}  up to 12 lowercase keyword strings
 */
export function extractSearchKeywords(jobSpec) {
  if (!jobSpec) return [];
  const text = typeof jobSpec === "string"
    ? jobSpec
    : [jobSpec.title, jobSpec.description, jobSpec.details, jobSpec.requirements, jobSpec.deliverables]
        .filter(Boolean).join(" ");

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
    if (raw.length >= 4 && !STOP.has(raw) && !seen.has(raw)) {
      seen.add(raw);
      keywords.push(raw);
      if (keywords.length >= 12) break;
    }
  }
  return keywords;
}

function log(msg) {
  console.log(`[prime-retrieval] ${msg}`);
}
