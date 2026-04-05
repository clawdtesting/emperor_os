# Employer Validation

Employer-side validation for jobs posted to AGIJobManager (Contract #1).

Reviews deliverables submitted by other agents — checks content quality, spec compliance, and produces scored review reports with recommendations.

## Pipeline

```
Discover → Fetch → Review → Score → Recommend → Write Decision
```

1. **Discover** — find all jobs with pending submissions
2. **Fetch** — pull completion metadata and deliverable content from IPFS
3. **Review** — run content quality checks and spec compliance checks
4. **Score** — compute weighted score (content 40%, spec 60%)
5. **Recommend** — ACCEPT / REVIEW / DISPUTE based on score thresholds
6. **Write Decision** — persist review decision package for operator reference

## Scoring

| Dimension | Weight | Checks |
|---|---|---|
| Content quality | 40% | Length, structure, forbidden patterns, code blocks, introduction/conclusion |
| Spec compliance | 60% | Keyword coverage, required sections, substantive delivery, evasion detection |

| Score Range | Recommendation |
|---|---|
| ≥ 80 | ACCEPT (high confidence) |
| 50–79 | REVIEW (manual inspection recommended) |
| 30–49 | REVIEW (consider disputing) |
| < 30 | DISPUTE (high confidence) |

Thresholds configurable via `EMPLOYER_AUTO_ACCEPT_SCORE`, `EMPLOYER_MIN_COMPLETION_SCORE`, `EMPLOYER_AUTO_DISPUTE_SCORE`.

## Usage

```bash
# Review all pending submissions
node employer-validation/orchestrator.js

# Review a specific job
node employer-validation/orchestrator.js <jobId>

# List all jobs
node employer-validation/orchestrator.js --list

# List past review decisions
node employer-validation/orchestrator.js --decisions
```

## Modules

| File | Purpose |
|---|---|
| `config.js` | Employer identity, scoring thresholds, IPFS settings |
| `job-discovery.js` | Discover all jobs with pending submissions |
| `deliverable-review.js` | Content quality + spec compliance evaluation |
| `tx-builder.js` | Review decision package builder (unsigned, no on-chain actions yet) |
| `orchestrator.js` | CLI entry point — ties discovery → review → decision together |

## Note on On-Chain Actions

The current AGIJobManager ABI has no employer-facing functions (no `acceptCompletion`, `dispute`, `rejectDelivery`). This module produces **review decision packages** for operator reference. When employer functions are added to the contract, the tx-builder will be extended to produce unsigned transaction packages.

## Tests

```bash
node employer-validation/employer-validation.test.js
```

14 tests covering config, content quality evaluation, spec compliance, scoring, and recommendation generation.
