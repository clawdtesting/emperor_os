// Single-poll entry point for GitHub Actions.
// Runs one full procurement cycle (new events → reveals → shortlists → trials),
// then exits. State is persisted to data/procurement_state.json and committed
// back to the repo by the workflow.

import { poll, loadState, saveState } from './procurement_agent.js'
import { mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), 'data')

if (!process.env.AGENT_PRIVATE_KEY) { console.error('AGENT_PRIVATE_KEY not set'); process.exit(1) }
if (!process.env.ETH_RPC_URL)       { console.error('ETH_RPC_URL not set');       process.exit(1) }
if (!process.env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY not set'); process.exit(1) }
if (!process.env.PINATA_JWT)        { console.error('PINATA_JWT not set');         process.exit(1) }
if (!process.env.AGENT_SUBDOMAIN)   { console.error('AGENT_SUBDOMAIN not set');   process.exit(1) }

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })

const state = loadState()
console.log(`[procurement] starting single poll — ${state.pending_reveals.length} pending reveals, ${state.pending_trials.length} pending trials`)

await poll(state)
saveState(state)

console.log(`[procurement] poll complete — ${state.pending_reveals.length} pending reveals, ${state.pending_trials.length} pending trials`)
