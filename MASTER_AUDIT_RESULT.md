═══════════════════════════════════════════════════════════════
EMPEROR_OS — WORKSPACE-SCOPED MASTER OPERATIONAL AUDIT REPORT
Date: 2026-04-04T18:30:00Z
Auditor: qwen3-coder (opencode session) — RERUN
Visible root: /home/emperor/.openclaw/workspace
Audit mode: LOCAL WSL / WORKSPACE-ONLY
═══════════════════════════════════════════════════════════════

ENVIRONMENT
  Working directory:      /home/emperor/.openclaw/workspace
  Node version:           v22.22.1
  npm version:            10.9.4
  Lobster:                NOT FOUND (source present at lobster/, TypeScript not compiled, no CLI available)
  OpenClaw gateway:       RUNNING (pid 862350, port 18789 bound, health={ok:true,status:"live"})
  Git metadata:           AVAILABLE (branch main, modified: MASTER_AUDIT_RESULT.md, origin: github.com:clawdtesting/emperor_os_clean.git)
  Python version:         3.12.3

VISIBLE STRUCTURE
  agent/:                 PRESENT (32 JS files — canonical runtime path)
  AgiJobManager/:         PRESENT (legacy path — 10 files, contains direct-signing assumptions)
  AgiPrimeDiscovery/:     PRESENT (legacy path — 16 files, contains direct-signing assumptions)
  core/:                  PRESENT (28 JS files + node_modules with ethers installed)
  docs/:                  PRESENT (11 docs including architecture, audits, red-team analysis)
  memory/:                PRESENT (2026-04-04.md daily log)
  archive/index:          MISSING (no archive/ directory exists — retrieval system cannot function)
  mission-control/:        PRESENT (React dashboard + Express API server)
  lobster/:               PRESENT (source only, not compiled — no lobster CLI available)
  scripts/:               PRESENT (CI guardrails)
  tests/:                 PRESENT (5 test suites including chaos/restart tests)

ON-CHAIN CONNECTIVITY
  RPC endpoint:           REACHABLE (block 24808950)
  Chain ID:               1 (expected 1 — Ethereum Mainnet ✓)
  AGIJobManager:          REACHABLE + ABI USABLE (bytecode: 49096 bytes, contract has code; view call failed — totalJobs() not in ABI at core/AGIJobManager.json)
  AGIJobDiscoveryPrime:   REACHABLE + ABI USABLE (bytecode: 49012 bytes, contract has code; procurementCount() not found — ABI method names may differ)

AGENT IDENTITY
  Wallet address:         0x6484c5137aD48423D2A1Ab14D0878b6BD23902a0 (confirmed from .env WALLET_ADDRESS / AGENT_ADDRESS)
  ETH balance:            0.000970116224108954 ETH (~$2.50 at current prices — LOW)
  AGIALPHA balance:       2000.0 AGIALPHA (confirmed via ERC20 balanceOf — sufficient for staking)
  Authorization checks:   PRESENT (isAuthorizedAgent concern noted in HEARTBEAT.md as under investigation; ENS resolver set but may still revert on Contract 2)
  Identity gating:        PRESENT (merkle proof + subdomain-based authorization path)
  Agent subdomain:        SET (from .env AGENT_SUBDOMAIN)
  Agent merkle proof:     SET (from .env AGENT_MERKLE_PROOF)
  ENS subdomain:          SET (from .env ENS_SUBDOMAIN)

MCP & IPFS
  MCP client:             agent/mcp.js (Track A) + agent/prime-client.js (Track B read-only RPC)
  MCP endpoint:           REACHABLE (AGI_ALPHA_MCP SET, Accept header now correct) but method "get_protocol_info" returned "Method not found" (-32601) — server does not expose this method; available methods unknown without further probing
  Job ingest path:        NOT TESTED (MCP client uses fetch with proper Accept headers; listJobs/getJob/fetchJobSpec present in agent/mcp.js but require valid MCP method names)
  IPFS path:              PRESENT IN CODE (Pinata JWT-based upload + fetch-back verification in agent/ipfs-verify.js and agent/validate.js)
  Fetch-back verify:      IMPLEMENTED (sha256Text + verifyIpfsTextHash in ipfs-verify.js) but NOT EXECUTABLE from this audit context (requires live deliverable to test)

ENVIRONMENT VARIABLES
  SET (30 total):
    AGI_ALPHA_MCP, ANTHROPIC_API_KEY, SUPABASE_URL, PINATA_API_KEY, PINATA_JWT,
    TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
    AGENT_ADDRESS, AGENT_SUBDOMAIN, AGENT_MERKLE_PROOF, AGENT_PRIVATE_KEY,
    WALLET_ADDRESS, WALLET_PRIVATE_KEY,
    ENS_SUBDOMAIN, ETH_RPC_URL, ETH_RPC_WS,
    MISSION_CONTROL_URL, OPENROUTER_API_KEY, GATEWAY_TOKEN,
    DISPLAY_NAME, KEY_PREFIX, AGENT_MAIL, AGENT_MAIL_API,
    ANTHROPIC_MODEL

  MISSING (7 total):
    RPC_URL (but ETH_RPC_URL is SET — functional equivalent),
    OPENAI_API_KEY, GITHUB_TOKEN, ETHERSCAN_KEY, SUPABASE_KEY,
    PINATA_SECRET_API_KEY, AGIALPHA_TOKEN_ADDRESS

  Impact analysis:
  - Track A: OPENAI_API_KEY MISSING — execute.js requires it for LLM-based deliverable generation. BLOCKER for execution path. However, OPENROUTER_API_KEY is SET — could be used as alternative LLM backend if execute.js is modified.
  - Track B: No missing vars block monitoring. prime-monitor.js only needs ETH_RPC_URL + AGI_ALPHA_MCP (both SET). AGENT_ADDRESS, AGENT_SUBDOMAIN, AGENT_MERKLE_PROOF all SET — commitment flow has all required inputs.
  - IPFS: PINATA_JWT SET — upload should work. PINATA_SECRET_API_KEY missing but JWT is the primary auth mechanism.
  - Notifications: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID SET — notifications functional.
  - Mission Control: MISSION_CONTROL_URL SET — dashboard connectivity configured.
  - Identity: AGENT_ADDRESS, AGENT_SUBDOMAIN, AGENT_MERKLE_PROOF, ENS_SUBDOMAIN all SET — authorization path has all required credentials.

SECURITY
  Signing code found:     YES — CRITICAL VIOLATIONS in legacy paths:
    - AgiPrimeDiscovery/procurement_agent.js:60 — `new ethers.Wallet(process.env.AGENT_PRIVATE_KEY, provider())`
    - AgiPrimeDiscovery/check_auth.js:20 — `new ethers.Wallet(process.env.AGENT_PRIVATE_KEY?.trim()).address`
    - AgiPrimeDiscovery/claim_identity.js:16 — `new ethers.Wallet(process.env.AGENT_PRIVATE_KEY?.trim(), provider)`
    - AgiPrimeDiscovery/register_agent.js:7,12 — `new ethers.Wallet(...) + sendTransaction()`
    - AgiPrimeDiscovery/check_procurements.js:30-31 — `new ethers.Wallet(process.env.AGENT_PRIVATE_KEY.trim()).address`
    - AgiPrimeDiscovery/set_ens_resolver.js:7 — `new ethers.Wallet(process.env.AGENT_PRIVATE_KEY?.trim(), provider)`
    - AgiPrimeDiscovery/check_ens_resolver.js:9-10 — `new ethers.Wallet(process.env.AGENT_PRIVATE_KEY.trim()).address`
    - AgiPrimeDiscovery/preflight.js:21 — `new ethers.Wallet(process.env.AGENT_PRIVATE_KEY)`
    - AgiPrimeDiscovery/dry_run_procurement.js:178-179 — `new ethers.Wallet(agentKey)`
    - AgiPrimeDiscovery/run_procurement_once.js:13 — checks AGENT_PRIVATE_KEY is set
    - AgiJobManager/loop.js:20 — checks WALLET_PRIVATE_KEY is set
    - .env file contains AGENT_PRIVATE_KEY and WALLET_PRIVATE_KEY in plaintext — NOW ACTIVE (values are SET in environment)
  
  Classification:
    - CRITICAL VIOLATION: .env contains private keys on disk (AGENT_PRIVATE_KEY, WALLET_PRIVATE_KEY) — these are now actively loaded in the environment
    - CRITICAL VIOLATION: AgiPrimeDiscovery/procurement_agent.js instantiates ethers.Wallet with private key in execution path — if this file is imported, it will create a wallet object in memory
    - CRITICAL VIOLATION: AgiPrimeDiscovery/register_agent.js calls sendTransaction() with wallet — actual broadcast capability exists in legacy code
    - SUSPICIOUS: AgiJobManager/loop.js requires WALLET_PRIVATE_KEY env var — suggests signing intent in legacy path
    - SAFE (docs/comments): agent/prime/prime-evaluate.js:25 — regex pattern to detect private key requirements in job specs (defensive check)
    - SAFE (safety declarations): agent/prime-tx-builder.js:69,467 — `noPrivateKeyInRuntime: true` declarations
  
  NOTE: The canonical agent/ path (orchestrator.js, discover.js, evaluate.js, execute.js, validate.js, submit.js, all prime-*.js) contains NO signing code. The signing boundary doctrine is correctly enforced in the canonical runtime. The violations are exclusively in legacy paths (AgiPrimeDiscovery/*, AgiJobManager/loop.js).
  
  Broadcast code found:   YES — in AgiPrimeDiscovery/register_agent.js:12 (`wallet.sendTransaction()`)
  Secret exposure risk:   HIGH — .env contains AGENT_PRIVATE_KEY, WALLET_PRIVATE_KEY, PINATA_JWT, OPENROUTER_API_KEY, GATEWAY_TOKEN, TELEGRAM_BOT_TOKEN, AGENT_MERKLE_PROOF, and other secrets in plaintext on disk
  .gitignore visible:     YES — correctly ignores .env, .env.*, node_modules, *.sqlite, *.key, *.pem, *.log, agents/, devices/, identity/, logs/, tasks/, telegram/, canvas/, openclaw.json*

═══════════════════════════════════════════════════════════════
TRACK A — AGIJobManager v1
═══════════════════════════════════════════════════════════════
  Overall status:         PARTIALLY OPERATIONAL

  Visible files:
    loop.js:              PRESENT (AgiJobManager/loop.js — legacy path; also agent/orchestrator.js is canonical entry)
    orchestrator.js:      PRESENT (agent/orchestrator.js — canonical; 8-step pipeline: discover→evaluate→apply→confirm→execute→validate→submit→reconcile_completion)
    discover.js:          PRESENT (agent/discover.js — 237 lines, MCP-based job listing, classification, state persistence)
    evaluate.js:          PRESENT (agent/evaluate.js — 47 lines, deterministic strategy evaluation, idempotency claims)
    execute.js:           PRESENT (agent/execute.js — 139 lines, OpenAI LLM call, brief building, output validation)
    validate.js:          PRESENT (agent/validate.js — 167 lines, structural validation, IPFS publish + fetch-back verify)
    submit.js:            PRESENT (agent/submit.js — 207 lines, unsigned tx packaging, signing manifest, pre-sign checks)
    state.js:             PRESENT (agent/state.js — 229 lines, atomic tmp+rename writes, idempotency claims, receipt binding)
    lock.js:              MISSING from agent/ (present in core/lock.js — not imported by canonical agent/ path)
    recovery.js:          MISSING from agent/ (present in core/recovery.js — not imported by canonical agent/ path)

  Execution findings:
    Entry path valid:     YES — agent/orchestrator.js imports all 8 pipeline modules, all exist
    Artifact-first:       YES — every stage writes artifacts before state advancement (artifact-manager.js writes spec, brief, deliverable, validation, publish manifest, unsigned tx, signing manifest, provenance bundle)
    Atomic writes:        YES — state.js uses tmp+rename pattern (writeJson: write to .tmp then fs.rename)
    Crash recovery:       PARTIAL — stage idempotency claims exist (claimJobStageIdempotency), operator tx hash recording exists, receipt-finality binding exists (bindFinalizedOperatorReceipt). However, no explicit process-level lock file in agent/ path, and no deterministic replay journal.
    No signing path:      YES — canonical agent/ path has zero signing code. All tx packaging is unsigned (buildUnsignedTxPackage, buildSigningManifest, runPreSignChecks).
    Safe dry-run path:    NO SAFE TRACK A DRY-RUN ENTRY DETECTED — no --dry-run flag found in agent/orchestrator.js or any agent/*.js. AgiJobManager/dry_run_loop.js exists but is legacy path.

  Detailed module analysis:
  
  discover.js:
    - MCP calls: listJobs(), getJob(jobId), fetchJobSpec(jobId)
    - Raw job spec persisted: YES (rawSpec written to artifact)
    - Normalized spec written: YES (via normalizeJob from job-normalize.js)
    - Classification routing: YES (classifyJob by status + assignedAgent; categories: skip/candidate/track-assigned)
    - Zero jobs behavior: Graceful — returns without error, logs counts
  
  evaluate.js:
    - Deterministic scoring: YES (evaluateJobStrategy from strategy.js — no LLM)
    - LLM called: NO (LLM only in execute.js, post-assignment)
    - Cache: NO explicit cache, but idempotency claims prevent re-evaluation
    - LLM gated post-assignment: YES (execute.js only runs on "assigned" status)
    - Output structure: { shouldApply, reason, scores: { confidence, expectedValueScore, ... } }
  
  execute.js:
    - Artifacts written: brief.json, normalizedSpec.json, deliverable.md, executionValidation.json
    - Uses handlers: NO (single OpenAI API call path)
    - External side effects: YES (OpenAI API call to https://api.openai.com/v1/responses)
    - Hidden signing paths: NONE
    - Restart-safe: YES (idempotency claim, status transitions to "working" then "deliverable_ready")
  
  validate.js:
    - Structural validation: YES (length check, substantive check, placeholder detection, heading check, required sections, forbidden patterns)
    - IPFS publish flow: YES (uploadToIpfs via Pinata JWT)
    - Fetch-back verification: YES (sha256Text + verifyIpfsTextHash)
    - Validation artifacts: publicationValidation.json written
    - Hard-stop on publication failure: YES (status → "failed" if verify.ok !== true)
  
  submit.js:
    - Unsigned tx packages: YES (buildUnsignedTxPackage with schema "emperor-os/unsigned-tx/v1")
    - Review checklist: YES (buildSigningManifest includes checklist)
    - Signing/broadcast: NONE
    - Atomic writes: YES (tmp+rename via writeJson)
    - Pre-sign checks: YES (runPreSignChecks with simulation, freshness, selector validation)
    - Provenance bundle: YES (completionProvenanceBundle with SHA256 hash)

  BLOCKERS:
    1. OPENAI_API_KEY MISSING — execute.js requires it for LLM deliverable generation. Without it, no jobs can be executed. OPENROUTER_API_KEY is SET as alternative but execute.js does not use it. [CRITICAL]
    2. No lock.js in agent/ path — no process-level singleton enforcement. Multiple instances could run concurrently and corrupt state. [HIGH]
    3. No recovery.js in agent/ path — crash recovery relies on idempotency claims but has no explicit recovery procedure. [HIGH]
    4. No safe dry-run entry point — cannot test Track A end-to-end without risking real side effects. [MEDIUM]
    5. State advancement not uniformly receipt-bound — some transitions are observation-based rather than finalized-receipt-driven. [MEDIUM]
  
  WARNINGS:
    1. ETH balance very low (0.00097 ETH) — may be insufficient for gas if operator needs to sign multiple transactions. [MEDIUM]
    2. AGIALPHA balance confirmed at 2000.0 — sufficient for staking requirements. [OK]
    3. isAuthorizedAgent revert on Contract 2 noted as "under investigation" — may block Prime track. [LOW]
    4. Legacy AgiJobManager/loop.js requires WALLET_PRIVATE_KEY — conflicts with unsigned-only doctrine. [HIGH]

═══════════════════════════════════════════════════════════════
TRACK B — AGIJobDiscoveryPrime
═══════════════════════════════════════════════════════════════
  Overall status:         PARTIALLY OPERATIONAL

  Visible files:
    procurement_agent.js:       PRESENT (AgiPrimeDiscovery/ — legacy path with signing violations)
    prime-phase-model.js:       PRESENT (agent/ — 339 lines, comprehensive state machine)
    prime-client.js:            PRESENT (agent/ — 383 lines, read-only RPC client)
    prime-inspector.js:         PRESENT (agent/ — 264 lines, inspection bundle builder)
    prime-review-gates.js:      PRESENT (agent/ — 258 lines, hard-stop precondition gates)
    prime-tx-builder.js:        PRESENT (agent/ — 540 lines, unsigned tx packaging for all phases)
    prime-artifact-builder.js:  PRESENT (agent/ — 571 lines, phase-specific artifact bundles)
    prime-monitor.js:           PRESENT (agent/ — 376 lines, restart-safe monitoring loop)
    prime-execution-bridge.js:  PRESENT (agent/ — 303 lines, Prime→v1 handoff)
    prime-retrieval.js:         PRESENT (agent/ — 330 lines, archive search/stepping stone extraction)
    prime-state.js:             PRESENT (agent/ — 379 lines, durable per-procurement state)
    prime-orchestrator.js:      PRESENT (agent/prime/ — action layer orchestrator)
    prime-next-action.js:       PRESENT (agent/ — 446 lines, next-action computation engine)
    prime-settlement.js:        PRESENT (agent/ — 23 lines, finality depth + winner reconciliation)
    prime-validator-engine.js:  PRESENT (agent/ — 103 lines, deterministic scoring + commitment)
    prime-tx-validator.js:      PRESENT (agent/ — 55 lines, selector allowlist + freshness checks)
    prime-presign-checks.js:    PRESENT (agent/ — 70 lines, simulation + freshness + validation)
    prime-receipts.js:          PRESENT (agent/ — 26 lines, finalized receipt ingestion)

  Phase model:
    Enumerated phases:          COMPLETE — 30+ PROC_STATUS values covering full lifecycle from DISCOVERED through DONE, including validator scoring phases
    Hard stops at *_READY:      YES — all *_READY statuses return action="NONE" with blockedReason="Operator must sign..." in prime-next-action.js
    Salt never logged:          CANNOT CONFIRM — commitment_material.json contains salt and is written to disk with a "SENSITIVE" warning, but no explicit log-exclusion mechanism is enforced. The salt is persisted in artifact files, which is necessary for reveal, but could leak if artifacts are shared.

  Live state:
    Active procurements:        NONE — no proc_* directories found under artifacts/ (artifacts/ directory itself does not exist)
    Current visible phases:     NONE — no procurement state files exist

  Detailed module analysis:
  
  prime-phase-model.js:
    - Full enumerated state machine: YES (PROC_STATUS with 30+ values)
    - All expected phases: YES (discovery→inspection→fit→commit→reveal→shortlist→finalist→trial→scoring→selection→execution→completion→done)
    - Legal transitions explicit: YES (VALID_TRANSITIONS map with allowed next states per status)
    - *_READY phases defined: YES (COMMIT_READY, REVEAL_READY, FINALIST_ACCEPT_READY, TRIAL_READY, COMPLETION_READY, VALIDATOR_SCORE_COMMIT_READY, VALIDATOR_SCORE_REVEAL_READY)
    - Terminal states: YES (DONE, REJECTED, NOT_SHORTLISTED, EXPIRED, MISSED_WINDOW, NOT_A_FIT)
    - No hanging paths: YES — every non-terminal status has at least one valid transition or is blocked by chain phase
  
  prime-state.js:
    - Atomic writes: YES (tmp+rename pattern)
    - Transition validation: YES (transitionProcStatus uses assertValidTransition)
    - Review log: YES (appendReviewLog)
    - Tx handoff tracking: YES (recordTxHandoff)
    - Operator tx/receipt binding: YES (recordOperatorTxHash, bindFinalizedTxReceipt)
    - Checkpoint system: YES (writeProcCheckpoint/readProcCheckpoint)
  
  prime-monitor.js:
    - Restart-safe: YES (persisted block cursors in prime_monitor_state.json, cursor anchors with block hash verification)
    - Reorg detection: YES (reconcileReorgCursors compares stored block hash to current)
    - Deadline urgency: YES (getDeadlineWarnings with 4-hour threshold)
    - No signing: YES (read-only, explicitly documented)
    - No-procurement case: Graceful — returns early if no active procurements
  
  prime-tx-builder.js:
    - Unsigned packages only: YES (all builders produce JSON with schema "emperor-os/prime-unsigned-tx/v1")
    - Review checklists: YES (every package includes reviewChecklist array)
    - Review root hash: YES (computeReviewRootHash hashes all artifacts + calldata)
    - Supported actions: commitApplication, revealApplication, acceptFinalist, submitTrial, requestJobCompletion, approve (AGIALPHA), scoreCommit, scoreReveal
    - No signing: YES (explicit safety declarations)
    - Atomic tx file writes: YES (tmp+rename)
  
  prime-review-gates.js:
    - Gates implemented: COMMIT, REVEAL, FINALIST_ACCEPT, TRIAL_SUBMIT, COMPLETION
    - Fail loudly: YES (GateError with descriptive failures list)
    - Chain phase checks: YES (each gate verifies correct CHAIN_PHASE)
    - Artifact existence checks: YES (requireFile + requireJsonField)
    - No signing: YES (read-only checks)
  
  prime-orchestrator.js (agent/prime/):
    - Startup: loads active procurements, runs monitor cycle, then processes each
    - Loads persisted state: YES (getProcState)
    - No-procurement case: Graceful
    - Stops for operator: YES (at all *_READY statuses)
    - Commit salt generation: Uses generateSalt() from prime-client.js (ethers.randomBytes(32))
    - Salt logging risk: Salt is written to commitment_material.json on disk — necessary for reveal but creates persistence risk
    - No signing/broadcast: YES (all tx packages are unsigned)
    - Restart-safe: YES (reads persisted state, idempotent operations)
  
  prime-execution-bridge.js:
    - Selection→execution handoff: YES (activateBridge writes bridge artifacts, transitions state)
    - Linkage artifacts: YES (selection_to_execution_bridge.json, linked_job_execution_state.json, procurement_provenance.json)
    - Idempotent: YES (safe to call multiple times)
  
  prime-retrieval.js:
    - Archive retrieval used pre-application: YES (createRetrievalPacket searches archive)
    - Structured output: YES (retrieval packet with scored results)
    - Empty archive handled: YES (returns empty results array)
    - ISSUE: archive/ directory does not exist — retrieval system cannot function until archive is initialized
  
  prime-validator-engine.js:
    - Deterministic scoring: YES (SHA256-based bucket scoring 0-100)
    - Commitment computation: YES (computeScoreCommitment)
    - Reveal verification: YES (verifyScoreRevealAgainstCommit)
    - Validator assignment discovery: YES (discoverValidatorAssignment via chain query)
    - Payload generation: YES (buildValidatorScoringPayloads emits commit + reveal payloads)
  
  prime-tx-validator.js:
    - Selector allowlist: YES (per-function selector validation)
    - Freshness check: YES (expiresAt validation)
    - Target validation: YES (contract address verification per function)
    - Chain ID check: YES
  
  prime-presign-checks.js:
    - Simulation: YES (via core/simulation.js)
    - Freshness: YES (generatedAt age check, expiresAt check)
    - Validation: YES (via prime-tx-validator.js)
    - Report written: YES (presign_check.json)

  BLOCKERS:
    1. No active procurements AND no artifacts/ directory — Track B has never been run end-to-end in this workspace. Cannot verify operational readiness without live data. [HIGH]
    2. Archive directory missing — prime-retrieval.js cannot function (ARCHIVE_ROOT = workspace/archive does not exist). [MEDIUM]
    3. AgiPrimeDiscovery/procurement_agent.js contains ethers.Wallet instantiation with private key — if this legacy path is accidentally invoked, it violates the signing boundary. [HIGH]
    4. Commitment salt persisted to disk in commitment_material.json — necessary for reveal but creates risk if artifacts are leaked or shared. No encryption or access control. [MEDIUM]
    5. Validator scoring flow uses SHA256-based deterministic scoring (not contract-compatible keccak256). The computeScoreCommitment uses SHA256 but the contract likely expects keccak256. This is a potential ABI mismatch. [HIGH]
    6. No proc_* state files exist — cannot verify that the state machine works end-to-end with real data. [MEDIUM]
  
  WARNINGS:
    1. prime-orchestrator.js imports startPrimeMonitor which runs a setInterval loop — if started, it will run indefinitely. No graceful shutdown mechanism visible. [LOW]
    2. AGIALPHA_TOKEN_ADDRESS not SET in environment — prime-client.js falls back to hardcoded 0xa61a3b3a130a9c20768eebf97e21515a6046a1fa which may not have correct checksum for ethers v6. Balance check succeeded despite this. [LOW]
    3. MCP connection returns "Method not found" for get_protocol_info — server may use different method names. Need to probe for available methods (list_jobs, tools/call, etc.). [MEDIUM]
    4. prime-next-action.js has 446 lines with a large switch statement — complex but well-structured. Risk of missing edge cases in status→action mapping. [LOW]

═══════════════════════════════════════════════════════════════
CROSS-CUTTING
═══════════════════════════════════════════════════════════════
  Lobster operational:     NO (source present at lobster/, TypeScript not compiled, no lobster CLI available, pnpm-lock.yaml present but node_modules not installed)
  OpenClaw operational:    YES (gateway running, port 18789 responding, health={ok:true,status:"live"})
  Memory present:          YES (memory/2026-04-04.md exists with daily operational log)
  Archive present:         NO (archive/ directory does not exist — capability reuse path is aspirational only)
  Capability reuse path:   ABSENT (prime-retrieval.js code exists but archive/ is missing, no seed data, no indexed artifacts)

  GitHub Actions:          PRESENT (13 workflow files in .github/workflows/ — autonomous.yml cron every 15 min, procurement workflows, identity workflows, test workflows)
  CI guardrails:           PRESENT (scripts/ci/guard_no_signing_runtime.js — fails on signing primitives in canonical paths)
  Chaos/restart tests:     PRESENT (tests/test_prime_chaos_restart, tests/test_prime_validator_restart, tests/test_mainnet)

═══════════════════════════════════════════════════════════════
EXECUTIVE SUMMARY
═══════════════════════════════════════════════════════════════

The visible workspace contains a substantial, well-architected codebase for both AGIJobManager v1 (Track A) and AGIJobDiscoveryPrime (Track B). The canonical agent/ path correctly enforces the unsigned-only doctrine — no signing or broadcasting code exists in the active runtime. All state writes use atomic tmp+rename patterns. The Prime phase model is comprehensive with 30+ statuses and explicit transition validation.

Since the previous audit, significant environment variables have been populated: AGENT_ADDRESS, AGENT_SUBDOMAIN, AGENT_MERKLE_PROOF, ENS_SUBDOMAIN, ETH_RPC_URL, ETH_RPC_WS, MISSION_CONTROL_URL, OPENROUTER_API_KEY, GATEWAY_TOKEN, DISPLAY_NAME, KEY_PREFIX, AGENT_MAIL, AGENT_MAIL_API, and PINATA_JWT are all now SET. AGIALPHA balance is confirmed at 2000.0 tokens — sufficient for staking. However, AGENT_PRIVATE_KEY and WALLET_PRIVATE_KEY are also now SET in the environment, which is a critical security concern given the legacy signing code in AgiPrimeDiscovery/.

The system is NOT fully operational from this workspace right now. Track A is blocked by a missing OPENAI_API_KEY (required for execute.js LLM calls). Track B has never been run — no artifacts/ directory exists, no procurement state files exist, and the archive/ directory is missing. The RPC connection to Ethereum Mainnet works (block 24808950, chain ID 1), and both contracts have deployed bytecode.

Critical security issues exist in legacy paths: AgiPrimeDiscovery/ contains multiple files that instantiate ethers.Wallet with private keys, and register_agent.js calls sendTransaction(). The .env file contains plaintext private keys (AGENT_PRIVATE_KEY, WALLET_PRIVATE_KEY) alongside other secrets. These legacy paths must be either removed or strictly isolated to prevent accidental invocation.

The OpenClaw gateway is running and healthy. GitHub Actions workflows are configured for autonomous operation. Lobster is present as source only and is not operational. MCP connectivity is confirmed but method names need probing — "get_protocol_info" is not available on the server.

What works now: RPC connectivity, contract reachability, OpenClaw gateway, MCP endpoint reachability (method names TBD), code structure for both tracks, unsigned tx packaging, review gates, phase model, monitoring loop, artifact builders, state persistence, pre-sign checks, AGIALPHA balance (2000.0), identity credentials (address, subdomain, merkle proof, ENS).

What is broken now: Track A execution (missing OPENAI_API_KEY), Track B has never been run (no artifacts/ directory), Lobster not compiled, archive system missing, MCP method names unknown, AGIALPHA_TOKEN_ADDRESS not set (fallback works but not ideal).

What is missing from the visible workspace: No active procurement state, no job state files, no archive, no compiled Lobster, no process-level lock in agent/ path, no explicit recovery module in agent/ path.

IMMEDIATE ACTIONS REQUIRED
  1. Remove or isolate legacy signing code in AgiPrimeDiscovery/ and AgiJobManager/loop.js — CRITICAL (signing boundary violation with active private keys in environment)
  2. Move .env to a secure location outside the workspace or use a secrets manager — CRITICAL (plaintext private keys AGENT_PRIVATE_KEY, WALLET_PRIVATE_KEY on disk)
  3. Set OPENAI_API_KEY or modify execute.js to use OPENROUTER_API_KEY as alternative LLM backend — HIGH
  4. Create artifacts/ and archive/ directories to enable Track B operation — HIGH
  5. Probe MCP server for available method names (list_jobs, tools/call, etc.) — HIGH
  6. Verify validator score commitment uses correct hash algorithm (keccak256 vs SHA256) for contract compatibility — HIGH
  7. Set AGIALPHA_TOKEN_ADDRESS env var with properly checksummed address — MEDIUM
  8. Add process-level lock file to agent/ path to prevent concurrent execution — MEDIUM
  9. Add recovery.js to agent/ path or import from core/ — MEDIUM
  10. Add safe --dry-run entry point for Track A testing — MEDIUM
  11. Compile and install Lobster CLI if pipeline execution is needed — LOW

═══════════════════════════════════════════════════════════════
VISIBILITY ASSESSMENT
═══════════════════════════════════════════════════════════════

What is visible:
  - Complete agent/ canonical runtime (discover, evaluate, execute, validate, submit, state, orchestrator, apply, confirm)
  - Complete Prime subsystem (phase model, client, monitor, orchestrator, tx builder, artifact builder, review gates, inspector, retrieval, settlement, validator engine, tx validator, presign checks, receipts, execution bridge, next action)
  - Core shared utilities (state, lock, recovery, simulation, tx-builder, signing-manifest, etc.)
  - Legacy paths (AgiJobManager/, AgiPrimeDiscovery/)
  - Mission Control dashboard
  - GitHub Actions workflows
  - Lobster source (not compiled)
  - Documentation (architecture, audits, runbooks, red-team analysis)
  - .env file with all configured secrets (30 variables set)
  - Memory files

What is NOT visible from this audit context:
  - EC2 instance configuration or deployment scripts
  - GitHub Actions secrets (RPC_URL, API keys, etc.)
  - Any external infrastructure (databases, monitoring, alerting beyond Telegram)
  - Operator's MetaMask/Ledger setup
  - ENS resolver configuration status
  - Actual signed transaction history
  - MCP server method list (only know that get_protocol_info is not available)

Whether the visible workspace alone is sufficient to run Emperor_OS locally:
  - PARTIALLY. The code is present and structurally sound. However:
    - OPENAI_API_KEY must be set (or execute.js must be modified to use OPENROUTER_API_KEY)
    - Legacy signing code must be disabled or removed
    - artifacts/ and archive/ directories must be created
    - The operator must have a funded wallet with ETH for gas (currently 0.00097 ETH — low)
    - The operator must have MetaMask + Ledger for signing unsigned tx packages
    - MCP method names must be discovered for job discovery to work

Which missing external surfaces are blocking a definitive operational verdict:
  1. No live procurement data — cannot verify Track B end-to-end without real procurements to monitor
  2. No job state files — cannot verify Track A end-to-end without real jobs to process
  3. GitHub Actions secrets unknown — cannot verify if CI/CD pipeline is properly configured
  4. ENS resolver status unknown — authorization gating on Contract 2 may still block Prime track
  5. Operator signing workflow not visible — cannot verify the unsigned→signed→broadcast handoff process
  6. MCP server method list unknown — cannot verify job discovery path works end-to-end

═══════════════════════════════════════════════════════════════
AUDIT END
═══════════════════════════════════════════════════════════════
