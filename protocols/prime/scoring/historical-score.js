export function historicalScore(history = []) {
  if (!history.length) return 0;
  return Math.round((history.filter((h) => h.success).length / history.length) * 100);
}
