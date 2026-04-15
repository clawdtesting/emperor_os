# DiscoveryPrime v2 Validation + Validator Actions SOP

## Scope
- Use this for Procurement #0 / Job #0 lifecycle checks and validator scoring flow.
- Goal: avoid mistakes from IPFS issues, wrong wallet, wrong phase, or lost salt.

## Part A — Job v2 validation (Mission Control)

1. Open Mission Control and select the v2 job.
2. Run **Validate this job** first.
3. Treat **view brief / IPFS fetch** as optional display, not a blocker for validation.
4. Pass criteria for operational go:
   - verdict is not error
   - key checks pass (contract match, job exists, payout/spec/completion signals as expected)
5. If validation fails:
   - read failed checks list
   - fix source issue (contract mismatch / missing fields / MCP path) before any validator action

### Quick rule
- Validation lane = truth for operational readiness
- IPFS brief fetch = convenience only

## Part B — Validator scoring workflow (strict)

### Phase order (must be exact)
1. Wait until trial submission window fully closes.
2. Commit window: submit hidden commitment.
3. Reveal window: reveal exact same score and salt.
4. Wait for winner finalization.

### Before commit
- Use the same validator wallet you will use later for reveal.
- Prepare validator subdomain/path.
- Prepare validator proof array (JSON 0x values).
- Ensure AGIALPHA allowance is enough for bond.
- Bond baseline: **350 AGIALPHA per finalist score**.
- Choose finalist and score (0–100).
- Generate and safely store salt.

### At commit
- Submit hidden commitment (finalist + score + salt + wallet-bound data).
- Save validator receipt immediately (must include finalist, score, salt, subdomain, proof, tx hash).

### At reveal
- Use same wallet as commit.
- Reveal exact same finalist + score + salt + validator proof/subdomain.
- If any value differs, reveal can fail.

## Part C — Safety rules (non-negotiable)

- Never commit from one wallet and reveal from another.
- Never lose the salt.
- Never score before trial window closes.
- Never assume IPFS outage means contract state is wrong.
- Never proceed if phase gate says closed.

## Part D — Fast triage

### If IPFS fails
- Continue with validation lane and on-chain/MCP checks.
- Do not block operations on gateway-only errors.

### If commit/reveal button is locked
- You are in wrong phase window or wallet/network mismatch.

### If reveal fails
- Check exact match of: wallet, finalist, score, salt, subdomain, proof.

## Part E — GO / NO-GO checklist

### GO only if all true
- v2 validation lane run completed
- no critical failed checks
- correct phase window open
- validator wallet connected on correct network
- allowance covers intended commits
- receipt saved safely before leaving commit flow

### NO-GO
- If any checklist item above is false.
