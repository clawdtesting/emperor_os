MASTER AUDIT PROMPT — Emperor_OS Workspace-Scoped Operational Readiness Assessment

Purpose: Determine with precision whether the currently visible Emperor_OS workspace is fully operational, partially operational, or broken for both the AGIJobManager (v1 loop) and the AGIJobDiscoveryPrime (procurement) tracks.

Execution context: This audit is running locally on Windows via WSL Ubuntu, with OpenClaw mounted locally.

Filesystem reality:

Local OpenClaw root: /home/emperor/.openclaw
Visible workspace root: /home/emperor/.openclaw/workspace
In GitHub, this workspace corresponds to: /.openclaw/workspace
Only the workspace is visible to you.

Critical constraint: You must audit only what is actually visible from the workspace. Do not assume access to the full repository root, EC2, GitHub Actions secrets, or workflow files unless those files are explicitly visible inside the workspace.

How to use this prompt: Paste this into Claude Code or another coding agent session that has local shell access to the visible workspace. The agent executing this audit must read every referenced visible file, run every referenced command, and report actual results — not assumptions.

Do not skip steps. Do not assume. If a file is missing, say it is missing. If a command fails, report the exact error. If a contract call reverts, report what reverted and why.

AUDIT MODE

This is a workspace-scoped operational audit.

That means:

You are auditing the actual visible implementation surface under /home/emperor/.openclaw/workspace.
If required files are outside the workspace and not visible, that is an audit finding.
If a path in older docs references repo-root files that are not visible from workspace, do not invent them. Mark them NOT VISIBLE FROM AUDIT CONTEXT.
This audit must answer:

If I run the local system from this WSL/OpenClaw-visible workspace right now, what works, what fails, and what is missing?

AUDIT SCOPE

Audit both tracks independently:

Track A — AGIJobManager (v1): Standard job discovery, evaluation, execution, validation, and unsigned completion packaging.
Track B — AGIJobDiscoveryPrime (Procurement): Multi-phase procurement flow, including inspection, fit evaluation, commit/reveal preparation, finalist/trial preparation, and handoff into execution.

For each track, determine:

Does the visible workspace contain the needed code?
Does that code load?
Does it run locally in WSL?
Does it appear operational now?
Is it blocked by missing files, broken imports, missing env vars, chain failures, or invisible dependencies outside workspace?
PHASE 0 — AUDIT BASELINE
0.1 — Confirm Working Directory

Run:

pwd
ls -la

You must confirm you are operating from:

/home/emperor/.openclaw/workspace

If not, cd there first and report the corrected path.

0.2 — Runtime

Run:

node --version
npm --version
which lobster || true
lobster --version 2>/dev/null || node lobster/bin/lobster.js --version 2>/dev/null || echo "LOBSTER_NOT_FOUND"
python3 --version 2>/dev/null || echo "PYTHON_NOT_FOUND"

Report exact versions.

Do not hardcode a required Node version unless the visible code explicitly requires one. Instead:

report actual Node version
inspect package metadata and visible docs for required version
flag mismatch only if the workspace explicitly requires another version
0.3 — Visible Workspace Tree

Run:

find . -maxdepth 3 | sort

Report the visible top-level structure, especially whether these directories exist:

agent/
AgiJobManager/
AgiPrimeDiscovery/
core/
memory/
data/
artifacts/ or agent/artifacts/
docs/
.github/ (if visible)
lobster/ or pipeline directories

If a directory is missing, report it plainly.

0.4 — Git State of Visible Workspace

Run:

git status 2>&1
git log --oneline -10 2>&1
git remote -v 2>&1

Report:

whether the visible workspace is in a git repo
latest visible commit
configured remotes
whether the working tree is clean

If .git is not available from this visible context, report:
GIT METADATA NOT VISIBLE FROM AUDIT CONTEXT

0.5 — Process State

Run:

cat agent/execution.lock 2>/dev/null || echo "NO_LOCK"
ps aux | grep -E "loop\.js|procurement_agent|orchestrator|prime-monitor|openclaw|lobster" | grep -v grep
ss -ltnp 2>/dev/null | grep 18789 || true

Report:

stale execution lock or none
currently running relevant processes
whether port 18789 appears bound locally
0.6 — Visible Environment Variables

Run:

for var in RPC_URL AGI_ALPHA_MCP ANTHROPIC_API_KEY OPENAI_API_KEY GITHUB_TOKEN \
           ETHERSCAN_KEY SUPABASE_KEY SUPABASE_URL PINATA_API_KEY PINATA_SECRET_API_KEY \
           TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID; do
  if [ -n "${!var}" ]; then
    echo "$var: SET"
  else
    echo "$var: MISSING"
  fi
done

Do not print values.

Report which missing variables are likely blockers for:

Track A
Track B
IPFS
notifications
archive/cache layers
0.7 — Dependency Audit

Run:

[ -f package.json ] && cat package.json || echo "NO_PACKAGE_JSON_AT_WORKSPACE_ROOT"
[ -f package-lock.json ] && echo "PACKAGE_LOCK_PRESENT" || echo "NO_PACKAGE_LOCK"
npm ls --depth=0 2>&1 | grep -E "UNMET|missing|error" || echo "No dependency issues detected by npm ls"

node -e "require('ethers'); console.log('ethers: OK')" 2>/dev/null || echo "ethers: MISSING"
node -e "require('axios'); console.log('axios: OK')" 2>/dev/null || echo "axios: MISSING"
node -e "require('@supabase/supabase-js'); console.log('supabase: OK')" 2>/dev/null || echo "supabase: MISSING"

If dependencies are broken, report the exact module names.

PHASE 1 — ON-CHAIN CONNECTIVITY & CONTRACT AUDIT

This must be run from the visible workspace only.

1.1 — RPC Connectivity

Run:

node - <<'EOF'
const { ethers } = require('ethers');

(async () => {
  try {
    if (!process.env.RPC_URL) {
      console.error('RPC_URL missing');
      process.exit(1);
    }
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const block = await provider.getBlockNumber();
    const network = await provider.getNetwork();
    console.log(`Block: ${block}`);
    console.log(`ChainId: ${network.chainId.toString()}`);
  } catch (e) {
    console.error('RPC FAILURE:', e.message);
    process.exit(1);
  }
})();
EOF

Report:

block number
chain ID
whether chain ID is 1
whether RPC is a hard blocker
1.2 — Locate Visible ABI Sources

You must first find where the visible workspace stores ABIs.

Run:

find . -type f | grep -E "AGIJobManager|AGIJobDiscoveryPrime|abi"

From actual results, determine the correct visible ABI paths.

If ABI files are missing, that is a blocker.

1.3 — AGIJobManager Reachability

Using the actual visible ABI path, run a read-only contract reachability test against:

0xB3AAeb69b630f0299791679c063d68d6687481d1

Attempt:

presence of bytecode
one safe view call if ABI supports it
if the view call fails, distinguish between:
no code
wrong chain
ABI mismatch
function missing
revert
1.4 — AGIJobDiscoveryPrime Reachability

Using the actual visible ABI path, run a read-only contract reachability test against:

0xd5EF1dde7Ac60488f697ff2A7967a52172A78F29

Same reporting structure as above.

1.5 — Wallet & Identity Audit

You must not invent the wallet address. You must discover it from visible files.

Search for likely sources:

grep -Rni "0x6484\|wallet\|agent wallet\|HEARTBEAT\|identity\|address" . 2>/dev/null | head -100

Determine the actual visible configured wallet address.

Then audit:

ETH balance
AGIALPHA balance
whether balance appears sufficient
any visible identity/NFT checks implemented in code
whether the code depends on ENS, NFT, merkle proof, or authorization checks

If the audit cannot confirm a wallet address from visible files, report:
AGENT WALLET ADDRESS NOT CONFIRMABLE FROM VISIBLE WORKSPACE

1.6 — Authorization Check

Search visible code for:

grep -Rni "isAuthorizedAgent\|authorized agent\|authorization" . 2>/dev/null

If visible code invokes isAuthorizedAgent, inspect the implementation and determine whether a revert in that path would block Track B.

PHASE 2 — MCP / IPFS / EXTERNAL SERVICE CONNECTIVITY
2.1 — Locate MCP Client

Search for the visible MCP client implementation:

find . -type f | grep -E "mcp.*\.(js|ts)$|mcp_dev|prime-client|client"

Read the real file used by the workspace.

You must determine:

actual file path
actual exported interface
actual endpoint env var used
whether it uses JSON-RPC, HTTP, SSE, or wrappers
2.2 — MCP Reachability

Using the real visible MCP client, run the safest read-only call available, such as:

list_jobs
get_protocol_info
another read-only MCP method visible in code

If the visible client cannot be executed, report the exact import or runtime error.

Report:

reachable or unreachable
actual method tested
exact error on failure
whether MCP is a hard blocker for Track A and/or Track B
2.3 — Job Metadata Ingestion

If MCP works and visible code supports it, test the full read path:

list jobs
pick one job ID if present
get job details
fetch metadata/spec

Do not fake field names. Use the actual return structure from the visible client.

2.4 — IPFS / Pinata Path

Search visible code for:

grep -Rni "pinata\|ipfs\|IpfsHash\|upload_to_ipfs\|verifyIpfs" . 2>/dev/null

Determine:

actual upload function
actual verify/fetch-back function
actual env vars required

If a safe tiny test payload path is implemented, run it.

If not safe or not possible from visible code, report:
IPFS PATH PRESENT IN CODE BUT NOT SAFELY EXECUTABLE FROM THIS AUDIT CONTEXT

PHASE 3 — TRACK A DEEP AUDIT (AGIJobManager v1)

You must only inspect files that actually exist under the visible workspace.

3.1 — Locate Track A Entry Surface

Search:

find . -type f | grep -E "loop\.js$|orchestrator\.js$|discover\.js$|evaluate\.js$|execute\.js$|validate\.js$|submit\.js$|state\.js$|lock\.js$|recovery\.js$"

Map the real file set.

If expected files do not exist, say exactly which ones are missing.

3.2 — loop.js Static Audit

Read the visible Track A loop entry file.

Answer with evidence:

entry point structure
first function invoked
whether it imports orchestrator logic
whether it acquires/releases a lock
how it behaves when zero jobs exist
whether it includes any signer, wallet, sendTransaction, or broadcast logic
whether it appears safe for local dry-run execution
3.3 — Orchestrator Integrity

Read the visible orchestrator file.

Determine whether the actual pipeline is:

discover
evaluate
execute
validate
submit

or a different sequence.

Answer:

exact call order
whether artifact creation precedes state advancement
whether state writes appear atomic
whether handler routing exists
whether any signing or broadcast path exists
whether IPFS verification failure is hard-stop or soft warning
3.4 — Discovery Layer

Read the visible discovery module.

Answer:

actual MCP calls made
whether raw job spec is persisted
whether normalized spec is written
classification/handler routing criteria
whether discovery can operate with zero jobs without crashing
3.5 — Evaluation Layer

Read the visible evaluation module.

Answer:

deterministic scoring rules
whether an LLM is called
whether cache exists
whether LLM usage is gated to post-assignment only
whether more than one LLM call per job is possible
exact output structure
3.6 — Execution Layer

Read the visible execution module.

Answer:

what artifacts it writes
whether it uses handlers
whether it can run without external side effects
whether there are hidden signing paths
whether it is restart-safe or idempotent
3.7 — Validation Layer

Read the visible validation module.

Answer:

structural validation checks
IPFS publish flow
IPFS fetch-back verification
exact validation artifacts written
whether validation can pass without verified publication
3.8 — Submission Layer

Read the visible submission/tx packaging module.

Answer:

whether it emits unsigned tx packages
whether schema resembles emperor-os/unsigned-tx/v1
whether review checklist is included
whether any signing or broadcast occurs
whether writes are atomic
3.9 — State / Lock / Recovery

Read the actual visible state, lock, and recovery files.

Answer:

whether writes use tmp+rename atomicity
lock file structure
stale lock recovery behavior
whether crash recovery is implemented or only implied
whether state machine transitions are explicit
3.10 — Track A Dry Run

Only run a dry run if a safe dry-run or no-op mode clearly exists in visible code.

Examples:

node <actual loop path> --dry-run
node <actual loop path> --help

If no safe dry-run exists, do not improvise. Report:
NO SAFE TRACK A DRY-RUN ENTRY DETECTED

3.11 — Track A Assessment

State precisely:

RPC connectivity: GO / NO-GO
contract reachable + ABI usable: GO / NO-GO
wallet address confirmable: GO / NO-GO
MCP working: GO / NO-GO
IPFS path working: GO / NO-GO / UNKNOWN
no signing code found: GO / NO-GO
artifact-first pattern: GO / NO-GO / PARTIAL
atomic state writes: GO / NO-GO / PARTIAL
crash recovery: GO / NO-GO / PARTIAL
Track A overall: OPERATIONAL / PARTIALLY OPERATIONAL / BLOCKED

If blocked, list blockers in severity order.

PHASE 4 — TRACK B DEEP AUDIT (AGIJobDiscoveryPrime)
4.1 — Locate Track B File Set

Search:

find . -type f | grep -E "procurement_agent|prime-phase-model|prime-client|prime-inspector|prime-review-gates|prime-tx-builder|prime-artifact-builder|prime-monitor|prime-execution-bridge|prime-retrieval|prime-state|prime-orchestrator"

Map what actually exists.

4.2 — Phase Model Audit

Read the visible phase model.

Determine:

whether a full enumerated state machine exists
whether all expected phases exist
whether legal transitions are explicit
whether any *_READY phases are defined
whether terminal states exist
whether any path can hang with no defined next step
4.3 — Procurement Agent Main Loop

Read the visible procurement_agent.js.

Answer:

startup sequence
where it loads persisted state from
whether no-procurement case is graceful
where it stops for operator
whether commit salt is generated and how
whether salt could be logged
whether any signing/broadcast path exists
whether the agent is restart-safe
4.4 — Inspector / Review Gates / Tx Builder

Read those visible files.

Determine:

actual inspection bundle contents
exact review gate checks
whether failed gates fail loudly
whether tx builder creates unsigned packages only
whether review checklists exist
whether trial readiness requires verified artifacts
whether any hidden signing logic exists
4.5 — Artifact Builder / State / Monitor

Read those visible files.

Determine:

artifact directory structure by phase
whether writes are atomic
whether reruns are handled safely
whether monitor calculates deadline urgency
whether monitor is restart-safe
whether state schema is explicit and durable
4.6 — Prime → Execution Bridge

If a visible bridge exists, inspect it.

Determine:

whether selected procurements hand off into execution
whether linkage artifacts are written
whether the handoff is idempotent
4.7 — Retrieval / Archive Use

Read the visible retrieval file and archive index logic.

Determine:

whether archive retrieval is used pre-application
whether retrieval output is structured
whether empty archive is handled gracefully
4.8 — Visible Live Procurement State

Inspect visible state and artifacts:

find . -type d | grep "proc_"
find . -type f | grep -E "procurement_state|state\.json" | sort

For each visible procurement state file, extract:

procurement ID
current phase
timestamps/deadlines if present
whether it appears stuck
4.9 — Track B Assessment

State precisely:

RPC connectivity: GO / NO-GO
contract reachable + ABI usable: GO / NO-GO
authorization dependency understood: GO / NO-GO / UNKNOWN
wallet address confirmable: GO / NO-GO
MCP working: GO / NO-GO
IPFS path working: GO / NO-GO / UNKNOWN
complete phase model: GO / NO-GO / PARTIAL
hard stops at *_READY: GO / NO-GO / PARTIAL
salt never logged: GO / NO-GO / CANNOT CONFIRM
no signing code found: GO / NO-GO
atomic writes: GO / NO-GO / PARTIAL
active visible procurements: YES / NO
Track B overall: OPERATIONAL / PARTIALLY OPERATIONAL / BLOCKED

If blocked, list blockers in severity order.

PHASE 5 — CROSS-CUTTING SECURITY & SAFETY
5.1 — Signing Boundary Verification

Run:

grep -Rni "\.sign\b" ./agent ./AgiJobManager ./AgiPrimeDiscovery ./core 2>/dev/null
grep -Rni "ethers\.Wallet" ./agent ./AgiJobManager ./AgiPrimeDiscovery ./core 2>/dev/null
grep -Rni "sendTransaction\|signTransaction\|broadcastTransaction" ./agent ./AgiJobManager ./AgiPrimeDiscovery ./core 2>/dev/null
grep -Rni "privateKey\|PRIVATE_KEY\|mnemonic\|MNEMONIC" ./agent ./AgiJobManager ./AgiPrimeDiscovery ./core 2>/dev/null

Do not suppress results.

Classify each hit as one of:

safe docs/comment/reference
suspicious
critical violation

Any real execution-path signing/broadcast code is a CRITICAL VIOLATION.

5.2 — Secret Exposure

Run:

grep -Rni "0x[0-9a-fA-F]\{64\}" . 2>/dev/null
grep -Rni "\.env\|execution\.lock\|commitment_material\|heartbeat-state" .gitignore 2>/dev/null || echo ".gitignore not visible"

Report:

any unexplained 64-byte hex values
whether .gitignore is visible
whether sensitive files appear ignored
5.3 — Lobster / Pipelines

Search:

find . -type f | grep -E "pipeline|lobster|\.yml$|\.yaml$"

Determine:

whether Lobster is present
whether pipeline definitions are visible
whether pipeline files appear valid
whether the local workspace seems runnable without unseen external pipeline definitions
5.4 — OpenClaw Gateway

Run:

curl -s http://127.0.0.1:18789/health 2>/dev/null || echo "OPENCLAW_HEALTH_UNREACHABLE"
curl -s http://localhost:18789/health 2>/dev/null || echo "LOCALHOST_18789_UNREACHABLE"
ps aux | grep openclaw | grep -v grep

Report:

whether OpenClaw is running
whether gateway health responds
whether the local runtime appears live
5.5 — Memory / Archive

Inspect visible memory and archive state:

find . -maxdepth 3 | grep -E "memory|archive|heartbeat"

Determine:

whether memory files exist
whether heartbeat state exists
whether archive index exists
approximate visible archive size
whether capability reuse appears operational or only aspirational
PHASE 6 — REQUIRED FINAL REPORT FORMAT

You must produce the final report in exactly this structure, with real values.

═══════════════════════════════════════════════════════════════
EMPEROR_OS — WORKSPACE-SCOPED MASTER OPERATIONAL AUDIT REPORT
Date: [ISO8601]
Auditor: [model/session]
Visible root: /home/emperor/.openclaw/workspace
Audit mode: LOCAL WSL / WORKSPACE-ONLY
═══════════════════════════════════════════════════════════════

ENVIRONMENT
  Working directory:      [path]
  Node version:           [x.x.x]
  npm version:            [x.x.x]
  Lobster:                [version] / NOT FOUND
  OpenClaw gateway:       RUNNING / DOWN / UNKNOWN
  Git metadata:           AVAILABLE / NOT VISIBLE

VISIBLE STRUCTURE
  agent/:                 PRESENT / MISSING
  AgiJobManager/:         PRESENT / MISSING
  AgiPrimeDiscovery/:     PRESENT / MISSING
  core/:                  PRESENT / MISSING
  docs/:                  PRESENT / MISSING
  memory/:                PRESENT / MISSING
  archive/index:          PRESENT / MISSING

ON-CHAIN CONNECTIVITY
  RPC endpoint:           REACHABLE (block [N]) / UNREACHABLE
  Chain ID:               [N] (expected 1)
  AGIJobManager:          REACHABLE + ABI USABLE / ABI MISMATCH / UNREACHABLE
  AGIJobDiscoveryPrime:   REACHABLE + ABI USABLE / ABI MISMATCH / UNREACHABLE

AGENT IDENTITY
  Wallet address:         [0x...] / NOT CONFIRMABLE
  ETH balance:            [N] / NOT TESTED
  AGIALPHA balance:       [N] / NOT TESTED
  Authorization checks:   PRESENT / ABSENT / UNCLEAR
  Identity gating:        PRESENT / ABSENT / UNCLEAR

MCP & IPFS
  MCP client:             [path] / NOT FOUND
  MCP endpoint:           REACHABLE / UNREACHABLE / NOT TESTABLE
  Job ingest path:        WORKING / BROKEN / NOT TESTED
  IPFS path:              WORKING / BROKEN / UNKNOWN
  Fetch-back verify:      PASS / FAIL / UNKNOWN

ENVIRONMENT VARIABLES
  Missing critical vars:  [list] / NONE

SECURITY
  Signing code found:     NONE / YES [files:lines]
  Broadcast code found:   NONE / YES [files:lines]
  Secret exposure risk:   NONE / YES [details]
  .gitignore visible:     YES / NO

══════════════════════════════════════════════
TRACK A — AGIJobManager v1
══════════════════════════════════════════════
  Overall status:         OPERATIONAL / PARTIALLY OPERATIONAL / BLOCKED

  Visible files:
    loop.js:              PRESENT / MISSING
    orchestrator.js:      PRESENT / MISSING
    discover.js:          PRESENT / MISSING
    evaluate.js:          PRESENT / MISSING
    execute.js:           PRESENT / MISSING
    validate.js:          PRESENT / MISSING
    submit.js:            PRESENT / MISSING
    state.js:             PRESENT / MISSING
    lock.js:              PRESENT / MISSING
    recovery.js:          PRESENT / MISSING

  Execution findings:
    Entry path valid:     YES / NO
    Artifact-first:       YES / NO / PARTIAL
    Atomic writes:        YES / NO / PARTIAL
    Crash recovery:       YES / NO / PARTIAL
    No signing path:      YES / NO
    Safe dry-run path:    YES / NO

  BLOCKERS:
    1. [blocker or NONE]
    2. ...
  
  WARNINGS:
    1. [warning or NONE]

══════════════════════════════════════════════
TRACK B — AGIJobDiscoveryPrime
══════════════════════════════════════════════
  Overall status:         OPERATIONAL / PARTIALLY OPERATIONAL / BLOCKED

  Visible files:
    procurement_agent.js:       PRESENT / MISSING
    prime-phase-model.js:       PRESENT / MISSING
    prime-client.js:            PRESENT / MISSING
    prime-inspector.js:         PRESENT / MISSING
    prime-review-gates.js:      PRESENT / MISSING
    prime-tx-builder.js:        PRESENT / MISSING
    prime-artifact-builder.js:  PRESENT / MISSING
    prime-monitor.js:           PRESENT / MISSING
    prime-execution-bridge.js:  PRESENT / MISSING
    prime-retrieval.js:         PRESENT / MISSING
    prime-state.js:             PRESENT / MISSING
    prime-orchestrator.js:      PRESENT / MISSING

  Phase model:
    Enumerated phases:          COMPLETE / PARTIAL / MISSING
    Hard stops at *_READY:      YES / NO / PARTIAL
    Salt never logged:          CONFIRMED / CANNOT CONFIRM / VIOLATION

  Live state:
    Active procurements:        [N] / NONE
    Current visible phases:     [list] / NONE

  BLOCKERS:
    1. [blocker or NONE]
    2. ...
  
  WARNINGS:
    1. [warning or NONE]

══════════════════════════════════════════════
CROSS-CUTTING
══════════════════════════════════════════════
  Lobster operational:     YES / NO / UNKNOWN
  OpenClaw operational:    YES / NO / UNKNOWN
  Memory present:          YES / NO
  Archive present:         YES / NO
  Capability reuse path:   REAL / PARTIAL / ABSENT

══════════════════════════════════════════════
EXECUTIVE SUMMARY
══════════════════════════════════════════════

[Write 5–10 direct sentences. State what actually works now, what is actually broken now, and what is missing from the visible workspace. Do not speculate.]

IMMEDIATE ACTIONS REQUIRED
  1. [action — severity CRITICAL/HIGH/MEDIUM]
  2. [action — severity CRITICAL/HIGH/MEDIUM]
  3. ...
AUDIT EXECUTION RULES
Read every visible file you reference.
Run every command you claim to have run.
Report actual errors exactly.
Do not assume access outside /home/emperor/.openclaw/workspace.
Do not invent non-visible workflow files, secrets, or repo-root files.
If a dependency exists only outside workspace, report it as an external dependency not visible from this audit context.
No signing. No broadcasting. No state mutation except safe read-only inspection and explicitly harmless test payloads where a visible test path exists.
Security findings come first. If signing or broadcast code is present in execution paths, report that immediately as critical.
Distinguish clearly between:
missing
present but broken
present but not testable from this audit context
No speculation. Evidence only.
OPERATOR NOTE

If the agent discovers that the visible workspace is only a partial mirror of the true runtime, it must explicitly answer:

what is visible
what is not visible
whether the visible workspace alone is sufficient to run Emperor_OS locally
which missing external surfaces are blocking a definitive operational verdictMASTER AUDIT PROMPT — Emperor_OS Workspace-Scoped Operational Readiness Assessment

Purpose: Determine with precision whether the currently visible Emperor_OS workspace is fully operational, partially operational, or broken for both the AGIJobManager (v1 loop) and the AGIJobDiscoveryPrime (procurement) tracks.

Execution context: This audit is running locally on Windows via WSL Ubuntu, with OpenClaw mounted locally.

Filesystem reality:

Local OpenClaw root: /home/emperor/.openclaw
Visible workspace root: /home/emperor/.openclaw/workspace
In GitHub, this workspace corresponds to: /.openclaw/workspace
Only the workspace is visible to you.

Critical constraint: You must audit only what is actually visible from the workspace. Do not assume access to the full repository root, EC2, GitHub Actions secrets, or workflow files unless those files are explicitly visible inside the workspace.

How to use this prompt: Paste this into Claude Code or another coding agent session that has local shell access to the visible workspace. The agent executing this audit must read every referenced visible file, run every referenced command, and report actual results — not assumptions.

Do not skip steps. Do not assume. If a file is missing, say it is missing. If a command fails, report the exact error. If a contract call reverts, report what reverted and why.

AUDIT MODE

This is a workspace-scoped operational audit.

That means:

You are auditing the actual visible implementation surface under /home/emperor/.openclaw/workspace.
If required files are outside the workspace and not visible, that is an audit finding.
If a path in older docs references repo-root files that are not visible from workspace, do not invent them. Mark them NOT VISIBLE FROM AUDIT CONTEXT.
This audit must answer:

If I run the local system from this WSL/OpenClaw-visible workspace right now, what works, what fails, and what is missing?

AUDIT SCOPE

Audit both tracks independently:

Track A — AGIJobManager (v1): Standard job discovery, evaluation, execution, validation, and unsigned completion packaging.
Track B — AGIJobDiscoveryPrime (Procurement): Multi-phase procurement flow, including inspection, fit evaluation, commit/reveal preparation, finalist/trial preparation, and handoff into execution.

For each track, determine:

Does the visible workspace contain the needed code?
Does that code load?
Does it run locally in WSL?
Does it appear operational now?
Is it blocked by missing files, broken imports, missing env vars, chain failures, or invisible dependencies outside workspace?
PHASE 0 — AUDIT BASELINE
0.1 — Confirm Working Directory

Run:

pwd
ls -la

You must confirm you are operating from:

/home/emperor/.openclaw/workspace

If not, cd there first and report the corrected path.

0.2 — Runtime

Run:

node --version
npm --version
which lobster || true
lobster --version 2>/dev/null || node lobster/bin/lobster.js --version 2>/dev/null || echo "LOBSTER_NOT_FOUND"
python3 --version 2>/dev/null || echo "PYTHON_NOT_FOUND"

Report exact versions.

Do not hardcode a required Node version unless the visible code explicitly requires one. Instead:

report actual Node version
inspect package metadata and visible docs for required version
flag mismatch only if the workspace explicitly requires another version
0.3 — Visible Workspace Tree

Run:

find . -maxdepth 3 | sort

Report the visible top-level structure, especially whether these directories exist:

agent/
AgiJobManager/
AgiPrimeDiscovery/
core/
memory/
data/
artifacts/ or agent/artifacts/
docs/
.github/ (if visible)
lobster/ or pipeline directories

If a directory is missing, report it plainly.

0.4 — Git State of Visible Workspace

Run:

git status 2>&1
git log --oneline -10 2>&1
git remote -v 2>&1

Report:

whether the visible workspace is in a git repo
latest visible commit
configured remotes
whether the working tree is clean

If .git is not available from this visible context, report:
GIT METADATA NOT VISIBLE FROM AUDIT CONTEXT

0.5 — Process State

Run:

cat agent/execution.lock 2>/dev/null || echo "NO_LOCK"
ps aux | grep -E "loop\.js|procurement_agent|orchestrator|prime-monitor|openclaw|lobster" | grep -v grep
ss -ltnp 2>/dev/null | grep 18789 || true

Report:

stale execution lock or none
currently running relevant processes
whether port 18789 appears bound locally
0.6 — Visible Environment Variables

Run:

for var in RPC_URL AGI_ALPHA_MCP ANTHROPIC_API_KEY OPENAI_API_KEY GITHUB_TOKEN \
           ETHERSCAN_KEY SUPABASE_KEY SUPABASE_URL PINATA_API_KEY PINATA_SECRET_API_KEY \
           TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID; do
  if [ -n "${!var}" ]; then
    echo "$var: SET"
  else
    echo "$var: MISSING"
  fi
done

Do not print values.

Report which missing variables are likely blockers for:

Track A
Track B
IPFS
notifications
archive/cache layers
0.7 — Dependency Audit

Run:

[ -f package.json ] && cat package.json || echo "NO_PACKAGE_JSON_AT_WORKSPACE_ROOT"
[ -f package-lock.json ] && echo "PACKAGE_LOCK_PRESENT" || echo "NO_PACKAGE_LOCK"
npm ls --depth=0 2>&1 | grep -E "UNMET|missing|error" || echo "No dependency issues detected by npm ls"

node -e "require('ethers'); console.log('ethers: OK')" 2>/dev/null || echo "ethers: MISSING"
node -e "require('axios'); console.log('axios: OK')" 2>/dev/null || echo "axios: MISSING"
node -e "require('@supabase/supabase-js'); console.log('supabase: OK')" 2>/dev/null || echo "supabase: MISSING"

If dependencies are broken, report the exact module names.

PHASE 1 — ON-CHAIN CONNECTIVITY & CONTRACT AUDIT

This must be run from the visible workspace only.

1.1 — RPC Connectivity

Run:

node - <<'EOF'
const { ethers } = require('ethers');

(async () => {
  try {
    if (!process.env.RPC_URL) {
      console.error('RPC_URL missing');
      process.exit(1);
    }
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const block = await provider.getBlockNumber();
    const network = await provider.getNetwork();
    console.log(`Block: ${block}`);
    console.log(`ChainId: ${network.chainId.toString()}`);
  } catch (e) {
    console.error('RPC FAILURE:', e.message);
    process.exit(1);
  }
})();
EOF

Report:

block number
chain ID
whether chain ID is 1
whether RPC is a hard blocker
1.2 — Locate Visible ABI Sources

You must first find where the visible workspace stores ABIs.

Run:

find . -type f | grep -E "AGIJobManager|AGIJobDiscoveryPrime|abi"

From actual results, determine the correct visible ABI paths.

If ABI files are missing, that is a blocker.

1.3 — AGIJobManager Reachability

Using the actual visible ABI path, run a read-only contract reachability test against:

0xB3AAeb69b630f0299791679c063d68d6687481d1

Attempt:

presence of bytecode
one safe view call if ABI supports it
if the view call fails, distinguish between:
no code
wrong chain
ABI mismatch
function missing
revert
1.4 — AGIJobDiscoveryPrime Reachability

Using the actual visible ABI path, run a read-only contract reachability test against:

0xd5EF1dde7Ac60488f697ff2A7967a52172A78F29

Same reporting structure as above.

1.5 — Wallet & Identity Audit

You must not invent the wallet address. You must discover it from visible files.

Search for likely sources:

grep -Rni "0x6484\|wallet\|agent wallet\|HEARTBEAT\|identity\|address" . 2>/dev/null | head -100

Determine the actual visible configured wallet address.

Then audit:

ETH balance
AGIALPHA balance
whether balance appears sufficient
any visible identity/NFT checks implemented in code
whether the code depends on ENS, NFT, merkle proof, or authorization checks

If the audit cannot confirm a wallet address from visible files, report:
AGENT WALLET ADDRESS NOT CONFIRMABLE FROM VISIBLE WORKSPACE

1.6 — Authorization Check

Search visible code for:

grep -Rni "isAuthorizedAgent\|authorized agent\|authorization" . 2>/dev/null

If visible code invokes isAuthorizedAgent, inspect the implementation and determine whether a revert in that path would block Track B.

PHASE 2 — MCP / IPFS / EXTERNAL SERVICE CONNECTIVITY
2.1 — Locate MCP Client

Search for the visible MCP client implementation:

find . -type f | grep -E "mcp.*\.(js|ts)$|mcp_dev|prime-client|client"

Read the real file used by the workspace.

You must determine:

actual file path
actual exported interface
actual endpoint env var used
whether it uses JSON-RPC, HTTP, SSE, or wrappers
2.2 — MCP Reachability

Using the real visible MCP client, run the safest read-only call available, such as:

list_jobs
get_protocol_info
another read-only MCP method visible in code

If the visible client cannot be executed, report the exact import or runtime error.

Report:

reachable or unreachable
actual method tested
exact error on failure
whether MCP is a hard blocker for Track A and/or Track B
2.3 — Job Metadata Ingestion

If MCP works and visible code supports it, test the full read path:

list jobs
pick one job ID if present
get job details
fetch metadata/spec

Do not fake field names. Use the actual return structure from the visible client.

2.4 — IPFS / Pinata Path

Search visible code for:

grep -Rni "pinata\|ipfs\|IpfsHash\|upload_to_ipfs\|verifyIpfs" . 2>/dev/null

Determine:

actual upload function
actual verify/fetch-back function
actual env vars required

If a safe tiny test payload path is implemented, run it.

If not safe or not possible from visible code, report:
IPFS PATH PRESENT IN CODE BUT NOT SAFELY EXECUTABLE FROM THIS AUDIT CONTEXT

PHASE 3 — TRACK A DEEP AUDIT (AGIJobManager v1)

You must only inspect files that actually exist under the visible workspace.

3.1 — Locate Track A Entry Surface

Search:

find . -type f | grep -E "loop\.js$|orchestrator\.js$|discover\.js$|evaluate\.js$|execute\.js$|validate\.js$|submit\.js$|state\.js$|lock\.js$|recovery\.js$"

Map the real file set.

If expected files do not exist, say exactly which ones are missing.

3.2 — loop.js Static Audit

Read the visible Track A loop entry file.

Answer with evidence:

entry point structure
first function invoked
whether it imports orchestrator logic
whether it acquires/releases a lock
how it behaves when zero jobs exist
whether it includes any signer, wallet, sendTransaction, or broadcast logic
whether it appears safe for local dry-run execution
3.3 — Orchestrator Integrity

Read the visible orchestrator file.

Determine whether the actual pipeline is:

discover
evaluate
execute
validate
submit

or a different sequence.

Answer:

exact call order
whether artifact creation precedes state advancement
whether state writes appear atomic
whether handler routing exists
whether any signing or broadcast path exists
whether IPFS verification failure is hard-stop or soft warning
3.4 — Discovery Layer

Read the visible discovery module.

Answer:

actual MCP calls made
whether raw job spec is persisted
whether normalized spec is written
classification/handler routing criteria
whether discovery can operate with zero jobs without crashing
3.5 — Evaluation Layer

Read the visible evaluation module.

Answer:

deterministic scoring rules
whether an LLM is called
whether cache exists
whether LLM usage is gated to post-assignment only
whether more than one LLM call per job is possible
exact output structure
3.6 — Execution Layer

Read the visible execution module.

Answer:

what artifacts it writes
whether it uses handlers
whether it can run without external side effects
whether there are hidden signing paths
whether it is restart-safe or idempotent
3.7 — Validation Layer

Read the visible validation module.

Answer:

structural validation checks
IPFS publish flow
IPFS fetch-back verification
exact validation artifacts written
whether validation can pass without verified publication
3.8 — Submission Layer

Read the visible submission/tx packaging module.

Answer:

whether it emits unsigned tx packages
whether schema resembles emperor-os/unsigned-tx/v1
whether review checklist is included
whether any signing or broadcast occurs
whether writes are atomic
3.9 — State / Lock / Recovery

Read the actual visible state, lock, and recovery files.

Answer:

whether writes use tmp+rename atomicity
lock file structure
stale lock recovery behavior
whether crash recovery is implemented or only implied
whether state machine transitions are explicit
3.10 — Track A Dry Run

Only run a dry run if a safe dry-run or no-op mode clearly exists in visible code.

Examples:

node <actual loop path> --dry-run
node <actual loop path> --help

If no safe dry-run exists, do not improvise. Report:
NO SAFE TRACK A DRY-RUN ENTRY DETECTED

3.11 — Track A Assessment

State precisely:

RPC connectivity: GO / NO-GO
contract reachable + ABI usable: GO / NO-GO
wallet address confirmable: GO / NO-GO
MCP working: GO / NO-GO
IPFS path working: GO / NO-GO / UNKNOWN
no signing code found: GO / NO-GO
artifact-first pattern: GO / NO-GO / PARTIAL
atomic state writes: GO / NO-GO / PARTIAL
crash recovery: GO / NO-GO / PARTIAL
Track A overall: OPERATIONAL / PARTIALLY OPERATIONAL / BLOCKED

If blocked, list blockers in severity order.

PHASE 4 — TRACK B DEEP AUDIT (AGIJobDiscoveryPrime)
4.1 — Locate Track B File Set

Search:

find . -type f | grep -E "procurement_agent|prime-phase-model|prime-client|prime-inspector|prime-review-gates|prime-tx-builder|prime-artifact-builder|prime-monitor|prime-execution-bridge|prime-retrieval|prime-state|prime-orchestrator"

Map what actually exists.

4.2 — Phase Model Audit

Read the visible phase model.

Determine:

whether a full enumerated state machine exists
whether all expected phases exist
whether legal transitions are explicit
whether any *_READY phases are defined
whether terminal states exist
whether any path can hang with no defined next step
4.3 — Procurement Agent Main Loop

Read the visible procurement_agent.js.

Answer:

startup sequence
where it loads persisted state from
whether no-procurement case is graceful
where it stops for operator
whether commit salt is generated and how
whether salt could be logged
whether any signing/broadcast path exists
whether the agent is restart-safe
4.4 — Inspector / Review Gates / Tx Builder

Read those visible files.

Determine:

actual inspection bundle contents
exact review gate checks
whether failed gates fail loudly
whether tx builder creates unsigned packages only
whether review checklists exist
whether trial readiness requires verified artifacts
whether any hidden signing logic exists
4.5 — Artifact Builder / State / Monitor

Read those visible files.

Determine:

artifact directory structure by phase
whether writes are atomic
whether reruns are handled safely
whether monitor calculates deadline urgency
whether monitor is restart-safe
whether state schema is explicit and durable
4.6 — Prime → Execution Bridge

If a visible bridge exists, inspect it.

Determine:

whether selected procurements hand off into execution
whether linkage artifacts are written
whether the handoff is idempotent
4.7 — Retrieval / Archive Use

Read the visible retrieval file and archive index logic.

Determine:

whether archive retrieval is used pre-application
whether retrieval output is structured
whether empty archive is handled gracefully
4.8 — Visible Live Procurement State

Inspect visible state and artifacts:

find . -type d | grep "proc_"
find . -type f | grep -E "procurement_state|state\.json" | sort

For each visible procurement state file, extract:

procurement ID
current phase
timestamps/deadlines if present
whether it appears stuck
4.9 — Track B Assessment

State precisely:

RPC connectivity: GO / NO-GO
contract reachable + ABI usable: GO / NO-GO
authorization dependency understood: GO / NO-GO / UNKNOWN
wallet address confirmable: GO / NO-GO
MCP working: GO / NO-GO
IPFS path working: GO / NO-GO / UNKNOWN
complete phase model: GO / NO-GO / PARTIAL
hard stops at *_READY: GO / NO-GO / PARTIAL
salt never logged: GO / NO-GO / CANNOT CONFIRM
no signing code found: GO / NO-GO
atomic writes: GO / NO-GO / PARTIAL
active visible procurements: YES / NO
Track B overall: OPERATIONAL / PARTIALLY OPERATIONAL / BLOCKED

If blocked, list blockers in severity order.

PHASE 5 — CROSS-CUTTING SECURITY & SAFETY
5.1 — Signing Boundary Verification

Run:

grep -Rni "\.sign\b" ./agent ./AgiJobManager ./AgiPrimeDiscovery ./core 2>/dev/null
grep -Rni "ethers\.Wallet" ./agent ./AgiJobManager ./AgiPrimeDiscovery ./core 2>/dev/null
grep -Rni "sendTransaction\|signTransaction\|broadcastTransaction" ./agent ./AgiJobManager ./AgiPrimeDiscovery ./core 2>/dev/null
grep -Rni "privateKey\|PRIVATE_KEY\|mnemonic\|MNEMONIC" ./agent ./AgiJobManager ./AgiPrimeDiscovery ./core 2>/dev/null

Do not suppress results.

Classify each hit as one of:

safe docs/comment/reference
suspicious
critical violation

Any real execution-path signing/broadcast code is a CRITICAL VIOLATION.

5.2 — Secret Exposure

Run:

grep -Rni "0x[0-9a-fA-F]\{64\}" . 2>/dev/null
grep -Rni "\.env\|execution\.lock\|commitment_material\|heartbeat-state" .gitignore 2>/dev/null || echo ".gitignore not visible"

Report:

any unexplained 64-byte hex values
whether .gitignore is visible
whether sensitive files appear ignored
5.3 — Lobster / Pipelines

Search:

find . -type f | grep -E "pipeline|lobster|\.yml$|\.yaml$"

Determine:

whether Lobster is present
whether pipeline definitions are visible
whether pipeline files appear valid
whether the local workspace seems runnable without unseen external pipeline definitions
5.4 — OpenClaw Gateway

Run:

curl -s http://127.0.0.1:18789/health 2>/dev/null || echo "OPENCLAW_HEALTH_UNREACHABLE"
curl -s http://localhost:18789/health 2>/dev/null || echo "LOCALHOST_18789_UNREACHABLE"
ps aux | grep openclaw | grep -v grep

Report:

whether OpenClaw is running
whether gateway health responds
whether the local runtime appears live
5.5 — Memory / Archive

Inspect visible memory and archive state:

find . -maxdepth 3 | grep -E "memory|archive|heartbeat"

Determine:

whether memory files exist
whether heartbeat state exists
whether archive index exists
approximate visible archive size
whether capability reuse appears operational or only aspirational
PHASE 6 — REQUIRED FINAL REPORT FORMAT

You must produce the final report in exactly this structure, with real values.

═══════════════════════════════════════════════════════════════
EMPEROR_OS — WORKSPACE-SCOPED MASTER OPERATIONAL AUDIT REPORT
Date: [ISO8601]
Auditor: [model/session]
Visible root: /home/emperor/.openclaw/workspace
Audit mode: LOCAL WSL / WORKSPACE-ONLY
═══════════════════════════════════════════════════════════════

ENVIRONMENT
  Working directory:      [path]
  Node version:           [x.x.x]
  npm version:            [x.x.x]
  Lobster:                [version] / NOT FOUND
  OpenClaw gateway:       RUNNING / DOWN / UNKNOWN
  Git metadata:           AVAILABLE / NOT VISIBLE

VISIBLE STRUCTURE
  agent/:                 PRESENT / MISSING
  AgiJobManager/:         PRESENT / MISSING
  AgiPrimeDiscovery/:     PRESENT / MISSING
  core/:                  PRESENT / MISSING
  docs/:                  PRESENT / MISSING
  memory/:                PRESENT / MISSING
  archive/index:          PRESENT / MISSING

ON-CHAIN CONNECTIVITY
  RPC endpoint:           REACHABLE (block [N]) / UNREACHABLE
  Chain ID:               [N] (expected 1)
  AGIJobManager:          REACHABLE + ABI USABLE / ABI MISMATCH / UNREACHABLE
  AGIJobDiscoveryPrime:   REACHABLE + ABI USABLE / ABI MISMATCH / UNREACHABLE

AGENT IDENTITY
  Wallet address:         [0x...] / NOT CONFIRMABLE
  ETH balance:            [N] / NOT TESTED
  AGIALPHA balance:       [N] / NOT TESTED
  Authorization checks:   PRESENT / ABSENT / UNCLEAR
  Identity gating:        PRESENT / ABSENT / UNCLEAR

MCP & IPFS
  MCP client:             [path] / NOT FOUND
  MCP endpoint:           REACHABLE / UNREACHABLE / NOT TESTABLE
  Job ingest path:        WORKING / BROKEN / NOT TESTED
  IPFS path:              WORKING / BROKEN / UNKNOWN
  Fetch-back verify:      PASS / FAIL / UNKNOWN

ENVIRONMENT VARIABLES
  Missing critical vars:  [list] / NONE

SECURITY
  Signing code found:     NONE / YES [files:lines]
  Broadcast code found:   NONE / YES [files:lines]
  Secret exposure risk:   NONE / YES [details]
  .gitignore visible:     YES / NO

══════════════════════════════════════════════
TRACK A — AGIJobManager v1
══════════════════════════════════════════════
  Overall status:         OPERATIONAL / PARTIALLY OPERATIONAL / BLOCKED

  Visible files:
    loop.js:              PRESENT / MISSING
    orchestrator.js:      PRESENT / MISSING
    discover.js:          PRESENT / MISSING
    evaluate.js:          PRESENT / MISSING
    execute.js:           PRESENT / MISSING
    validate.js:          PRESENT / MISSING
    submit.js:            PRESENT / MISSING
    state.js:             PRESENT / MISSING
    lock.js:              PRESENT / MISSING
    recovery.js:          PRESENT / MISSING

  Execution findings:
    Entry path valid:     YES / NO
    Artifact-first:       YES / NO / PARTIAL
    Atomic writes:        YES / NO / PARTIAL
    Crash recovery:       YES / NO / PARTIAL
    No signing path:      YES / NO
    Safe dry-run path:    YES / NO

  BLOCKERS:
    1. [blocker or NONE]
    2. ...
  
  WARNINGS:
    1. [warning or NONE]

══════════════════════════════════════════════
TRACK B — AGIJobDiscoveryPrime
══════════════════════════════════════════════
  Overall status:         OPERATIONAL / PARTIALLY OPERATIONAL / BLOCKED

  Visible files:
    procurement_agent.js:       PRESENT / MISSING
    prime-phase-model.js:       PRESENT / MISSING
    prime-client.js:            PRESENT / MISSING
    prime-inspector.js:         PRESENT / MISSING
    prime-review-gates.js:      PRESENT / MISSING
    prime-tx-builder.js:        PRESENT / MISSING
    prime-artifact-builder.js:  PRESENT / MISSING
    prime-monitor.js:           PRESENT / MISSING
    prime-execution-bridge.js:  PRESENT / MISSING
    prime-retrieval.js:         PRESENT / MISSING
    prime-state.js:             PRESENT / MISSING
    prime-orchestrator.js:      PRESENT / MISSING

  Phase model:
    Enumerated phases:          COMPLETE / PARTIAL / MISSING
    Hard stops at *_READY:      YES / NO / PARTIAL
    Salt never logged:          CONFIRMED / CANNOT CONFIRM / VIOLATION

  Live state:
    Active procurements:        [N] / NONE
    Current visible phases:     [list] / NONE

  BLOCKERS:
    1. [blocker or NONE]
    2. ...
  
  WARNINGS:
    1. [warning or NONE]

══════════════════════════════════════════════
CROSS-CUTTING
══════════════════════════════════════════════
  Lobster operational:     YES / NO / UNKNOWN
  OpenClaw operational:    YES / NO / UNKNOWN
  Memory present:          YES / NO
  Archive present:         YES / NO
  Capability reuse path:   REAL / PARTIAL / ABSENT

══════════════════════════════════════════════
EXECUTIVE SUMMARY
══════════════════════════════════════════════

[Write 5–10 direct sentences. State what actually works now, what is actually broken now, and what is missing from the visible workspace. Do not speculate.]

IMMEDIATE ACTIONS REQUIRED
  1. [action — severity CRITICAL/HIGH/MEDIUM]
  2. [action — severity CRITICAL/HIGH/MEDIUM]
  3. ...
AUDIT EXECUTION RULES
Read every visible file you reference.
Run every command you claim to have run.
Report actual errors exactly.
Do not assume access outside /home/emperor/.openclaw/workspace.
Do not invent non-visible workflow files, secrets, or repo-root files.
If a dependency exists only outside workspace, report it as an external dependency not visible from this audit context.
No signing. No broadcasting. No state mutation except safe read-only inspection and explicitly harmless test payloads where a visible test path exists.
Security findings come first. If signing or broadcast code is present in execution paths, report that immediately as critical.
Distinguish clearly between:
missing
present but broken
present but not testable from this audit context
No speculation. Evidence only.
OPERATOR NOTE

If the agent discovers that the visible workspace is only a partial mirror of the true runtime, it must explicitly answer:

what is visible
what is not visible
whether the visible workspace alone is sufficient to run Emperor_OS locally
which missing external surfaces are blocking a definitive operational verdict
