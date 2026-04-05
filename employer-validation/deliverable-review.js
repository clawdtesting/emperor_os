// employer-validation/deliverable-review.js
// Reviews submitted deliverables for employer-side validation.
//
// For each job with a pending submission:
//   1. Fetches the completion metadata from IPFS
//   2. Fetches the deliverable content from IPFS
//   3. Fetches the original job spec from IPFS
//   4. Runs content quality checks
//   5. Runs spec compliance checks
//   6. Produces a review report with score and recommendation
//
// SAFETY CONTRACT: Read-only. No signing. No broadcasting.

import { fetchJobSpec } from "../agent/mcp.js";
import { EMPLOYER_CONFIG } from "./config.js";

const IPFS_GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
];

async function fetchFromIpfs(uri, timeoutMs = EMPLOYER_CONFIG.IPFS_FETCH_TIMEOUT_MS) {
  if (!uri) return null;
  const cid = uri.replace("ipfs://", "").replace(/^https?:\/\/[^/]+\/ipfs\//, "");
  if (!cid) return null;

  for (const gateway of IPFS_GATEWAYS) {
    for (let attempt = 0; attempt < EMPLOYER_CONFIG.IPFS_MAX_RETRIES; attempt++) {
      try {
        const url = `${gateway}${cid}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) continue;
        return await res.text();
      } catch {
        if (attempt < EMPLOYER_CONFIG.IPFS_MAX_RETRIES - 1) {
          await sleep(EMPLOYER_CONFIG.IPFS_RETRY_DELAY_MS);
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
  return uri.replace("ipfs://", "").replace(/^https?:\/\/[^/]+\/ipfs\//, "").split("/")[0] || null;
}

async function fetchCompletionMetadata(completionURI) {
  const text = await fetchFromIpfs(completionURI);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text, parseError: "Not valid JSON" };
  }
}

async function fetchDeliverableContent(completionURI) {
  const metadata = await fetchCompletionMetadata(completionURI);
  if (!metadata) return null;

  // Try to find deliverable URI in metadata
  const deliverableUri =
    metadata?.properties?.finalDeliverables?.[0]?.uri ??
    metadata?.image ??
    metadata?.properties?.deliverableURI ??
    null;

  if (!deliverableUri) {
    // If metadata IS the deliverable (markdown as JSON string)
    return metadata.raw ?? JSON.stringify(metadata, null, 2);
  }

  return fetchFromIpfs(deliverableUri);
}

function evaluateContentQuality(content) {
  if (!content) return { score: 0, checks: [], errors: ["No content to evaluate"] };

  const checks = [];
  const errors = [];
  const warnings = [];
  let score = 0;

  // Length check
  const meetsMinLength = content.length >= EMPLOYER_CONFIG.MIN_DELIVERABLE_CHARS;
  checks.push({ name: "meets_min_length", passed: meetsMinLength, value: content.length, threshold: EMPLOYER_CONFIG.MIN_DELIVERABLE_CHARS });
  if (meetsMinLength) score += 20;
  else errors.push(`Content too short: ${content.length} < ${EMPLOYER_CONFIG.MIN_DELIVERABLE_CHARS}`);

  // Substantive check
  const substantive = content.trim().length >= EMPLOYER_CONFIG.MIN_SUBSTANTIVE_CHARS && !content.includes("*[");
  checks.push({ name: "is_substantive", passed: substantive });
  if (substantive) score += 15;
  else errors.push("Content is not substantive");

  // No placeholders
  const noPlaceholders = !/\*\[[^\]]{3,}\]\*/.test(content);
  checks.push({ name: "no_placeholders", passed: noPlaceholders });
  if (noPlaceholders) score += 10;
  else errors.push("Content contains placeholder markers");

  // Markdown structure
  const hasHeadings = (content.match(/#{2,}/g) || []).length >= 2;
  checks.push({ name: "has_markdown_headings", passed: hasHeadings, value: (content.match(/#{2,}/g) || []).length });
  if (hasHeadings) score += 15;
  else warnings.push("Content may lack structure (few section headings)");

  // No AI disclaimers / forbidden patterns
  const forbiddenMatches = [];
  for (const pattern of EMPLOYER_CONFIG.FORBIDDEN_PATTERNS) {
    if (pattern.test(content)) {
      forbiddenMatches.push(pattern.source);
    }
  }
  const noForbidden = forbiddenMatches.length === 0;
  checks.push({ name: "no_forbidden_patterns", passed: noForbidden, matches: forbiddenMatches });
  if (noForbidden) score += 10;
  else errors.push(`Forbidden patterns found: ${forbiddenMatches.join(", ")}`);

  // Code blocks
  const hasCodeBlocks = /```[\s\S]*```/.test(content);
  checks.push({ name: "has_code_examples", passed: hasCodeBlocks });
  if (hasCodeBlocks) score += 10;

  // Lists
  const hasLists = /[-*]\s+\S/.test(content);
  checks.push({ name: "has_lists", passed: hasLists });
  if (hasLists) score += 5;

  // Introduction and conclusion
  const hasIntro = /introduction|overview|summary|abstract/i.test(content);
  checks.push({ name: "has_introduction", passed: hasIntro });
  if (hasIntro) score += 5;

  const hasConclusion = /conclusion|summary|final|wrap.?up/i.test(content);
  checks.push({ name: "has_conclusion", passed: hasConclusion });
  if (hasConclusion) score += 5;

  // Word count
  const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
  const adequateWords = wordCount >= 100;
  checks.push({ name: "adequate_word_count", passed: adequateWords, value: wordCount });
  if (adequateWords) score += 5;

  return {
    score: Math.min(100, score),
    checks,
    errors,
    warnings,
    stats: {
      charCount: content.length,
      wordCount,
      lineCount: content.split("\n").length,
      sectionCount: (content.match(/#{2,}\s+/g) || []).length,
      codeBlockCount: Math.floor((content.match(/```/g) || []).length / 2),
    },
  };
}

function evaluateSpecCompliance(content, jobSpec) {
  if (!content || !jobSpec) return { score: 0, checks: [], errors: ["Missing content or spec"] };

  const checks = [];
  const errors = [];
  const warnings = [];
  let score = 0;

  const contentLower = content.toLowerCase();
  const specText = JSON.stringify(jobSpec).toLowerCase();

  // Check if job title/keywords appear in deliverable
  const specKeywords = extractKeywords(jobSpec);
  const matchedKeywords = specKeywords.filter(kw => contentLower.includes(kw.toLowerCase()));
  const keywordCoverage = specKeywords.length > 0 ? matchedKeywords.length / specKeywords.length : 0;
  const goodCoverage = keywordCoverage >= EMPLOYER_CONFIG.REQUIRED_SECTION_MATCH_THRESHOLD;

  checks.push({
    name: "keyword_coverage",
    passed: goodCoverage,
    value: Math.round(keywordCoverage * 100) / 100,
    matched: matchedKeywords,
    total: specKeywords.length,
  });
  if (goodCoverage) score += 30;
  else if (keywordCoverage > 0.3) {
    score += 15;
    warnings.push(`Low keyword coverage: ${Math.round(keywordCoverage * 100)}%`);
  }
  else errors.push(`Very low keyword coverage: ${Math.round(keywordCoverage * 100)}%`);

  // Check required sections from spec
  const requiredSections = extractRequiredSections(jobSpec);
  if (requiredSections.length > 0) {
    const matchedSections = requiredSections.filter(s => contentLower.includes(s.toLowerCase()));
    const sectionCoverage = matchedSections.length / requiredSections.length;
    const goodSectionCoverage = sectionCoverage >= EMPLOYER_CONFIG.REQUIRED_SECTION_MATCH_THRESHOLD;

    checks.push({
      name: "required_sections",
      passed: goodSectionCoverage,
      value: Math.round(sectionCoverage * 100) / 100,
      matched: matchedSections,
      missing: requiredSections.filter(s => !matchedSections.includes(s)),
      total: requiredSections.length,
    });
    if (goodSectionCoverage) score += 30;
    else if (sectionCoverage > 0.5) {
      score += 15;
      warnings.push(`Missing required sections: ${requiredSections.filter(s => !matchedSections.includes(s)).join(", ")}`);
    }
    else errors.push(`Most required sections missing: ${requiredSections.filter(s => !matchedSections.includes(s)).join(", ")}`);
  }

  // Has substantive deliverable (not just a link or one-liner)
  const hasSubstantiveDelivery = content.length >= 200;
  checks.push({ name: "substantive_delivery", passed: hasSubstantiveDelivery });
  if (hasSubstantiveDelivery) score += 20;
  else errors.push("Deliverable appears insubstantial");

  // No obvious evasion (e.g., "see attached", "will deliver later")
  const evasionPatterns = [/see attached/i, /will deliver/i, /coming soon/i, /under construction/i, /todo/i, /tbd/i];
  const evasionMatches = evasionPatterns.filter(p => p.test(content));
  const noEvasion = evasionMatches.length === 0;
  checks.push({ name: "no_evasion_patterns", passed: noEvasion, matches: evasionMatches.map(p => p.source) });
  if (noEvasion) score += 20;
  else warnings.push(`Possible evasion patterns: ${evasionMatches.map(p => p.source).join(", ")}`);

  return {
    score: Math.min(100, score),
    checks,
    errors,
    warnings,
  };
}

function extractKeywords(jobSpec) {
  if (typeof jobSpec === "string") {
    return jobSpec.split(/\s+/).filter(w => w.length > 4).slice(0, 20);
  }
  const text = JSON.stringify(jobSpec);
  return text.split(/\s+/).filter(w => w.length > 4).slice(0, 20);
}

function extractRequiredSections(jobSpec) {
  if (typeof jobSpec === "object" && jobSpec !== null) {
    if (Array.isArray(jobSpec.required_sections)) return jobSpec.required_sections;
    if (Array.isArray(jobSpec.sections)) return jobSpec.sections;
    if (jobSpec.brief?.required_sections) return jobSpec.brief.required_sections;
  }
  return [];
}

function computeOverallScore(contentQuality, specCompliance) {
  const contentWeight = 0.4;
  const specWeight = 0.6;
  return Math.round((contentQuality.score * contentWeight + specCompliance.score * specWeight) * 100) / 100;
}

function generateRecommendation(overallScore) {
  if (overallScore >= EMPLOYER_CONFIG.AUTO_ACCEPT_SCORE) {
    return { action: "ACCEPT", confidence: "HIGH", reason: `Score ${overallScore} exceeds auto-accept threshold (${EMPLOYER_CONFIG.AUTO_ACCEPT_SCORE})` };
  }
  if (overallScore >= EMPLOYER_CONFIG.MIN_COMPLETION_SCORE) {
    return { action: "REVIEW", confidence: "MEDIUM", reason: `Score ${overallScore} is acceptable but below auto-accept threshold. Manual review recommended.` };
  }
  if (overallScore >= EMPLOYER_CONFIG.AUTO_DISPUTE_SCORE) {
    return { action: "REVIEW", confidence: "LOW", reason: `Score ${overallScore} is below minimum. Consider disputing or requesting revisions.` };
  }
  return { action: "DISPUTE", confidence: "HIGH", reason: `Score ${overallScore} is critically low. Dispute recommended.` };
}

export async function reviewDeliverable(jobId, completionURI, jobSpec = null) {
  const contentQuality = { score: 0, checks: [], errors: ["No content fetched"], warnings: [] };
  const specCompliance = { score: 0, checks: [], errors: ["No content fetched"], warnings: [] };

  // Fetch deliverable content
  const content = await fetchDeliverableContent(completionURI);

  // Fetch job spec if not provided
  let spec = jobSpec;
  if (!spec) {
    try {
      spec = await fetchJobSpec(Number(jobId));
    } catch {
      spec = null;
    }
  }

  if (content) {
    contentQuality.score = evaluateContentQuality(content).score;
    Object.assign(contentQuality, evaluateContentQuality(content));
    specCompliance.score = evaluateSpecCompliance(content, spec).score;
    Object.assign(specCompliance, evaluateSpecCompliance(content, spec));
  }

  const overallScore = computeOverallScore(contentQuality, specCompliance);
  const recommendation = generateRecommendation(overallScore);

  return {
    schema: "emperor-os/employer-deliverable-review/v1",
    jobId: String(jobId),
    completionURI,
    contentFetched: !!content,
    contentLength: content?.length ?? 0,
    contentQuality,
    specCompliance,
    overallScore,
    recommendation,
    reviewedAt: new Date().toISOString(),
  };
}

export async function batchReviewDeliverables(pendingJobs) {
  const results = [];
  for (const job of pendingJobs) {
    try {
      if (!job.completionURI) {
        results.push({
          jobId: job.jobId,
          status: job.status,
          error: "No completionURI — agent has not submitted yet",
        });
        continue;
      }
      const review = await reviewDeliverable(job.jobId, job.completionURI);
      results.push(review);
    } catch (err) {
      results.push({
        jobId: job.jobId,
        status: job.status,
        error: err.message,
      });
    }
  }
  return results;
}

// Re-export internal functions for testing
export { evaluateContentQuality, evaluateSpecCompliance, computeOverallScore, generateRecommendation };
