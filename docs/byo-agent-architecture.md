# BYO Agent / BYO LLM Architecture

## Invariants

- No runtime private key usage.
- No adapter-side signing or broadcasting.
- External agent outputs are candidate packages only.
- Canonical artifacts, review manifests, and unsigned tx are produced only after deterministic validation.

## Canonical packet/result contracts

- `protocols/agent-job-packet.schema.json`
- `protocols/agent-job-result.schema.json`
- `protocols/agent-connection.schema.json`

## Deterministic ingest flow

1. Validate candidate schema.
2. Verify file scope inside allowed workspace prefixes.
3. Recompute authoritative hashes and reject mismatches.
4. Verify lane required artifacts + acceptance checks.
5. Produce validation report + canonical review payload.
6. Generate manifest + unsigned tx preview for human sign handoff.

## Adapter model

Implemented adapters:
- webhook
- hermes (webhook-compatible)
- openclaw (webhook-compatible)
- openai (direct LLM to candidate package)
- ollama (local model to candidate package)

All adapters terminate at candidate result package boundaries.
