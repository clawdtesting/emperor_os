export function buildAgentPacketPreview({ packet, packetHash, requiredArtifacts, acceptanceChecks, connection }) {
  return {
    packet,
    packetHash,
    requiredArtifacts,
    acceptanceChecks,
    connectionSummary: connection ? {
      id: connection.id,
      name: connection.name,
      adapter: connection.adapter,
      scopes: connection.scopes,
      enabled: connection.enabled
    } : null
  }
}
