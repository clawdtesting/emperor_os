import { discoverStage } from "./stages/discover.js";
import { commitApplicationStage } from "./stages/commit-application.js";
import { revealApplicationStage } from "./stages/reveal-application.js";
import { finalizeShortlistStage } from "./stages/finalize-shortlist.js";
import { acceptFinalistStage } from "./stages/accept-finalist.js";
import { executeTrialStage } from "./stages/execute-trial.js";
import { submitTrialStage } from "./stages/submit-trial.js";
import { revealValidatorScoreStage } from "./stages/reveal-validator-score.js";
import { finalizeWinnerStage } from "./stages/finalize-winner.js";
import { promoteFallbackStage } from "./stages/promote-fallback.js";
import { settleStage } from "./stages/settle.js";
import { transition } from "./stages/_helpers.js";

export const primePipeline = {
  stages: [
    { name: "discover", when: (s) => s.status === "DISCOVERED", run: discoverStage },
    { name: "commit-ready", when: (s) => s.status === "EVALUATED", run: async ({ state, context }) => ({ state: await transition(context, state, "COMMIT_READY", { stage: "auto-ready" }) }) },
    { name: "commit", when: (s) => s.status === "COMMIT_READY", run: commitApplicationStage },
    { name: "reveal-ready", when: (s) => s.status === "COMMIT_CONFIRMED", run: async ({ state, context }) => ({ state: await transition(context, state, "REVEAL_READY", { stage: "auto-ready" }) }) },
    { name: "reveal", when: (s) => s.status === "REVEAL_READY", run: revealApplicationStage },
    { name: "shortlist-pending", when: (s) => s.status === "REVEAL_CONFIRMED", run: async ({ state, context }) => ({ state: await transition(context, state, "SHORTLIST_PENDING", { stage: "waiting-shortlist" }) }) },
    { name: "finalize-shortlist", when: (s) => s.status === "SHORTLIST_PENDING", run: finalizeShortlistStage },
    { name: "accept-ready", when: (s) => s.status === "FINALIST", run: async ({ state, context }) => ({ state: await transition(context, state, "FINALIST_ACCEPT_READY", { stage: "auto-ready" }) }) },
    { name: "accept", when: (s) => s.status === "FINALIST_ACCEPT_READY", run: acceptFinalistStage },
    { name: "trial-ready", when: (s) => s.status === "FINALIST_ACCEPT_CONFIRMED", run: async ({ state, context }) => ({ state: await transition(context, state, "TRIAL_EXECUTION_READY", { stage: "auto-ready" }) }) },
    { name: "trial-exec", when: (s) => s.status === "TRIAL_EXECUTION_READY", run: executeTrialStage },
    { name: "trial-submit", when: (s) => s.status === "TRIAL_EXECUTED", run: submitTrialStage },
    { name: "score-pending", when: (s) => s.status === "TRIAL_PUBLISHED", run: async ({ state, context }) => ({ state: await transition(context, state, "VALIDATOR_SCORING_PENDING", { stage: "score-pending" }) }) },
    { name: "score-reveal", when: (s) => s.status === "VALIDATOR_SCORING_PENDING", run: revealValidatorScoreStage },
    { name: "finalize-winner", when: (s) => s.status === "WINNER_PENDING", run: finalizeWinnerStage },
    { name: "fallback", when: (s) => s.status === "FALLBACK_PROMOTABLE", run: promoteFallbackStage },
    { name: "settle", when: (s) => s.status === "WINNER_DESIGNATED", run: settleStage }
  ]
};
