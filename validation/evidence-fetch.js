// validation/evidence-fetch.js
// Fetches and normalizes on-chain evidence for validator scoring.
//
// Reads trial artifacts, procurement state, and all submitted deliverables
// from chain + IPFS, producing a canonical evidence bundle.
//
// SAFETY CONTRACT: Read-only. No signing. No broadcasting.

import { promises as fs } from "fs";
import path from "path";
import { createHash } from "crypto";
import { fetchProcurement, fetchApplicationView, getPrimeContract, getProvider } from "../agent/prime-client.js";
import { deriveChainPhase, CHAIN_PHASE } from "../agent/prime-phase-model.js";
import { readJson, writeJson, ensureProcSubdir } from "../agent/prime-state.js";
import { VALIDATOR_CONFIG } from "./config.js";

const IPFS_GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
];

async function fetchFromIpfs(cid, timeoutMs = VALIDATOR_CONFIG.EVIDENCE_FETCH_TIMEOUT_MS) {
  for (const gateway of IPFS_GATEWAYS) {
    for (let attempt = 0; attempt < VALIDATOR_CONFIG.EVIDENCE_MAX_RETRIES; attempt++) {
      try {
        const url = `${gateway}${cid.replace("ipfs://", "")}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) continue;
        return await res.text();
      } catch (err) {
        if (attempt < VALIDATOR_CONFIG.EVIDENCE_MAX_RETRIES - 1) {
          await sleep(VALIDATOR_CONFIG.EVIDENCE_RETRY_DELAY_MS);
        }
      }
    }
  }
  return null;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function extractCid(uri) {
  if (!uri) return null;
  const cleaned = uri.replace("ipfs://", "").replace(/^https?:\/\/[^/]+\/ipfs\//, "");
  return cleaned.split("/")[0] || null;
}

async function fetchTrialEvidence(procurementId, procStruct) {
  const contract = getPrimeContract();
  const evidence = {
    procurementId: String(procurementId),
    fetchedAt: new Date().toISOString(),
    trialSubmissions: [],
    errors: [],
  };

  try {
    const trialEvent = await contract.getTrialSubmission?.(BigInt(procurementId));
    if (trialEvent) {
      const trialURI = String(trialEvent.trialURI ?? trialEvent[1] ?? "");
      const submitter = String(trialEvent.submitter ?? trialEvent[0] ?? "").toLowerCase();
      const cid = extractCid(trialURI);
      let content = null;
      if (cid) {
        content = await fetchFromIpfs(trialURI);
      }
      evidence.trialSubmissions.push({
        submitter,
        trialURI,
        cid,
        content,
        contentLength: content ? content.length : 0,
        fetchedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    evidence.errors.push(`Failed to fetch trial submission: ${err.message}`);
  }

  return evidence;
}

async function fetchProcurementEvidence(procurementId) {
  const procStruct = await fetchProcurement(procurementId);
  const chainPhase = deriveChainPhase(procStruct);
  const evidence = {
    procurementId: String(procurementId),
    procStruct,
    chainPhase,
    deadlines: {
      commit: Number(procStruct.commitDeadline),
      reveal: Number(procStruct.revealDeadline),
      finalistAccept: Number(procStruct.finalistAcceptDeadline),
      trial: Number(procStruct.trialDeadline),
      scoreCommit: Number(procStruct.scoreCommitDeadline),
      scoreReveal: Number(procStruct.scoreRevealDeadline),
    },
    isScorePhase: chainPhase === CHAIN_PHASE.SCORE_COMMIT || chainPhase === CHAIN_PHASE.SCORE_REVEAL,
    isClosed: chainPhase === CHAIN_PHASE.CLOSED,
    fetchedAt: new Date().toISOString(),
  };
  return evidence;
}

async function fetchAllApplicantViews(procurementId, applicantAddresses) {
  const views = [];
  for (const addr of applicantAddresses) {
    try {
      const view = await fetchApplicationView(procurementId, addr);
      views.push({
        address: addr.toLowerCase(),
        phase: view.phase,
        phaseName: view.phaseName,
        applicationURI: view.applicationURI,
        commitment: view.commitment,
        shortlisted: view.shortlisted,
      });
    } catch (err) {
      views.push({
        address: addr.toLowerCase(),
        error: err.message,
      });
    }
  }
  return views;
}

async function fetchScoreEvidence(procurementId) {
  const contract = getPrimeContract();
  const evidence = {
    procurementId: String(procurementId),
    scoreCommits: [],
    scoreReveals: [],
    errors: [],
  };

  try {
    const scoreCommitDeadline = await contract.scoreCommitDeadline?.(BigInt(procurementId));
    const scoreRevealDeadline = await contract.scoreRevealDeadline?.(BigInt(procurementId));
    evidence.deadlines = {
      scoreCommit: scoreCommitDeadline ? Number(scoreCommitDeadline) : null,
      scoreReveal: scoreRevealDeadline ? Number(scoreRevealDeadline) : null,
    };
  } catch (err) {
    evidence.errors.push(`Failed to fetch score deadlines: ${err.message}`);
  }

  try {
    const validatorCount = await contract.validatorCount?.(BigInt(procurementId));
    evidence.validatorCount = validatorCount ? Number(validatorCount) : null;
  } catch {
    evidence.validatorCount = null;
  }

  return evidence;
}

export async function fetchValidatorEvidenceBundle(procurementId, applicantAddresses = []) {
  const [procEvidence, trialEvidence, scoreEvidence] = await Promise.all([
    fetchProcurementEvidence(procurementId),
    fetchTrialEvidence(procurementId),
    fetchScoreEvidence(procurementId),
  ]);

  const applicantViews = applicantAddresses.length > 0
    ? await fetchAllApplicantViews(procurementId, applicantAddresses)
    : [];

  const bundle = {
    schema: "emperor-os/validator-evidence-bundle/v1",
    procurementId: String(procurementId),
    procurement: procEvidence,
    trial: trialEvidence,
    scoring: scoreEvidence,
    applicants: applicantViews,
    generatedAt: new Date().toISOString(),
    validatorAddress: VALIDATOR_CONFIG.VALIDATOR_ADDRESS,
  };

  const scoringDir = await ensureProcSubdir(procurementId, "scoring");
  const evidencePath = path.join(scoringDir, "evidence_bundle.json");
  await writeJson(evidencePath, bundle);

  return bundle;
}

export async function fetchAndCacheEvidence(procurementId, applicantAddresses = []) {
  const scoringDir = await ensureProcSubdir(procurementId, "scoring");
  const cachedPath = path.join(scoringDir, "evidence_bundle.json");
  const cached = await readJson(cachedPath, null);

  if (cached && cached.schema === "emperor-os/validator-evidence-bundle/v1") {
    const ageMs = Date.now() - Date.parse(cached.generatedAt);
    if (ageMs < 5 * 60 * 1000) {
      return cached;
    }
  }

  return fetchValidatorEvidenceBundle(procurementId, applicantAddresses);
}
