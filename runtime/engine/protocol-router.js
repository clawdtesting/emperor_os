export function detectProtocol(input = {}) {
  if (input.protocol === "prime") return "prime";
  if (input.protocol === "v1") return "v1";
  if (String(input.procurementId ?? "").length > 0) return "prime";
  if (input.prime === true) return "prime";
  return "v1";
}

export function routeProtocol(input, handlers) {
  const protocol = detectProtocol(input);
  const handler = handlers?.[protocol];
  if (!handler) {
    throw new Error(`No pipeline registered for protocol=${protocol}`);
  }
  return { protocol, handler };
}
