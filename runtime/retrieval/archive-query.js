export function queryArchive({ keywords = [], archiveIndex = [] }) {
  return archiveIndex.filter((row) => keywords.some((k) => (row.tags ?? []).includes(k)));
}
