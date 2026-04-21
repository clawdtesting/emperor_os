import { ProjectAdapter } from '../ProjectAdapter.js'

export class OrchestratorChatAlphaV0Adapter extends ProjectAdapter {
  constructor() {
    super({
      id: 'project_orchestrator_chat_alpha_v0',
      slug: 'orchestrator-chat-alpha-v0',
      name: 'Orchestrator Chat Alpha v0',
      status: 'planned',
      adapterKey: 'orchestrator_chat_alpha_v0',
      description: 'Planned orchestration vertical sourced from /Orchestrator-node/orchestratorchatalphav0 with Render onboarding pending and MetaMask required for browser access.',
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
      scaffoldNote: 'Scaffold only. Render deployment target not yet configured in Op-control. Requires MetaMask-compatible browser wallet.',
      displayOrder: 30,
    })
  }
}
