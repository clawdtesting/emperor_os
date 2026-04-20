import test from 'node:test'
import assert from 'node:assert/strict'

import {
  PLATFORM_NAV_SECTIONS,
  PROJECT_STATUS,
  RUNTIME_STATUS,
  SKILL_KIND,
  SKILL_SCOPE,
  EXECUTION_STATUS,
  buildPlatformSummary,
  validatePlatformDataset,
} from '../../models/platform.js'
import { PLATFORM_SEED_DATA } from '../../state/platform-seed.js'

test('platform nav contains required sections in deterministic order', () => {
  assert.deepEqual(
    PLATFORM_NAV_SECTIONS.map((section) => section.key),
    ['dashboard', 'projects', 'runtimes', 'skills', 'executions', 'settings'],
  )
})

test('seeded projects, runtimes, skills, and executions match required base set', () => {
  assert.deepEqual(PLATFORM_SEED_DATA.projects.map((item) => item.slug), ['emperor-os', 'polymarket', 'future-placeholder'])
  assert.deepEqual(PLATFORM_SEED_DATA.runtimes.map((item) => item.name), ['Hermes VPS Main', 'OpenClaw Local', 'Hosted Runtime Placeholder'])
  assert.deepEqual(PLATFORM_SEED_DATA.skills.map((item) => item.slug), [
    'deterministic-artifact-packaging',
    'ipfs-publish-fetchback-verify',
    'unsigned-tx-preview-generation',
    'generic-repo-triage-placeholder',
    'emperor-procurement-helper-placeholder',
  ])
  assert.ok(PLATFORM_SEED_DATA.executions.length >= 3)
})

test('enumerated statuses and kinds stay explicit for future extension', () => {
  assert.ok(PROJECT_STATUS.includes('active-legacy'))
  assert.ok(PROJECT_STATUS.includes('planned'))
  assert.ok(RUNTIME_STATUS.includes('connected'))
  assert.ok(RUNTIME_STATUS.includes('planned'))
  assert.ok(SKILL_KIND.includes('deterministic'))
  assert.ok(SKILL_KIND.includes('llm-assisted'))
  assert.ok(SKILL_SCOPE.includes('platform'))
  assert.ok(SKILL_SCOPE.includes('emperor_os'))
  assert.ok(SKILL_SCOPE.includes('polymarket'))
  assert.ok(EXECUTION_STATUS.includes('succeeded'))
  assert.ok(EXECUTION_STATUS.includes('awaiting_review'))
})

test('platform seed passes deterministic shape validation', () => {
  const result = validatePlatformDataset(PLATFORM_SEED_DATA)
  assert.equal(result.ok, true)
  assert.deepEqual(result.errors, [])
})

test('buildPlatformSummary derives dashboard metrics from typed seed data', () => {
  const summary = buildPlatformSummary(PLATFORM_SEED_DATA)

  assert.equal(summary.projectsTotal, 3)
  assert.equal(summary.activeProjects, 1)
  assert.equal(summary.plannedProjects, 2)
  assert.equal(summary.connectedRuntimes, 2)
  assert.equal(summary.plannedRuntimes, 1)
  assert.equal(summary.skillsTotal, 5)
  assert.equal(summary.deterministicSkills, 3)
  assert.equal(summary.llmAssistedSkills, 2)
  assert.equal(summary.executionsTotal, PLATFORM_SEED_DATA.executions.length)
  assert.ok(summary.awaitingReviewExecutions >= 1)
})
