// EmpireOS — Legacy autonomous loop (quarantined)
//
// This entrypoint is intentionally disabled in production runtime.
// It requires private key based signing/broadcast behavior that violates
// the unsigned-handoff doctrine used by Emperor_OS.
//
// Canonical runtime entrypoints:
//   - AGIJobManager v1 flow: `agent/orchestrator.js` (+ `core/*` modules)
//   - Prime flow: `agent/prime/prime-orchestrator.js`
//
// If you need to test legacy behavior locally, use non-production dry-run
// tooling and keep all signing paths out of canonical runtime directories.
throw new Error(
  'Legacy AgiJobManager/loop.js is disabled in production runtime. Use agent/orchestrator.js + core/* unsigned-handoff pipeline.'
);
