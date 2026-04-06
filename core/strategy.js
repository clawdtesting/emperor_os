// ./agent/strategy.js

const DEFAULTS = {
    MIN_CONFIDENCE_TO_APPLY: Number(process.env.MIN_CONFIDENCE_TO_APPLY ?? "0.4"),
    MAX_ACCEPTABLE_DIFFICULTY: Number(process.env.MAX_ACCEPTABLE_DIFFICULTY ?? "0.75"),
    MIN_EXECUTION_CONFIDENCE: Number(process.env.MIN_EXECUTION_CONFIDENCE ?? "0.55"),
    MIN_PAYOUT_AGIALPHA: Number(process.env.MIN_PAYOUT_AGIALPHA ?? "500"),
    MAX_DURATION_DAYS: Number(process.env.MAX_DURATION_DAYS ?? "30"),
    ENABLE_RED_FLAG_HARD_SKIP:
      String(process.env.ENABLE_RED_FLAG_HARD_SKIP ?? "true").toLowerCase() === "true"
  };
  
  const TERMINAL_STATUSES = new Set([
    "completed",
    "disputed",
    "cancelled",
    "canceled",
    "closed",
    "expired"
  ]);
  
  const OPEN_STATUSES = new Set([
    "open",
    "created",
    "active",
    "available",
    ""
  ]);
  
  const CATEGORY_BASE_CAPABILITY = {
    analysis: 0.9,
    research: 0.9,
    development: 0.8,
    creative: 0.6,
    other: 0.45
  };
  
  const RED_FLAG_PATTERNS = [
    /production[\s-]?ready/i,
    /deploy(?:ment)?/i,
    /live trading/i,
    /real[\s-]?time/i,
    /full stack/i,
    /end[\s-]?to[\s-]?end/i,
    /optimi[sz]e/i,
    /guarantee/i,
    /mission[\s-]?critical/i,
    /high availability/i,
    /fault[\s-]?toleran/i,
    /kubernetes/i,
    /\bci\/cd\b/i,
    /smart contract audit/i,
    /formal verification/i,
    /security review/i,
    /trading bot/i,
    /latency-sensitive/i,
    /infra(?:structure)?/i,
    /mobile app/i,
    /ios\b/i,
    /android\b/i
  ];
  
  const CLEARNESS_POSITIVE_PATTERNS = [
    /plain[-\s]?language/i,
    /beginner/i,
    /high[-\s]?level/i,
    /use analogies/i,
    /single markdown file/i,
    /structured/i,
    /step[-\s]?by[-\s]?step/i
  ];
  
  const HARD_CONSTRAINT_PATTERNS = [
    /must include/i,
    /exactly/i,
    /strict/i,
    /required sections/i,
    /acceptance criteria/i,
    /validator/i,
    /source file/i,
    /source code/i
  ];
  
  const DELIVERABLE_PATTERNS = [
    /markdown/i,
    /\.md\b/i,
    /report/i,
    /write[-\s]?up/i,
    /explanation/i,
    /analysis/i,
    /documentation/i,
    /spec/i
  ];
  
  function clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, value));
  }
  
  function normalizeStatus(status) {
    return String(status ?? "").trim().toLowerCase();
  }
  
  function toText(job) {
    return [
      job.title ?? "",
      job.details ?? "",
      job.category ?? "",
      job.specUri ?? "",
      job.rawSpec ? JSON.stringify(job.rawSpec) : "",
      job.rawJob ? JSON.stringify(job.rawJob) : ""
    ]
      .filter(Boolean)
      .join("\n");
  }
  
  function parseDurationDays(job) {
    if (job.durationSeconds != null && Number.isFinite(Number(job.durationSeconds))) {
      return Number(job.durationSeconds) / 86400;
    }
  
    const rawDuration = job.rawJob?.duration ?? job.duration ?? "";
    const s = String(rawDuration).trim().toLowerCase();
    const match = s.match(/^(\d+(?:\.\d+)?)\s*(day|days|hour|hours|minute|minutes|second|seconds)$/);
  
    if (!match) return null;
  
    const n = Number(match[1]);
    const unit = match[2];
  
    if (unit.startsWith("day")) return n;
    if (unit.startsWith("hour")) return n / 24;
    if (unit.startsWith("minute")) return n / 1440;
    if (unit.startsWith("second")) return n / 86400;
    return null;
  }
  
  function inferCategory(job) {
    const category = String(job.category ?? "").trim().toLowerCase();
    if (!category) return "other";
    if (category.includes("research")) return "research";
    if (category.includes("analysis")) return "analysis";
    if (category.includes("develop")) return "development";
    if (category.includes("creative")) return "creative";
    return "other";
  }
  
  function computePayoutScore(job) {
    const payout = Number(job.payout ?? 0);
    if (!Number.isFinite(payout) || payout <= 0) return 0;
    if (payout >= 500000) return 1.0;
    if (payout >= 250000) return 0.95;
    if (payout >= 100000) return 0.85;
    if (payout >= 50000) return 0.75;
    if (payout >= 10000) return 0.6;
    if (payout >= 5000) return 0.5;
    if (payout >= 1000) return 0.35;
    return 0.15;
  }
  
  function hasPattern(text, patterns) {
    return patterns.some((pattern) => pattern.test(text));
  }
  
  function countPatternHits(text, patterns) {
    let count = 0;
    for (const pattern of patterns) {
      if (pattern.test(text)) count += 1;
    }
    return count;
  }
  
  function detectSignals(job) {
    const text = toText(job);
    const status = normalizeStatus(job.status);
    const category = inferCategory(job);
    const payout = Number(job.payout ?? 0);
    const durationDays = parseDurationDays(job);
  
    const missingSpec = !job.specUri && !job.rawSpec;
    const vagueRequirements = !job.details || String(job.details).trim().length < 40;
    const hasClearDeliverable = hasPattern(text, DELIVERABLE_PATTERNS);
    const hasRedFlags = hasPattern(text, RED_FLAG_PATTERNS);
    const redFlagCount = countPatternHits(text, RED_FLAG_PATTERNS);
    const hardConstraintCount = countPatternHits(text, HARD_CONSTRAINT_PATTERNS);
    const clarityPositiveCount = countPatternHits(text, CLEARNESS_POSITIVE_PATTERNS);
  
    const requiresMultiDiscipline =
      /design|architecture|implementation|deployment|infra|testing/i.test(text) &&
      /frontend|backend|database|api|ops|devops|mobile/i.test(text);
  
    const requiresExternalData =
      /latest|current|real-time|market data|web scraping|crawl|scrape|external api/i.test(text);
  
    const requiresStrictFormat =
      hardConstraintCount >= 2 ||
      /exact format|strict format|exactly these sections/i.test(text);
  
    const highDepthExpected =
      /deep|thorough|comprehensive|detailed|production-ready|expert-level/i.test(text);
  
    const beginnerFriendly =
      /beginner|newbie|plain language|simple terms|high-level/i.test(text);
  
    const noCodePreferred =
      /no code|no solidity|high-level only|plain-language explanation/i.test(text);
  
    const likelyGoodFit =
      (category === "analysis" || category === "research") &&
      (beginnerFriendly || noCodePreferred || hasClearDeliverable);
  
    const alreadyAssignedToUs =
      String(job.assignedAgent ?? "").toLowerCase() ===
      String(process.env.AGENT_ADDRESS ?? "").toLowerCase();
  
    return {
      status,
      category,
      payout,
      durationDays,
      missingSpec,
      vagueRequirements,
      hasClearDeliverable,
      hasRedFlags,
      redFlagCount,
      hardConstraintCount,
      clarityPositiveCount,
      requiresMultiDiscipline,
      requiresExternalData,
      requiresStrictFormat,
      highDepthExpected,
      beginnerFriendly,
      noCodePreferred,
      likelyGoodFit,
      alreadyAssignedToUs
    };
  }
  
  function computeDifficulty(job, signals) {
    let difficulty = 0.1;
  
    if (signals.missingSpec) difficulty += 0.35;
    if (signals.vagueRequirements) difficulty += 0.2;
    if (!signals.hasClearDeliverable) difficulty += 0.15;
    if (signals.requiresMultiDiscipline) difficulty += 0.35;
    if (signals.requiresExternalData) difficulty += 0.25;
    if (signals.requiresStrictFormat) difficulty += 0.15;
    if (signals.highDepthExpected) difficulty += 0.2;
  
    difficulty += Math.min(signals.redFlagCount * 0.08, 0.32);
  
    if (signals.category === "creative") difficulty += 0.08;
    if (signals.category === "development") difficulty += 0.12;
  
    if (signals.beginnerFriendly) difficulty -= 0.08;
    if (signals.noCodePreferred) difficulty -= 0.06;
    if (signals.clarityPositiveCount > 0) difficulty -= Math.min(signals.clarityPositiveCount * 0.03, 0.12);
  
    if (signals.durationDays != null) {
      if (signals.durationDays < 1) difficulty += 0.2;
      else if (signals.durationDays < 3) difficulty += 0.1;
      else if (signals.durationDays > DEFAULTS.MAX_DURATION_DAYS) difficulty += 0.15;
    }
  
    return clamp(difficulty);
  }
  
  function computeCapability(job, signals) {
    let capability = CATEGORY_BASE_CAPABILITY[signals.category] ?? CATEGORY_BASE_CAPABILITY.other;
  
    if (signals.likelyGoodFit) capability += 0.15;
    if (signals.beginnerFriendly) capability += 0.1;
    if (signals.noCodePreferred) capability += 0.08;
    if (signals.hasClearDeliverable) capability += 0.08;
    if (!signals.vagueRequirements) capability += 0.05;
  
    if (signals.requiresMultiDiscipline) capability -= 0.25;
    if (signals.requiresExternalData) capability -= 0.2;
    if (signals.requiresStrictFormat) capability -= 0.08;
    if (signals.highDepthExpected) capability -= 0.06;
  
    if (signals.category === "creative" && signals.highDepthExpected) {
      capability -= 0.1;
    }
  
    return clamp(capability);
  }
  
  function computeWinProbability(job, signals, difficulty, capability) {
    let winProbability = 0.55;
    const payoutScore = computePayoutScore(job);
  
    if (payoutScore >= 0.85) winProbability -= 0.08;
    if (payoutScore <= 0.2) winProbability -= 0.05;
  
    if (signals.category === "analysis" || signals.category === "research") winProbability += 0.08;
    if (signals.category === "creative") winProbability -= 0.08;
  
    if (signals.requiresMultiDiscipline) winProbability -= 0.1;
    if (signals.redFlagCount >= 2) winProbability -= 0.1;
    if (signals.beginnerFriendly) winProbability += 0.05;
    if (signals.hasClearDeliverable) winProbability += 0.04;
  
    winProbability += (capability - difficulty) * 0.35;
    return clamp(winProbability);
  }
  
  function computeExecutionConfidence(job, signals, difficulty, capability) {
    let confidence = 0.5;
    confidence += capability * 0.45;
    confidence -= difficulty * 0.45;
  
    if (signals.hasClearDeliverable) confidence += 0.08;
    if (signals.beginnerFriendly) confidence += 0.06;
    if (signals.noCodePreferred) confidence += 0.04;
    if (signals.requiresExternalData) confidence -= 0.1;
    if (signals.redFlagCount > 0) confidence -= Math.min(signals.redFlagCount * 0.04, 0.16);
  
    return clamp(confidence);
  }
  
  function computeExpectedValue(job, signals, winProbability, executionConfidence) {
    const payoutScore = computePayoutScore(job);
    return clamp(
      payoutScore * 0.45 +
        winProbability * 0.3 +
        executionConfidence * 0.25
    );
  }
  
  function hardSkipReason(job, signals, difficulty, executionConfidence) {
    const status = signals.status;
  
    if (TERMINAL_STATUSES.has(status)) return `terminal status: ${status}`;
    if (status === "assigned" && !signals.alreadyAssignedToUs) return "already assigned to another agent";
    if (!OPEN_STATUSES.has(status) && status !== "assigned") return `unsupported status: ${status || "unknown"}`;
    if (!Number.isFinite(signals.payout) || signals.payout < DEFAULTS.MIN_PAYOUT_AGIALPHA) {
      return `payout below threshold (${signals.payout || 0} < ${DEFAULTS.MIN_PAYOUT_AGIALPHA})`;
    }
    if (signals.missingSpec) return "missing spec";
    if (signals.requiresExternalData) return "requires unsupported external/current data";
    if (signals.requiresMultiDiscipline && signals.category === "development") {
      return "multi-discipline development job exceeds safe scope";
    }
    if (DEFAULTS.ENABLE_RED_FLAG_HARD_SKIP && signals.redFlagCount >= 3) {
      return "too many execution red flags";
    }
    if (difficulty > DEFAULTS.MAX_ACCEPTABLE_DIFFICULTY) {
      return `difficulty too high (${difficulty.toFixed(3)})`;
    }
    if (executionConfidence < DEFAULTS.MIN_EXECUTION_CONFIDENCE) {
      return `execution confidence too low (${executionConfidence.toFixed(3)})`;
    }
  
    return null;
  }
  
  function buildReason({ shouldApply, hardSkip, confidence, difficulty, expectedValueScore, signals }) {
    if (!shouldApply) {
      if (hardSkip) return hardSkip;
      if (signals.category === "creative") {
        return `creative job confidence too low (${confidence.toFixed(3)})`;
      }
      return `confidence too low (${confidence.toFixed(3)}), difficulty=${difficulty.toFixed(3)}, ev=${expectedValueScore.toFixed(3)}`;
    }
  
    const notes = [];
    if (signals.category === "analysis" || signals.category === "research") notes.push("strong category fit");
    if (signals.beginnerFriendly) notes.push("clear beginner-friendly framing");
    if (signals.hasClearDeliverable) notes.push("deliverable is structurally clear");
    notes.push(`confidence=${confidence.toFixed(3)}`);
    notes.push(`ev=${expectedValueScore.toFixed(3)}`);
    return notes.join(", ");
  }
  
  export function evaluateJobStrategy(job) {
    const signals = detectSignals(job);
    const payoutScore = computePayoutScore(job);
    const difficulty = computeDifficulty(job, signals);
    const capability = computeCapability(job, signals);
    const winProbability = computeWinProbability(job, signals, difficulty, capability);
    const executionConfidence = computeExecutionConfidence(job, signals, difficulty, capability);
    const expectedValueScore = computeExpectedValue(job, signals, winProbability, executionConfidence);
  
    const confidence = clamp(
      capability * 0.5 +
        executionConfidence * 0.3 +
        expectedValueScore * 0.2 -
        difficulty * 0.45
    );
  
    const hardSkip = hardSkipReason(job, signals, difficulty, executionConfidence);
  
    const shouldApply =
      !hardSkip &&
      confidence >= DEFAULTS.MIN_CONFIDENCE_TO_APPLY &&
      expectedValueScore >= 0.35;
  
    const reason = buildReason({
      shouldApply,
      hardSkip,
      confidence,
      difficulty,
      expectedValueScore,
      signals
    });
  
    return {
      shouldApply,
      reason,
      scores: {
        payoutScore: Number(payoutScore.toFixed(3)),
        difficulty: Number(difficulty.toFixed(3)),
        capability: Number(capability.toFixed(3)),
        winProbability: Number(winProbability.toFixed(3)),
        executionConfidence: Number(executionConfidence.toFixed(3)),
        expectedValueScore: Number(expectedValueScore.toFixed(3)),
        confidence: Number(confidence.toFixed(3))
      },
      signals
    };
  }
  
  export function shouldApply(job) {
    return evaluateJobStrategy(job).shouldApply;
  }
  
  export function explainSkip(job) {
    const decision = evaluateJobStrategy(job);
    return decision.shouldApply ? null : decision.reason;
  }