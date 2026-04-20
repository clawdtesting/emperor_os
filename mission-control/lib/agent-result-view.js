export function buildAgentResultReviewPayload({ run, ingest }) {
  return {
    run: {
      id: run.id,
      status: run.status,
      adapter: run.adapter,
      packetHash: run.packetHash,
      externalRunId: run.externalRunId || null,
      updatedAt: run.updatedAt
    },
    deterministicChecks: ingest.validationReport,
    fileInventory: ingest.fileInventory,
    publication: ingest.publication,
    signingManifest: ingest.signingManifest,
    unsignedTx: ingest.unsignedTx,
    warnings: ingest.warnings,
    errors: ingest.errors
  }
}
