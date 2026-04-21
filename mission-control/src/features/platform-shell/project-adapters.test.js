import test from 'node:test'
import assert from 'node:assert/strict'

import {
  PROJECT_ADAPTER_REGISTRY,
  getProjectAdapters,
  getProjectAdapterBySlug,
  getProjectsMetadataFromAdapters,
} from '../../adapters/projects/index.js'

test('project adapter registry exposes deterministic adapter keys', () => {
  assert.deepEqual(Object.keys(PROJECT_ADAPTER_REGISTRY), ['emperor_os', 'polymarket', 'orchestrator_chat_alpha_v0'])
})

test('adapter metadata exposes shell/project capability contract', () => {
  const projects = getProjectsMetadataFromAdapters()
  assert.deepEqual(projects.map((project) => project.slug), ['emperor-os', 'polymarket', 'orchestrator-chat-alpha-v0'])

  const emperor = projects.find((project) => project.slug === 'emperor-os')
  assert.ok(emperor)
  assert.equal(emperor.supportsDeterministic, true)
  assert.equal(emperor.supportsHumanSigning, true)
  assert.equal(emperor.legacyEntry?.embeddedSectionKey, 'executions')
  assert.equal(emperor.legacyUrl, null)
  assert.equal(emperor.legacyEntry?.externalUrl, undefined)
  assert.equal(emperor.doctrine?.signingAuthority, 'human-only')
  assert.ok(Array.isArray(emperor.requestTypes) && emperor.requestTypes.includes('agijobmanager-v2'))

  const polymarket = projects.find((project) => project.slug === 'polymarket')
  assert.ok(polymarket)
  assert.equal(polymarket.status, 'planned')
  assert.equal(polymarket.supportsHumanSigning, false)
  assert.equal(polymarket.scaffoldNote, 'Scaffold only. Runtime integration and execution lanes intentionally deferred.')

  const orchestrator = projects.find((project) => project.slug === 'orchestrator-chat-alpha-v0')
  assert.ok(orchestrator)
  assert.equal(orchestrator.status, 'planned')
  assert.equal(orchestrator.supportsHumanSigning, false)
  assert.equal(orchestrator.scaffoldNote, 'Scaffold only. Render deployment target not yet configured in Op-control. Requires MetaMask-compatible browser wallet.')
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
