const SUPPORTED_PROTOCOLS = new Set(["v1", "v2", "prime"]);

function normalizeVersion(value) {
  return String(value ?? "").trim().toLowerCase();
}

function versionToProtocol(version) {
  if (version === "v1" || version === "v2" || version === "prime") return version;
  return null;
}

export function detectProtocol(input = {}) {
  const explicitProtocol = normalizeVersion(input.protocol);
  if (explicitProtocol) {
    if (!SUPPORTED_PROTOCOLS.has(explicitProtocol)) {
      throw new Error(`Unsupported protocol=${input.protocol}`);
    }
    return explicitProtocol;
  }

  const versionHints = [
    input._contractVersion,
    input.contractVersion,
    input.rawJob?._contractVersion,
    input.job?._contractVersion
  ].map(normalizeVersion).filter(Boolean);

  for (const version of versionHints) {
    const protocol = versionToProtocol(version);
    if (protocol) return protocol;
    throw new Error(`Unsupported contract version=${version}`);
  }

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
