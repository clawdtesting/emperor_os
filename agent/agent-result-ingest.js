import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { buildHashInventory } from './hash-inventory.js'
import { assertPathInsideAllowedPrefixes, resolveScopedPath, rejectSymlinkPath } from './file-scope.js'
import { validateSchema } from '../mission-control/lib/schema-validate.js'
import { getLaneRuleSet } from '../validation/agent-lane-rules.js'
import { runPreSignChecks } from './pre-sign-checks.js'
import { buildSigningManifest } from './signing-manifest.js'

function buildUnsignedTxPreview({ jobId, packetHash, candidateResultDigest }) {
  return {
    schema: 'emperor-os/unsigned-tx/v1',
    kind: 'requestJobCompletion',
    jobId: String(jobId),
    chainId: 1,
    to: '0x0000000000000000000000000000000000000001',
    data: '0x8d1bc00f',
    value: '0',
    generatedAt: new Date().toISOString(),
    packetHash,
    candidateResultDigest,
  }
}

export async function ingestAgentResult({ packet, result, workspaceRoot, connectionSummary = {}, runMeta = {} }) {
  const errors = []
  const warnings = []
  const schemaCheck = validateSchema('agent-job-result', result)
  if (!schemaCheck.valid) errors.push(...schemaCheck.errors.map(e => `schema: ${e}`))

  if (String(packet?.jobId) !== String(result?.jobId)) {
    errors.push(`packet/result jobId mismatch: packet=${packet?.jobId} result=${result?.jobId}`)
  }

  const allowedPrefixes = packet?.workspaceContract?.allowedOutputPrefixes || []
  const inventoryInputs = []
  for (const deliverable of result?.deliverables || []) {
    try {
      const safePath = assertPathInsideAllowedPrefixes(deliverable.path, allowedPrefixes)
      const { absolutePath, relativePath } = resolveScopedPath(workspaceRoot, safePath)
      if (!existsSync(absolutePath)) throw new Error(`declared deliverable missing on disk: ${relativePath}`)
      rejectSymlinkPath(absolutePath)
      inventoryInputs.push({ path: relativePath, absolutePath })
    } catch (err) {
      errors.push(`deliverable path invalid (${deliverable.path}): ${err.message}`)
    }
  }

  const fileInventory = errors.length ? [] : buildHashInventory(inventoryInputs)

  for (const deliverable of result?.deliverables || []) {
    if (deliverable.sha256) {
      const inv = fileInventory.find(i => i.path === deliverable.path)
      if (inv && inv.sha256 !== deliverable.sha256) {
        errors.push(`agent hash mismatch for ${deliverable.path}: declared=${deliverable.sha256} actual=${inv.sha256}`)
      }
    }
  }

  const requiredArtifacts = packet?.requiredArtifacts || []
  for (const req of requiredArtifacts.filter(r => r.required !== false)) {
    if (!fileInventory.some(item => item.path === req.path)) {
      errors.push(`required artifact missing: ${req.path}`)
    }
  }

  const laneRules = getLaneRuleSet(packet?.lane)
  const laneValidation = laneRules.validateResult(result, { inventory: fileInventory, phase: runMeta.phase })
  if (!laneValidation.ok) errors.push(...laneValidation.errors)
  warnings.push(...(laneValidation.warnings || []), ...(result?.warnings || []))

  const validationReport = {
    schema: 'emperor-os/agent-result-validation/v1',
    generatedAt: new Date().toISOString(),
    ok: errors.length === 0,
    packetJobId: packet?.jobId,
    resultJobId: result?.jobId,
    lane: packet?.lane,
    schemaCheck,
    errors,
    warnings,
    acceptanceChecks: packet?.acceptanceChecks || []
  }

  if (errors.length > 0) {
    return { ok: false, stage: 'validation_failed', errors, warnings, fileInventory, validationReport }
  }

  const candidateResultDigest = createHash('sha256').update(JSON.stringify(result)).digest('hex')
  const validationReportDigest = createHash('sha256').update(JSON.stringify(validationReport)).digest('hex')
  const packetHash = createHash('sha256').update(JSON.stringify(packet)).digest('hex')

  const publication = {
    schema: 'emperor-os/agent-candidate-publication/v1',
    packetHash,
    candidateResultDigest,
    fileInventory
  }

  const unsignedTx = buildUnsignedTxPreview({ jobId: packet.jobId, packetHash, candidateResultDigest })
  unsignedTx.tx = { to: unsignedTx.to, data: unsignedTx.data, value: unsignedTx.value }

  await runPreSignChecks({
    unsignedPackage: unsignedTx,
    reviewContext: { jobId: packet.jobId, lane: packet.lane, externalRunId: runMeta.externalRunId || null, adapter: connectionSummary.adapter || null }
  })

  const signingManifest = await buildSigningManifest({
    jobId: packet.jobId,
    kind: unsignedTx.kind,
    contract: unsignedTx.to,
    chainId: 1,
    warnings,
  })

  signingManifest.packetHash = packetHash
  signingManifest.agentConnectionId = connectionSummary.id || null
  signingManifest.adapterId = connectionSummary.adapter || null
  signingManifest.externalRunId = runMeta.externalRunId || null
  signingManifest.candidateResultDigest = candidateResultDigest
  signingManifest.validationReportDigest = validationReportDigest
  signingManifest.finalArtifactHashes = Object.fromEntries(fileInventory.map(item => [item.path, item.sha256]))

  return {
    ok: true,
    stage: 'validated',
    errors,
    warnings,
    fileInventory,
    validationReport,
    publication,
    signingManifest,
    unsignedTx
  }
}
