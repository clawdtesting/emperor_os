# HEARTBEAT — Emperor_OS Autonomous Agent

> Live status of the autonomous agent operating on the AGI Alpha job market.
> Updated by CI on each run. Last known-good state recorded below.

---

## Identity

| Field | Value |
|---|---|
| ENS Name | `emperor-os.agi.eth` |
| Agent Wallet | `0x6484c5...` |
| ENS Token Owner | `0x6484c5...` (confirmed) |
| Resolver | ENS Public Resolver `0x231b0Ee1...` |
| Addr Record | Set and verified |
| AGIALPHA Balance | 2000 tokens |
| Bond Requirement | 1000 tokens |
| Payout Tier | 60% |

---

## Contracts

### Contract 1 — AGIJobManager
- **Address:** `0xB3AAeb69b630f0299791679c063d68d6687481d1`
- **Flow:** scan open jobs → apply → generate deliverable (Claude) → pin IPFS → `requestJobCompletion(jobId, ipfsURI)`
- **Cron:** every 15 min via `autonomous.yml`
- **Agent:** `AgiJobManager/loop.js`

### Contract 2 — AGIJobDiscoveryPrime
- **Address:** `0xd5EF1dde7Ac60488f697ff2A7967a52172A78F29`
- **Flow:** commit → reveal → apply (with IPFS trial) → poll for award → deliver
- **Cron:** every 15 min via `procurement.yml`
- **Agent:** `AgiPrimeDiscovery/procurement_agent.js`
- **State:** persisted in `data/procurement_state.json` (committed after each run)

---

## Workflows

| Workflow | Trigger | Purpose |
|---|---|---|
| `autonomous.yml` | cron 15min | Contract 1 main loop |
| `procurement.yml` | cron 15min | Contract 2 procurement loop |
| `dry_run_loop.yml` | manual | Simulate Contract 1 without on-chain txs |
| `dry_run_procurement.yml` | manual | Simulate Contract 2 without on-chain txs |
| `check_auth.yml` | manual | Verify agent auth + AGIALPHA balance |
| `check_ens_resolver.yml` | manual | Verify ENS resolver + addr record |
| `set_ens_resolver.yml` | manual | Set ENS resolver + addr (one-time setup) |
| `claim_identity.yml` | manual | Claim ENS subdomain identity |
| `register_agent.yml` | manual | Register agent on Contract 2 |
| `check_procurements.yml` | manual | List active procurements on Contract 2 |
| `test_01.yml` | manual | E2E: research report → IPFS → completion metadata |
| `test_02.yml` | manual | E2E: SVG logo → IPFS → completion metadata |
| `keepalive.yml` | cron | Keep runner alive |

---

## IPFS Pipeline — Validated Runs

### test_01 — Smart Contract Explanation (`2026-03-27`)
| Asset | CID |
|---|---|
| Job Spec | `QmcZErDbkCECXwNnW89dgCXxR8LE4mWf4LN3uoXX2Z4e3K` |
| Deliverable (MD) | `Qmb9UQFLQggGbVf3PoZB7x8mLn1syirc24rbLa6TGipvs4` |
| Completion Metadata | `QmQgm4cinJBa1wVZqAvgXbnBPWdrZGpMNMNG8zwtxuoV8f` |

### test_02 — Emperor_OS SVG Logo (`2026-03-28`)
| Asset | CID |
|---|---|
| Job Spec | `QmTdZkTVedm1mGdTwjcXAFXi5GgzSar7H1QkdDpzvrcNRj` |
| Deliverable (SVG, 16 217 chars) | `QmX3UyUQgKg1afDvdsbomjpHz77v4hZwHwMbnUfSErHeqw` |
| Completion Metadata | `QmTBMUxBru5dgJKAdu8o8UHXhe54AmK7DAsPsKhenTNs2m` |

---

## Known Issues

| # | Description | Status |
|---|---|---|
| 1 | `isAuthorizedAgent` check is misattributed to Contract 2; legacy scripts call it on Contract 1 (`0xB3AA...`) and Contract 2 ABI does not expose this function in current runtime | Investigated 2026-04-07 — update scripts/docs before further auth debugging |

---

## Stack

- **Runtime:** Node.js 20 (ES modules)
- **Chain:** Ethereum mainnet via RPC
- **AI:** `claude-sonnet-4-6`, 300 s timeout, 8192 max tokens
- **IPFS:** Pinata (`pinFileToIPFS` + `pinJSONToIPFS`)
- **Notifications:** Telegram bot (on job completion)
- **State:** `data/procurement_state.json` committed to `main` with `[skip ci]`
