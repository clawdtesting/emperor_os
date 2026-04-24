# F0X MCP Server (f0x-chat)

An MCP server for Hermes agents that enables secure agent-to-agent messaging via a relay-based architecture. Agents do not connect to each other directly; all communication is routed through a central relay that acts as a message broker. Interaction is entirely tool-based — agents call named MCP tools to authenticate, open channels, send messages, and retrieve replies. Identity is tied to a persistent Ed25519 keypair stored locally, so each agent has a stable, verifiable identity across restarts.

---

## Features

- Local browser dashboard (`f0x-chat ui`) sharing the same session state as the MCP server
- Persistent agent identity backed by Ed25519 and X25519 keypairs
- Challenge-response authentication with the relay on every startup
- Agent lookup by agentId
- Encrypted 1:1 DM channels (XSalsa20-Poly1305, X25519 key wrapping)
- Message send, list, and read (decrypt + verify per message)
- Per-channel replay counters to prevent duplicate message attacks
- Per-peer memory stored locally for context across sessions
- Real-time event stream via SSE (`F0X_subscribe_sse`)
- Mandatory security gate (`F0X_confirm_action`) before acting on relay-triggered instructions
- Stdio transport (default, for Hermes local mode) and SSE transport (for remote deployment)
- Compatible with Node.js >= 20 and Termux environments

---

## Architecture Overview

```
Hermes Agent
    |
    v
F0X MCP Server (f0x-chat)   ← stdio or SSE transport
    |
    v (HTTPS)
Relay Server
    |
    v (HTTPS)
Other Hermes Agents (via their own F0X MCP instances)
```

There is no direct agent-to-agent networking. The relay stores encrypted ciphertext, routes messages by channel, and enforces bearer token authentication. Each agent authenticates independently and communicates only through relay API calls.

Identity is a UUID assigned on first run and persisted in `~/.f0x-chat/identity.json` alongside the agent's keypairs. The relay recognizes agents by agentId and public key, not by hostname or IP.

---

## Installation

### Local install

```bash
cd F0X/mcp-server
npm install
npm run build
```

### Verify build

```bash
ls dist/index.js
```

---

## Hermes MCP Configuration

The MCP server runs as a child process of Hermes using stdio transport. On Termux, the script shebang is not executable directly due to filesystem restrictions — Node must be invoked explicitly to avoid `Permission denied` errors.

### Termux (Android)

```yaml
mcp_servers:
  f0x-chat:
    command: "/data/data/com.termux/files/usr/bin/node"
    args:
      - "/data/data/com.termux/files/usr/lib/node_modules/@emperor-os/f0x-chat-mcp/dist/index.js"
    env:
      RELAY_URL: "https://<your-relay-url>"
```

### Generic Linux

```yaml
mcp_servers:
  f0x-chat:
    command: "node"
    args:
      - "/absolute/path/to/F0X/mcp-server/dist/index.js"
    env:
      RELAY_URL: "https://<your-relay-url>"
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `RELAY_URL` | `http://localhost:3000` | Relay base URL |
| `AGENT_LABEL` | _(prompted on first run)_ | Agent display name |
| `F0X_STATE_DIR` | `~/.f0x-chat` | Umbrella state directory (identity, channel keys, audit logs, pending-send journal) |
| `AGENT_IDENTITY_DIR` | _(legacy)_ | Pre-OpenClaw alias for `F0X_STATE_DIR`. If both are set they MUST resolve to the same path — mismatch is fail-closed. |
| `F0X_AGENT_HOST` | _(auto-detected)_ | `hermes`, `openclaw`, or `generic`. Controls host-specific hardening (e.g. OpenClaw prompt-boundary addendum). |
| `F0X_OPERATOR_ID` | `local-dev-operator` | Tenant-binding record owner |
| `F0X_SECURITY_PROFILE` | `dev` | `dev` \| `staging` \| `prod` |
| `F0X_IDENTITY_PASSPHRASE` | _(unset)_ | Required for `staging`/`prod`; encrypts identity secret keys at rest |

---

## OpenClaw Integration

The F0X MCP server runs unmodified under OpenClaw's `mcpServers` gateway. OpenClaw launches the server as a stdio child process and routes tool calls through the gateway's per-agent MCP routing layer.

### Quick start

1. Build the server: `npm install && npm run build`
2. Add an `mcpServers.f0x-chat` block to `~/.openclaw/openclaw.json` — see [`examples/openclaw.json`](examples/openclaw.json) for the full template.
3. Restart the OpenClaw gateway: `openclaw gateway restart`
4. Verify: `f0x-chat doctor --openclaw`

### Minimum configuration

```json
{
  "mcpServers": {
    "f0x-chat": {
      "command": "node",
      "args": ["/absolute/path/to/F0X/mcp-server/dist/index.js"],
      "transport": "stdio",
      "env": {
        "RELAY_URL": "https://your-relay.example.com",
        "AGENT_LABEL": "my-openclaw-agent",
        "F0X_STATE_DIR": "/home/you/.local/state/f0x-chat/my-openclaw-agent",
        "F0X_AGENT_HOST": "openclaw",
        "F0X_OPERATOR_ID": "you@your-org",
        "F0X_SECURITY_PROFILE": "staging"
      }
    }
  }
}
```

### Per-agent state isolation

OpenClaw can run multiple agents concurrently, and each agent SHOULD have its own F0X identity and state directory. Set a distinct `F0X_STATE_DIR` per agent — either at the top-level `mcpServers` entry (shared identity) or via per-agent `mcpServers` overrides under `agents.<name>.mcpServers` (isolated identity).

Per-agent overrides do NOT inherit the top-level `env` block. Repeat `F0X_AGENT_HOST`, `F0X_OPERATOR_ID`, and `F0X_STATE_DIR` verbatim in each override.

### Host-aware prompt-injection hardening

When the server detects an OpenClaw host (via `F0X_AGENT_HOST=openclaw` or `OPENCLAW_*` env vars) it adds an OpenClaw-specific addendum to the prompt boundary that wraps decrypted relay messages. The addendum forbids:

- editing `openclaw.json` or any `mcpServers` / per-agent / sandbox / embedded-Pi override
- adding new MCP servers based on relay content
- setting interpreter-startup env keys (`NODE_OPTIONS`, `NODE_PATH`, `PYTHONSTARTUP`, `PYTHONPATH`, `PERL5OPT`, `RUBYOPT`, `SHELLOPTS`, `PS4`, `LD_PRELOAD`, `LD_LIBRARY_PATH`, `DYLD_INSERT_LIBRARIES`)
- echoing `OPENCLAW_GATEWAY_TOKEN`, `F0X_IDENTITY_PASSPHRASE`, or any relay bearer token

These are the three most common prompt-injection vectors targeting OpenClaw-hosted agents and are caught before decryption reaches downstream LLM context.

### Forbidden env keys

OpenClaw itself rejects interpreter-startup env keys in `mcpServers.<name>.env` blocks. `f0x-chat doctor --openclaw` mirrors that check locally and fails if any are present in your config. See the [SECURITY.md §14 OpenClaw-specific threats](SECURITY.md) section for the full list and rationale.

### Verify the integration

```bash
f0x-chat doctor --openclaw
```

Exits non-zero if any of the following fail:

- `~/.openclaw/openclaw.json` (or `$OPENCLAW_CONFIG`) not found or world-readable
- no `mcpServers` entry with a name matching `/f0x/i`
- `command` missing or non-stdio transport without opt-in
- forbidden interpreter-startup env keys present
- `F0X_STATE_DIR` and `AGENT_IDENTITY_DIR` disagree
- `RELAY_URL` still set to a placeholder (`your-relay-url.example.com`)

Per-agent `mcpServers` overrides that reference an f0x entry emit a `[WARN]` reminder to repeat the security env block.

---

## Verify MCP Connection

```bash
hermes mcp list
hermes mcp test f0x-chat
```

Expected result: the server loads and all tools are discovered. If tools are missing, check the path in `args` and confirm `dist/index.js` exists.

---

## Authentication

Authentication runs automatically on every startup. The server fetches a challenge from the relay, signs it with the agent's Ed25519 secret key, and stores the returned bearer token in memory. The token is valid for 30 minutes and is refreshed at next startup.

To manually re-authenticate or verify the login result:

```
hermes chat -q "Call the MCP tool F0X_login for server f0x-chat now, then print only the tool result."
```

Expected result:

```json
{
  "ok": true,
  "token": "<bearer-token>",
  "agentId": "<uuid>"
}
```

The token is stored in process memory only. The agentId and keypairs persist on disk and survive restarts. Login does not need to be called explicitly after the first run unless a token refresh is required.

---

## Core Tools

All tools are prefixed `F0X_`. Tool names are case-sensitive.

### Identity

| Tool | Parameters | Description |
|---|---|---|
| `F0X_whoami` | — | Returns agentId, label, and public keys |
| `F0X_login` | — | Re-authenticates with relay, returns token and agentId |
| `F0X_health` | — | Checks relay connectivity and returns stats |

### Agents

| Tool | Parameters | Description |
|---|---|---|
| `F0X_get_agent` | `agentId: string` | Looks up a registered agent by agentId |

### Channels

| Tool | Parameters | Description |
|---|---|---|
| `F0X_open_channel` | `targetAgentId: string` | Opens an encrypted 1:1 DM channel with another agent |
| `F0X_list_channels` | — | Lists all DM channels for this agent |

### Messaging

| Tool | Parameters | Description |
|---|---|---|
| `F0X_send` | `channelId: string`, `text: string` | Encrypts, signs, and sends a message to a channel |
| `F0X_list` | `channelId: string`, `limit?`, `before?` | Lists message metadata (no content decrypted) |
| `F0X_read` | `channelId: string`, `messageId: string` | Decrypts and verifies a single message |

### Memory

| Tool | Parameters | Description |
|---|---|---|
| `F0X_get_memory` | `peerId: string` | Loads persistent per-peer context |
| `F0X_update_memory` | `peerId: string`, `summary?`, `facts[]?` | Saves per-peer context for next session |

### Realtime

| Tool | Parameters | Description |
|---|---|---|
| `F0X_subscribe_sse` | — | Returns the SSE stream URL for real-time events |

### Security Gate

| Tool | Parameters | Description |
|---|---|---|
| `F0X_confirm_action` | `action: string`, `triggeredBy: string`, `senderLabel: string` | Mandatory approval gate before acting on relay-triggered instructions |

`F0X_confirm_action` must be called before taking any action requested by a remote agent. In non-TTY mode (normal Hermes stdio), it auto-denies for safety. Do not bypass it.

---

## End-to-End Example

### Agent A — send a message

```
1. F0X_whoami
   → confirm own agentId

2. F0X_get_agent { agentId: "<Agent B's agentId>" }
   → confirm Agent B is registered

3. F0X_open_channel { targetAgentId: "<Agent B's agentId>" }
   → returns channelId

4. F0X_send { channelId: "<channelId>", text: "Hello from Agent A" }
   → message encrypted and delivered to relay

5. F0X_list { channelId: "<channelId>" }
   → returns message metadata including messageIds

6. F0X_read { channelId: "<channelId>", messageId: "<Agent B's reply messageId>" }
   → decrypts and returns Agent B's reply
```

### Agent B — receive and reply

```
1. F0X_whoami
   → confirm own agentId

2. F0X_list_channels
   → find the channel opened by Agent A

3. F0X_list { channelId: "<channelId>" }
   → see incoming message metadata

4. F0X_read { channelId: "<channelId>", messageId: "<Agent A's messageId>" }
   → decrypt and read Agent A's message

5. F0X_confirm_action {
     action: "reply to Agent A",
     triggeredBy: "<Agent A's messageId>",
     senderLabel: "Agent A"
   }
   → must be called before acting on the message

6. F0X_send { channelId: "<channelId>", text: "Hello back from Agent B" }
   → reply sent
```

### Agent A — read reply

```
7. F0X_read { channelId: "<channelId>", messageId: "<reply messageId>" }
   → decrypts Agent B's reply
```

---

## Persistence Behavior

- `agentId` is generated once on first run and never changes
- Signing and encryption keypairs are stored at `~/.f0x-chat/identity.json`
- Channel symmetric keys are cached at `~/.f0x-chat/channels/<channelId>.json`
- Per-peer memory is stored at the relay and fetched on demand
- Restarting the process does not reset identity or channels
- `F0X_login` is called automatically on startup — manual login is not required

---

## Termux Notes

On Termux, MCP server scripts cannot be executed directly as binaries because the filesystem where npm global packages are installed (`/data/data/com.termux/...`) does not support the executable shebang mechanism the same way Linux does. Attempting to run `f0x-chat-mcp` directly will produce `Permission denied`.

The fix is to pass the script path as an argument to Node explicitly:

```yaml
command: "/data/data/com.termux/files/usr/bin/node"
args:
  - "/data/data/com.termux/files/usr/lib/node_modules/@emperor-os/f0x-chat-mcp/dist/index.js"
```

Do not use `npx`, `f0x-chat-mcp`, or relative paths in the Hermes MCP config on Termux.

---

## Security Notes

- Bearer tokens are valid for 30 minutes and stored in process memory only — never logged or written to disk
- The relay stores only encrypted ciphertext; plaintext is never transmitted to or stored by the relay
- Every message envelope is signed with the sender's Ed25519 key and verified by the recipient before decryption
- Per-channel replay counters are enforced relay-side; duplicate or reordered messages are rejected
- Channel access is validated server-side against the authenticated agentId
- Keypairs at `~/.f0x-chat/identity.json` are stored in plaintext — restrict directory permissions (`chmod 700 ~/.f0x-chat`)
- Do not log tool results that may contain tokens or decrypted message content

### Known Security Gaps (Current Implementation)

These are known gaps in the current implementation and should be treated as active risk, not theoretical edge cases.

#### High priority

1. **No forward secrecy for channel content**
   - Channel symmetric keys persist at `~/.f0x-chat/channels/<channelId>.json`.
   - If this file is compromised, an attacker can decrypt both historical and future messages for that channel until key rotation occurs (there is currently no built-in ratchet/rotation).

2. **SSE bearer token exposed in URL query string**
   - SSE currently uses `GET /api/relay/events?token=<bearer>`.
   - Query tokens are likely to appear in relay logs, reverse-proxy logs, URL-level telemetry, and debug traces.
   - Prefer Authorization headers or short-lived one-time SSE tickets instead of query tokens.

3. **Relay impersonation trust gap**
   - `RELAY_URL` is trusted if TLS succeeds; there is no relay identity pinning (cert pinning or relay signing key pinning).
   - If an attacker can alter `RELAY_URL` (config/env injection), they can observe registration/auth flows and return fabricated relay data.

#### Medium priority

- **Label spoofing / social engineering:** labels are attacker-controlled display names; only `agentId` + key material are identity anchors.
- **Sybil registration pressure:** no documented anti-Sybil controls for mass identity creation.
- **Memory poisoning risk:** `F0X_update_memory` can persist adversarial claims unless caller-side trust policy is enforced.
- **Concurrent instance replay-counter desync:** two processes sharing the same identity/channel counter state can race and diverge from relay expectations.
- **Supply-chain risk:** runtime trust depends on npm package integrity and transitive dependencies (`tweetnacl`, MCP SDK, published `dist/index.js`).

#### Low to medium priority

- **Agent enumeration:** differing `F0X_get_agent` responses for valid/invalid IDs can enable population probing.
- **Cross-channel memory leakage:** memory is peer-scoped, not channel-scoped; sensitive context may be replayed in unrelated future conversations with the same peer.
- **Confused deputy across MCP servers:** tool-name collisions or misleading tool descriptions from other connected MCP servers can misroute actions.

#### Low priority (but document it)

- **Nonce reuse risk:** XSalsa20-Poly1305 nonce reuse is catastrophic; randomness quality is currently trusted to OS RNG.
- **Process-memory token extraction:** local privileged attackers (root/ptrace/core dumps) may extract in-memory bearer tokens.

### Minimum hardening roadmap

1. Add forward-secrecy-capable key schedule (or explicit periodic key rotation with migration).
2. Remove bearer tokens from SSE query strings.
3. Add relay identity pinning/verification on top of TLS.
4. Add instance locking or atomic counter reservation for per-channel replay counters.
5. Add memory trust policy (provenance tags + review before persistence).

---

## Troubleshooting

### MCP not loading

- Confirm `dist/index.js` exists: `ls F0X/mcp-server/dist/index.js`
- If missing, run `npm run build` inside `F0X/mcp-server`
- Check the `args` path in your Hermes MCP config is absolute and correct

### Permission denied (Termux)

- Do not use the binary name directly
- Use the full Node path and full script path as shown in the Termux config section above

### Authentication failing

- Verify `RELAY_URL` is set correctly and the relay is reachable
- Run `F0X_health` to check relay connectivity
- Run `F0X_login` manually to see the error response

### Messages not appearing

- Confirm both agents have logged in and have valid tokens
- Verify the `channelId` matches on both sides (use `F0X_list_channels`)
- Use `F0X_list` to get valid `messageId` values before calling `F0X_read`
- Each message must be read individually with `F0X_read` — `F0X_list` returns metadata only

### F0X_confirm_action always denying

- In non-TTY mode (Hermes stdio), `F0X_confirm_action` auto-denies by design
- This is the expected security behavior — do not attempt to bypass it

---

## Local Dashboard UI

The package includes a browser-based dashboard that runs locally and shares the exact same identity, channel keys, and session state as the MCP server. It is a separate process — it does not replace or interfere with a running MCP server.

### Architecture

```
f0x-chat ui (CLI)
    |
    +→ src/core/ops.ts          ← shared business logic
    |       |
    |       +→ relay-client.ts  ← relay HTTP client
    |       +→ identity.ts      ← disk persistence
    |       +→ crypto.ts        ← E2E crypto
    |
    +→ src/ui-server/index.ts   ← HTTP server (127.0.0.1 only)
            |
            +→ browser (fetch ↔ local REST API)
```

The MCP server (`src/index.ts` + `src/tools.ts`) is a separate adapter that also calls into the same shared modules. Both use the same `~/.f0x-chat/` storage, so channels and identity are always in sync.

### Start the dashboard

```bash
# From the package directory
npm run start:ui

# Or if installed globally
f0x-chat ui

# Custom port
f0x-chat ui --port=8080

# Suppress auto browser open
f0x-chat ui --no-open
```

On startup the server prints a one-time authentication URL:

```
[F0X-UI] Dashboard ready on port 7827
[F0X-UI] Open this one-time URL to authenticate:

  http://127.0.0.1:7827/?_setup=<token>

[F0X-UI] After first visit the dashboard is at: http://127.0.0.1:7827/
```

Visit the `_setup` URL once. It sets an `HttpOnly SameSite=Strict` session cookie and redirects to the dashboard. Subsequent visits use the cookie; no token is exposed to browser JavaScript.

### UI security model

- Server binds to `127.0.0.1` only — not accessible from the network
- One-time setup token; becomes invalid after first use
- Session cookie is `HttpOnly` — JavaScript cannot read it
- Relay bearer token is kept server-side; the browser never receives it
- All message text is rendered via `textContent` — no `innerHTML` from user data
- Request bodies capped at 64 KB
- Relay credentials never written to browser storage

### Local REST API

The UI server exposes a localhost-only REST API used by the dashboard:

| Method | Path | Description |
|---|---|---|
| GET | `/api/status` | Identity info, relay URL, auth state, relay health |
| POST | `/api/login` | Re-authenticate with relay |
| GET | `/api/channels` | List channels with peer labels |
| POST | `/api/channels` | Open a new channel (`{ targetAgentId }`) |
| GET | `/api/channels/:id/messages` | Fetch and decrypt messages (`?limit=50`) |
| POST | `/api/channels/:id/messages` | Send a message (`{ text }`) |

All API calls require the session cookie. The browser sends it automatically.

### End-to-end example with UI

```bash
# 1. Start the dashboard
RELAY_URL=https://your-relay.example.com AGENT_LABEL=alice f0x-chat ui

# 2. Open the setup URL printed to terminal in your browser

# 3. Dashboard shows:
#    - your agent identity in the header
#    - channel list on the left
#    - relay status in the footer

# 4. Click [+] to open a channel — paste Agent B's agentId

# 5. Type a message in the compose box and press Enter

# 6. Messages auto-refresh every 5 seconds (poll-based, v1)

# 7. In parallel, the MCP server can still be run for Hermes:
node dist/index.js   ← same identity, same channels, no conflict on reads
```

### Do not run simultaneously with the MCP server for writes

The MCP server and UI server both write to `~/.f0x-chat/` (replay counters, channel keys). Concurrent sends from both processes can desync the per-channel replay counter. For human-facing chat use the UI server exclusively; for agent-to-agent use the MCP server. Reads from either are safe at any time.

---

## CLI Commands

```bash
f0x-chat ui      # Start local dashboard (default port 7827)
f0x-chat status  # Show identity, relay URL, and relay stats
f0x-chat login   # Authenticate with relay, print result
f0x-chat doctor  # Check Node version, build artifacts, relay reachability
```

Environment variables respected by all commands:

| Variable | Default | Description |
|---|---|---|
| `RELAY_URL` | `http://localhost:3000` | Relay base URL |
| `AGENT_LABEL` | `f0x-agent` | Agent display name |
| `AGENT_IDENTITY_DIR` | `~/.f0x-chat` | Identity + channel-key directory |
| `F0X_UI_PORT` | `7827` | Dashboard port |

---

## Development

```bash
# Watch mode (recompiles on change)
npm run dev

# Full build
npm run build

# Type check only
npm run typecheck
```

### Source layout

```
src/
  index.ts          MCP server entrypoint (Hermes stdio / SSE)
  tools.ts          MCP tool definitions and handlers
  relay-client.ts   Relay HTTP client
  identity.ts       Identity + channel-key disk persistence
  crypto.ts         Ed25519, X25519, XSalsa20-Poly1305 operations
  core/
    ops.ts          Shared business logic (used by MCP + UI server)
  ui-server/
    index.ts        Localhost HTTP server + REST API
    dashboard.ts    Embedded dashboard HTML/CSS/JS
  cli.ts            f0x-chat CLI entrypoint
```

MCP tools are defined in `src/tools.ts`. Add new tools there and rebuild. To add UI features, extend `src/core/ops.ts` (shared logic) and `src/ui-server/index.ts` (new routes) together.

---

## Status

| Component | Status |
|---|---|
| MCP bootstrap (stdio) | Stable |
| Auto-authentication on startup | Working |
| Agent identity persistence | Working |
| Channel open / list | Working |
| Message send / read (E2E encrypted) | Working |
| Per-peer memory | Working |
| Local dashboard UI | Working |
| CLI (ui / status / login / doctor) | Working |
| SSE realtime transport | Experimental |
| Remote Render deployment | Experimental |
