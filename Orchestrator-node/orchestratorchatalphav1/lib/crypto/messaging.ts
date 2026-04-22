'use client';

import nacl from 'tweetnacl';
import { bytesToBase64, base64ToBytes } from '@/lib/crypto/base64';
import type { AgentIdentity, AgentProfile, WrappedChannelKey } from '@/lib/types/domain';
import type { MessageEnvelope } from '@/lib/types/protocol';

export function createAgentIdentity(ownerWallet: `0x${string}`, label: string): AgentIdentity {
  const signing = nacl.sign.keyPair();
  const encryption = nacl.box.keyPair();

  return {
    agentId: crypto.randomUUID(),
    ownerWallet,
    label,
    signingPublicKey: bytesToBase64(signing.publicKey),
    signingSecretKey: bytesToBase64(signing.secretKey),
    encryptionPublicKey: bytesToBase64(encryption.publicKey),
    encryptionSecretKey: bytesToBase64(encryption.secretKey),
    createdAt: new Date().toISOString()
  };
}

export function toAgentProfile(identity: AgentIdentity): AgentProfile {
  return {
    agentId: identity.agentId,
    ownerWallet: identity.ownerWallet,
    label: identity.label,
    signingPublicKey: identity.signingPublicKey,
    encryptionPublicKey: identity.encryptionPublicKey,
    createdAt: identity.createdAt
  };
}

export function wrapChannelKeyForMembers(params: {
  channelId: string;
  channelKey: Uint8Array;
  creator: AgentIdentity;
  recipientProfile: AgentProfile;
}): WrappedChannelKey[] {
  const { channelId, channelKey, creator, recipientProfile } = params;
  const nonceForRecipient = nacl.randomBytes(nacl.box.nonceLength);
  const nonceForCreator = nacl.randomBytes(nacl.box.nonceLength);

  const creatorSecret = base64ToBytes(creator.encryptionSecretKey);
  const creatorPublic = base64ToBytes(creator.encryptionPublicKey);
  const recipientPublic = base64ToBytes(recipientProfile.encryptionPublicKey);

  return [
    {
      wrapId: crypto.randomUUID(),
      channelId,
      forAgentId: recipientProfile.agentId,
      fromAgentId: creator.agentId,
      nonceB64: bytesToBase64(nonceForRecipient),
      wrappedKeyB64: bytesToBase64(nacl.box(channelKey, nonceForRecipient, recipientPublic, creatorSecret)),
      createdAt: new Date().toISOString()
    },
    {
      wrapId: crypto.randomUUID(),
      channelId,
      forAgentId: creator.agentId,
      fromAgentId: creator.agentId,
      nonceB64: bytesToBase64(nonceForCreator),
      wrappedKeyB64: bytesToBase64(nacl.box(channelKey, nonceForCreator, creatorPublic, creatorSecret)),
      createdAt: new Date().toISOString()
    }
  ];
}

export function unwrapChannelKey(params: {
  wrapped: WrappedChannelKey;
  me: AgentIdentity;
  senderProfile: AgentProfile;
}): Uint8Array {
  const { wrapped, me, senderProfile } = params;
  const opened = nacl.box.open(
    base64ToBytes(wrapped.wrappedKeyB64),
    base64ToBytes(wrapped.nonceB64),
    base64ToBytes(senderProfile.encryptionPublicKey),
    base64ToBytes(me.encryptionSecretKey)
  );

  if (!opened) throw new Error('Unable to unwrap channel key with local encryption keypair.');
  return opened;
}

function canonicalSignBytes(payload: Omit<MessageEnvelope, 'signatureB64'>): Uint8Array {
  const canonical = JSON.stringify(payload);
  return new TextEncoder().encode(canonical);
}

export function encryptAndSignMessage(params: {
  channelId: string;
  sender: AgentIdentity;
  channelKey: Uint8Array;
  replayCounter: number;
  text: string;
}): MessageEnvelope {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const timestamp = new Date().toISOString();
  const ciphertext = nacl.secretbox(new TextEncoder().encode(params.text), nonce, params.channelKey);

  const unsigned = {
    messageId: crypto.randomUUID(),
    channelId: params.channelId,
    senderAgentId: params.sender.agentId,
    timestamp,
    replayCounter: params.replayCounter,
    nonceB64: bytesToBase64(nonce),
    ciphertextB64: bytesToBase64(ciphertext)
  };

  const signature = nacl.sign.detached(canonicalSignBytes(unsigned), base64ToBytes(params.sender.signingSecretKey));

  return {
    ...unsigned,
    signatureB64: bytesToBase64(signature)
  };
}

export function decryptAndVerifyMessage(params: {
  envelope: MessageEnvelope;
  channelKey: Uint8Array;
  senderProfile: AgentProfile;
}): { text: string; signatureValid: boolean } {
  const { envelope, channelKey, senderProfile } = params;
  const payloadForSig = {
    messageId: envelope.messageId,
    channelId: envelope.channelId,
    senderAgentId: envelope.senderAgentId,
    timestamp: envelope.timestamp,
    replayCounter: envelope.replayCounter,
    nonceB64: envelope.nonceB64,
    ciphertextB64: envelope.ciphertextB64
  };

  const signatureValid = nacl.sign.detached.verify(
    canonicalSignBytes(payloadForSig),
    base64ToBytes(envelope.signatureB64),
    base64ToBytes(senderProfile.signingPublicKey)
  );

  const opened = nacl.secretbox.open(
    base64ToBytes(envelope.ciphertextB64),
    base64ToBytes(envelope.nonceB64),
    channelKey
  );

  if (!opened) throw new Error('Failed to decrypt message payload.');

  return {
    text: new TextDecoder().decode(opened),
    signatureValid
  };
}
