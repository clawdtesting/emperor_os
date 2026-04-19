# Architecture Doctrine (Non-Negotiable)

This is the highest-authority architecture contract for this repository.

## 1) Artifacts are truth
- Every meaningful stage must emit durable artifacts on disk.
- If state claims completion, artifacts for that state must exist and be structurally valid.
- Logs, memory, and prompt context are never sufficient evidence.

## 2) State is explicit and restart-safe
- Job and procurement progression must live in persisted state files.
- No hidden transitions. No implicit advancement.
- Recovery must be possible from disk state + artifacts alone.
- Write state atomically and before/with side-effect boundaries where possible.

## 3) Unsigned-only boundary at irreversible actions
- Runtime must not hold private keys.
- Runtime must not sign or broadcast transactions.
- Irreversible actions must be prepared as unsigned packages for operator handoff.

## 4) Operator review before signing
- Operator is required at every irreversible boundary.
- Required pre-sign materials: unsigned tx package, decoded call, review checklist, artifact bindings.
- Runtime stops at READY/review states and waits for operator decision.

## 5) Bounded workspace and deterministic layout
- Runtime state and artifact paths must remain deterministic and inspectable.
- File layout must support audits, replay, and incident recovery without hidden dependencies.

## 6) Recovery and auditability are architecture
- Partial failures must be visible in state/artifacts.
- The system should fail loudly and legibly, not silently.
- Every consequential transition must be traceable to artifacts and state mutations.

## 7) Capability extraction is required
- Completion is not just deliverable submission.
- Jobs/procurements should leave reusable residue (templates, validators, retrieval packets, stepping stones) to support compounding performance.

---

Canonical operational context:
- [CURRENT_SYSTEM.md](./CURRENT_SYSTEM.md)
- [OPERATOR_INSTRUCTIONS.md](./OPERATOR_INSTRUCTIONS.md)
- [IMPLEMENTATION_GAPS.md](./IMPLEMENTATION_GAPS.md)
