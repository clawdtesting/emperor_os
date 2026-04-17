export function rankFinalists(finalists = []) {
  return [...finalists].sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0));
}
