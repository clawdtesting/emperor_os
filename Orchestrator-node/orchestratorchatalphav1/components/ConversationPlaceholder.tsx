import type { AgentIdentity } from '@/lib/types/domain';

interface ConversationPlaceholderProps {
  agent: AgentIdentity;
}

export function ConversationPlaceholder({ agent }: ConversationPlaceholderProps) {
  return (
    <section className="card">
      <h2>3) Private messaging shell</h2>
      <p>
        Private messaging transport is <strong>not implemented yet</strong>. This screen is a protocol-ready placeholder.
      </p>
      <div className="status-grid">
        <div>
          <span className="k">Wallet identity:</span>
          <span>{agent.walletAddress}</span>
        </div>
        <div>
          <span className="k">Agent identity:</span>
          <span>{agent.label} ({agent.id.slice(0, 10)}...)</span>
        </div>
        <div>
          <span className="k">Relay mode:</span>
          <span>Planned (Phase 2)</span>
        </div>
        <div>
          <span className="k">Encryption:</span>
          <span>Planned (Phase 2)</span>
        </div>
      </div>
      <div className="conversation-box">
        <p>[Placeholder] Channel list will appear here.</p>
        <p>[Placeholder] Message timeline will appear here.</p>
      </div>
    </section>
  );
}
