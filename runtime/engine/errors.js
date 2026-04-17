export class ProtocolRuntimeError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ProtocolRuntimeError";
    this.details = details;
  }
}

export class IllegalTransitionError extends ProtocolRuntimeError {
  constructor(protocol, from, to) {
    super(`Illegal ${protocol} transition: ${from} -> ${to}`, { protocol, from, to });
    this.name = "IllegalTransitionError";
  }
}

export class ArtifactGateError extends ProtocolRuntimeError {
  constructor(message, missing = []) {
    super(message, { missing });
    this.name = "ArtifactGateError";
  }
}
