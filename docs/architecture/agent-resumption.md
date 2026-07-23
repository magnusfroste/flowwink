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

**Empirical state today:** liteit 1, www 2 `status='approved'` rows still stuck — all
`update_skill_instructions` from before the follow-through shipped (Curator's own approvals).
**Concrete first fix (Phase 0 below):** the follow-through executor doesn't route
`update_skill_instructions`, so Curator-approved instruction changes never apply. Small,
verifiable, and it clears the last stuck rows fleet-wide.

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
| **0 · Close the last stuck approvals** | Route `update_skill_instructions` (and any other Curator-approved skills) through the follow-through executor; clear the liteit/www stuck rows; guardrail. | backend |
| **1 · `agent_runs` + checkpoint** | Migration (idempotent, forward-dated); loop writes cursor/status after each step; reconstruct-on-first-sight. | backend |
| **2 · Resumer pre-pass** | Extend `flowpilot-lifecycle?task=followthrough` to resume paused runs from cursor; idempotent, bounded, never-retry-failures (same contract as today). | backend |
| **3 · Trace shows run state** | Surface `status` + `cursor` in the Trace read model and the Trace UI (the surface Lovable is building). | backend + Lovable |
| **4 · Sim proof** | `flowpilot:sim` fast-forward: start a 7-step plan, kill the heartbeat mid-run, assert the next heartbeat resumes at the cursor and completes without re-firing prior steps. | backend |

Phase 0 is a small, immediate win (clears real stuck rows). Phases 1–2 are the substrate.
Phase 4 is the acceptance gate — resumption is "done" only when the sim proves a killed run
resumes without double-firing.

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
