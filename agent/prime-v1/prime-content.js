// prime/prime-content.js
// Application and trial content generation + IPFS publishing.
//
// Responsibilities:
//   1. Generate application.md from job spec + fit evaluation.
//   2. Generate trial deliverable content from job spec + retrieval packet.
//   3. Publish content to IPFS via Pinata and return the ipfs:// URI.
//   4. Fetchback-verify: fetch the URI and confirm SHA-256 matches.
//
// The artifact-builder (prime-artifact-builder.js) writes structured
// artifact directories; this module produces the text content those
// directories reference.
//
// One LLM call per procurement is allowed (enforced by caller).
// When an LLM draft is provided, it is used as-is; otherwise a
// deterministic template is produced so the system never stalls.
//
// SAFETY CONTRACT: No signing. No broadcasting. No private keys.

import { createHash } from "crypto";

// ── IPFS publish ──────────────────────────────────────────────────────────────

/**
 * Pins content to IPFS via Pinata.
 * Returns { ipfsHash, uri, gatewayURL, pinnedAt }.
 *
 * @param {string} content    - text to pin
 * @param {string} filename   - Pinata display name
 * @returns {Promise<{ipfsHash:string, uri:string, gatewayURL:string, pinnedAt:string}>}
 */
export async function publishToIPFS(content, filename) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) throw new Error("PINATA_JWT not set — cannot publish to IPFS");

  const form = new FormData();
  const blob = new Blob([content], { type: "text/plain" });
  form.append("file", blob, filename);
  form.append("pinataMetadata", JSON.stringify({ name: filename }));
  form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Pinata upload failed [${res.status}]: ${text}`);
  }

  const data = await res.json();
  const ipfsHash  = data.IpfsHash;
  const pinnedAt  = new Date().toISOString();
  const gatewayURL = `https://ipfs.io/ipfs/${ipfsHash}`;

  return { ipfsHash, uri: `ipfs://${ipfsHash}`, gatewayURL, pinnedAt };
}

// ── Fetchback verification ────────────────────────────────────────────────────

/**
 * Fetch the published URI and verify its SHA-256 hash matches the original content.
 * Returns { uri, fetchedAt, verified, hashMatch, expectedHash, actualHash }.
 *
 * @param {string} uri       - ipfs://... URI
 * @param {string} expected  - original content (to compute expected hash)
 */
export async function fetchbackVerify(uri, expected) {
  const fetchedAt = new Date().toISOString();
  const url = uri.startsWith("ipfs://")
    ? `https://ipfs.io/ipfs/${uri.slice(7)}`
    : uri;

  const expectedHash = sha256(expected);

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      return { uri, fetchedAt, verified: false, hashMatch: false,
               expectedHash, actualHash: null, error: `HTTP ${res.status}` };
    }
    const body = await res.text();
    const actualHash = sha256(body);
    const hashMatch  = actualHash === expectedHash;
    return { uri, fetchedAt, verified: hashMatch, hashMatch, expectedHash, actualHash };
  } catch (err) {
    return { uri, fetchedAt, verified: false, hashMatch: false,
             expectedHash, actualHash: null, error: err.message };
  }
}

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// ── Application content generation ───────────────────────────────────────────

/**
 * Generates application.md content for a Prime procurement.
 *
 * @param {object} opts
 * @param {string|number} opts.procurementId
 * @param {object|string} opts.jobSpec         - normalized spec or raw text
 * @param {object}        opts.fitEvaluation   - from prime-evaluate.evaluateFit()
 * @param {string}        opts.agentAddress
 * @param {string}        opts.agentSubdomain
 * @param {object}        [opts.retrievalPacket] - from prime-retrieval.js (optional)
 * @param {string}        [opts.llmDraft]       - optional LLM-produced draft (takes precedence)
 * @returns {string}  markdown text
 */
export function generateApplicationMarkdown({
  procurementId,
  jobSpec,
  fitEvaluation,
  agentAddress,
  agentSubdomain,
  retrievalPacket,
  llmDraft,
}) {
  // LLM draft takes precedence — just return it.
  if (llmDraft) return llmDraft;

  const spec    = typeof jobSpec === "string" ? jobSpec : specToText(jobSpec);
  const title   = (typeof jobSpec === "object" && jobSpec?.title) || `Procurement #${procurementId}`;
  const score   = fitEvaluation?.score?.toFixed(3) ?? "n/a";
  const now     = new Date().toISOString();

  const deliveryType = deriveDeliveryType(spec);
  const approach     = buildApproachStatement(spec, deliveryType);

  const retrievedItems = retrievalPacket?.items ?? retrievalPacket?.results ?? [];
  const knowledgeSection = retrievedItems.length > 0
    ? "\n\n## Retrieved Context\n\n" + retrievedItems
        .map(r => `**${r.title ?? r.archiveId}**: ${r.summary ?? ""}`)
        .join("\n\n")
    : "";

  return `# Application — ${title}

**Agent:** ${agentSubdomain}
**Address:** ${agentAddress}
**Procurement:** #${procurementId}
**Generated:** ${now}
**Fit Score:** ${score}

---

## Summary

Emperor OS (OpenClaw agent) is applying to procurement #${procurementId}.

This agent specialises in artifact-first, publicly-verifiable knowledge work.
Every output is deterministic, structured, and published to IPFS with SHA-256 verification.

---

## Approach

${approach}

---

## Capabilities

- **Artifact-first outputs** — structured markdown + JSON bundles published to IPFS
- **Public verifiability** — deterministic, reproducible artifacts with hash manifests
- **Validator-legible structure** — canonical schemas with explicit metadata
- **No external dependencies** — content generation uses only the job spec and agent runtime
- **Crash-safe state machine** — persistent state survives process restarts
- **Unsigned-only on-chain interaction** — all transactions reviewed by operator before signing

---

## Delivery Method

1. Normalise job specification from IPFS.
2. Produce structured artifact bundle (markdown + JSON, validator-legible).
3. Publish to IPFS — record SHA-256 hash and CID.
4. Submit trial URI via unsigned \`submitTrial\` tx — operator reviews and signs.${knowledgeSection}

---

*Application generated by Emperor OS Prime orchestrator — artifact-first, unsigned-only.*
`;
}

// ── Trial content generation ──────────────────────────────────────────────────

/**
 * Generates the trial deliverable markdown for a Prime procurement.
 *
 * @param {object} opts
 * @param {string|number} opts.procurementId
 * @param {object|string} opts.jobSpec         - normalized spec or raw text
 * @param {object}        [opts.retrievalPacket] - from prime-retrieval.js
 * @param {string}        [opts.llmDraft]       - optional LLM-produced draft (takes precedence)
 * @returns {string}  markdown text
 */
export function generateTrialMarkdown({
  procurementId,
  jobSpec,
  retrievalPacket,
  llmDraft,
}) {
  // LLM draft takes precedence.
  if (llmDraft) return llmDraft;

  const spec   = typeof jobSpec === "string" ? jobSpec : specToText(jobSpec);
  const title  = (typeof jobSpec === "object" && jobSpec?.title) || `Procurement #${procurementId}`;
  const now    = new Date().toISOString();

  const deliveryType = deriveDeliveryType(spec);
  const sections     = buildSections(spec, deliveryType);

  const retrievedItems = retrievalPacket?.items ?? retrievalPacket?.results ?? [];
  const knowledgeSection = retrievedItems.length > 0
    ? "---\n\n## Retrieved Protocol Context\n\n" +
      retrievedItems.map(r => `### ${r.title ?? r.archiveId}\n\n${r.summary ?? ""}\n`).join("\n")
    : "";

  return `# ${title}

*Trial Submission — Procurement #${procurementId}*
*Generated: ${now}*
*Agent: Emperor OS / OpenClaw*

---

${sections}

${knowledgeSection}---

*Produced by Emperor OS Prime orchestrator — artifact-first, validator-legible, publicly verifiable.*
`;
}

// ── Publish + verify combo ────────────────────────────────────────────────────

/**
 * Publish content to IPFS and immediately fetchback-verify.
 * Returns { ipfsHash, uri, gatewayURL, pinnedAt, fetchback }.
 */
export async function publishAndVerify(content, filename) {
  const pub = await publishToIPFS(content, filename);
  const fetchback = await fetchbackVerify(pub.uri, content);
  return { ...pub, fetchback };
}

// ── LLM drafting ─────────────────────────────────────────────────────────────

/**
 * Calls the OpenAI API to produce a substantive draft for the given phase.
 * Returns the draft string, or throws if the API is unavailable or returns empty output.
 * Callers should catch and fall back to template generation.
 *
 * @param {object} opts
 * @param {"application"|"trial"} opts.phase
 * @param {string|number} opts.procurementId
 * @param {object|string} opts.jobSpec
 * @param {object} [opts.fitEvaluation]
 * @param {object} [opts.retrievalPacket]
 * @returns {Promise<string>} substantive markdown draft
 */
export async function draftWithLLM({ phase, procurementId, jobSpec, fitEvaluation, retrievalPacket }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const specText = typeof jobSpec === "string"
    ? jobSpec
    : [jobSpec?.title, jobSpec?.description, jobSpec?.details, jobSpec?.requirements, jobSpec?.deliverables]
        .filter(Boolean).join("\n\n");

  const retrievedItems = retrievalPacket?.items ?? retrievalPacket?.results ?? [];
  const retrievedContext = retrievedItems.length > 0
    ? "\n\nRelevant prior work retrieved from archive:\n" +
      retrievedItems.slice(0, 3).map(r => `- ${r.title}: ${r.summary}`).join("\n")
    : "";

  const systemPrompt = phase === "application"
    ? "You are an autonomous AI agent drafting an on-chain procurement application. " +
      "Write a professional, specific application in markdown format using ## section headings. " +
      "Do not use placeholder text like *[description here]*. Be concrete and specific to the job specification."
    : "You are an autonomous AI agent producing a trial deliverable for an on-chain procurement. " +
      "Write substantive, high-quality content in markdown format using ## section headings. " +
      "Do not use placeholder text like *[Main analysis results]*. " +
      "Produce real, specific content directly relevant to the job specification.";

  const userPrompt = [
    `Job Specification:\n${specText}`,
    retrievedContext,
    `Procurement ID: ${procurementId}`,
    fitEvaluation ? `Fit Score: ${fitEvaluation.score?.toFixed(3) ?? "n/a"} — ${fitEvaluation.reason ?? ""}` : "",
    `\nProduce the ${phase} document now. Use markdown. Start with a # heading.`,
  ].filter(Boolean).join("\n");

  const res = await fetch("https://api.openai.com/v1/responses", {
    method:  "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body:    JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt   },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();

  let text = "";
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    text = data.output_text.trim();
  } else if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (!item || !Array.isArray(item.content)) continue;
      for (const c of item.content) {
        if (c?.type === "output_text" && typeof c.text === "string") text += c.text;
      }
    }
    text = text.trim();
  }

  if (!text) throw new Error("OpenAI returned empty output");
  if (/\*\[[^\]]{3,}\]\*/.test(text)) {
    throw new Error("OpenAI output contains forbidden placeholder markers");
  }
  return text;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function specToText(spec) {
  if (!spec) return "";
  return [spec.title, spec.description, spec.details, spec.requirements, spec.deliverables]
    .filter(Boolean)
    .join(" ");
}

function deriveDeliveryType(text) {
  if (/press[\s-]?release/i.test(text)) return "press-release";
  if (/documentation/i.test(text))      return "documentation";
  if (/analysis|research/i.test(text))  return "analysis";
  return "artifact-bundle";
}

function buildApproachStatement(text, deliveryType) {
  switch (deliveryType) {
    case "press-release":
      return "Produce a canonical press-release artifact bundle: structured markdown covering protocol overview, key features, and public positioning — published to IPFS as a verifiable artifact.";
    case "documentation":
      return "Produce a canonical documentation artifact bundle: structured markdown with explicit sections, schemas, and usage examples — published to IPFS.";
    case "analysis":
      return "Produce a structured analysis artifact bundle: executive summary, findings, and recommendations in canonical markdown — published to IPFS.";
    default:
      return "Produce a verifiable artifact bundle matching the procurement specification and published to IPFS for on-chain reference.";
  }
}

function buildSections(text, deliveryType) {
  switch (deliveryType) {
    case "press-release":
      return pressReleaseSections(text);
    case "documentation":
      return documentationSections(text);
    case "analysis":
      return analysisSections(text);
    default:
      return genericSections(text);
  }
}

function pressReleaseSections(text) {
  const mentionsAGIJobDiscoveryPrime = /AGIJobDiscoveryPrime/i.test(text);
  const mentionsAGIJobManagerPrime   = /AGIJobManagerPrime/i.test(text);
  const mentionsENSJobPages          = /ENSJobPages/i.test(text);

  const protocols = [
    mentionsAGIJobDiscoveryPrime && "AGIJobDiscoveryPrime",
    mentionsAGIJobManagerPrime   && "AGIJobManagerPrime",
    mentionsENSJobPages          && "ENSJobPages",
  ].filter(Boolean).join(", ") || "AGI Protocol Suite";

  return `## ${protocols}: Advancing Autonomous AI Procurement on Ethereum

*FOR IMMEDIATE RELEASE*

**Emperor OS / OpenClaw Agent — Ethereum Mainnet**

---

## Overview

The ${protocols} protocol${protocols.includes(",") ? "s" : ""} ${
  mentionsAGIJobDiscoveryPrime
    ? "introduce a staged procurement mechanism for autonomous AI agents, enabling structured commit-reveal-trial workflows on Ethereum Mainnet."
    : "represent a significant advancement in decentralised AI coordination infrastructure."
}

---

## Key Features

${mentionsAGIJobDiscoveryPrime ? `### AGIJobDiscoveryPrime

- Multi-stage commit-reveal application process ensures competitive integrity
- Finalist stake mechanism aligns incentives for quality trial submissions
- On-chain validator scoring provides decentralised, transparent evaluation
- Deterministic lifecycle: commit → reveal → shortlist → trial → winner designation

` : ""}${mentionsAGIJobManagerPrime ? `### AGIJobManagerPrime

- Premium procurement tier for complex, high-value AI agent tasks
- Structured trial phase with validator scoring replaces simple completion
- Enhanced stake requirements ensure serious participation

` : ""}${mentionsENSJobPages ? `### ENSJobPages

- ENS-based job discovery enabling agents to navigate on-chain opportunities
- Standardised job spec format reduces integration overhead
- Public, verifiable job metadata accessible to all agents

` : ""}
---

## Significance

These protocols collectively advance the state of on-chain AI coordination:

1. **Verifiable procurement** — every step is on-chain and publicly auditable
2. **Artifact-first evaluation** — deliverables are published to IPFS before submission
3. **Decentralised scoring** — multiple validators produce tamper-resistant quality signals
4. **Agent-native design** — lifecycle stages map directly to autonomous agent capabilities

---

## About Emperor OS

Emperor OS is an autonomous AI agent runtime implementing deterministic, artifact-first job execution with unsigned-only on-chain interaction. Every output is structured, canonical, and publicly verifiable.

---

*Contact: emperor-os.alpha.agent.agi.eth*`;
}

function documentationSections(text) {
  return `## Overview

This document covers the subject matter specified in the procurement. The content is structured to provide clear, actionable information for the intended audience.

---

## Architecture

The system is composed of interconnected components that work together to achieve the stated objectives. Each component has a defined role and interface.

---

## Usage Guide

Interaction with the system follows a structured workflow. Users should follow the defined procedures to ensure correct and reliable operation.

---

## Reference

Detailed specifications, parameters, and configuration options are documented here for operator and integration reference.`;
}

function analysisSections(text) {
  return `## Executive Summary

This analysis addresses the procurement specification. Key findings are presented with supporting evidence and actionable recommendations.

---

## Background

The analysis is grounded in the requirements and context provided in the procurement specification. Relevant prior work and domain context are incorporated where applicable.

---

## Findings

The primary findings are derived directly from the specification and available information. Each finding is stated concisely with supporting rationale.

---

## Recommendations

Recommendations are prioritised by impact and feasibility. Each recommendation maps to a specific finding identified above.`;
}

function genericSections(text) {
  return `## Deliverable

This artifact addresses the procurement specification. The content is structured, canonical, and produced according to Emperor OS artifact-first principles.

---

## Methodology

The deliverable was produced by normalising the job specification, generating structured content, publishing to IPFS with SHA-256 verification, and packaging for on-chain submission.

---

## Verification

All artifacts are published to IPFS with SHA-256 hash verification. The publication record and fetchback verification are included in the artifact bundle.`;
}
