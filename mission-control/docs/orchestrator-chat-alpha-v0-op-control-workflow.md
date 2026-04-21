# Orchestrator Chat Alpha v0 onboarding workflow for Op-control

Purpose: move `/home/emperor/workspace/Orchestrator-node/orchestratorchatalphav0` from "planned scaffold" to a usable project entry in Op-control without weakening human-sign or deterministic review boundaries.

## Current state

What exists now:
- Op-control already lists `Orchestrator Chat Alpha v0` as a project adapter.
- The source app exists at `/home/emperor/workspace/Orchestrator-node/orchestratorchatalphav0`.
- The app is a standalone Next.js 13 project with:
  - `npm run build`
  - `npm start`
- The app requires an injected browser wallet (`window.ethereum`) and explicitly throws if MetaMask or compatible wallet is missing.
- Ownership gating is currently ENS-based via `VerifyOwnershipComponent` and `src/utils/web3Utils.ts`.

What does not exist yet:
- no real Render deployment URL wired into Op-control
- no environment-gated external project entry button in Op-control
- no project-specific runbook shown to operators
- no deterministic ingestion/review bridge between Op-control and this app
- no MetaMask readiness/status surface in Op-control for this project

## Hard constraints

- Signing and broadcast authority remain human-only.
- Op-control must not sign, inject keys, or automate MetaMask actions.
- External app output remains untrusted until deterministically reviewed/ingested where relevant.
- If no real deployment URL exists, Op-control must not show a dead launch button.

## Target operator experience

From Op-control Projects page:
1. Operator sees `Orchestrator Chat Alpha v0`.
2. If deployment is not configured, card shows honest status:
   - "Render deployment not configured"
   - "Requires MetaMask-compatible browser wallet"
3. If deployment is configured, card shows:
   - `Open app`
   - `Open runbook`
4. Operator opens the app in a browser with MetaMask.
5. Operator connects wallet and verifies ENS/domain ownership.
6. Operator uses the chat/peer app directly.
7. Any outputs that later matter to Op-control are brought back through explicit deterministic review steps.

## Implementation workflow

### Phase 1: Deploy the app on Render (Docker)

Repository/app root:
- root directory: `Orchestrator-node/orchestratorchatalphav0`

Render service type:
- Web Service using Docker

Render service settings:
- root directory: `Orchestrator-node/orchestratorchatalphav0`
- environment: `Docker`
- Dockerfile: use the repo-local `Dockerfile`
- build command: none in Render UI (Docker build handles this)
- start command: none in Render UI (Docker `CMD ["npm", "start"]` handles this)

Current Dockerfile behavior:
- base image: `node:20-bullseye-slim`
- installs dependencies with `npm install`
- runs `npm run build`
- starts with `npm start`
- exposes port `3000`
- sets `HOSTNAME=0.0.0.0` for container-friendly startup

Recommended Docker follow-up:
- add a lockfile and switch to `npm ci` for reproducible builds
- verify no browser-only wallet assumptions are moved server-side

Expected result:
- a stable Render URL for the app
- browser-accessible HTTPS endpoint suitable for MetaMask usage
- deployment behavior controlled by the checked-in Dockerfile, not duplicated in Render commands

Validation:
- Render build succeeds from Dockerfile
- landing page loads
- MetaMask prompt appears in a browser with extension installed
- app fails honestly in browsers without injected wallet

## Phase 2: Add deployment config to Op-control

Goal: make Op-control show a live launch button only when a real deployment URL is configured.

Recommended approach:
- add optional environment variable in `mission-control` frontend build/runtime config:
  - `VITE_ORCHESTRATOR_CHAT_ALPHA_V0_URL`
- expose it through adapter metadata only when non-empty
- render project CTA conditionally from adapter metadata

Required code areas:
- `src/adapters/projects/orchestrator-chat-alpha-v0/OrchestratorChatAlphaV0Adapter.js`
- `src/App.jsx`
- relevant tests under `src/features/platform-shell/`

Behavior:
- if env var missing:
  - no external button
  - show explanatory copy
- if env var present:
  - show `Open app`
  - keep wording explicit: external app requires MetaMask and runs outside Op-control

## Phase 3: Add project runbook surface in Op-control

Goal: turn the card from passive metadata into an operator-ready workflow.

Recommended UI additions for this project card:
- requirement badges:
  - `MetaMask required`
  - `Render deployment`
  - `Human wallet only`
- small runbook block:
  1. Open app in wallet-enabled browser
  2. Connect MetaMask
  3. Verify ENS/domain ownership
  4. Join/connect to peer network
  5. Use chat
- status copy:
  - "No signing automation in Op-control"
  - "Wallet actions occur in MetaMask only"

This can stay metadata-driven initially.

## Phase 4: Add deterministic operator bridge back into Op-control

Only if needed for this product later.

If Orchestrator Chat Alpha v0 needs to hand artifacts or state back into Op-control, implement a separate explicit bridge:
- import/review package upload or URL handoff
- deterministic validation rules for accepted artifacts
- unsigned-only packaging for anything on-chain
- explicit operator review before irreversible actions

Do not do this by scraping browser wallet state or automating MetaMask.

## Phase 5: MetaMask-specific readiness requirements

What Op-control should communicate clearly:
- this project requires a browser with injected wallet support
- MetaMask connection happens in the external app, not inside Op-control
- wallet/network/account mismatch should be treated as operator-visible preflight state

Suggested preflight checklist to show in the project runbook:
- MetaMask installed
- correct network selected
- intended wallet account selected
- ENS/domain ownership matches expected identity
- app loads over HTTPS

## Concrete code changes still needed

1. Adapter configuration
- Extend `OrchestratorChatAlphaV0Adapter` to optionally expose:
  - `legacyEntry.externalUrl` or equivalent launch URL only when configured
  - requirement metadata: `requiresMetaMask: true`
  - operator runbook steps

2. Project-card rendering
- Teach `App.jsx` project cards to render project-specific requirement badges/runbook items.
- Keep buttons hidden when URL absent.

3. Tests
- add assertions for:
  - no launch URL when env var missing
  - launch URL present when configured
  - runbook/meta requirements visible in metadata

4. Docs
- update `mission-control/README.md` once real deployment wiring exists
- document actual Render URL source and operator launch flow

## Recommended first implementation slice

Minimal, production-safe slice:
1. Deploy Render app
2. Add env-gated external URL to orchestrator adapter
3. Add `Open app` button only when configured
4. Add MetaMask-required copy to project card
5. Add tests

That is enough to make the project genuinely accessible from Op-control without pretending deeper integration exists.

## Out of scope for first slice

- embedded iframe version inside Op-control
- wallet automation
- signing/broadcast from Op-control
- deep state sync between Op-control and orchestrator app
- artifact ingestion pipeline unless a real downstream need exists

## Acceptance criteria

- Orchestrator project no longer reads as generic scaffold once URL is configured
- Op-control shows a real launch button only when deployment exists
- Operator sees MetaMask requirement before launch
- No private keys enter Op-control
- No signing automation is introduced
- Build/tests still pass
