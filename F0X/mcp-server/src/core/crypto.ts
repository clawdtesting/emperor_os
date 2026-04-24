/**
 * Node.js-native cryptographic operations for the MCP server.
 * Uses tweetnacl for key generation and message crypto, Node crypto for Ed25519 verification.
 * No browser globals — this module is safe to run in any Node.js context.
 */

import { randomUUID, randomBytes as nodeRandomBytes } from 'node:crypto';
import nacl from 'tweetnacl';

// ─── Base64 helpers (no window.btoa) ─────────────────────────────────────────

export function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

export function base64ToBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

// ─── Key generation ───────────────────────────────────────────────────────────

export interface KeyPair {
  publicKeyBase64: string;
  secretKeyBase64: string;
}

export function generateSigningKeyPair(): KeyPair {
  const kp = nacl.sign.keyPair();
  return {
    publicKeyBase64: bytesToBase64(kp.publicKey),
    secretKeyBase64: bytesToBase64(kp.secretKey)
  };
}

export function generateEncryptionKeyPair(): KeyPair {
  const kp = nacl.box.keyPair();
  return {
    publicKeyBase64: bytesToBase64(kp.publicKey),
    secretKeyBase64: bytesToBase64(kp.secretKey)
  };
}

// ─── Challenge signing ────────────────────────────────────────────────────────

export function signChallenge(challengeMessage: string, signingSecretKeyBase64: string): string {
  const sig = nacl.sign.detached(
    Buffer.from(challengeMessage, 'utf8'),
    base64ToBytes(signingSecretKeyBase64)
  );
  return bytesToBase64(sig);
}

// ─── Channel key wrapping (X25519 box) ───────────────────────────────────────

export interface WrappedKey {
  wrapId: string;
  nonceB64: string;
  wrappedKeyB64: string;
}

export function wrapChannelKey(
  channelKey: Uint8Array,
  recipientEncPublicBase64: string,
  myEncSecretBase64: string
): WrappedKey {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const wrapped = nacl.box(
    channelKey,
    nonce,
    base64ToBytes(recipientEncPublicBase64),
    base64ToBytes(myEncSecretBase64)
  );
  return {
    wrapId: randomUUID(),
    nonceB64: bytesToBase64(nonce),
    wrappedKeyB64: bytesToBase64(wrapped)
  };
}

export function unwrapChannelKey(
  wrappedKeyBase64: string,
  nonceBase64: string,
  senderEncPublicBase64: string,
  myEncSecretBase64: string
): Uint8Array {
  const opened = nacl.box.open(
    base64ToBytes(wrappedKeyBase64),
    base64ToBytes(nonceBase64),
    base64ToBytes(senderEncPublicBase64),
    base64ToBytes(myEncSecretBase64)
  );
  if (!opened) throw new Error('Failed to unwrap channel key — wrong key or corrupted data.');
  return opened;
}

// ─── Message encryption (XSalsa20-Poly1305) ──────────────────────────────────

export interface EncryptedPayload {
  nonceB64: string;
  ciphertextB64: string;
}

export function encryptMessage(text: string, channelKey: Uint8Array): EncryptedPayload {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const ciphertext = nacl.secretbox(Buffer.from(text, 'utf8'), nonce, channelKey);
  return { nonceB64: bytesToBase64(nonce), ciphertextB64: bytesToBase64(ciphertext) };
}

export function decryptMessage(ciphertextBase64: string, nonceBase64: string, channelKey: Uint8Array): string {
  const opened = nacl.secretbox.open(
    base64ToBytes(ciphertextBase64),
    base64ToBytes(nonceBase64),
    channelKey
  );
  if (!opened) throw new Error('Decryption failed — wrong key or tampered ciphertext.');
  return Buffer.from(opened).toString('utf8');
}

// ─── Envelope signing + verification ─────────────────────────────────────────

export interface EnvelopePayload {
  messageId: string;
  channelId: string;
  senderAgentId: string;
  timestamp: string;
  replayCounter: number;
  nonceB64: string;
  ciphertextB64: string;
}

export function signEnvelope(payload: EnvelopePayload, signingSecretKeyBase64: string): string {
  const canonical = Buffer.from(JSON.stringify(payload), 'utf8');
  const sig = nacl.sign.detached(canonical, base64ToBytes(signingSecretKeyBase64));
  return bytesToBase64(sig);
}

export function verifyEnvelopeSignature(
  payload: EnvelopePayload,
  signatureBase64: string,
  signingPublicKeyBase64: string
): boolean {
  try {
    const canonical = Buffer.from(JSON.stringify(payload), 'utf8');
    return nacl.sign.detached.verify(
      canonical,
      base64ToBytes(signatureBase64),
      base64ToBytes(signingPublicKeyBase64)
    );
  } catch {
    return false;
  }
}

export function generateChannelKey(): Uint8Array {
  return nacl.randomBytes(nacl.secretbox.keyLength);
}

export { randomUUID };
