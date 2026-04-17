export function selectRetrievalKeywords(jobSpec = {}) {
  const tokens = [jobSpec.domain, jobSpec.type, ...(jobSpec.tags ?? [])].filter(Boolean);
  return [...new Set(tokens.map((t) => String(t).toLowerCase()))];
}
