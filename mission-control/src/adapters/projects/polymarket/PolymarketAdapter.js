import { ProjectAdapter } from '../ProjectAdapter.js'

export class PolymarketAdapter extends ProjectAdapter {
  constructor() {
    super({
      id: 'project_polymarket',
      slug: 'polymarket',
      name: 'Polymarket',
      status: 'planned',
      adapterKey: 'polymarket',
      description: 'Planned market-operations vertical. Scaffold records only in this phase.',
      supportsDeterministic: true,
      supportsAgentRuntime: true,
      supportsHumanSigning: false,
      requestTypes: [],
      doctrine: {
        deterministicCoreAuthoritative: true,
        externalOutputsUntrustedUntilIngested: true,
        signingAuthority: 'human-only',
        irreversibleActionsRequireHumanReview: true,
      },
      futureHooks: {
        supportsDeterministicExecutionPlanning: false,
        supportsDeterministicValidationHooks: false,
      },
      scaffoldNote: 'Scaffold only. Runtime integration and execution lanes intentionally deferred.',
      displayOrder: 20,
    })
  }
}
