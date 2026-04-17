import assert from "assert";
import {
  commitWindowGuard,
  revealWindowGuard,
  finalistAcceptGuard,
  trialGuard,
  scoreCommitGuard,
  scoreRevealGuard,
  fallbackPromotionGuard
} from "../../protocols/prime/guards.js";

const d = {
  commitStart: 100,
  commitDeadline: 200,
  revealDeadline: 300,
  finalistAcceptDeadline: 400,
  trialDeadline: 500,
  scoreCommitDeadline: 600,
  scoreRevealDeadline: 700
};

assert.equal(commitWindowGuard(150, d), true);
assert.equal(commitWindowGuard(250, d), false);
assert.equal(revealWindowGuard(250, d), true);
assert.equal(finalistAcceptGuard(350, d), true);
assert.equal(trialGuard(450, d), true);
assert.equal(scoreCommitGuard(550, d), true);
assert.equal(scoreRevealGuard(650, d), true);
assert.equal(fallbackPromotionGuard(699, d), false);
assert.equal(fallbackPromotionGuard(700, d), true);

console.log("prime-deadline-guards.test.js passed");
