export function withinWindow(now, start, end) {
  return now >= Number(start) && now < Number(end);
}

export function commitWindowGuard(now, deadlines) {
  return withinWindow(now, deadlines.commitStart ?? 0, deadlines.commitDeadline);
}
export function revealWindowGuard(now, deadlines) {
  return withinWindow(now, deadlines.commitDeadline, deadlines.revealDeadline);
}
export function finalistAcceptGuard(now, deadlines) {
  return withinWindow(now, deadlines.revealDeadline, deadlines.finalistAcceptDeadline);
}
export function trialGuard(now, deadlines) {
  return withinWindow(now, deadlines.finalistAcceptDeadline, deadlines.trialDeadline);
}
export function scoreCommitGuard(now, deadlines) {
  return withinWindow(now, deadlines.trialDeadline, deadlines.scoreCommitDeadline);
}
export function scoreRevealGuard(now, deadlines) {
  return withinWindow(now, deadlines.scoreCommitDeadline, deadlines.scoreRevealDeadline);
}
export function fallbackPromotionGuard(now, deadlines) {
  return now >= Number(deadlines.scoreRevealDeadline ?? 0);
}
