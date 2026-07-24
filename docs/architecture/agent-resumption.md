# Resumption (H11) — design

**Status:** design · **Date:** 2026-07-23
**Author:** Claude (dev lead) · **Trigger:** last open component of the
[Agent Harness](./agent-harness.md) (H11), and the last Hermes-benchmark gap in
[`flowpilot-2.0.md`](./flowpilot-2.0.md).
**Depends on:** the Trace read model (H10) — a run's identity and checkpoints are the same thing.

---

## 0. What "resumption" actually means here — and what's already done

"Resumption" is often stated as one thing. In FlowWink it is **two**, and the recon
(2026-07-23) shows they are at very different maturity:

### A. Approval resumption — **SHIPPED**, one edge case open
A heartbeat stages a trust-approve action → it returns `pending_approval` → a human approves
→ **something must re-execute it.** This was the acute FINDING-1 dead-end (a 24-row graveyard
of approved-but-never-run actions on dev). It is built:

- `runFollowThroughPrePass()` (flowpilot-heartbeat) → `flowpilot-lifecycle?task=followthrough`
  runs approved actions **before** the operator reasons about new work, feeds the result into
  the cycle's context, is idempotent, and never retries failures.
- A 5-min cron does the low-latency sweep; the pre-pass makes the loop self-contained.

**Empirical state (corrected after Phase 0 recon, 2026-07-23):** liteit 1, www 2 rows were
stuck in `status='approved'`. The follow-through selector has **no skill filter** — it would
route any skill. The real cause was the **48h window**: the rows (liteit's
`update_skill_instructions` from 07-16, www's `social_post_batch` from 06-09/10) had aged out
before a sweep ran, and nothing terminal-states an aged-out approval, so they lingered.

Crucially, re-running them would be **wrong**, which is why the window is correct:
- www's 6-week-old `social_post_batch` is **stale** — it would post old content now.
- liteit's `update_skill_instructions` is **superseded** — a newer ship (this week's grounding
  + slug + cadence fixes) already replaced write_blog_post's instructions; re-applying the
  Curator's 07-16 text would *regress* them.

**Phase 0 (shipped 2026-07-23):** each follow-through sweep now terminal-states approvals
older than its window as `expired` — safe (never re-runs a stale/superseded action) and
visible (no silent graveyard). The 3 legacy rows were expired fleet-wide; the sweep keeps it
clear going forward, and surfaces an `expired` count in its pulse. Lesson for §2: an aged-out
approval is not resumable — resumption is for *paused* runs (window/rate-limit), not for
approvals that outlived their validity.

### B. Multi-step run resumption — **NOT built** (this doc's subject)
FINDING 2: a novel plan (an objective's `plan.steps`, e.g. P2P's 7 steps) is held **across
cron heartbeats**, each a fresh `reason()` with only 24h of activity context. There is no
explicit cursor — the loop **re-derives** "where am I" every heartbeat from what it sees in
`agent_activity`. When a heartbeat window ends mid-plan, a rate limit hits, or a step gates
to approval, the next heartbeat does not cleanly resume step N+1 — it reasons from scratch.

Pipeline-collapse (Phase 2, shipped) fixed this for **known** chains by turning them into
deterministic scripts. The gap is **dynamic** plans the operator composes at runtime. That is
H11.

---

## 1. The key realisation: a run is already a checkpoint

The Trace (H10) groups `agent_activity` by `trace_id` into a **run** with **ordered steps**.
That is 90% of a resumption substrate already sitting in the database:

- **Run identity** = `trace_id` (reason.ts stamps one per run; now an indexed column).
- **Completed steps** = the run's `agent_activity` rows (skill, verbatim args, status, outcome).
- **What's left** = the objective's `plan.steps` minus the steps already logged.

So resumption does **not** need a new event-sourcing engine. It needs to make the run's
*state* durable and cursored, and teach the pre-pass (which already resumes approved actions)
to also resume **paused runs** from their cursor.

> **A trace node is a resumption point.** The harness doc's claim, made real: the same record
> that lets you *see* a run lets you *continue* it.

---

## 2. Design

### 2.1 Durable run state (the checkpoint)

Promote the implicit run into an explicit, small record — `agent_runs`, keyed by `trace_id`:

| column | meaning |
|--------|---------|
| `trace_id` (PK) | run identity, shared with `agent_activity.trace_id` |
| `objective_id` | the plan this run advances (nullable — ad-hoc runs have none) |
| `status` | `running` · `paused` · `awaiting_approval` · `completed` · `failed` |
| `cursor` | index of the next unstarted `plan.steps` entry |
| `plan` | snapshot of the plan's steps at run start (so a mid-run objective edit can't corrupt resumption) |
| `paused_reason` | `window_ended` · `rate_limited` · `awaiting_approval` · `error` |
| `resume_after` | timestamp — don't resume before this (backoff / approval-poll) |
| `updated_at` | last checkpoint |

This is **derived-then-durable**: on first sight of a run the resumer can reconstruct it from
`agent_activity` + the objective's `plan` (no migration-day backfill needed); from then on the
loop checkpoints it explicitly. Cheap, idempotent, forward-dated migration.

### 2.2 Checkpoint discipline in the loop

After each plan step the loop advances the cursor and stamps `agent_runs` (`running`,
`cursor++`). When it must stop, it records **why**:

- **window ends / rate limit** → `paused` + `paused_reason` + `resume_after`.
- **step gates to approval** → `awaiting_approval` (the existing approval flow owns re-exec;
  §0.A already does this — the run just reflects it).
- **step errors** → `failed` (fail-open: a config typo pauses one run, never the operator).

Completed steps are **never re-run** — resumption is "continue", not "restart". This is the
whole safety property: idempotency on side-effects (already a platform law) means a
double-fired resume is harmless, and the cursor means it usually won't fire twice at all.

### 2.3 The resumer — generalise the pre-pass

`runFollowThroughPrePass` already runs **before** the operator reasons and completes
human-approved work. Extend the same pre-pass to also pick up **paused runs** whose
`resume_after` has passed, and continue each from its cursor:

```
heartbeat begins
  ├─ resume pre-pass:
  │    ├─ approved single actions        (SHIPPED — §0.A)
  │    └─ paused multi-step runs          (NEW — continue from cursor, re-reason only remaining steps)
  └─ then: reason() about new standing work
```

Deterministic where it can be (a step whose args are fully known re-fires without the model),
re-reasoning only the genuinely open steps. This is the Hermes "zero-context-cost turn"
applied to resumption: the completed prefix costs nothing to replay because it isn't replayed.

### 2.4 Trace shows it (H10 × H11)

The Trace read model gains the run's `status` + `cursor`, so a run reads as
**"paused 3/7 · awaiting approval"** or **"resumed, completed 7/7"**. Resumption stops being
invisible plumbing and becomes the most legible thing in the cockpit — which is the whole
point of naming the harness.

---

## 3. Build plan (phased)

| Phase | Scope | Owner |
|-------|-------|-------|
| **0 · Close the last stuck approvals** ✅ | The follow-through sweep expires approvals aged past its window (safe, visible); legacy rows cleared fleet-wide; guardrail. *(shipped 2026-07-23)* | backend |
| **1 · `agent_runs` + checkpoint** ✅ | agent_runs (RLS); reason loop checkpoints running→completed/failed (never-throw contract); Trace overlays durable lifecycle. Live-verified: a heartbeat run checkpoints and the Trace shows lifecycle=completed. *(shipped 2026-07-23)* | backend |
| **2 · Resumer pre-pass** ✅ | New `?task=resume`: reconciles interrupted runs (running+stale → paused) and injects a cursor-aware resume directive into the heartbeat, alongside follow-through. Live-verified: a 30-min-stale run reconciled and produced "plan 2/4 done, continue from step 3". *(shipped 2026-07-23)* | backend |
| **3 · Trace shows run state** | Surface `status` + `cursor` in the Trace read model and the Trace UI (the surface Lovable is building). | backend + Lovable |
| **4 · Sim proof** ❌ FOUND A REAL FLAW → directives gated | Live-heartbeat proof on sandbox (2026-07-23): reconcile + directive were correct, but the model IGNORED "do NOT repeat completed steps" and RE-RAN both completed write_blog_post steps (0→2 posts). A soft directive is insufficient for non-idempotent skills. **Response:** directive injection was GATED OFF by default; reconcile stays on (safe). Phase 2.5 must add a HARD no-repeat guard before directives can drive plans unattended. | backend |
| **2.5 · Hard no-repeat guard** ✅ | `buildResumeDirective` now returns a discriminated `ResumeOutcome`. It emits a `resume` directive **only** when every completed step is provably safe to re-run (`isPlanResumeSafe` — every completed step's skill is in the fail-closed `IDEMPOTENT_SKILLS` allowlist). A non-idempotent or unclassified completed step (write_blog_post — the Phase 4 case) yields `needs_review`: the run stays paused and surfaces in the Trace, never auto-driven. The opt-in flag is retired — the guard **is** the gate. *(shipped 2026-07-24)* | backend |

Phase 0 is a small, immediate win (clears real stuck rows). Phases 1–2 are the substrate.
Phase 4 is the acceptance gate — resumption is "done" only when the sim proves a killed run
resumes without double-firing. Phase 2.5 makes that guarantee structural: the Phase 4 double-
fire plan can no longer produce a directive at all, so no model is in the loop to disobey.

---

## 2.5 The hard no-repeat guard (opened by Phase 4)

Phase 4 proved the soft directive is not enough: told "steps 1–2 are done,
continue from 3", a live model re-ran steps 1–2 anyway. For an idempotent skill
that is harmless (the money core's `p_reference`/status guards absorb it); for a
non-idempotent one (write_blog_post creates a new row each call) it duplicates
real work. So resumption cannot rely on the model's obedience. Options for the
hard guard, to design next:

- **Per-step idempotency keys.** A plan step carries a key; the loop refuses to
  re-execute a step whose key already succeeded. Strongest, but needs every
  resumable skill to accept a key.
- **Cursor as a hard filter.** The resumer strips already-done steps from the
  plan it hands the loop, so the model never sees a completed step to re-run.
  Cheaper, and it matches the "continue, not restart" intent.
- **Resume only idempotent plans.** ✅ **CHOSEN (shipped 2026-07-24).** Classify a
  plan as resumable only when every completed step is idempotent; otherwise
  reconcile-and-notify (`needs_review`), don't auto-resume. Fail-closed: the
  `IDEMPOTENT_SKILLS` allowlist (money core + reads) is the only path to an
  auto-driven directive; everything else — write_blog_post, any send_*, unknown
  skills — stays paused for a human. Cheapest guard that eliminates the Phase 4
  failure structurally: the double-fire plan never yields a directive, so no
  model is in the loop to disobey. Lives in `resume-logic.ts` (pure, unit-tested).

The other two options remain the upgrade path: a declared `idempotent` property on
each skill (retires the hand-curated allowlist), then cursor-as-hard-filter or
per-step keys (lets even non-idempotent plans resume safely). The allowlist is the
pragmatic Phase 2.5 guard for the multi-step processes where resumption actually
matters (P2P, bookkeeping). The reconcile half (no zombie runs) is safe and on
everywhere regardless.

---

## 4. Non-goals

- **No general workflow engine.** This resumes the harness's own runs against an objective's
  plan; it is not a BPMN/DAG orchestrator. Known deterministic chains stay pipeline-collapsed.
- **No re-running completed side-effects.** Resume = continue from cursor. Idempotency is the
  backstop, the cursor is the intent.
- **No new run identity.** `trace_id` is the run key everywhere — Trace, checkpoint, resumer.
  One id, three uses.

---

## 5. Why now, and why this shape

The Trace (H10) just made runs first-class and queryable. Resumption is the same substrate
read the other way: H10 *shows* the run, H11 *continues* it. Building H11 on H10's checkpoints
means no second source of truth, and it closes the last Hermes-benchmark gap — after which the
harness is **complete and legible**, the actual product from `agent-harness.md`.
