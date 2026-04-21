import test from 'node:test'
import assert from 'node:assert/strict'

import {
  PROJECT_ADAPTER_REGISTRY,
  getProjectAdapters,
  getProjectAdapterBySlug,
  getProjectsMetadataFromAdapters,
} from '../../adapters/projects/index.js'

test('project adapter registry exposes deterministic adapter keys', () => {
  assert.deepEqual(Object.keys(PROJECT_ADAPTER_REGISTRY), ['emperor_os', 'polymarket', 'future_placeholder'])
})

test('adapter metadata exposes shell/project capability contract', () => {
  const projects = getProjectsMetadataFromAdapters()
  assert.deepEqual(projects.map((project) => project.slug), ['emperor-os', 'polymarket', 'future-placeholder'])

  const emperor = projects.find((project) => project.slug === 'emperor-os')
  assert.ok(emperor)
  assert.equal(emperor.supportsDeterministic, true)
  assert.equal(emperor.supportsHumanSigning, true)
  assert.equal(emperor.legacyEntry?.embeddedSectionKey, 'executions')
  assert.equal(emperor.doctrine?.signingAuthority, 'human-only')
  assert.ok(Array.isArray(emperor.requestTypes) && emperor.requestTypes.includes('agijobmanager-v2'))

  const polymarket = projects.find((project) => project.slug === 'polymarket')
  assert.ok(polymarket)
  assert.equal(polymarket.status, 'planned')
  assert.equal(polymarket.supportsHumanSigning, false)
  assert.equal(polymarket.scaffoldNote, 'Scaffold only. Runtime integration and execution lanes intentionally deferred.')
})

test('adapter placeholders are explicit and non-authoritative for execution hooks', () => {
  const adapters = getProjectAdapters()
  assert.ok(adapters.length >= 2)
  adapters.forEach((adapter) => {
    assert.equal(adapter.planExecution(), null)
    assert.equal(adapter.validateCandidate(), null)
  })

  const emperorAdapter = getProjectAdapterBySlug('emperor-os')
  assert.ok(emperorAdapter)
  assert.equal(emperorAdapter.getMetadata().id, 'project_emperor_os')
})
