# FlowPilot 2.0 — Design & Build Plan

**Status:** draft for review (Magnus) · **Date:** 2026-07-10
**Author:** Claude (dev lead) · **Trigger:** proof-weeks readiness + OpenClaw/Hermes architecture benchmark

---

## 1. Where we stand (the honest picture)

Tonight's campaign hardened **13 SMB processes** and the money core (idempotency, abort
guards, rounding seams, currency splitting) — all verified through the **MCP gateway path**
(`/rest/execute` → `agent-execute`, `agent_type='mcp'`). Those fixes are in shared skills +
handlers, so they apply to FlowPilot too.

But FlowPilot's **path to those skills is different**, and it "has had the least love":

| | External agent (OpenClaw) | FlowPilot (embedded operator) |
|---|---|---|
| Entry | MCP gateway `/rest/execute` | `flowpilot-heartbeat` cron → `reason()` ReAct loop |
| Retry model | **in-session, next turn** | **next cron heartbeat (minutes/hours later)** |
| Skill reach | `search_skills`/`execute_skill` | skill scorer narrows 300→~25/turn |
| State across steps | one continuous session | **must survive between heartbeats** |

The proof weeks depend on the *right column*. This doc is the plan to make it trustworthy.

## 2. Architecture benchmark verdict (2026-07)

The two dominant 2026 OSS agent frameworks split exactly along FlowWink's seam:
**OpenClaw** = gateway-first hub-and-spoke (great for personal assistants, many channels);
**Hermes Agent** (NousResearch) = agent-loop-first, container-native (industry consensus:
the right shape for **embedded / vertical domain agents**).

**FlowWink already has both, correctly placed:** FlowPilot is the embedded loop-first
operator; the MCP gateway serves only external agents crossing a trust boundary. **The
macro-architecture does not change.** The gaps are three *Hermes patterns* FlowPilot lacks —
each maps to a concrete build below.

## 3. Audit findings (verified on dev, 2026-07-10)

### FINDING 1 — Resumption is unbuilt (CRITICAL, proof-weeks blocker)
Nothing in the heartbeat/`reason()` loop loads or **re-executes an approved-but-unexecuted
activity**. Flow: heartbeat stages `book_expense_report` → returns `pending_approval` →
admin approves in `/admin/approvals` (`sync_agent_activity_on_approval` marks the
`agent_activity` row `approved`, but does **not** execute) → **nothing ever runs it.**

**Evidence:** dev has **24 `agent_activity` rows stuck in `status='approved'`** — a graveyard
of human-approved actions silently dropped, spanning money (`mark_payroll_paid`,
`invoice_from_timesheets`, `approve_expense_report`, `dispose_fixed_asset`,
`manage_salary_advance`), comms (`send_bulk_lead_email`, `reply_to_ticket_via_email`), and
content (`social_post_batch`). **FlowPilot cannot currently complete ANY trust-approve action
autonomously.** For a gateway agent this is masked (it retries in-session); for the
cron-driven operator it is a hard dead-end.

`agent_activity` already carries everything a resumer needs: `skill_id`, `skill_name`,
`input` (args), `status`, `approval_request_id`, `created_at`.

### FINDING 2 — Multi-step chains rely on ReAct persistence across heartbeats (HIGH)
P2P is 7 steps. Holding a chain across cron heartbeats (each a fresh reason() with only
24h activity context) is the fragile design. Hermes's answer: **collapse known pipelines
into deterministic scripts the loop invokes** ("zero-context-cost turns"). FlowWink has the
substrate (`agent_automations`, composite skills) but the loop still hand-walks chains.

### FINDING 3 — No learning loop / Curator (MEDIUM, = BR2)
Hermes creates, self-improves and **curates** skills autonomously ("The Curator"). FlowWink's
skills are static seeds; **every instruction improvement tonight was a human acting as the
Curator.** This makes BR2 (escalate→template + learning loop) architecturally essential, not
optional. `flowpilot-learn` / `flowpilot-distill` are the seeds.

## 4. Build plan (phased)

### Phase 1 — Approval follow-through sweep  *(unblocks proof weeks — build first)*

> **Naming (Magnus 2026-07-12):** the wire identifier is **`flowpilot-followthrough`**, NOT
> "resume". "Resume" already means the **résumé/CV module** (`parse_resume`) in FlowWink — a
> user-chosen module, a different thing entirely. This is **engine plumbing**: the operator
> *following through* on a decision a human already approved. Renamed while still dev-only
> (before it froze into the fleet). The internal architecture concept is still "resumption"
> (Hermes's term); the FlowWink component is "follow-through".

A deterministic pass, invoked at the START of every heartbeat (and available as a standalone
cron), that:
1. Selects `agent_activity` where `status='approved'` AND not yet executed, within a
   **freshness window** (e.g. `created_at > now() - interval '48 hours'` — mirrors the
   staged-op `expires_at`; older ones are stale, must be re-proposed not resurrected).
2. For each: re-invoke the skill via `agent-execute` with the stored `input` + the bypass
   flags (`_approved: true`, plus `_approved_operation_id` when a `pending_operations` row
   exists), reusing the *exact* double-gate handshake verified in the money-integrity round.
3. On success → mark the activity `completed`/`executed` + link the resulting entity; on
   failure → record `error_message`, leave for review (do NOT loop forever).
4. **Idempotency:** relies on the money-core guards already shipped (payment `p_reference`,
   status guards) so a resume that races the UI can't double-act.
5. Backfill: the 24 existing stale rows are pre-fix — mark them `expired` (do not execute
   month-old approvals), then the sweep governs everything new.

Deliverable: `flowpilot-followthrough` (edge fn on a fixed cron or a heartbeat pre-pass) + a
guardrail test + dev end-to-end proof (stage → approve in UI → next sweep executes → entity
created). Writes one in-place `agent_activity` pulse row (`skill_name='followthrough_sweep'`,
`agent='cron'`) the Operator Health card reads — never a row per run.

### Phase 1.5 — Hermes hardening of the loop  *(SHIPPED 2026-07-12, sim-proven)*

Fast-forward sim (`npm run flowpilot:sim`) exposed three operator-quality gaps; all fixed
in the heartbeat/reason seam and pinned by `flowpilot-hermes.guardrails.test.ts`:

1. **Hollow turns** — a cycle ended "Preparing to generate…" with zero execution (baseline
   day 2). Now: if a cycle with active objectives executed no business skill, ONE bounded
   completion pass runs (artifact-or-NO_REPLY). Outcome check, not intent routing — Law 1
   intact. Proven: starved 3-iteration cycle → detected → rescued with a published post.
2. **`search_skills` counted as execution** — the dispatch meta-tool wasn't in
   BUILT_IN_TOOL_NAMES; a cycle that only searched looked productive. Fixed at the root.
3. **Content amnesia** — 6 near-identical blog titles in 6 sim days. The heartbeat context
   now shows recent output titles; post-fix sim produced trends-piece / how-to guide /
   business case on consecutive days.
4. **Follow-through as heartbeat pre-pass** — approvals complete at the START of each cycle
   and the operator SEES the results in context (the Phase-1 "pre-pass" half, now real).

Sim scoreboard: baseline 2 artifacts/3 days with 1 hollow turn → after: 5/5 days delivered,
0 hollow, differentiated content, follow-through visible every cycle.

### Phase 2 — Pipeline-collapse for known chains
Turn P2P / dunning / month-end / expense-reimbursement into deterministic **composite
automations** the loop *invokes* as one step, instead of hand-walking 7 skills across
heartbeats. Each composite is internally sequential + idempotent; the loop only decides
*whether* to run it, not *how*.

### Phase 3 — Curator / learning loop (BR2)
`flowpilot-learn` observes repeated corrections → proposes instruction/skill improvements to
a review queue (human-approved at first, the dial can open later). `flowpilot-distill`
consolidates. Closes the loop so FlowPilot improves at *this* business over the proof weeks —
the exact Hermes "grows with you" property, governed by the autonomy dial.

## 4b. Plumbing vs policy vs transparency (design ruling, Magnus 2026-07-10)

- **Plumbing** (heartbeat, follow-through, distill, learn cadence) = **engine constants**, not
  settings. Dedicated pg_cron jobs, never surfaced as adjustable automations — a knob you
  must never turn is false transparency and settings-sprawl. Cadence: heartbeat hourly,
  follow-through sweep every 5 min (HIL responsiveness), briefing/distill/learn daily. Dev is live;
  fleet gets the cadence at proof-week start (heartbeat cost is an owner decision per
  instance).
- **Policy** (what the operator MAY do) = the only adjustable layer: `flowpilot_autonomy`
  posture + `agent_trust_policies` + objectives + /admin/approvals.
- **Transparency** = seeing what the agent DID and WANTS, not seeing the gears: activity
  log + approvals + daily briefing, plus a small **Operator Health card** (posture, last
  heartbeat/follow-through/distill/learn run + status, pending approvals count) so the owner sees
  in 5 seconds that the engine is alive without understanding five cron jobs.

## 5. Proof-weeks gate

FlowPilot operates **liteit** (real co., real bank feed, zero customer risk) on the
**approve** trust level with a daily briefing to Magnus. Ship gate for starting: **Phase 1
green** (a human-approved action reliably completes autonomously) + the pipeline-collapse for
the 2–3 flows liteit actually runs. Metric: *approved actions completed / week, zero
incidents.* Phase 3 rides along during the weeks (it needs real corrections to learn from).

## 6. Non-goals

No macro-architecture change (the loop-first + gateway split is correct). No parity grind
(89% is enough for the story). No new modules until the proof weeks tell us which gap matters.
