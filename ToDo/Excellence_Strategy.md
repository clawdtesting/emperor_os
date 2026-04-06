# 🎯 Prime Procurement Excellence Strategy
> **The Golden Rule:** 1 LLM call per procurement. Use it to **enhance**, not generate.
---
## 📋 At a Glance
| Phase | What | When | LLM? |
|:---|:---|:---|:---:|
| 🔍 Discovery & Inspection | Analyze the spec | Days 1–2 | ❌ |
| 📊 Fit Evaluation | Score & decide | Days 2–3 | ❌ |
| ✍️ Application Draft | 5 variations → merge → enhance | Days 3–5 | ✅ |
| 🔐 Commit & Reveal | On-chain mechanics | Automatic | ❌ |
| 🧪 Trial Submission | 3 variations → merge → polish | Days 7–14 | ✅ |
| 🏆 Post-Selection | Execute & deliver | If winner | ❌ |
---
## 🔍 Phase 1: Discovery & Inspection
**Timeline:** Days 1–2 · **LLM calls:** 0
### What Happens
The monitor detects a new `ProcurementCreated` event. We fetch the job spec, linked job snapshot, and employer info. Deterministic scoring runs against the spec.
### 🧠 Strategy
**Don't rush.** Inspection is free — no LLM needed. Take the time to build a thorough **spec analysis matrix**:
- **Required sections & keywords** — what does the spec actually ask for?
- **Payout vs effort ratio** — is this worth our time?
- **Duration feasibility** — can we deliver quality work in the timeframe?
- **Employer reputation** — any history we can reference?
- **Competition level** — how many applicants are expected?
### 🛠️ To Build
- [ ] `spec_analysis.json` artifact in inspection bundle
- [ ] `determine_competition_level()` — estimate from `maxApplicants` + historical data
- [ ] `calculate_economic_viability()` — payout vs estimated effort
---
## 📊 Phase 2: Fit Evaluation
**Timeline:** Days 2–3 · **LLM calls:** 0
### What Happens
Deterministic scoring produces `fit_evaluation.json` with a `decision: "PASS" | "FAIL"`. The operator reviews and approves.
### 🧠 Strategy
**Be selective.** Only apply when all of these are true:
| Criteria | Threshold |
|:---|:---|
| Payout | > 50k AGIALPHA (configurable) |
| Duration | Feasible for quality work |
| Spec match | Aligns with our capability archive |
| Competition | < 10 applicants ideal |
### 🛠️ To Build
- [ ] `economic_threshold` in config
- [ ] `capability_match_score()` — compare spec against `archive/` stepping stones
- [ ] `competition_risk_score()` — factor of maxApplicants, duration, payout
---
## ✍️ Phase 3: Application Draft
**Timeline:** Days 3–5 · **LLM calls:** 1 ⚡
### The 5-Variation Deterministic Strategy
#### Step 1: Generate 5 Variations
Each variation emphasizes a different angle — all deterministic, zero LLM:
| # | Variation | Focus | Best For |
|:---:|:---|:---|:---|
| **V1** | 🔧 Technical | Architecture, methodology, depth | Technical specs, complex deliverables |
| **V2** | 📋 Process | Step-by-step plan, timelines | Process-heavy procurements |
| **V3** | 🛡️ Risk | Mitigation, contingency, QA | High-stakes, long-duration |
| **V4** | 🏅 Capability | Past experience, portfolio | Strong stepping stones in archive |
| **V5** | 💡 Innovation | Novel approaches, differentiation | Open-ended or creative specs |
#### Step 2: Score Each Variation
Deterministic scoring against the spec:
- **Keyword match** — does it hit the spec's required terms?
- **Section coverage** — every requirement addressed?
- **Specificity** — concrete details vs vague claims
- **Relevance** — aligned with employer's domain?
#### Step 3: Merge Top 2
Take the strongest sections from each. Resolve conflicts by preferring the more specific over the more general.
#### Step 4: The 1 LLM Call
**Input:** merged draft + spec + context
**Prompt:**
> "Elevate this application. Strengthen weak sections. Add specificity where vague. Maintain all factual claims. Do not invent capabilities."
**Output:** polished, submission-ready application
### ⏰ Timing Is Everything
```
Commit Window Timeline
├─────────────────────────────────────────────┤
Day 1        Day 3        Day 5        Day 7
  │            │            │            │
  ✗ NO         ✓ YES        ✓ YES        ✗ RISKY
  (too early)  (70-80%)     (sweet spot) (deadline)
```
- **Never submit on day 1** — zero advantage, sets a low bar
- **Target 70–80%** through the commit window
- **Never wait past 90%** — deadline risk is real
### 🛠️ To Build
- [ ] `generate_application_variations()` — 5 deterministic drafts
- [ ] `score_variation(variation, spec)` — deterministic scoring
- [ ] `merge_variations(top1, top2)` — intelligent merge
- [ ] `enhance_with_llm(merged_draft, spec, context)` — single LLM call
- [ ] `commit_window_progress()` — % of window elapsed
- [ ] `should_submit_now()` — returns true only at 70–80%
- [ ] Update `handleDraftApplication()` to use new pipeline
---
## 🔐 Phase 4: Commit & Reveal
**Timeline:** Automatic · **LLM calls:** 0
### What Happens
Commitment hash computed and submitted on-chain. Reveal window opens, application revealed.
### 🧠 Strategy
Purely mechanical — no LLM needed. Just ensure:
- Commitment salt is cryptographically secure
- Reveal transaction lands before deadline
### 🛠️ To Build
- [ ] Verify `prime-tx-builder.js` commit/reveal builders work correctly
- [ ] `verify_reveal_deadline()` — warning if < 4 hours remaining
---
## 🧪 Phase 5: Trial Submission
**Timeline:** Days 7–14 · **LLM calls:** 1 ⚡
### 🧠 Strategy
Same pattern: **deterministic draft → LLM refinement**. The trial is where you **prove capability** — make it concrete:
- Specific deliverables with timelines
- Methodology with milestones
- Risk mitigation plan
- Quality assurance process
- Communication plan
### The 3-Variation Trial Strategy
| # | Variation | Content |
|:---:|:---|:---|
| **V1** | 📅 Project Plan | Gantt-style milestones, timeline |
| **V2** | 🏗️ Technical Approach | Architecture + implementation details |
| **V3** | 🛡️ Risk Analysis | Contingency plans, mitigation strategies |
Merge best sections → 1 LLM call for polish.
### 🛠️ To Build
- [ ] `generate_trial_variations()` — 3 deterministic drafts
- [ ] `score_trial_variation()` — deterministic scoring
- [ ] `merge_trial_variations()` — intelligent merge
- [ ] Update `handleBuildTrial()` to use new pipeline
---
## 🏆 Phase 6: Post-Selection (If Winner)
**Timeline:** Execution phase · **LLM calls:** 0
### What Happens
Winner designated → job execution starts → deliverable produced → completion package built.
### 🧠 Strategy
- Reuse trial plan as execution blueprint
- Produce deliverable with high quality
- Build completion package with full artifact bundle
### 🛠️ To Build
- [ ] Verify `prime-execution-bridge.js` works correctly
---
## 🚀 Build Priority Order
Start here, work down:
1. **Spec analysis matrix** — `spec_analysis.json` + helpers
2. **Economic viability check** — `calculate_economic_viability()`
3. **5-variation application generator** — `generate_application_variations()`
4. **Variation scorer** — `score_variation()`
5. **Variation merger** — `merge_variations()`
6. **LLM enhancement wrapper** — `enhance_with_llm()`
7. **Commit window timing** — `should_submit_now()`
8. **3-variation trial generator** — `generate_trial_variations()`
9. **Trial merger** — `merge_trial_variations()`
---
## 📈 Key Metrics
| Metric | Target | Why |
|:---|:---:|:---|
| Application quality score | **> 80/100** | Deterministic baseline quality |
| LLM call efficiency | **< 500 in / < 2000 out** | Cost control |
| Submission timing | **70–80%** of window | Strategic positioning |
| Selectivity rate | **< 30%** of procurements | Quality over quantity |
| Win rate | **> 20%** of applications | Effectiveness |
| Time to submit | **2–3 days** after detection | Not rushed, not late |
---
## 🚫 Anti-Patterns to Avoid
| ❌ Don't | ✅ Do |
|:---|:---|
| Submit on day 1 | Wait until 70–80% of window |
| Use LLM from scratch | Deterministic draft → LLM enhance |
| Apply to everything | Be selective — quality over quantity |
| Generic templated apps | Spec-specific, tailored applications |
| Rush the trial | It's your proof of capability |
| Ignore economics | Some procurements cost more than they pay |