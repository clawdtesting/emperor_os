import { ProjectAdapter } from '../ProjectAdapter.js'

export class FuturePlaceholderAdapter extends ProjectAdapter {
  constructor() {
    super({
      id: 'project_future_placeholder',
      slug: 'future-placeholder',
      name: 'Coming Soon',
      status: 'planned',
      adapterKey: 'future_placeholder',
      description: 'Reserved slot for future project vertical onboarding.',
      supportsDeterministic: false,
      supportsAgentRuntime: false,
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
      scaffoldNote: 'Placeholder for future project verticals. No runtime hooks yet.',
      displayOrder: 30,
    })
  }
}
