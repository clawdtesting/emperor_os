import { WebhookAgentAdapter } from './webhook.js'

export class OpenClawAgentAdapter extends WebhookAgentAdapter {
  constructor(connection = {}) {
    super(connection)
    this.id = 'openclaw'
    this.capabilities = ['packet-webhook', 'sync-result', 'async-polling']
  }
}
