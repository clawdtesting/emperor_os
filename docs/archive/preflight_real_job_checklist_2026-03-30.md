# Real-Job Preflight Checklist (2026-03-30)

Use this checklist before allowing one real production job to run.
This checklist is derived from the current implementation and authoritative docs.

Status gate: if any blocker fails, do not launch.

---

## Environment

- [ ] `ETH_RPC_URL` is set and RPC endpoint is reachable (confirm block number returns)
- [ ] `AGI_ALPHA_MCP` is set and MCP endpoint is reachable
- [ ] `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` is set for LLM deliverable generation
- [ ] `AGENT_ADDRESS` is set to the correct wallet address
- [ ] `AGENT_SUBDOMAIN` is set to the registered ENS subdomain
- [ ] `PINATA_JWT` is set and Pinata IPFS upload is functional
- [ ] `RPC_URL` is set (core/ pipeline uses this name; ETH_RPC_URL used by prime-client)

## Agent Identity

- [ ] Agent wallet holds sufficient ETH for gas (check: `>0.01 ETH` minimum)
- [ ] Agent wallet holds sufficient AGIALPHA for staking if required
- [ ] Agent is authorized on AGIJobManager (`isAuthorizedAgent` returns true)
- [ ] ENS subdomain is registered and resolver is set

## Signing Boundary

- [ ] No `AGENT_PRIVATE_KEY` is set in any runtime environment (worker must never sign)
- [ ] MetaMask is connected to Ethereum Mainnet (chainId 1)
- [ ] Ledger hardware wallet is connected and unlocked
- [ ] Operator has reviewed `METAMASK_LEDGER_SIGNING_GUIDE.md` and is ready to sign manually

## Code and State

- [ ] `npm install` has been run in `core/`, `AgiJobManager/`, and `AgiPrimeDiscovery/`
- [ ] No active lock file (`workspace.lock`) from a crashed previous session
- [ ] No jobs stuck in `working` state (run `recovery.js` if needed)
- [ ] No stale `artifacts/job_*/` directories from a previous failed run

## Pre-Launch Smoke Tests

- [ ] Run `node core/runner.js --dry-run` (or `AgiJobManager/dry_run_loop.js`) — must complete without error
- [ ] Confirm MCP `list_jobs` returns a valid response (non-empty or empty, but no error)
- [ ] Confirm ABI files are present: `core/AGIJobManager.json`, `agent/abi/AGIJobDiscoveryPrime.json`
- [ ] Confirm `state/allowlists.json` is present with correct contract addresses

## Workflow Wiring (CI/GitHub Actions)

- [ ] `autonomous.yml` is wired to `node core/runner.js`, NOT to `AgiJobManager/loop.js`
- [ ] All required secrets are injected: `ETH_RPC_URL`, `AGI_ALPHA_MCP`, `ANTHROPIC_API_KEY`, `AGENT_ADDRESS`, `AGENT_SUBDOMAIN`, `PINATA_JWT`, `AGENT_MERKLE_PROOF`

---

Launch is authorized only when all checkboxes above are ticked.
