export const PRIME_PHASES = {
  commit: "COMMIT",
  reveal: "REVEAL",
  finalistAccept: "FINALIST_ACCEPT",
  trial: "TRIAL",
  scoreCommit: "SCORE_COMMIT",
  scoreReveal: "SCORE_REVEAL",
  postScore: "POST_SCORE"
};

export function derivePrimePhase(now, deadlines) {
  if (now < deadlines.commitDeadline) return PRIME_PHASES.commit;
  if (now < deadlines.revealDeadline) return PRIME_PHASES.reveal;
  if (now < deadlines.finalistAcceptDeadline) return PRIME_PHASES.finalistAccept;
  if (now < deadlines.trialDeadline) return PRIME_PHASES.trial;
  if (now < deadlines.scoreCommitDeadline) return PRIME_PHASES.scoreCommit;
  if (now < deadlines.scoreRevealDeadline) return PRIME_PHASES.scoreReveal;
  return PRIME_PHASES.postScore;
}
