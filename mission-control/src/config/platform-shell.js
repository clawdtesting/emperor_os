import { PLATFORM_NAV_SECTIONS, buildPlatformSummary, findProjectBySlug } from '../models/platform.js'
import { PLATFORM_SEED_DATA } from '../state/platform-seed.js'

export { PLATFORM_NAV_SECTIONS, buildPlatformSummary }

export const PROJECTS = PLATFORM_SEED_DATA.projects.map((project) => ({
  key: project.slug,
  label: project.name,
  description: project.description || '',
  status: project.status,
  scaffoldOnly: project.status !== 'active-legacy',
  legacyUrl: project.legacyUrl || null,
}))

export function legacyProjectLink(projectKey) {
  return findProjectBySlug(PLATFORM_SEED_DATA.projects, projectKey)?.legacyUrl || null
}
