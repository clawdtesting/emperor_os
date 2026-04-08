// Single-cycle Prime monitor entry point for GitHub Actions.
// Uses canonical unsigned-handoff runtime (`agent/prime-monitor.js`) and exits.

import { startPrimeMonitor } from '../../agent/prime-monitor.js'

if (!process.env.ETH_RPC_URL) {
  console.error('ETH_RPC_URL not set')
  process.exit(1)
}

const derivedAgentAddress = process.env.AGENT_ADDRESS

if (!derivedAgentAddress) {
  console.error('AGENT_ADDRESS must be set')
  process.exit(1)
}

console.log(`[procurement] starting single Prime monitor cycle for agent=${derivedAgentAddress}`)
await startPrimeMonitor({ agentAddress: derivedAgentAddress, once: true })
console.log('[procurement] Prime monitor cycle complete')
