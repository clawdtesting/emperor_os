// validation/scoring-adjudicator.js
// Substantive scoring adjudication for validator role.
//
// Replaces the trivial deterministicScore() in prime-validator-engine.js
// with a multi-dimensional evaluation of trial deliverables.
//
// Dimensions:
//   1. Spec compliance — does the trial address the procurement requirements?
//   2. Artifact quality — structure, depth, coherence of the deliverable
//   3. Public verifiability — IPFS publication integrity
//   4. Deadline adherence — submitted within the trial window
//   5. Reuse value — stepping-stone potential for future work
//
// SAFETY CONTRACT: Pure evaluation. No signing. No broadcasting.
// One deterministic output per evidence bundle.

import { createHash } from "crypto";
import { VALIDATOR_CONFIG } from "./config.js";

const SCORING_WEIGHTS = {
  specCompliance: 0.30,
  artifactQuality: 0.25,
  publicVerifiability: 0.20,
  deadlineAdherence: 0.15,
  reuseValue: 0.10,
};

function normalizeScore(raw, min = 0, max = 100) {
  const clamped = Math.max(min, Math.min(max, raw));
  const precision = VALIDATOR_CONFIG.SCORE_PRECISION;
  return Math.round(clamped * Math.pow(10, precision)) / Math.pow(10, precision);
}

function evaluateSpecCompliance(evidence, trialContent) {
  if (!trialContent || !String(trialContent).trim()) return { score: 0, checks: [{ name: "no_content", passed: false }] };

  const content = trialContent.toLowerCase();
  let score = 0;
  const checks = [];

  const hasSectionHeadings = (content.match(/#{2,}/g) || []).length >= 2;
  checks.push({ name: "has_section_headings", passed: hasSectionHeadings });
  if (hasSectionHeadings) score += 20;

  const hasSubstantiveLength = trialContent.length >= 500;
  checks.push({ name: "substantive_length", passed: hasSubstantiveLength });
  if (hasSubstantiveLength) score += 20;

  const hasNoPlaceholders = !/\*\[[^\]]{3,}\]\*/.test(trialContent);
  checks.push({ name: "no_placeholders", passed: hasNoPlaceholders });
  if (hasNoPlaceholders) score += 15;

  const hasCodeBlocks = /```[\s\S]*```/.test(trialContent);
  checks.push({ name: "has_code_blocks", passed: hasCodeBlocks });
  if (hasCodeBlocks) score += 10;

  const hasLists = /[-*]\s+\S/.test(trialContent);
  checks.push({ name: "has_lists", passed: hasLists });
  if (hasLists) score += 10;

  const procStruct = evidence?.procurement?.procStruct;
  if (procStruct?.jobId) {
    checks.push({ name: "linked_job_present", passed: true });
    score += 15;
  }

  const trialSubmissions = evidence?.trial?.trialSubmissions || [];
  if (trialSubmissions.length > 0 && trialSubmissions[0].content) {
    checks.push({ name: "trial_content_accessible", passed: true });
    score += 10;
  }

  return { score: normalizeScore(score), checks };
}

function evaluateArtifactQuality(trialContent) {
  if (!trialContent) return { score: 0, checks: [] };

  const checks = [];
  let score = 0;

  const lines = trialContent.split("\n");
  const nonEmptyLines = lines.filter(l => l.trim().length > 0);
  const contentRatio = nonEmptyLines.length / Math.max(1, lines.length);

  const goodStructure = contentRatio > 0.6;
  checks.push({ name: "good_structure_ratio", passed: goodStructure, value: contentRatio });
  if (goodStructure) score += 25;

  const hasIntroduction = /introduction|overview|summary|abstract/i.test(trialContent);
  checks.push({ name: "has_introduction", passed: hasIntroduction });
  if (hasIntroduction) score += 15;

  const hasConclusion = /conclusion|summary|final|wrap.?up/i.test(trialContent);
  checks.push({ name: "has_conclusion", passed: hasConclusion });
  if (hasConclusion) score += 15;

  const sectionCount = (trialContent.match(/#{2,}\s+/g) || []).length;
  const adequateSections = sectionCount >= 3;
  checks.push({ name: "adequate_sections", passed: adequateSections, value: sectionCount });
  if (adequateSections) score += 20;

  const wordCount = trialContent.split(/\s+/).filter(w => w.length > 0).length;
  const adequateLength = wordCount >= 200;
  checks.push({ name: "adequate_word_count", passed: adequateLength, value: wordCount });
  if (adequateLength) score += 15;

  const hasNoAIDisclaimers = !/as an ai|language model|large language/i.test(trialContent);
  checks.push({ name: "no_ai_disclaimers", passed: hasNoAIDisclaimers });
  if (hasNoAIDisclaimers) score += 10;

  return { score: normalizeScore(score), checks };
}

function evaluatePublicVerifiability(evidence) {
  const checks = [];
  let score = 0;

  const trialSubmissions = evidence?.trial?.trialSubmissions || [];
  if (trialSubmissions.length > 0) {
    const sub = trialSubmissions[0];
    const hasCid = !!sub.cid;
    checks.push({ name: "has_cid", passed: hasCid });
    if (hasCid) score += 30;

    const contentFetched = !!sub.content;
    checks.push({ name: "content_fetched", passed: contentFetched });
    if (contentFetched) score += 30;

    const hasTrialURI = !!sub.trialURI;
    checks.push({ name: "has_trial_uri", passed: hasTrialURI });
    if (hasTrialURI) score += 20;

    const contentLength = sub.contentLength || 0;
    const adequateContent = contentLength >= 500;
    checks.push({ name: "adequate_content_length", passed: adequateContent, value: contentLength });
    if (adequateContent) score += 20;
  } else {
    checks.push({ name: "no_trial_submissions", passed: false });
  }

  return { score: normalizeScore(score), checks };
}

function evaluateDeadlineAdherence(evidence) {
  const checks = [];
  let score = 0;

  const deadlines = evidence?.procurement?.deadlines;
  const now = Math.floor(Date.now() / 1000);

  if (deadlines?.trial) {
    const submittedBeforeDeadline = now <= deadlines.trial;
    checks.push({ name: "submitted_before_trial_deadline", passed: submittedBeforeDeadline });
    if (submittedBeforeDeadline) score += 50;
  }

  if (deadlines?.scoreCommit) {
    const withinScoreCommitWindow = now <= deadlines.scoreCommit;
    checks.push({ name: "within_score_commit_window", passed: withinScoreCommitWindow });
    if (withinScoreCommitWindow) score += 25;
  }

  const isScorePhase = evidence?.procurement?.isScorePhase;
  checks.push({ name: "in_score_phase", passed: !!isScorePhase });
  if (isScorePhase) score += 25;

  return { score: normalizeScore(score), checks };
}

function evaluateReuseValue(trialContent, evidence) {
  const checks = [];
  let score = 0;

  if (!trialContent) return { score: 0, checks: [{ name: "no_content", passed: false }] };

  const hasReusablePatterns = /template|pattern|framework|methodology|approach/i.test(trialContent);
  checks.push({ name: "has_reusable_patterns", passed: hasReusablePatterns });
  if (hasReusablePatterns) score += 25;

  const hasReferences = /reference|citation|source|link|url|http/i.test(trialContent);
  checks.push({ name: "has_references", passed: hasReferences });
  if (hasReferences) score += 20;

  const hasExamples = /example|sample|demonstrat|illustrat/i.test(trialContent);
  checks.push({ name: "has_examples", passed: hasExamples });
  if (hasExamples) score += 25;

  const hasStructuredData = /\{[^}]+\}|\[[^\]]+\]/.test(trialContent);
  checks.push({ name: "has_structured_data", passed: hasStructuredData });
  if (hasStructuredData) score += 15;

  const hasStepByStep = /step|phase|stage|first|second|third|finally/i.test(trialContent);
  checks.push({ name: "has_step_by_step", passed: hasStepByStep });
  if (hasStepByStep) score += 15;

  return { score: normalizeScore(score), checks };
}

export function adjudicateScore(evidence, trialContent) {
  const specCompliance = evaluateSpecCompliance(evidence, trialContent);
  const artifactQuality = evaluateArtifactQuality(trialContent);
  const publicVerifiability = evaluatePublicVerifiability(evidence);
  const deadlineAdherence = evaluateDeadlineAdherence(evidence);
  const reuseValue = evaluateReuseValue(trialContent, evidence);

  const weightedScore =
    specCompliance.score * SCORING_WEIGHTS.specCompliance +
    artifactQuality.score * SCORING_WEIGHTS.artifactQuality +
    publicVerifiability.score * SCORING_WEIGHTS.publicVerifiability +
    deadlineAdherence.score * SCORING_WEIGHTS.deadlineAdherence +
    reuseValue.score * SCORING_WEIGHTS.reuseValue;

  const finalScore = normalizeScore(weightedScore);

  return {
    schema: "emperor-os/validator-adjudication/v1",
    score: finalScore,
    dimensions: {
      specCompliance,
      artifactQuality,
      publicVerifiability,
      deadlineAdherence,
      reuseValue,
    },
    weights: SCORING_WEIGHTS,
    generatedAt: new Date().toISOString(),
  };
}

export function computeScoreCommitment(score, salt) {
  return `0x${createHash("sha256").update(`${score}:${salt}`, "utf8").digest("hex")}`;
}

export function verifyScoreReveal({ score, salt, expectedCommitment }) {
  const recomputed = computeScoreCommitment(score, salt);
  return {
    expectedCommitment: String(expectedCommitment ?? "").toLowerCase(),
    recomputedCommitment: recomputed.toLowerCase(),
    verified: recomputed.toLowerCase() === String(expectedCommitment ?? "").toLowerCase(),
  };
}
