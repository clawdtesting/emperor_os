import { useCallback, useMemo, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { getAgents, getChannels, getMessages, getStatus, login, sendMessage } from '../services/api';
import type { AgentSummary, ChannelSummary, ChatMessage, StatusResponse } from '../types';

type Tab = 'overview' | 'agents' | 'channels' | 'chat';

export default function App() {
  const [tab, setTab] = useState<Tab>('overview');
  const [authed, setAuthed] = useState(false);
  const [identityJson, setIdentityJson] = useState('');
  const [label, setLabel] = useState('');
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string>('');

  const refresh = useCallback(async () => {
    try {
      const s = await getStatus();
      setStatus(s);
      setAuthed(true);
      const [a, c] = await Promise.all([getAgents(), getChannels()]);
      setAgents(a);
      setChannels(c);
    } catch (e) {
      setAuthed(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const refreshMessages = useCallback(async () => {
    if (!activeChannelId) return;
    const result = await getMessages(activeChannelId);
    setMessages(result);
  }, [activeChannelId]);

  usePolling(refresh, 10000, true);
  usePolling(refreshMessages, 4000, Boolean(activeChannelId) && authed);

  const activeChannel = useMemo(
    () => channels.find((channel) => channel.channelId === activeChannelId) ?? null,
    [channels, activeChannelId]
  );

  const doLogin = async (mode: 'upload' | 'generate') => {
    setError('');
    await login(identityJson, label, mode);
    await refresh();
  };

  const doSend = async () => {
    if (!activeChannelId || !draft.trim()) return;
    await sendMessage(activeChannelId, draft.trim());
    setDraft('');
    await refreshMessages();
  };

  if (!authed) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="mb-4 text-3xl font-semibold text-cyan-300">F0X Dashboard Login</h1>
        <p className="mb-4 text-slate-400">Bring your own identity. Upload identity.json or generate a new identity.</p>
        <label className="mb-2 block text-sm text-slate-300">Optional label</label>
        <input className="mb-4 w-full rounded border border-slate-700 bg-slate-900 p-2" value={label} onChange={(e) => setLabel(e.target.value)} />
        <label className="mb-2 block text-sm text-slate-300">identity.json content</label>
        <textarea className="mb-4 h-56 w-full rounded border border-slate-700 bg-slate-900 p-2" value={identityJson} onChange={(e) => setIdentityJson(e.target.value)} />
        <div className="flex gap-3">
          <button className="rounded bg-cyan-600 px-4 py-2" onClick={() => void doLogin('upload')}>Login with identity</button>
          <button className="rounded bg-slate-700 px-4 py-2" onClick={() => void doLogin('generate')}>Generate identity</button>
        </div>
        {error && <p className="mt-4 text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="grid min-h-screen grid-cols-[220px_1fr_280px]">
      <aside className="border-r border-slate-800 p-4">
        <h2 className="mb-4 text-xl font-semibold text-cyan-300">F0X Dashboard</h2>
        {(['overview', 'agents', 'channels', 'chat'] as Tab[]).map((entry) => (
          <button key={entry} className={`mb-2 w-full rounded px-3 py-2 text-left ${tab === entry ? 'bg-cyan-800' : 'bg-slate-900'}`} onClick={() => setTab(entry)}>
            {entry}
          </button>
        ))}
      </aside>

      <main className="p-6">
        {tab === 'overview' && status && (
          <div className="space-y-2">
            <h3 className="text-2xl font-semibold">Overview</h3>
            <p>Agent: {status.identity.label} ({status.identity.agentId})</p>
            <p>Connection: {status.authenticated ? 'Connected' : 'Disconnected'}</p>
            <p>Relay health: {status.relayHealth ? 'Healthy' : 'Unavailable'}</p>
            <p>Active channels: {channels.length}</p>
          </div>
        )}

        {tab === 'agents' && (
          <div>
            <h3 className="mb-3 text-2xl font-semibold">Agents</h3>
            <ul className="space-y-2">
              {agents.map((agent) => (
                <li key={agent.agentId} className="rounded border border-slate-800 bg-slate-900 p-3">
                  <div>{agent.label}</div>
                  <div className="text-sm text-slate-400">{agent.agentId}</div>
                  <div className="text-xs text-slate-500">{agent.status}</div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === 'channels' && (
          <div>
            <h3 className="mb-3 text-2xl font-semibold">Channels</h3>
            <ul className="space-y-2">
              {channels.map((channel) => (
                <li key={channel.channelId} className="rounded border border-slate-800 bg-slate-900 p-3">
                  <button onClick={() => { setActiveChannelId(channel.channelId); setTab('chat'); }} className="text-left">
                    <div>{channel.peerLabel}</div>
                    <div className="text-sm text-slate-400">{channel.channelId}</div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === 'chat' && (
          <div>
            <h3 className="mb-3 text-2xl font-semibold">Chat {activeChannel ? `with ${activeChannel.peerLabel}` : ''}</h3>
            {!activeChannel && <p className="text-slate-400">Select a channel from Channels tab.</p>}
            <div className="mb-3 max-h-[60vh] space-y-2 overflow-auto rounded border border-slate-800 p-3">
              {messages.map((msg) => (
                <div key={msg.messageId} className={`rounded p-2 ${msg.isMine ? 'bg-cyan-900/30' : 'bg-slate-900'}`}>
                  <p className="text-xs text-slate-400">{msg.senderLabel} • {new Date(msg.timestamp).toLocaleString()}</p>
                  <p>{msg.text}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="flex-1 rounded border border-slate-700 bg-slate-900 p-2" value={draft} onChange={(e) => setDraft(e.target.value)} />
              <button className="rounded bg-cyan-600 px-4 py-2" onClick={() => void doSend()}>Send</button>
            </div>
          </div>
        )}
      </main>

      <aside className="border-l border-slate-800 p-4">
        <h3 className="mb-4 text-lg font-semibold">System Health</h3>
        <ul className="space-y-2 text-sm">
          <li>Relay: {status?.relayHealth ? 'reachable' : 'offline'}</li>
          <li>Hermes adapter: {status?.adapterStatus.hermes ?? 'unknown'}</li>
          <li>OpenClaw adapter: {status?.adapterStatus.openclaw ?? 'unknown'}</li>
          <li>Last heartbeat: {status?.lastHeartbeat ? new Date(status.lastHeartbeat).toLocaleString() : 'n/a'}</li>
        </ul>
      </aside>
    </div>
  );
}
