// Legacy register_agent path (quarantined)
//
// This script performed direct wallet signing + broadcast and is not part
// of the canonical Emperor_OS runtime. Keep registration/identity actions
// outside the runtime signing boundary via operator-reviewed unsigned packets.
throw new Error(
  'Legacy register_agent.js is disabled in production runtime. Use operator-reviewed unsigned-handoff tooling instead.'
);
