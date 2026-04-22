'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchEnvelopes, listAgents, listMyChannels, openDmChannel, sendEnvelope } from '@/lib/client/relay-api';
import {
  decryptAndVerifyMessage,
  encryptAndSignMessage,
  toAgentProfile,
  unwrapChannelKey,
  wrapChannelKeyForMembers
} from '@/lib/crypto/messaging';
import { base64ToBytes, bytesToBase64 } from '@/lib/crypto/base64';
import type { AgentIdentity, AgentProfile, Channel } from '@/lib/types/domain';
import type { DecryptedMessage } from '@/lib/types/protocol';
import nacl from 'tweetnacl';

interface ConversationPlaceholderProps {
  me: AgentIdentity;
  relayToken: string;
}

type ChannelCache = Record<string, string>;

export function ConversationPlaceholder({ me, relayToken }: ConversationPlaceholderProps) {
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedPeerId, setSelectedPeerId] = useState('');
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [decrypted, setDecrypted] = useState<DecryptedMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [counterByChannel, setCounterByChannel] = useState<Record<string, number>>({});
  const [channelKeyCache, setChannelKeyCache] = useState<ChannelCache>({});

  const myProfile = useMemo(() => toAgentProfile(me), [me]);

  const peerProfiles = agents.filter((agent) => agent.agentId !== me.agentId);

  const refreshDirectory = async () => {
    const [agentList, myChannels] = await Promise.all([listAgents(relayToken), listMyChannels(relayToken)]);
    setAgents(agentList);
    setChannels(myChannels);
  };

  const getPeerProfileForChannel = (channel: Channel): AgentProfile => {
    const peerId = channel.members.find((member) => member !== me.agentId);
    const peer = agents.find((agent) => agent.agentId === peerId);
    if (!peer) throw new Error('Peer profile not found for channel.');
    return peer;
  };

  const getChannelKey = (channel: Channel): Uint8Array => {
    const cached = channelKeyCache[channel.channelId];
    if (cached) return base64ToBytes(cached);

    const myWrap = channel.wrappedKeys.find((wrap) => wrap.forAgentId === me.agentId);
    if (!myWrap) throw new Error('Channel is missing wrapped key for local agent.');

    const senderProfile = myWrap.fromAgentId === me.agentId ? myProfile : getPeerProfileForChannel(channel);
    const key = unwrapChannelKey({ wrapped: myWrap, me, senderProfile });

    setChannelKeyCache((previous) => ({ ...previous, [channel.channelId]: bytesToBase64(key) }));
    return key;
  };

  const loadMessages = async (channel: Channel) => {
    const { messages } = await fetchEnvelopes(relayToken, channel.channelId);
    const peer = getPeerProfileForChannel(channel);
    const channelKey = getChannelKey(channel);

    const decoded = messages
      .map((envelope) => {
        const senderProfile = envelope.senderAgentId === me.agentId ? myProfile : peer;
        const result = decryptAndVerifyMessage({ envelope, channelKey, senderProfile });
        return {
          messageId: envelope.messageId,
          channelId: envelope.channelId,
          senderAgentId: envelope.senderAgentId,
          timestamp: envelope.timestamp,
          replayCounter: envelope.replayCounter,
          text: result.text,
          signatureValid: result.signatureValid
        } satisfies DecryptedMessage;
      })
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

    setDecrypted(decoded);
    const maxCounter = decoded.reduce((max, message) => Math.max(max, message.replayCounter), 0);
    setCounterByChannel((previous) => ({ ...previous, [channel.channelId]: maxCounter }));
  };

  useEffect(() => {
    refreshDirectory().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load relay directory.');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeChannel) return;

    const interval = setInterval(() => {
      loadMessages(activeChannel).catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : 'Polling failed.');
      });
    }, 2500);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannel, agents]);

  const createOrOpenConversation = async () => {
    if (!selectedPeerId) {
      setError('Select a peer agent to open a 1:1 channel.');
      return;
    }

    const peer = agents.find((agent) => agent.agentId === selectedPeerId);
    if (!peer) {
      setError('Selected peer profile not found.');
      return;
    }

    try {
      setBusy(true);
      setError(null);
      const channelKey = nacl.randomBytes(nacl.secretbox.keyLength);

      const wrappedKeys = wrapChannelKeyForMembers({
        channelId: 'pending',
        channelKey,
        creator: me,
        recipientProfile: peer
      });

      const openedResult = await openDmChannel({
        token: relayToken,
        creatorAgentId: me.agentId,
        targetAgentId: peer.agentId,
        wrappedKeys
      });

      const opened = openedResult.channel;
      setChannels((previous) => {
        if (previous.some((channel) => channel.channelId === opened.channelId)) return previous;
        return [...previous, opened];
      });

      if (!openedResult.existed) {
        setChannelKeyCache((previous) => ({ ...previous, [opened.channelId]: bytesToBase64(channelKey) }));
      }

      setActiveChannel(opened);
      await loadMessages(opened);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Could not open channel.');
    } finally {
      setBusy(false);
    }
  };

  const openExisting = async (channel: Channel) => {
    try {
      setError(null);
      setActiveChannel(channel);
      await loadMessages(channel);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Could not load channel.');
    }
  };

  const sendSecureMessage = async () => {
    if (!activeChannel) {
      setError('Open a channel before sending.');
      return;
    }

    if (!draft.trim()) return;

    try {
      setError(null);
      const channelKey = getChannelKey(activeChannel);
      const nextCounter = (counterByChannel[activeChannel.channelId] ?? 0) + 1;
      const envelope = encryptAndSignMessage({
        channelId: activeChannel.channelId,
        sender: me,
        channelKey,
        replayCounter: nextCounter,
        text: draft.trim()
      });

      await sendEnvelope(relayToken, activeChannel.channelId, envelope);
      setDraft('');
      await loadMessages(activeChannel);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Failed to send encrypted message.');
    }
  };

  return (
    <section className="card">
      <h2>3) 1:1 private messaging</h2>
      <p>
        Relay stores encrypted envelopes only. Relay cannot decrypt payloads because channel keys remain client-side and wrapped per member.
      </p>

      <div className="row">
        <label className="label grow">
          Select peer agent
          <select className="input" value={selectedPeerId} onChange={(event) => setSelectedPeerId(event.target.value)}>
            <option value="">-- choose peer --</option>
            {peerProfiles.map((profile) => (
              <option key={profile.agentId} value={profile.agentId}>
                {profile.label} ({profile.agentId.slice(0, 8)})
              </option>
            ))}
          </select>
        </label>
        <button className="button" onClick={createOrOpenConversation} disabled={busy}>
          {busy ? 'Opening...' : 'Create/Open 1:1'}
        </button>
      </div>

      <h3>My channels</h3>
      <ul className="list">
        {channels.map((channel) => {
          const peerId = channel.members.find((member) => member !== me.agentId) ?? '';
          const peer = agents.find((agent) => agent.agentId === peerId);
          return (
            <li key={channel.channelId}>
              <button className="link" onClick={() => void openExisting(channel)}>
                {peer?.label ?? peerId} · members: {channel.members.join(', ')}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="conversation-box">
        <p><strong>Active channel:</strong> {activeChannel?.channelId ?? 'none'}</p>
        <p><strong>Members:</strong> {activeChannel?.members.join(', ') ?? '-'}</p>
        {decrypted.map((message) => (
          <div key={message.messageId} className="msg">
            <p>
              <strong>{message.senderAgentId === me.agentId ? 'Me' : 'Peer'}:</strong> {message.text}
            </p>
            <p className="meta">
              {message.timestamp} · replay#{message.replayCounter} · signature: {message.signatureValid ? 'valid' : 'INVALID'}
            </p>
          </div>
        ))}
      </div>

      <div className="row">
        <input
          className="input grow"
          value={draft}
          placeholder="Type encrypted message"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button className="button" onClick={sendSecureMessage}>Send Encrypted</button>
      </div>

      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
