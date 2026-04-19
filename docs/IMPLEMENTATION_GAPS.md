# Implementation Gaps (Live)

This file is the present-tense gap tracker. No historical notes.

## Runtime gaps
- End-to-end deterministic validation coverage is uneven across job lanes (especially around edge-case reconciliation and restart-time consistency checks).
- Artifact schema standardization is still mixed across legacy and newer modules.

## Prime gaps
- Validator scoring lifecycle support is present but not fully operator-runbooked for all failure/deadline edge cases.
- Some Prime phase artifacts are generated inconsistently across paths (monitor/orchestrator/manual flow differences).

## Mission Control gaps
- Dashboard/operator state and local artifact state are not yet a single canonical source of truth.
- Some operator actions still rely on local/manual file inspection instead of fully surfaced UI checklists.

## Validation / retrieval / compounding gaps
- Retrieval-before-generation is now enforced as a v1 completion packaging gate (missing retrieval packet blocks `submit`), but remains non-uniform across all lanes/paths.
- Stepping-stone extraction and archive indexing are not consistently required at terminal completion for every job/procurement.
