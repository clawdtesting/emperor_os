import test from 'node:test'
import assert from 'node:assert/strict'

import {
  PLATFORM_NAV_SECTIONS,
  PROJECTS,
  buildPlatformSummary,
  legacyProjectLink,
} from '../../config/platform-shell.js'
import { PLATFORM_SEED_DATA } from '../../state/platform-seed.js'

test('platform shell exposes expected top-level navigation sections in order', () => {
  assert.deepEqual(
    PLATFORM_NAV_SECTIONS.map((section) => section.key),
    ['dashboard', 'projects', 'runtimes', 'skills', 'executions', 'settings'],
  )
})

test('platform projects include emperor_os legacy destination and scaffold projects', () => {
  const projectKeys = PROJECTS.map((project) => project.key)
  assert.deepEqual(projectKeys, ['emperor-os', 'polymarket', 'future-placeholder'])

  const emperor = PROJECTS.find((project) => project.key === 'emperor-os')
  assert.ok(emperor)
  assert.equal(emperor.legacyUrl, 'https://emperor-os.onrender.com/')
  assert.equal(emperor.status, 'active-legacy')

  const polymarket = PROJECTS.find((project) => project.key === 'polymarket')
  assert.ok(polymarket)
  assert.equal(polymarket.status, 'planned')
  assert.equal(polymarket.scaffoldOnly, true)
})

test('legacyProjectLink returns deterministic external URL for Emperor_OS card', () => {
  assert.equal(legacyProjectLink('emperor-os'), 'https://emperor-os.onrender.com/')
  assert.equal(legacyProjectLink('polymarket'), null)
})

test('buildPlatformSummary returns deterministic dashboard counts from seed dataset', () => {
  const summary = buildPlatformSummary(PLATFORM_SEED_DATA)

  assert.equal(summary.projectsTotal, 3)
  assert.equal(summary.activeProjects, 1)
  assert.equal(summary.plannedProjects, 2)
  assert.equal(summary.connectedRuntimes, 2)
  assert.equal(summary.skillsTotal, 5)
  assert.equal(summary.executionsTotal, 3)
})
