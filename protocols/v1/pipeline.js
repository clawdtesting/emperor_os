import { discoverStage } from "./stages/discover.js";
import { evaluateStage } from "./stages/evaluate.js";
import { applyStage } from "./stages/apply.js";
import { confirmStage } from "./stages/confirm.js";
import { executeStage } from "./stages/execute.js";
import { validateStage } from "./stages/validate.js";
import { publishStage } from "./stages/publish.js";
import { submitStage } from "./stages/submit.js";
import { reconcileStage } from "./stages/reconcile.js";

export const v1Pipeline = {
  stages: [
    { name: "discover", when: (s) => s.status === "DISCOVERED", run: discoverStage },
    { name: "evaluate", when: (s) => s.status === "EVALUATED", run: evaluateStage },
    { name: "apply", when: (s) => s.status === "APPLY_READY", run: applyStage },
    { name: "confirm", when: (s) => s.status === "APPLIED_UNSIGNED", run: confirmStage },
    { name: "execute-ready", when: (s) => s.status === "APPLIED_CONFIRMED", run: async ({ state, context }) => ({ state: await (await import('./stages/_helpers.js')).transition(context, state, 'EXECUTION_READY', { stage: 'auto-ready' }) }) },
    { name: "execute", when: (s) => s.status === "EXECUTION_READY", run: executeStage },
    { name: "validate", when: (s) => s.status === "EXECUTED", run: validateStage },
    { name: "publish", when: (s) => s.status === "VALIDATED", run: publishStage },
    { name: "submission-ready", when: (s) => s.status === "PUBLISHED", run: async ({ state, context }) => ({ state: await (await import('./stages/_helpers.js')).transition(context, state, 'SUBMISSION_READY', { stage: 'auto-ready' }) }) },
    { name: "submit", when: (s) => s.status === "SUBMISSION_READY", run: submitStage },
    { name: "reconcile", when: (s) => s.status === "RECONCILING", run: reconcileStage }
  ]
};
