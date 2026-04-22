export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof window !== 'undefined') {
    let binary = '';
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return window.btoa(binary);
  }

  return Buffer.from(bytes).toString('base64');
}

export function base64ToBytes(value: string): Uint8Array {
  if (typeof window !== 'undefined') {
    const binary = window.atob(value);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  }

  return new Uint8Array(Buffer.from(value, 'base64'));
}
