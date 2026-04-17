export function validatorScore(scores = []) {
  if (!scores.length) return 0;
  return scores.reduce((a, b) => a + Number(b), 0) / scores.length;
}
