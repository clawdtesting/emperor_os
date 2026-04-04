// prime-phase-model.js
// Canonical Prime procurement phase state machine.
//
// Defines all valid statuses, transitions, chain phase derivation,
// and next-action computation.
//
// SAFETY CONTRACT: Pure logic only. No network calls. No signing.

// ── Local procurement statuses (Emperor_OS internal) ─────────────────────────
// These are the values stored in proc_<id>/state.json

export const PROC_STATUS = {
  // Discovery & inspection
  DISCOVERED:                "DISCOVERED",
  INSPECTED:                 "INSPECTED",
  NOT_A_FIT:                 "NOT_A_FIT",
  FIT_APPROVED:              "FIT_APPROVED",

  // Application
  APPLICATION_DRAFTED:       "APPLICATION_DRAFTED",
  COMMIT_READY:              "COMMIT_READY",
  COMMIT_SUBMITTED:          "COMMIT_SUBMITTED",

  // Reveal
  REVEAL_READY:              "REVEAL_READY",
  REVEAL_SUBMITTED:          "REVEAL_SUBMITTED",

  // Shortlist / finalist
  SHORTLISTED:               "SHORTLISTED",
  FINALIST_ACCEPT_READY:     "FINALIST_ACCEPT_READY",
  FINALIST_ACCEPT_SUBMITTED: "FINALIST_ACCEPT_SUBMITTED",

  // Trial
  TRIAL_IN_PROGRESS:         "TRIAL_IN_PROGRESS",
  TRIAL_READY:               "TRIAL_READY",
  TRIAL_SUBMITTED:           "TRIAL_SUBMITTED",
  VALIDATOR_SCORE_COMMIT_READY: "VALIDATOR_SCORE_COMMIT_READY",
  VALIDATOR_SCORE_COMMIT_SUBMITTED: "VALIDATOR_SCORE_COMMIT_SUBMITTED",
  VALIDATOR_SCORE_REVEAL_READY: "VALIDATOR_SCORE_REVEAL_READY",
  VALIDATOR_SCORE_REVEAL_SUBMITTED: "VALIDATOR_SCORE_REVEAL_SUBMITTED",

  // Scoring
  WAITING_SCORE_PHASE:       "WAITING_SCORE_PHASE",
  WINNER_PENDING:            "WINNER_PENDING",

  // Selection
  SELECTED:                  "SELECTED",
  SELECTION_EXPIRED:         "SELECTION_EXPIRED",
  FALLBACK_PROMOTABLE:       "FALLBACK_PROMOTABLE",

  // Job execution (linked job)
  JOB_EXECUTION_IN_PROGRESS: "JOB_EXECUTION_IN_PROGRESS",
  COMPLETION_READY:          "COMPLETION_READY",
  COMPLETION_SUBMITTED:      "COMPLETION_SUBMITTED",

  // Terminal
  DONE:                      "DONE",
  REJECTED:                  "REJECTED",
  NOT_SHORTLISTED:           "NOT_SHORTLISTED",
  EXPIRED:                   "EXPIRED",
  MISSED_WINDOW:             "MISSED_WINDOW",
};

// Terminal statuses — no further action possible
export const TERMINAL_STATUSES = new Set([
  PROC_STATUS.NOT_A_FIT,
  PROC_STATUS.DONE,
  PROC_STATUS.REJECTED,
  PROC_STATUS.NOT_SHORTLISTED,
  PROC_STATUS.EXPIRED,
  PROC_STATUS.MISSED_WINDOW,
]);

// Canonical operator-facing phase labels (requested enum alignment)
export const CANONICAL_PHASE = {
  DISCOVERED:             "DISCOVERED",
  SPEC_FETCHED:           "SPEC_FETCHED",
  EVALUATED:              "EVALUATED",
  COMMIT_READY:           "COMMIT_READY",
  COMMITTED:              "COMMITTED",
  REVEAL_READY:           "REVEAL_READY",
  REVEALED:               "REVEALED",
  SHORTLIST_PENDING:      "SHORTLIST_PENDING",
  FINALIST_SELECTED:      "FINALIST_SELECTED",
  FINALIST_ACCEPT_READY:  "FINALIST_ACCEPT_READY",
  FINALIST_ACCEPTED:      "FINALIST_ACCEPTED",
  TRIAL_WORKING:          "TRIAL_WORKING",
  TRIAL_READY:            "TRIAL_READY",
  TRIAL_SUBMITTED:        "TRIAL_SUBMITTED",
  SCORING_PENDING:        "SCORING_PENDING",
  WINNER_PENDING:         "WINNER_PENDING",
  WINNER_DESIGNATED:      "WINNER_DESIGNATED",
  FALLBACK_PENDING:       "FALLBACK_PENDING",
  DONE:                   "DONE",
  MISSED_WINDOW:          "MISSED_WINDOW",
  REJECTED:               "REJECTED",
};

// ── Chain-level phase derivation ──────────────────────────────────────────────
// Derived purely from on-chain deadline timestamps vs current time.
// This matches the procStatus() logic in check_procurements.js.

export const CHAIN_PHASE = {
  COMMIT_OPEN:      "COMMIT_OPEN",
  REVEAL_OPEN:      "REVEAL_OPEN",
  FINALIST_ACCEPT:  "FINALIST_ACCEPT",
  TRIAL_OPEN:       "TRIAL_OPEN",
  SCORE_COMMIT:     "SCORE_COMMIT",
  SCORE_REVEAL:     "SCORE_REVEAL",
  CLOSED:           "CLOSED",
};

/**
 * Derives the current chain phase of a procurement from deadline timestamps.
 * @param {ProcurementStruct} proc - object with deadline fields as numeric strings
 * @param {number} [nowSecs] - current unix timestamp in seconds (default: Date.now()/1000)
 * @returns {string} CHAIN_PHASE value
 */
export function deriveChainPhase(proc, nowSecs) {
  const now = nowSecs ?? Math.floor(Date.now() / 1000);
  const cd  = Number(proc.commitDeadline);
  const rd  = Number(proc.revealDeadline);
  const fad = Number(proc.finalistAcceptDeadline);
  const td  = Number(proc.trialDeadline);
  const scd = Number(proc.scoreCommitDeadline);
  const srd = Number(proc.scoreRevealDeadline);

  if (now < cd)  return CHAIN_PHASE.COMMIT_OPEN;
  if (now < rd)  return CHAIN_PHASE.REVEAL_OPEN;
  if (now < fad) return CHAIN_PHASE.FINALIST_ACCEPT;
  if (now < td)  return CHAIN_PHASE.TRIAL_OPEN;
  if (now < scd) return CHAIN_PHASE.SCORE_COMMIT;
  if (now < srd) return CHAIN_PHASE.SCORE_REVEAL;
  return CHAIN_PHASE.CLOSED;
}

/**
 * Returns seconds remaining until the deadline relevant to the current phase.
 * Returns 0 if already past, Infinity if phase has no meaningful deadline.
 */
export function secondsUntilDeadline(proc, nowSecs) {
  const now   = nowSecs ?? Math.floor(Date.now() / 1000);
  const phase = deriveChainPhase(proc, now);
  const deadline = {
    [CHAIN_PHASE.COMMIT_OPEN]:     Number(proc.commitDeadline),
    [CHAIN_PHASE.REVEAL_OPEN]:     Number(proc.revealDeadline),
    [CHAIN_PHASE.FINALIST_ACCEPT]: Number(proc.finalistAcceptDeadline),
    [CHAIN_PHASE.TRIAL_OPEN]:      Number(proc.trialDeadline),
    [CHAIN_PHASE.SCORE_COMMIT]:    Number(proc.scoreCommitDeadline),
    [CHAIN_PHASE.SCORE_REVEAL]:    Number(proc.scoreRevealDeadline),
    [CHAIN_PHASE.CLOSED]:          0,
  }[phase] ?? 0;
  return Math.max(0, deadline - now);
}

/**
 * Returns a human-readable deadline status string.
 */
export function formatDeadlineStatus(proc, nowSecs) {
  const now   = nowSecs ?? Math.floor(Date.now() / 1000);
  const phase = deriveChainPhase(proc, now);
  const secs  = secondsUntilDeadline(proc, now);
  if (secs === 0) return `${phase} — deadline passed`;
  return `${phase} — ${formatDuration(secs)} remaining`;
}

function formatDuration(secs) {
  if (secs < 60)   return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d ${Math.floor((secs % 86400) / 3600)}h`;
}

// ── Application phase names (contract-level) ──────────────────────────────────

export const APP_PHASE = {
  0: "None",
  1: "Committed",
  2: "Revealed",
  3: "Shortlisted",
  4: "TrialSubmitted",
};

// ── Valid local status transitions ─────────────────────────────────────────────
// Defines which transitions are explicitly legal.

const VALID_TRANSITIONS = {
  [PROC_STATUS.DISCOVERED]:                [PROC_STATUS.INSPECTED, PROC_STATUS.EXPIRED, PROC_STATUS.MISSED_WINDOW],
  [PROC_STATUS.INSPECTED]:                 [PROC_STATUS.NOT_A_FIT, PROC_STATUS.FIT_APPROVED, PROC_STATUS.MISSED_WINDOW],
  [PROC_STATUS.FIT_APPROVED]:              [PROC_STATUS.APPLICATION_DRAFTED, PROC_STATUS.MISSED_WINDOW],
  [PROC_STATUS.APPLICATION_DRAFTED]:       [PROC_STATUS.COMMIT_READY, PROC_STATUS.MISSED_WINDOW],
  [PROC_STATUS.COMMIT_READY]:              [PROC_STATUS.COMMIT_SUBMITTED, PROC_STATUS.EXPIRED, PROC_STATUS.MISSED_WINDOW],
  [PROC_STATUS.COMMIT_SUBMITTED]:          [PROC_STATUS.REVEAL_READY, PROC_STATUS.EXPIRED, PROC_STATUS.MISSED_WINDOW],
  [PROC_STATUS.REVEAL_READY]:              [PROC_STATUS.REVEAL_SUBMITTED, PROC_STATUS.EXPIRED, PROC_STATUS.MISSED_WINDOW],
  [PROC_STATUS.REVEAL_SUBMITTED]:          [PROC_STATUS.SHORTLISTED, PROC_STATUS.NOT_SHORTLISTED, PROC_STATUS.EXPIRED, PROC_STATUS.MISSED_WINDOW],
  [PROC_STATUS.NOT_SHORTLISTED]:           [],
  [PROC_STATUS.SHORTLISTED]:               [PROC_STATUS.FINALIST_ACCEPT_READY, PROC_STATUS.EXPIRED, PROC_STATUS.MISSED_WINDOW],
  [PROC_STATUS.FINALIST_ACCEPT_READY]:     [PROC_STATUS.FINALIST_ACCEPT_SUBMITTED, PROC_STATUS.EXPIRED, PROC_STATUS.MISSED_WINDOW],
  [PROC_STATUS.FINALIST_ACCEPT_SUBMITTED]: [PROC_STATUS.TRIAL_IN_PROGRESS, PROC_STATUS.EXPIRED, PROC_STATUS.MISSED_WINDOW],
  [PROC_STATUS.TRIAL_IN_PROGRESS]:         [PROC_STATUS.TRIAL_READY, PROC_STATUS.EXPIRED, PROC_STATUS.MISSED_WINDOW],
  [PROC_STATUS.TRIAL_READY]:               [PROC_STATUS.TRIAL_SUBMITTED, PROC_STATUS.EXPIRED, PROC_STATUS.MISSED_WINDOW],
  [PROC_STATUS.TRIAL_SUBMITTED]:           [PROC_STATUS.WAITING_SCORE_PHASE, PROC_STATUS.EXPIRED, PROC_STATUS.MISSED_WINDOW],
  [PROC_STATUS.VALIDATOR_SCORE_COMMIT_READY]: [PROC_STATUS.VALIDATOR_SCORE_COMMIT_SUBMITTED, PROC_STATUS.EXPIRED, PROC_STATUS.MISSED_WINDOW],
  [PROC_STATUS.VALIDATOR_SCORE_COMMIT_SUBMITTED]: [PROC_STATUS.VALIDATOR_SCORE_REVEAL_READY, PROC_STATUS.EXPIRED, PROC_STATUS.MISSED_WINDOW],
  [PROC_STATUS.VALIDATOR_SCORE_REVEAL_READY]: [PROC_STATUS.VALIDATOR_SCORE_REVEAL_SUBMITTED, PROC_STATUS.EXPIRED, PROC_STATUS.MISSED_WINDOW],
  [PROC_STATUS.VALIDATOR_SCORE_REVEAL_SUBMITTED]: [PROC_STATUS.WAITING_SCORE_PHASE, PROC_STATUS.EXPIRED, PROC_STATUS.MISSED_WINDOW],
  [PROC_STATUS.WAITING_SCORE_PHASE]:       [PROC_STATUS.WINNER_PENDING, PROC_STATUS.REJECTED, PROC_STATUS.EXPIRED, PROC_STATUS.MISSED_WINDOW],
  [PROC_STATUS.WINNER_PENDING]:            [PROC_STATUS.SELECTED, PROC_STATUS.SELECTION_EXPIRED],
  [PROC_STATUS.SELECTION_EXPIRED]:         [PROC_STATUS.FALLBACK_PROMOTABLE, PROC_STATUS.EXPIRED],
  [PROC_STATUS.FALLBACK_PROMOTABLE]:       [PROC_STATUS.SELECTED, PROC_STATUS.EXPIRED],
  [PROC_STATUS.SELECTED]:                  [PROC_STATUS.JOB_EXECUTION_IN_PROGRESS],
  [PROC_STATUS.JOB_EXECUTION_IN_PROGRESS]: [PROC_STATUS.COMPLETION_READY],
  [PROC_STATUS.COMPLETION_READY]:          [PROC_STATUS.COMPLETION_SUBMITTED],
  [PROC_STATUS.COMPLETION_SUBMITTED]:      [PROC_STATUS.DONE],
  [PROC_STATUS.NOT_A_FIT]:                 [],
  [PROC_STATUS.DONE]:                      [],
  [PROC_STATUS.REJECTED]:                  [],
  [PROC_STATUS.EXPIRED]:                   [],
  [PROC_STATUS.MISSED_WINDOW]:             [],
};

/**
 * Returns true if transitioning from currentStatus to nextStatus is valid.
 */
export function isValidTransition(currentStatus, nextStatus) {
  const allowed = VALID_TRANSITIONS[currentStatus];
  return Array.isArray(allowed) && allowed.includes(nextStatus);
}

/**
 * Returns all valid next statuses from the current status.
 */
export function allowedNextStatuses(currentStatus) {
  return VALID_TRANSITIONS[currentStatus] ?? [];
}

/**
 * Validates a proposed transition; throws if invalid.
 */
export function assertValidTransition(currentStatus, nextStatus) {
  if (!isValidTransition(currentStatus, nextStatus)) {
    throw new Error(
      `Invalid transition: ${currentStatus} → ${nextStatus}. ` +
      `Allowed: [${(VALID_TRANSITIONS[currentStatus] ?? []).join(", ")}]`
    );
  }
}

// ── Human-readable phase summaries ───────────────────────────────────────────

export const PROC_STATUS_DESCRIPTION = {
  [PROC_STATUS.DISCOVERED]:                "Procurement found on chain. Needs inspection.",
  [PROC_STATUS.INSPECTED]:                 "Inspection complete. Awaiting fit decision.",
  [PROC_STATUS.NOT_A_FIT]:                 "Fit evaluation: skip. No action needed.",
  [PROC_STATUS.FIT_APPROVED]:              "Fit approved by operator. Draft application.",
  [PROC_STATUS.APPLICATION_DRAFTED]:       "Application drafted + IPFS pinned. Compute commitment.",
  [PROC_STATUS.COMMIT_READY]:              "Unsigned commitApplication tx ready. Awaiting operator signature.",
  [PROC_STATUS.COMMIT_SUBMITTED]:          "Commit tx broadcast. Waiting for reveal window.",
  [PROC_STATUS.REVEAL_READY]:              "Reveal window open. Unsigned revealApplication tx ready.",
  [PROC_STATUS.REVEAL_SUBMITTED]:          "Reveal tx broadcast. Waiting for shortlist.",
  [PROC_STATUS.SHORTLISTED]:               "We are on the shortlist. Need to accept finalist role.",
  [PROC_STATUS.FINALIST_ACCEPT_READY]:     "Unsigned acceptFinalist tx ready. Awaiting operator signature.",
  [PROC_STATUS.FINALIST_ACCEPT_SUBMITTED]: "Finalist acceptance broadcast. Trial window incoming.",
  [PROC_STATUS.TRIAL_IN_PROGRESS]:         "Trial work underway. Building deliverable artifacts.",
  [PROC_STATUS.TRIAL_READY]:               "Trial artifact + publication verified. Unsigned submitTrial ready.",
  [PROC_STATUS.TRIAL_SUBMITTED]:           "Trial submitted. Waiting for score phase.",
  [PROC_STATUS.VALIDATOR_SCORE_COMMIT_READY]: "Validator score commit tx ready. Awaiting operator signature.",
  [PROC_STATUS.VALIDATOR_SCORE_COMMIT_SUBMITTED]: "Validator score commit submitted. Awaiting reveal window.",
  [PROC_STATUS.VALIDATOR_SCORE_REVEAL_READY]: "Validator score reveal tx ready. Awaiting operator signature.",
  [PROC_STATUS.VALIDATOR_SCORE_REVEAL_SUBMITTED]: "Validator score reveal submitted. Waiting for winner designation.",
  [PROC_STATUS.WAITING_SCORE_PHASE]:       "Validators are scoring. No action needed.",
  [PROC_STATUS.WINNER_PENDING]:            "Scoring complete. Waiting for winner designation.",
  [PROC_STATUS.SELECTED]:                  "We are selected as the winning agent. Execute linked job.",
  [PROC_STATUS.SELECTION_EXPIRED]:         "Selection window expired. Check fallback promotion.",
  [PROC_STATUS.FALLBACK_PROMOTABLE]:       "Fallback promotion may be possible. Inspect chain state.",
  [PROC_STATUS.JOB_EXECUTION_IN_PROGRESS]: "Executing linked AGIJobManager job.",
  [PROC_STATUS.COMPLETION_READY]:          "Job complete. Unsigned requestJobCompletion tx ready.",
  [PROC_STATUS.COMPLETION_SUBMITTED]:      "Completion tx broadcast. Awaiting settlement.",
  [PROC_STATUS.DONE]:                      "Procurement fully complete and settled.",
  [PROC_STATUS.REJECTED]:                  "Not selected as winner.",
  [PROC_STATUS.NOT_SHORTLISTED]:           "Not shortlisted. No further action.",
  [PROC_STATUS.EXPIRED]:                   "Deadline passed before action could complete.",
  [PROC_STATUS.MISSED_WINDOW]:             "A required lifecycle window was missed. Manual intervention required.",
};

export function toCanonicalPhase(localStatus) {
  const m = {
    [PROC_STATUS.DISCOVERED]:                CANONICAL_PHASE.DISCOVERED,
    [PROC_STATUS.INSPECTED]:                 CANONICAL_PHASE.SPEC_FETCHED,
    [PROC_STATUS.NOT_A_FIT]:                 CANONICAL_PHASE.REJECTED,
    [PROC_STATUS.FIT_APPROVED]:              CANONICAL_PHASE.EVALUATED,
    [PROC_STATUS.APPLICATION_DRAFTED]:       CANONICAL_PHASE.COMMIT_READY,
    [PROC_STATUS.COMMIT_READY]:              CANONICAL_PHASE.COMMIT_READY,
    [PROC_STATUS.COMMIT_SUBMITTED]:          CANONICAL_PHASE.COMMITTED,
    [PROC_STATUS.REVEAL_READY]:              CANONICAL_PHASE.REVEAL_READY,
    [PROC_STATUS.REVEAL_SUBMITTED]:          CANONICAL_PHASE.REVEALED,
    [PROC_STATUS.SHORTLISTED]:               CANONICAL_PHASE.FINALIST_SELECTED,
    [PROC_STATUS.FINALIST_ACCEPT_READY]:     CANONICAL_PHASE.FINALIST_ACCEPT_READY,
    [PROC_STATUS.FINALIST_ACCEPT_SUBMITTED]: CANONICAL_PHASE.FINALIST_ACCEPTED,
    [PROC_STATUS.TRIAL_IN_PROGRESS]:         CANONICAL_PHASE.TRIAL_WORKING,
    [PROC_STATUS.TRIAL_READY]:               CANONICAL_PHASE.TRIAL_READY,
    [PROC_STATUS.TRIAL_SUBMITTED]:           CANONICAL_PHASE.TRIAL_SUBMITTED,
    [PROC_STATUS.VALIDATOR_SCORE_COMMIT_READY]: CANONICAL_PHASE.SCORING_PENDING,
    [PROC_STATUS.VALIDATOR_SCORE_COMMIT_SUBMITTED]: CANONICAL_PHASE.SCORING_PENDING,
    [PROC_STATUS.VALIDATOR_SCORE_REVEAL_READY]: CANONICAL_PHASE.SCORING_PENDING,
    [PROC_STATUS.VALIDATOR_SCORE_REVEAL_SUBMITTED]: CANONICAL_PHASE.SCORING_PENDING,
    [PROC_STATUS.WAITING_SCORE_PHASE]:       CANONICAL_PHASE.SCORING_PENDING,
    [PROC_STATUS.WINNER_PENDING]:            CANONICAL_PHASE.WINNER_PENDING,
    [PROC_STATUS.SELECTED]:                  CANONICAL_PHASE.WINNER_DESIGNATED,
    [PROC_STATUS.SELECTION_EXPIRED]:         CANONICAL_PHASE.FALLBACK_PENDING,
    [PROC_STATUS.FALLBACK_PROMOTABLE]:       CANONICAL_PHASE.FALLBACK_PENDING,
    [PROC_STATUS.JOB_EXECUTION_IN_PROGRESS]: CANONICAL_PHASE.WINNER_DESIGNATED,
    [PROC_STATUS.COMPLETION_READY]:          CANONICAL_PHASE.WINNER_DESIGNATED,
    [PROC_STATUS.COMPLETION_SUBMITTED]:      CANONICAL_PHASE.WINNER_DESIGNATED,
    [PROC_STATUS.DONE]:                      CANONICAL_PHASE.DONE,
    [PROC_STATUS.REJECTED]:                  CANONICAL_PHASE.REJECTED,
    [PROC_STATUS.NOT_SHORTLISTED]:           CANONICAL_PHASE.REJECTED,
    [PROC_STATUS.EXPIRED]:                   CANONICAL_PHASE.MISSED_WINDOW,
    [PROC_STATUS.MISSED_WINDOW]:             CANONICAL_PHASE.MISSED_WINDOW,
  };
  return m[localStatus] ?? localStatus;
}

export function didMissRequiredWindow(localStatus, chainPhase) {
  if (TERMINAL_STATUSES.has(localStatus)) return false;
  if (localStatus === PROC_STATUS.FIT_APPROVED || localStatus === PROC_STATUS.APPLICATION_DRAFTED || localStatus === PROC_STATUS.COMMIT_READY) {
    return chainPhase !== CHAIN_PHASE.COMMIT_OPEN;
  }
  if (localStatus === PROC_STATUS.COMMIT_SUBMITTED || localStatus === PROC_STATUS.REVEAL_READY) {
    return chainPhase !== CHAIN_PHASE.REVEAL_OPEN;
  }
  if (localStatus === PROC_STATUS.SHORTLISTED || localStatus === PROC_STATUS.FINALIST_ACCEPT_READY || localStatus === PROC_STATUS.FINALIST_ACCEPT_SUBMITTED) {
    return chainPhase !== CHAIN_PHASE.FINALIST_ACCEPT && chainPhase !== CHAIN_PHASE.TRIAL_OPEN;
  }
  if (localStatus === PROC_STATUS.TRIAL_IN_PROGRESS || localStatus === PROC_STATUS.TRIAL_READY) {
    return chainPhase !== CHAIN_PHASE.TRIAL_OPEN;
  }
  return false;
}
