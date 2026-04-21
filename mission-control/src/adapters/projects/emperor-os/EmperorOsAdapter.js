import { ProjectAdapter } from '../ProjectAdapter.js'

export class EmperorOsAdapter extends ProjectAdapter {
  constructor() {
    super({
      id: 'project_emperor_os',
      slug: 'emperor-os',
      name: 'Emperor_OS',
      status: 'active-legacy',
      adapterKey: 'emperor_os',
      description: 'Current operator-grade Mission Control workspace preserved as legacy executions experience.',
      supportsDeterministic: true,
      supportsAgentRuntime: true,
      supportsHumanSigning: true,
      requestTypes: ['agijobmanager-v1', 'agijobmanager-v2', 'agiprimediscovery', 'agijobmanager-prime'],
      legacyEntry: {
        embeddedSectionKey: 'executions',
      },
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
      displayOrder: 10,
    })
  }
}
