// prime-next-action.js
// Next-action engine for Prime procurements.
//
// Given a procurement's local state + chain phase snapshot, determines:
//   - What is the current situation?
//   - What is the next legal action?
//   - What is blocking us (if anything)?
//   - Is fallback promotion possible?
//   - Should we transition into linked job execution?
//
// SAFETY CONTRACT: Pure logic. No network calls. No signing.

import {
  PROC_STATUS,
  CHAIN_PHASE,
  TERMINAL_STATUSES,
  PROC_STATUS_DESCRIPTION,
  deriveChainPhase,
  secondsUntilDeadline,
} from "./prime-phase-model.js";

// ── Next-action result schema ─────────────────────────────────────────────────

/**
 * @typedef {object} NextAction
 * @property {string}   status           - Current local PROC_STATUS
 * @property {string}   chainPhase       - Current on-chain phase (CHAIN_PHASE)
 * @property {string}   action           - One of: NONE | INSPECT | EVALUATE_FIT | DRAFT_APPLICATION |
 *                                         BUILD_COMMIT_TX | WAIT_REVEAL_WINDOW | BUILD_REVEAL_TX |
 *                                         WAIT_SHORTLIST | CHECK_SHORTLIST | BUILD_FINALIST_TX |
 *                                         BUILD_TRIAL | BUILD_TRIAL_TX | WAIT_SCORING |
 *                                         CHECK_WINNER | EXECUTE_JOB | BUILD_COMPLETION_TX |
 *                                         TERMINAL
 * @property {string}   summary          - One-sentence human description
 * @property {string|null} blockedReason - null if not blocked; description if blocked
 * @property {string[]} preconditions    - list of precondition checks required before action
 * @property {boolean}  urgent           - true if deadline is within 4 hours
 * @property {number}   secsUntilDeadline
 * @property {string}   generatedAt
 */

const URGENCY_THRESHOLD_SECS = 4 * 3600; // 4 hours

// ── Main next-action computation ──────────────────────────────────────────────

/**
 * Computes the next action for a procurement.
 *
 * @param {object} opts
 * @param {object} opts.procState       - loaded from prime-state.js (proc_<id>/state.json)
 * @param {object} opts.procStruct      - chain data from prime-client.fetchProcurement()
 * @param {object} [opts.appView]       - from prime-client.fetchApplicationView()
 * @param {number} [opts.nowSecs]       - current time override (for testing)
 * @returns {NextAction}
 */
export function computeNextAction({ procState, procStruct, appView, nowSecs }) {
  const now        = nowSecs ?? Math.floor(Date.now() / 1000);
  const chainPhase = deriveChainPhase(procStruct, now);
  const secsLeft   = secondsUntilDeadline(procStruct, now);
  const localStatus = procState?.status ?? PROC_STATUS.DISCOVERED;
  const urgent     = secsLeft > 0 && secsLeft < URGENCY_THRESHOLD_SECS;

  const base = { chainPhase, secsUntilDeadline: secsLeft, urgent, generatedAt: new Date().toISOString() };

  // Terminal states — nothing to do
  if (TERMINAL_STATUSES.has(localStatus)) {
    return { ...base, status: localStatus, action: "TERMINAL", summary: PROC_STATUS_DESCRIPTION[localStatus], blockedReason: null, preconditions: [] };
  }

  // ── Derive action by local status + chain phase ──────────────────────────

  switch (localStatus) {
    case PROC_STATUS.DISCOVERED:
      return {
        ...base, status: localStatus,
        action: "INSPECT",
        summary: "Run inspection: fetch procurement struct, derive phase, write inspection bundle.",
        blockedReason: chainPhase === CHAIN_PHASE.CLOSED ? "Procurement already closed." : null,
        preconditions: ["ETH_RPC_URL set", "procurement struct readable"],
      };

    case PROC_STATUS.INSPECTED:
      if (procState?.fitEvaluatedAt) {
        return {
          ...base, status: localStatus,
          action: "NONE",
          summary: "Fit evaluation generated. Awaiting operator decision and explicit status transition.",
          blockedReason: "Operator must set FIT_APPROVED or NOT_A_FIT.",
          preconditions: [],
        };
      }
      return {
        ...base, status: localStatus,
        action: "EVALUATE_FIT",
        summary: "Evaluate fit: run deterministic scoring on linked job spec. Operator approves or rejects.",
        blockedReason: null,
        preconditions: [
          "inspection/procurement_snapshot.json exists",
          "inspection/linked_job_snapshot.json exists",
          "job spec fetchable from MCP",
        ],
      };

    case PROC_STATUS.FIT_APPROVED:
      if (chainPhase !== CHAIN_PHASE.COMMIT_OPEN) {
        return {
          ...base, status: localStatus,
          action: "NONE",
          summary: "Fit approved but commit window is not open.",
          blockedReason: `Chain phase is ${chainPhase}, not COMMIT_OPEN. Cannot commit.`,
          preconditions: [],
        };
      }
      return {
        ...base, status: localStatus,
        action: "DRAFT_APPLICATION",
        summary: "Draft application markdown, pin to IPFS, compute commitment, build unsigned commitApplication tx.",
        blockedReason: null,
        preconditions: [
          "PINATA_JWT set",
          "AGI_ALPHA_MCP set",
          "job spec fetchable",
          "AGENT_ADDRESS set",
          "AGENT_SUBDOMAIN set",
          "AGENT_MERKLE_PROOF set",
          "commit window open",
        ],
      };

    case PROC_STATUS.APPLICATION_DRAFTED:
      return {
        ...base, status: localStatus,
        action: "BUILD_COMMIT_TX",
        summary: "Build unsigned commitApplication tx package. Operator signs with MetaMask + Ledger.",
        blockedReason: chainPhase !== CHAIN_PHASE.COMMIT_OPEN
          ? `Commit window closed (chain phase: ${chainPhase}).`
          : null,
        preconditions: [
          "application/application_brief.md exists",
          "application/application_payload.json exists",
          "application/commitment_material.json exists (salt + hash)",
          "commit window still open",
        ],
      };

    case PROC_STATUS.COMMIT_READY:
      return {
        ...base, status: localStatus,
        action: "NONE",
        summary: "Unsigned commitApplication tx ready for operator signature. Waiting.",
        blockedReason: "Operator must sign application/unsigned_commit_tx.json with MetaMask + Ledger.",
        preconditions: [],
      };

    case PROC_STATUS.COMMIT_SUBMITTED:
      if (chainPhase === CHAIN_PHASE.COMMIT_OPEN) {
        return {
          ...base, status: localStatus,
          action: "NONE",
          summary: "Commit submitted. Waiting for commit deadline to pass before reveal window opens.",
          blockedReason: `Reveal window not yet open (${formatDuration(secsLeft)} until commit deadline).`,
          preconditions: [],
        };
      }
      if (chainPhase === CHAIN_PHASE.REVEAL_OPEN) {
        return {
          ...base, status: localStatus,
          action: "BUILD_REVEAL_TX",
          summary: "Reveal window is open. Build unsigned revealApplication tx package.",
          blockedReason: null,
          preconditions: [
            "application/commitment_material.json has salt + applicationURI",
            "commitment hash matches on-chain stored commitment",
            "reveal window open",
          ],
        };
      }
      return {
        ...base, status: localStatus,
        action: "NONE",
        summary: "Commit submitted but we are past the reveal deadline.",
        blockedReason: `Reveal window closed (chain phase: ${chainPhase}).`,
        preconditions: [],
      };

    case PROC_STATUS.REVEAL_READY:
      return {
        ...base, status: localStatus,
        action: "NONE",
        summary: "Unsigned revealApplication tx ready for operator signature. Waiting.",
        blockedReason: "Operator must sign reveal/unsigned_reveal_tx.json with MetaMask + Ledger.",
        preconditions: [],
      };

    case PROC_STATUS.REVEAL_SUBMITTED:
      return {
        ...base, status: localStatus,
        action: "CHECK_SHORTLIST",
        summary: "Reveal submitted. Monitor for ShortlistFinalized event to see if we are shortlisted.",
        blockedReason: null,
        preconditions: ["Monitor ShortlistFinalized events on Contract 2"],
      };

    case PROC_STATUS.SHORTLISTED:
      if (chainPhase !== CHAIN_PHASE.FINALIST_ACCEPT) {
        return {
          ...base, status: localStatus,
          action: "NONE",
          summary: "We are shortlisted but finalist accept window is not open yet.",
          blockedReason: `Chain phase is ${chainPhase}, waiting for FINALIST_ACCEPT.`,
          preconditions: [],
        };
      }
      return {
        ...base, status: localStatus,
        action: "BUILD_FINALIST_TX",
        summary: "Finalist accept window open. Build unsigned acceptFinalist tx package.",
        blockedReason: null,
        preconditions: [
          "shortlisted confirmed via ShortlistFinalized event",
          "finalist accept window open",
          "stake economics reviewed",
        ],
      };

    case PROC_STATUS.FINALIST_ACCEPT_READY:
      return {
        ...base, status: localStatus,
        action: "NONE",
        summary: "Unsigned acceptFinalist tx ready for operator signature. Waiting.",
        blockedReason: "Operator must sign finalist/unsigned_accept_finalist_tx.json with MetaMask + Ledger.",
        preconditions: [],
      };

    case PROC_STATUS.FINALIST_ACCEPT_SUBMITTED:
      if (chainPhase !== CHAIN_PHASE.TRIAL_OPEN) {
        return {
          ...base, status: localStatus,
          action: "NONE",
          summary: "Finalist acceptance confirmed. Waiting for trial window to open.",
          blockedReason: `Chain phase is ${chainPhase}, waiting for TRIAL_OPEN.`,
          preconditions: [],
        };
      }
      return {
        ...base, status: localStatus,
        action: "BUILD_TRIAL",
        summary: "Trial window open. Begin trial work execution.",
        blockedReason: null,
        preconditions: [
          "finalist acceptance confirmed on chain",
          "trial window open",
          "linked job spec fetchable",
        ],
      };

    case PROC_STATUS.TRIAL_IN_PROGRESS:
      return {
        ...base, status: localStatus,
        action: "BUILD_TRIAL",
        summary: "Trial work in progress. Complete deliverables, verify publication, build unsigned submitTrial tx.",
        blockedReason: chainPhase !== CHAIN_PHASE.TRIAL_OPEN
          ? `Trial window closed (chain phase: ${chainPhase}).`
          : null,
        preconditions: [
          "trial window still open",
          "deliverable artifacts complete",
          "IPFS publication fetch-back verified",
        ],
      };

    case PROC_STATUS.TRIAL_READY:
      return {
        ...base, status: localStatus,
        action: "NONE",
        summary: "Unsigned submitTrial tx ready for operator signature. Waiting.",
        blockedReason: "Operator must sign trial/unsigned_submit_trial_tx.json with MetaMask + Ledger.",
        preconditions: [],
      };

    case PROC_STATUS.TRIAL_SUBMITTED:
      return {
        ...base, status: localStatus,
        action: "WAIT_SCORING",
        summary: "Trial submitted. Waiting for validators to score.",
        blockedReason: null,
        preconditions: [],
      };

    case PROC_STATUS.WAITING_SCORE_PHASE:
      if (procState?.validatorRole === true && chainPhase === CHAIN_PHASE.SCORE_COMMIT) {
        return {
          ...base, status: localStatus,
          action: "BUILD_VALIDATOR_SCORE_COMMIT_TX",
          summary: "Validator role active. Build unsigned scoreCommit tx package.",
          blockedReason: null,
          preconditions: ["validator score inputs present", "score commit window open"],
        };
      }
      return {
        ...base, status: localStatus,
        action: "WAIT_SCORING",
        summary: "Score phase in progress. No action required. Monitor for winner designation.",
        blockedReason: null,
        preconditions: [],
      };

    case PROC_STATUS.WINNER_PENDING:
      return {
        ...base, status: localStatus,
        action: "CHECK_WINNER",
        summary: "Scores revealed. Check if we are selected as winner.",
        blockedReason: null,
        preconditions: ["score reveal phase complete"],
      };

    case PROC_STATUS.VALIDATOR_SCORE_COMMIT_READY:
      return { ...base, status: localStatus, action: "NONE", summary: "Validator score commit tx ready for operator signature.", blockedReason: "Operator must sign scoring/unsigned_score_commit_tx.json.", preconditions: [] };
    case PROC_STATUS.VALIDATOR_SCORE_COMMIT_SUBMITTED:
      return {
        ...base, status: localStatus,
        action: chainPhase === CHAIN_PHASE.SCORE_REVEAL ? "BUILD_VALIDATOR_SCORE_REVEAL_TX" : "WAIT_SCORING",
        summary: "Waiting for score reveal window.",
        blockedReason: null,
        preconditions: [],
      };
    case PROC_STATUS.VALIDATOR_SCORE_REVEAL_READY:
      return { ...base, status: localStatus, action: "NONE", summary: "Validator score reveal tx ready for operator signature.", blockedReason: "Operator must sign scoring/unsigned_score_reveal_tx.json.", preconditions: [] };
    case PROC_STATUS.VALIDATOR_SCORE_REVEAL_SUBMITTED:
      return { ...base, status: localStatus, action: "WAIT_SCORING", summary: "Validator scoring submitted. Waiting for winner designation.", blockedReason: null, preconditions: [] };

    case PROC_STATUS.SELECTED:
      return {
        ...base, status: localStatus,
        action: "EXECUTE_JOB",
        summary: "We are selected. Begin executing the linked AGIJobManager job.",
        blockedReason: null,
        preconditions: [
          "selection confirmed on chain",
          "linked job ID recorded in state",
          "procurement provenance artifacts exist",
        ],
      };

    case PROC_STATUS.SELECTION_EXPIRED:
      return {
        ...base, status: localStatus,
        action: "CHECK_WINNER",
        summary: "Selection expired. Check if fallback promotion is possible.",
        blockedReason: null,
        preconditions: ["inspect fallback promotion eligibility on Contract 2"],
      };

    case PROC_STATUS.FALLBACK_PROMOTABLE:
      return {
        ...base, status: localStatus,
        action: "CHECK_WINNER",
        summary: "Fallback promotion may be available. Inspect chain state for eligibility.",
        blockedReason: null,
        preconditions: ["verify fallback eligibility on Contract 2"],
      };

    case PROC_STATUS.JOB_EXECUTION_IN_PROGRESS:
      return {
        ...base, status: localStatus,
        action: "EXECUTE_JOB",
        summary: "Executing linked job. Follow AGIJobManager v1 completion pipeline.",
        blockedReason: null,
        preconditions: [
          "selection_to_execution_bridge.json exists",
          "linked job spec fetched",
          "artifact-first workflow active",
        ],
      };

    case PROC_STATUS.COMPLETION_READY:
      return {
        ...base, status: localStatus,
        action: "NONE",
        summary: "Unsigned requestJobCompletion tx ready for operator signature. Waiting.",
        blockedReason: "Operator must sign completion/unsigned_request_completion_tx.json.",
        preconditions: [],
      };

    case PROC_STATUS.COMPLETION_SUBMITTED:
      return {
        ...base, status: localStatus,
        action: "NONE",
        summary: "Completion tx broadcast. Awaiting on-chain settlement.",
        blockedReason: null,
        preconditions: [],
      };

    default:
      return {
        ...base, status: localStatus,
        action: "INSPECT",
        summary: `Unknown status ${localStatus}. Re-inspect procurement.`,
        blockedReason: `Unexpected local status: ${localStatus}`,
        preconditions: [],
      };
  }
}

// ── Deadline proximity warnings ───────────────────────────────────────────────

/**
 * Returns an array of warning strings for upcoming or missed deadlines.
 * @param {object} procStruct - chain procurement struct
 * @param {number} [nowSecs]
 * @returns {string[]}
 */
export function getDeadlineWarnings(procStruct, nowSecs) {
  const now = nowSecs ?? Math.floor(Date.now() / 1000);
  const warnings = [];

  const deadlines = [
    { label: "Commit",         ts: Number(procStruct.commitDeadline) },
    { label: "Reveal",         ts: Number(procStruct.revealDeadline) },
    { label: "FinalistAccept", ts: Number(procStruct.finalistAcceptDeadline) },
    { label: "Trial",          ts: Number(procStruct.trialDeadline) },
    { label: "ScoreCommit",    ts: Number(procStruct.scoreCommitDeadline) },
    { label: "ScoreReveal",    ts: Number(procStruct.scoreRevealDeadline) },
  ];

  for (const { label, ts } of deadlines) {
    if (!ts) continue;
    const diff = ts - now;
    if (diff > 0 && diff < URGENCY_THRESHOLD_SECS) {
      warnings.push(`URGENT: ${label} deadline in ${formatDuration(diff)}`);
    }
    if (diff < 0 && diff > -3600) {
      warnings.push(`MISSED: ${label} deadline passed ${formatDuration(-diff)} ago`);
    }
  }

  return warnings;
}

function formatDuration(secs) {
  const s = Math.abs(secs);
  if (s < 60)    return `${s}s`;
  if (s < 3600)  return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}
