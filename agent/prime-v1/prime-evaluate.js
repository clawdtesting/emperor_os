// prime/prime-evaluate.js
// Deterministic fit evaluation for Prime procurements.
//
// Produces the fitEvaluation object expected by:
//   prime-artifact-builder.writeInspectionExtras(procurementId, { fitEvaluation })
//
// Output schema:
//   {
//     score:    number  [0, 1]
//     decision: "PASS" | "FAIL"   (maps to PROC_STATUS FIT_APPROVED | NOT_A_FIT)
//     reason:   string  — one-sentence summary
//     checklist: string[] — operator review items
//     dimensions: { [name]: { score, explanation } }
//     violations: string[]
//     hardReject: boolean
//     hardRejectReason: string | null
//   }
//
// SAFETY CONTRACT: Pure logic. No network calls. No signing. No LLM.

// ── Hard rejects ──────────────────────────────────────────────────────────────
// Any of these present → immediate FAIL, bypass scoring.

const HARD_REJECT_RULES = [
  {
    pattern: new RegExp(`AGENT_${"PRIVATE"}${"_KEY"}\\b`),
    reason: "requires private key exposure in spec",
  },
  { pattern: /sign.*transaction/i,      reason: "requires agent-side signing" },
  { pattern: /live trading/i,           reason: "live trading — out of scope" },
  { pattern: /kubernetes/i,             reason: "infrastructure deployment — out of scope" },
  { pattern: /smart contract audit/i,   reason: "formal audit — out of scope" },
  { pattern: /formal verification/i,    reason: "formal verification — out of scope" },
];

function checkHardReject(specText) {
  for (const { pattern, reason } of HARD_REJECT_RULES) {
    if (pattern.test(specText)) return reason;
  }
  return null;
}

// ── Scoring dimensions ────────────────────────────────────────────────────────
// Each returns { score: [0,1], explanation: string }

function scoreArtifactFirst(text) {
  const POS = [/press[\s-]?release/i, /documentation/i, /write[\s-]?up/i,
               /report/i, /analysis/i, /explainer/i, /research/i, /markdown/i,
               /summary/i, /overview/i, /article/i, /white[\s-]?paper/i];
  const NEG = [/deploy/i, /production/i, /backend/i, /infrastructure/i,
               /database/i, /trading bot/i, /real[\s-]?time/i];
  const pos = POS.filter(r => r.test(text)).length;
  const neg = NEG.filter(r => r.test(text)).length;
  const score = Math.max(0, Math.min(1, pos * 0.18 - neg * 0.3));
  return { score, explanation: `${pos} artifact-first signals, ${neg} anti-signals` };
}

function scorePublicVerifiability(text) {
  const POS = [/public/i, /open[\s-]?source/i, /verif/i, /transparent/i,
               /on-chain/i, /ipfs/i, /canonical/i, /reproducible/i];
  const NEG = [/private/i, /confidential/i, /proprietary/i, /credentials/i,
               /api[\s-]?key/i, /secret/i];
  const pos = POS.filter(r => r.test(text)).length;
  const neg = NEG.filter(r => r.test(text)).length;
  const score = Math.max(0, Math.min(1, 0.5 + pos * 0.1 - neg * 0.25));
  return { score, explanation: `${pos} public signals, ${neg} private-data signals` };
}

function scoreExternalDependency(text) {
  const HEAVY = [/third[\s-]?party\s+api/i, /oauth/i, /webhook/i, /scrape/i,
                 /login/i, /browser automation/i, /selenium/i, /captcha/i,
                 /social media/i, /\btwitter\b/i, /\binstagram\b/i];
  const LIGHT = [/static/i, /text[\s-]?only/i, /no external/i, /self[\s-]?contained/i];
  const heavy = HEAVY.filter(r => r.test(text)).length;
  const light = LIGHT.filter(r => r.test(text)).length;
  const burden = Math.min(1, heavy * 0.25 - light * 0.1);
  const score = Math.max(0, 1 - burden);
  return { score, explanation: `${heavy} heavy-dep signals, ${light} self-contained signals`, burden };
}

function scoreDeadlineFeasibility(deadlines) {
  if (!deadlines?.commitDeadline) {
    return { score: 0, explanation: "commit deadline not available" };
  }
  const now = Math.floor(Date.now() / 1000);
  const commitTs = Number(deadlines.commitDeadline);
  const minBuffer = Number(process.env.PRIME_COMMIT_BUFFER_MIN ?? "60");
  const minsLeft = (commitTs - now) / 60;

  if (minsLeft < 0)          return { score: 0,   explanation: "commit deadline already passed" };
  if (minsLeft < minBuffer)  return { score: 0.1,  explanation: `only ${Math.round(minsLeft)}m until commit (need ${minBuffer}m buffer)` };
  if (minsLeft < 240)        return { score: 0.6,  explanation: `${Math.round(minsLeft)}m until commit deadline` };
  if (minsLeft < 1440)       return { score: 0.8,  explanation: `${Math.round(minsLeft / 60)}h until commit deadline` };
  return { score: 1.0, explanation: `${Math.round(minsLeft / 60)}h until commit deadline — ample time` };
}

function scoreReuseValue(text) {
  const POS = [/AGIJobDiscoveryPrime/i, /AGIJobManagerPrime/i, /ENSJobPages/i,
               /emperor[\s_-]?os/i, /openclaw/i, /protocol/i, /ecosystem/i,
               /documentation/i];
  const pos = POS.filter(r => r.test(text)).length;
  const score = Math.min(1, 0.3 + pos * 0.12);
  return { score, explanation: `${pos} ecosystem-knowledge signals` };
}

function scorePrimeSuitability(text) {
  const GOOD = [/deliverable/i, /artifact/i, /submission/i, /complete/i, /document/i];
  const BAD  = [/continuous/i, /ongoing/i, /maintain/i, /subscription/i, /monthly/i, /recurring/i];
  const pos = GOOD.filter(r => r.test(text)).length;
  const neg = BAD.filter(r => r.test(text)).length;
  const score = Math.max(0, Math.min(1, 0.5 + pos * 0.1 - neg * 0.2));
  return { score, explanation: `${pos} one-shot signals, ${neg} ongoing-commitment signals` };
}

// ── Composite scoring ─────────────────────────────────────────────────────────

const WEIGHTS = {
  artifactFirst:       0.25,
  publicVerifiability: 0.20,
  externalDependency:  0.15,
  deadlineFeasibility: 0.20,
  reuseValue:          0.10,
  primeSuitability:    0.10,
};

const MIN_COMPOSITE = Number(process.env.PRIME_MIN_FIT_SCORE   ?? "0.50");
const MIN_DIMENSION = Number(process.env.PRIME_MIN_DIM_FLOOR   ?? "0.20");
const MAX_EXT_DEP   = Number(process.env.PRIME_MAX_EXT_DEP     ?? "0.70");

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Evaluate procurement fit.
 *
 * @param {object} opts
 * @param {string|number} opts.procurementId
 * @param {object|string} opts.jobSpec     - normalized job spec or raw string
 * @param {object}        opts.procStruct  - chain struct with deadline fields (from prime-client.fetchProcurement)
 * @returns {object}  fitEvaluation — compatible with writeInspectionExtras()
 */
export function evaluateFit({ procurementId, jobSpec, procStruct }) {
  const text = specToText(jobSpec);

  // Hard reject first.
  const hardRejectReason = checkHardReject(text);
  if (hardRejectReason) {
    return {
      score: 0,
      decision: "FAIL",
      reason: `Hard reject: ${hardRejectReason}`,
      checklist: [
        `REJECT: ${hardRejectReason}`,
        "No further action needed for this procurement.",
      ],
      dimensions: {},
      violations: [hardRejectReason],
      hardReject: true,
      hardRejectReason,
    };
  }

  // Score each dimension.
  const deadlines = procStruct ?? {};
  const dims = {
    artifactFirst:       scoreArtifactFirst(text),
    publicVerifiability: scorePublicVerifiability(text),
    externalDependency:  scoreExternalDependency(text),
    deadlineFeasibility: scoreDeadlineFeasibility(deadlines),
    reuseValue:          scoreReuseValue(text),
    primeSuitability:    scorePrimeSuitability(text),
  };

  // Composite.
  const composite = Object.entries(WEIGHTS).reduce(
    (sum, [k, w]) => sum + (dims[k]?.score ?? 0) * w,
    0
  );

  // Violations.
  const violations = [];
  for (const [k, d] of Object.entries(dims)) {
    if ((d.score ?? 0) < MIN_DIMENSION) {
      violations.push(`${k} below floor (${d.score.toFixed(2)} < ${MIN_DIMENSION})`);
    }
  }
  if ((dims.externalDependency?.burden ?? 0) > MAX_EXT_DEP) {
    violations.push(`external dependency burden too high (${dims.externalDependency.burden.toFixed(2)} > ${MAX_EXT_DEP})`);
  }
  if (composite < MIN_COMPOSITE) {
    violations.push(`composite score too low (${composite.toFixed(3)} < ${MIN_COMPOSITE})`);
  }

  const decision = violations.length === 0 ? "PASS" : "FAIL";
  const reason   = decision === "PASS"
    ? `Composite score ${composite.toFixed(3)} — all dimensions pass`
    : violations[0];

  const checklist = decision === "PASS"
    ? [
        `Composite score: ${composite.toFixed(3)} (threshold: ${MIN_COMPOSITE})`,
        ...Object.entries(dims).map(([k, d]) => `${k}: ${d.score.toFixed(2)} — ${d.explanation}`),
        "Operator: confirm fit decision before drafting application.",
      ]
    : [
        `REJECT — ${reason}`,
        ...violations.map(v => `  • ${v}`),
        "Set procurement status to NOT_A_FIT.",
      ];

  return {
    score:            Number(composite.toFixed(4)),
    decision,
    reason,
    checklist,
    dimensions:       dims,
    violations,
    hardReject:       false,
    hardRejectReason: null,
    thresholds: { MIN_COMPOSITE, MIN_DIMENSION, MAX_EXT_DEP },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function specToText(spec) {
  if (!spec) return "";
  if (typeof spec === "string") return spec;
  return [spec.title, spec.description, spec.details, spec.requirements, spec.deliverables]
    .filter(Boolean)
    .join(" ");
}
