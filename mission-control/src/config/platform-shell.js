import { getProjectsMetadataFromAdapters } from '../adapters/projects/index.js'
import { PLATFORM_NAV_SECTIONS, buildPlatformSummary, findProjectBySlug } from '../models/platform.js'

export { PLATFORM_NAV_SECTIONS, buildPlatformSummary }

export const PROJECTS = getProjectsMetadataFromAdapters().map((project) => ({
  key: project.slug,
  label: project.name,
  description: project.description || '',
  status: project.status,
  scaffoldOnly: project.status !== 'active-legacy',
  legacyUrl: project.legacyUrl || null,
}))

export function legacyProjectLink(projectKey) {
  return findProjectBySlug(getProjectsMetadataFromAdapters(), projectKey)?.legacyUrl || null
}
