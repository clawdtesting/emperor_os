import { WebhookAgentAdapter } from './webhook.js'

export class HermesAgentAdapter extends WebhookAgentAdapter {
  constructor(connection = {}) {
    super(connection)
    this.id = 'hermes'
    this.capabilities = ['packet-webhook', 'sync-result', 'async-polling']
  }
}
