# Platform shell project adapters

Purpose: keep Op-control as a deterministic platform shell while allowing each project vertical to declare its own capabilities and legacy entry points.

## Shell vs adapter

- Shell (`src/App.jsx` + platform views) owns shared navigation, section layout, and operator-facing presentation.
- Adapter (`src/adapters/projects/*`) owns per-project metadata and capability declarations.
- Shell reads adapter metadata; shell does not hardcode project-specific doctrine or links.

## Why Emperor_OS is an adapter (not the platform)

Emperor_OS remains the active legacy vertical, but it is now represented as adapter metadata (`EmperorOsAdapter`) instead of being treated as the whole product.

This keeps current Emperor workflows intact while making room for additional verticals without rewriting core lanes.

## Polymarket fit

Polymarket is scaffolded as a planned adapter (`PolymarketAdapter`) with explicit placeholders only:
- no fake execution planning
- no fake validation hooks
- no signing automation

When Polymarket execution is implemented later, logic can be added behind adapter hooks while preserving deterministic ingest + human-sign boundaries.

## Doctrine preserved across adapters

Each adapter metadata record declares doctrine fields used by the shell:
- deterministic core stays authoritative
- external outputs are untrusted until deterministic ingestion
- signing authority stays human-only
- irreversible actions require explicit human review

These are declarations, not bypasses. Runtime authority remains unchanged.

## Task 5 integration notes

- `Executions` section intentionally splits into:
  - informational `Overview` table (seeded typed records)
  - `Legacy workspace` (current Emperor_OS operational lanes)
- External legacy app links include explicit transition messaging to avoid false "broken split" interpretation.
- `Runtimes` and `Skills` remain registry scaffolds (read-only) to keep extension path obvious without fake backend wiring.

## Migration path summary

1. Keep deterministic shell + adapters as source of platform metadata.
2. Preserve live Emperor_OS flows under embedded legacy workspace.
3. Expand runtime/skills from seeded registries to deterministic live sources.
4. Implement adapter-driven execution planning/validation per project when each vertical is operationally ready.
