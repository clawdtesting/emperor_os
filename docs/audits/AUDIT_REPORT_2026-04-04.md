═══════════════════════════════════════════════════════════════
EMPEROR_OS — WORKSPACE-SCOPED MASTER OPERATIONAL AUDIT REPORT
Date: 2026-04-04T17:30:00Z
Auditor: claude-sonnet-4-6 / session audit (GOD MODE)
Visible root: /home/user/emperor_os_clean (maps to /.openclaw/workspace on production WSL)
Audit mode: LOCAL GITHUB CLONE / WORKSPACE-ONLY
═══════════════════════════════════════════════════════════════

ENVIRONMENT
  Working directory:      /home/user/emperor_os_clean
  Node version:           v22.22.2
  npm version:            10.9.7
  Lobster:                SOURCE PRESENT (lobster/ dir) — NOT COMPILED / NOT RUNNABLE (no compiled bin)
  Python3:                3.11.15
  OpenClaw gateway:       DOWN (port 18789 not bound, no openclaw process)
  Git metadata:           AVAILABLE (branch: claude/master-audit-review-T18cn)
  node_modules state:     MISSING at audit start — installed during audit
                          core/, AgiJobManager/, AgiPrimeDiscovery/ all had UNMET DEPENDENCY errors
                          Fixed by running npm install in each subdirectory

VISIBLE STRUCTURE
  agent/:                 PRESENT (full pipeline: orchestrator, discover, evaluate, apply,
                          confirm, execute, validate, submit, prime/*, state, lock, recovery,
                          artifact-manager, tx-builder, signing-manifest, abi/)
  AgiJobManager/:         PRESENT (loop.js, dry_run_loop.js, chain.js, submit.js, score.js,
                          work.js, mcp.js, handlers/)
  AgiPrimeDiscovery/:     PRESENT (procurement_agent.js [DISABLED], run_procurement_once.js,
                          check_auth.js, check_procurements.js, dry_run_procurement.js,
                          preflight.js, register_agent.js, claim_identity.js, scripts/, tools/)
  core/:                  PRESENT (full pipeline: orchestrator, discover, evaluate, apply,
                          confirm, execute, validate, submit, state, lock, recovery, rpc,
                          artifact-manager, tx-builder, signing-manifest, abi-registry, ABIs)
  docs/:                  PRESENT (multiple audit/readiness docs)
  memory/:                PRESENT (memory/2026-04-04.md — today's session memory)
  archive/index:          MISSING (no archive/ directory visible)
  mission-control/:       PRESENT (React dashboard frontend + server.js)
  workspace/:             PRESENT (workspace/AGENTS.md, IDENTITY.md, SOUL.md, TOOLS.md, USER.md)
  .github/workflows/:     PRESENT (11 workflows visible)
  .openclaw/:             PRESENT (workspace-state.json only)
  lobster/:               PRESENT (source, tests, bin — TypeScript, not compiled)
  tests/:                 PRESENT (test_01, test_02, test_compounding_dry_run,
                          test_mainnet, test_prime_chaos_restart, test_prime_validator_restart)

ON-CHAIN CONNECTIVITY
  RPC endpoint:           UNREACHABLE (RPC_URL / ETH_RPC_URL not set in local env)
                          NOTE: Both env var names are in use — core/config.js uses RPC_URL,
                          prime-client.js and AgiPrimeDiscovery use ETH_RPC_URL.
                          This inconsistency is a WARNING.
  Chain ID:               NOT TESTED (no RPC)
  AGIJobManager:          NOT TESTED — ABI confirmed present at core/AGIJobManager.json
                          ABI has only 2 entries: applyForJob (nonpayable) +
                          requestJobCompletion (nonpayable). NO view functions.
                          This is ABI MINIMAL — no reachability smoke test possible without RPC.
  AGIJobDiscoveryPrime:   NOT TESTED — ABI confirmed present at agent/abi/AGIJobDiscoveryPrime.json
                          8 entries including procurements(uint256) view + applicationView view.
                          View-function test possible with RPC.

AGENT IDENTITY
  Wallet address:         0x6484c5... (PARTIALLY CONFIRMABLE — truncated in HEARTBEAT.md)
                          Full address NOT confirmed from visible workspace files.
                          AGENT_ADDRESS env var required at runtime; not hardcoded in code (correct).
  ETH balance:            NOT TESTED
  AGIALPHA balance:       2000 tokens (per HEARTBEAT.md — not chain-verified)
  Bond Requirement:       1000 tokens (per HEARTBEAT.md)
  Authorization checks:   PRESENT — isAuthorizedAgent called in check_auth.js and preflight.js
  Identity gating:        PRESENT — ENS subdomain + Merkle proof required for apply functions
  Known issue:            isAuthorizedAgent reverts on Contract 2 even after ENS resolver set
                          (recorded in HEARTBEAT.md Known Issues #1 — LOW PRIORITY classification)

MCP & IPFS
  MCP client:             core/mcp.js (canonical) + agent/mcp.js (copy) + AgiJobManager/mcp.js
                          Protocol: JSON-RPC 2.0 POST with SSE or JSON response
                          Endpoint env var: AGI_ALPHA_MCP
  MCP endpoint:           UNREACHABLE — AGI_ALPHA_MCP not set in local env
  Job ingest path:        NOT TESTED (MCP unreachable)
  IPFS path:              WORKING IN CODE — Pinata JWT (PINATA_JWT) used for uploads
                          Both direct Pinata API calls (pinFileToIPFS) and MCP upload_to_ipfs
  Fetch-back verify:      IMPLEMENTED — core/ipfs-verify.js provides SHA256 hash comparison
                          after IPFS fetch via public gateway

ENVIRONMENT VARIABLES
  Missing critical vars (ALL missing in local audit context):
    TRACK A blockers:    RPC_URL / ETH_RPC_URL, AGI_ALPHA_MCP, ANTHROPIC_API_KEY (or OPENAI_API_KEY),
                         AGENT_ADDRESS, PINATA_JWT, ENS_SUBDOMAIN / AGENT_SUBDOMAIN
    TRACK B blockers:    ETH_RPC_URL, AGI_ALPHA_MCP, ANTHROPIC_API_KEY,
                         AGENT_ADDRESS, AGENT_SUBDOMAIN, PINATA_JWT, AGENT_MERKLE_PROOF
    IPFS:                PINATA_JWT
    Notifications:       TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (non-blocking, best-effort)
    Archive/cache:       SUPABASE_KEY, SUPABASE_URL (referenced in tools but not critical path)
  NOTE: All env vars are injected via GitHub Actions secrets in CI. Local env has NONE.

SECURITY
  Signing code in agent/ + core/:   NONE — CI guard script passes clean
                                    (guard_no_signing_runtime.js confirms no ethers.Wallet,
                                     signTransaction, sendTransaction, PRIVATE_KEY usage in
                                     agent/ or core/)
  Signing code in AgiJobManager/:   CRITICAL VIOLATION — chain.js exports address(),
                                    broadcastMcpTx() — both throw intentionally (disabled stubs)
                                    BUT loop.js still imports and calls address() at line 38
                                    and broadcastMcpTx() at line 91. The loop WILL CRASH when
                                    open jobs are found, even with valid env vars.
  Signing code in AgiPrimeDiscovery/: WARNING — ethers.Wallet used in:
                                    procurement_agent.js (disabled/throws),
                                    check_auth.js, check_ens_resolver.js, check_procurements.js,
                                    preflight.js, register_agent.js, set_ens_resolver.js
                                    These are admin/utility scripts, NOT the main runtime.
                                    register_agent.js calls wallet.sendTransaction() — intentional
                                    one-shot setup script (ACCEPTABLE for admin use)
  Broadcast code found:             register_agent.js (intentional setup script) / ACCEPTABLE
  Salt never logged:                CONFIRMED — no console.log(salt) or equivalent found
                                    in production runtime paths
  64-byte hex exposure:             register_agent.js line 14 contains ABI-encoded calldata
                                    (0xf2c298be...) — this is function calldata, NOT a private key
                                    (verified: it's the registerAgent("empero") ABI encoding)
  Secret exposure risk:             NONE detected in committed code
  .gitignore:                       VISIBLE — covers .env, .env.*, *.key, *.pem,
                                    node_modules/, OpenClaw runtime dirs (agents/, identity/)
                                    commitment_material/ NOT explicitly listed — MINOR WARNING
  Private key env vars:             All accessed via process.env only — never hardcoded

══════════════════════════════════════════════
TRACK A — AGIJobManager v1
══════════════════════════════════════════════
  Overall status:   PARTIALLY OPERATIONAL

  Dual codebase situation:
    AgiJobManager/loop.js  → used by autonomous.yml CI workflow
    core/ + agent/         → full hardened pipeline (NOT wired to any CI workflow)

  Visible files (AgiJobManager/):
    loop.js:              PRESENT — BROKEN (calls address() and broadcastMcpTx() from chain.js
                          which throw intentionally; crashes when open jobs are found)
    dry_run_loop.js:      PRESENT — WORKING (safe dry-run, skips tx steps)
    chain.js:             PRESENT — ALL EXPORTS THROW (deliberately disabled)
    submit.js:            PRESENT — calls broadcastMcpTx() — will throw at submit step
    score.js:             PRESENT — deterministic scoring, no LLM
    work.js:              PRESENT — LLM call (Claude/Anthropic)
    mcp.js:               PRESENT — JSON-RPC/SSE client

  Visible files (core/ — canonical hardened pipeline):
    orchestrator.js:      PRESENT — pipeline: discover→evaluate→apply→confirm→execute→validate→submit
    discover.js:          PRESENT — MCP list/get/spec; normalizes jobs; writes artifacts
    evaluate.js:          PRESENT — deterministic strategy scoring; writes strategy artifact
    apply.js:             PRESENT (imported by orchestrator)
    confirm.js:           PRESENT — on-chain assignment confirmation
    execute.js:           PRESENT — LLM call (OpenAI); writes deliverable artifact
    validate.js:          PRESENT — IPFS upload + SHA256 fetch-back verification; hard-stop on fail
    submit.js:            PRESENT — unsigned tx package + signing manifest; NO signing
    state.js:             PRESENT — atomic writes (tmp+rename); per-job state JSON
    lock.js:              PRESENT — PID lock with stale recovery
    recovery.js:          PRESENT — resets working→assigned on restart
    runner.js (core/daemon.js): PRESENT — daemon with exponential backoff

  Execution findings (core/ pipeline):
    Entry path valid:       YES — core/runner.js → orchestrator.js pipeline
    Artifact-first:         YES — discover writes normalized_spec.json before state advance
    Atomic writes:          YES — tmp+rename pattern throughout state.js and artifact-manager.js
    Crash recovery:         YES — lock.js (PID stale recovery) + recovery.js (working→assigned)
    No signing path:        YES (core/agent/) — CI guard confirms clean
    Safe dry-run path:      YES — AgiJobManager/dry_run_loop.js runs; MCP fallback to mock data

  Execution findings (AgiJobManager/ v1 loop):
    Signing/broadcast:      DISABLED (chain.js stubs throw) — but loop.js calls them = CRASH
    Workflow wired:         YES — autonomous.yml runs AgiJobManager/loop.js every 15 min
    Practical result:       BLOCKED when open jobs exist (crashes at address() call)
                            Passes through silently only when: zero open jobs OR at MAX_ACTIVE limit

  BLOCKERS:
    1. [CRITICAL] autonomous.yml runs AgiJobManager/loop.js which calls address() and
       broadcastMcpTx() from chain.js — both throw. The loop crashes whenever open jobs
       are found. The workflow IS running on schedule but accomplishing nothing for job application.
    2. [CRITICAL] No CI workflow invokes the hardened core/ pipeline (runner.js). The improved
       pipeline with unsigned tx / operator review exists but is NOT connected to any scheduled job.
    3. [HIGH] RPC_URL env var mismatch: core/config.js expects RPC_URL; prime-client.js and
       AgiPrimeDiscovery expect ETH_RPC_URL. GitHub Actions autonomous.yml injects ETH_RPC_URL
       but the core/ pipeline reads RPC_URL. If the core workflow is ever wired up, it may fail.

  WARNINGS:
    1. node_modules absent at repo root — must npm install in each subdirectory.
    2. AgiJobManager/loop.js still checks WALLET_PRIVATE_KEY (throws if missing) but
       chain.js never actually uses it. Dead guard.
    3. AGIJobManager ABI has only 2 write functions and zero view functions — no smoke-test
       possible without a specific view that isn't in the ABI.

══════════════════════════════════════════════
TRACK B — AGIJobDiscoveryPrime
══════════════════════════════════════════════
  Overall status:   BLOCKED

  Dual codebase situation:
    AgiPrimeDiscovery/procurement_agent.js → DISABLED (throws on import)
    AgiPrimeDiscovery/run_procurement_once.js → imports procurement_agent.js → CRASHES
    procurement.yml → runs run_procurement_once.js → CRASHES immediately
    agent/prime/* → full hardened unsigned-handoff pipeline (NOT wired to any CI workflow)

  Visible files:
    procurement_agent.js:       PRESENT — DISABLED (line 3: throw new Error(...))
    prime-phase-model.js:       PRESENT — full state machine (in agent/)
    prime-client.js:            PRESENT — read-only chain client (in agent/)
    prime-inspector.js:         PRESENT (in agent/)
    prime-review-gates.js:      PRESENT — fail-closed gates (in agent/)
    prime-tx-builder.js:        PRESENT — unsigned-only tx builder (in agent/)
    prime-artifact-builder.js:  PRESENT (in agent/)
    prime-monitor.js:           PRESENT (in agent/)
    prime-execution-bridge.js:  PRESENT (in agent/)
    prime-retrieval.js:         PRESENT (in agent/)
    prime-state.js:             PRESENT — atomic writes (in agent/)
    prime-orchestrator.js:      PRESENT (in agent/prime/)

  Phase model (agent/prime-phase-model.js):
    Enumerated phases:          COMPLETE — 34 PROC_STATUS values defined
    Hard stops at *_READY:      YES — COMMIT_READY, REVEAL_READY, FINALIST_ACCEPT_READY,
                                TRIAL_READY, COMPLETION_READY all require operator tx signature
    Legal transitions:          FULLY EXPLICIT (VALID_TRANSITIONS map covers all states)
    Terminal states:            YES (NOT_A_FIT, DONE, REJECTED, NOT_SHORTLISTED, EXPIRED,
                                MISSED_WINDOW)
    Hang paths:                 NONE detected — all non-terminal states have defined transitions
    Salt never logged:          CONFIRMED — salt generated by generateSalt(), stored in
                                commitment_material.json, never passed to console.log
    Salt logging violation:     NONE found

  Live state:
    Active procurements (agent/ dir):  NONE (no proc_* dirs found)
    AgiPrimeDiscovery/data/procurement_state.json:
      pending_reveals:      []
      pending_trials:       []
      seen_procurements:    []
      lastProcurementBlock: 24802862
      lastShortlistBlock:   24802862
    Current visible phases:   NONE (no active procurements)

  BLOCKERS:
    1. [CRITICAL] procurement.yml runs run_procurement_once.js which imports
       procurement_agent.js which throws on line 3. CI workflow crashes on every scheduled run.
       Track B CI is FULLY NON-FUNCTIONAL.
    2. [CRITICAL] No CI workflow invokes the hardened agent/prime/* pipeline. The production-grade
       unsigned-tx orchestrator exists but has no scheduled runner or GitHub Actions entrypoint.
    3. [HIGH] isAuthorizedAgent reverts on Contract 2 (known issue in HEARTBEAT.md). Not verified
       from this audit context but this may block commit application at contract level.

  WARNINGS:
    1. agent/prime-client.js uses ETH_RPC_URL; autonomous.yml injects ETH_RPC_URL — consistent.
       But if core/ ever runs, its RPC_URL name differs.
    2. AGENT_MERKLE_PROOF defaults to '[]' in procurement.yml — empty proof may cause
       contract-level rejection depending on authorization logic.

══════════════════════════════════════════════
CROSS-CUTTING
══════════════════════════════════════════════
  Lobster operational:     NO — source present (TypeScript), but not compiled.
                           lobster/bin/lobster.js exists but is a wrapper expecting compiled
                           output. node lobster/bin/lobster.js --version returns no output.
  OpenClaw operational:    NO — gateway down (port 18789 unreachable, no process)
  Memory present:          YES — memory/2026-04-04.md (today's session log)
  Archive present:         NO — no archive/ directory at workspace root
  Capability reuse path:   PARTIAL — prime-retrieval.js implements stepping-stone extraction
                           and retrieval packet creation for future reuse, but archive is empty/absent
  Mission Control:         PRESENT (mission-control/ React app + server.js) — NOT RUNNING locally
  CI Guard script:         PRESENT AND PASSING (scripts/ci/guard_no_signing_runtime.js confirms
                           agent/ and core/ are free of signing primitives)
  Tests:                   PRESENT (test_01, test_02, test_compounding_dry_run, test_mainnet,
                           test_prime_chaos_restart, test_prime_validator_restart) — not run

══════════════════════════════════════════════
EXECUTIVE SUMMARY
══════════════════════════════════════════════

Both CI workflows (autonomous.yml for Track A, procurement.yml for Track B) are currently BROKEN
and crash on every scheduled run. Track A's AgiJobManager/loop.js imports broadcast/signing stubs
from chain.js that throw intentionally, but the loop still calls them — crashing whenever open jobs
are found. Track B's procurement.yml runs run_procurement_once.js which immediately imports
procurement_agent.js, which throws on line 3 ("Legacy procurement_agent is disabled in production
runtime"). The advanced hardened pipelines (core/ for Track A, agent/prime/* for Track B) are
fully implemented with unsigned-tx operator handoff, atomic state writes, crash recovery, and
no signing — but neither is wired to any CI workflow or scheduled runner.

The AGIJobManager ABI is critically minimal (2 write-only functions, zero view functions),
making on-chain smoke-testing impossible without additional contract introspection. The
AGIJobDiscoveryPrime ABI is more complete and supports read-only reachability testing via
procurements() and applicationView() view functions. All node_modules are absent by default
in this environment; npm install must be run in core/, AgiJobManager/, and AgiPrimeDiscovery/
before any code can execute. All critical environment variables (RPC, MCP, API keys, wallet)
are absent locally and must be present as GitHub Actions secrets for CI operation.

The CI signing guard passes cleanly — agent/ and core/ contain no private key handling. Admin
scripts in AgiPrimeDiscovery/ (register_agent.js, claim_identity.js, set_ens_resolver.js) do
use live wallet signing, which is appropriate for one-time setup but must never be used in the
main loop. The known isAuthorizedAgent revert on Contract 2 remains unresolved and may prevent
actual procurement commitments at the contract level.

IMMEDIATE ACTIONS REQUIRED
  1. [CRITICAL] Fix autonomous.yml: wire it to node core/runner.js (or core/daemon.js) instead
     of AgiJobManager/loop.js, OR fix AgiJobManager/loop.js to not call address()/broadcastMcpTx()
     — those stubs throw by design and the loop is broken for any session with open jobs.

  2. [CRITICAL] Fix procurement.yml: wire it to a new entrypoint that invokes agent/prime/ pipeline
     (prime-orchestrator.js). The current run_procurement_once.js → procurement_agent.js chain
     crashes on import. A new GitHub Actions-compatible single-shot runner for agent/prime/ is needed.

  3. [HIGH] Resolve RPC_URL env var inconsistency: core/config.js reads process.env.RPC_URL but
     prime-client.js and AgiPrimeDiscovery read ETH_RPC_URL. Standardize to one name (ETH_RPC_URL)
     and update core/config.js accordingly, or ensure both are injected in all workflows.

  4. [HIGH] Investigate and resolve isAuthorizedAgent revert on Contract 2. If this blocks the
     commitApplication function, the entire procurement flow is dead even with correct env vars.

  5. [HIGH] Run npm install in core/, AgiJobManager/, and AgiPrimeDiscovery/ as part of CI
     (already done in workflows for AgiJobManager and AgiPrimeDiscovery — core/ has no workflow).

  6. [MEDIUM] Add commitment_material/ and *.salt to .gitignore to prevent accidental salt exposure
     if the operator's local workspace ever has live procurement material.

  7. [MEDIUM] Build/compile Lobster (npm install + TypeScript compilation in lobster/) so the
     pipeline orchestration layer is operational if needed locally.
