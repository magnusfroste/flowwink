# The FlowWink Agent Harness

**Status:** design ruling + build plan · **Date:** 2026-07-23
**Author:** Claude (dev lead) · **Trigger:** "harness" has become the industry frame for
production agents; FlowWink already has one, unnamed and scattered. This doc names it,
fixes its ownership, and specifies the one surface it still lacks.
**Parent:** [`flowpilot-2.0.md`](./flowpilot-2.0.md) — this doc generalises that plan from
*FlowPilot the operator* to *the harness both FlowPilot and external agents run on*.

---

## 0. TL;DR

A **harness** is everything around the model that makes an agent reliable in production:
the loop, skill selection, context assembly, memory, policy/guardrails, verification,
self-correction, escalation-to-human, learning, and observability. The model is the engine;
the harness is the chassis. In 2026 the harness is where production reliability is won or
lost — the model is increasingly a swappable part.

**FlowWink already implements a near-complete harness.** It was built incident-by-incident
and it works — but it is *unnamed*, *scattered across files*, and *invisible as a thing*.
This doc makes three rulings:

1. **The harness is a PLATFORM primitive, not a FlowPilot-module feature.** It lives in
   `supabase/functions/_shared/`, is consumed by FlowPilot (internal operator) **and** by
   external agents through the MCP gateway, and must never be gated behind the FlowPilot
   toggle. (Same law as the Skill Relevance Engine and platform-seeds.)
2. **Its parts get one shared name and one map** (§2), so a developer — or a customer, or
   someone searching "does FlowWink have an agent harness" — can see it.
3. **The one missing surface is observability-as-a-product: the Trace** (§4). Reading the
   harness's own logs is already how we debug and how we run the roadmap; that method
   becomes a first-class surface.

---

## 1. Why platform-level, not inside flowpilot-module

FlowPilot is **one consumer** of the harness — the always-on internal operator. The MCP
gateway (`mcp-server`, `?mode=dispatch`) exposes the *same* skill surface, relevance
ranking, trust dial, and audit trail to **external** operators (OpenClaw, Hermes, any MCP
client). Burying the harness inside `flowpilot-module` would:

- hide it from external agents the moment a customer disables the FlowPilot module, and
- repeat the exact mistake CLAUDE.md already documents ("platform primitives must NOT live
  in flowpilot-module" — the weekly_business_digest / platform-seeds drift).

So the harness is FlowWink-level. **FlowPilot's own intelligence** (soul, objectives, ReAct
decisions) stays in the module; the *machinery that makes any agent reliable* is shared.

```
                        ┌─────────────────────────────────────────┐
   FlowPilot ──────────▶│           THE HARNESS (_shared/)          │◀────── OpenClaw / Hermes /
   (internal operator)  │  loop · skill-select · context · memory  │        any MCP client
                        │  policy · verify · self-correct · escalate│        (via mcp-server gateway)
                        │  learn · observe                          │
                        └─────────────────────────────────────────┘
```

---

## 2. The harness, named — component map

Every row already exists and ships today. The point of the table is that it *is* a table:
one named system, discoverable in one place.

| # | Component | What it does | Where it lives | Status |
|---|-----------|--------------|----------------|--------|
| H1 | **Loop** | The ReAct reason→act cycle; heartbeat cadence | `_shared/pilot/reason.ts` | shipped, Hermes-hardened |
| H2 | **Skill selection** | Ranks 500+ skills → ~25 by intent (IDF-weighted, direct-hit-beats-synonym) | `_shared/skills/intent-scorer.ts` | shipped |
| H3 | **Context assembly** | Compiles system prompt: soul, objectives, memory, KB, retrieval | `_shared/pilot/prompt-compiler.ts`, `_shared/retrieval/` | shipped |
| H4 | **Memory** | Persistent institutional memory; distilled by the learn cycle | `agent_memory`, `flowpilot-learn` | shipped |
| H5 | **Policy / guardrails** | Trust dial (auto/notify/approve), scope gating, cadence guard, generative-automation gate | `agent_skills.trust_level`, `reason.ts partitionByCadence`, `agent-execute` create-validation | shipped, extended this week |
| H6 | **Verification** | Objectives close on **evidence** from `agent_activity`, never on model prose | `_shared/pilot/reason.ts` (objective-evidence guard) | shipped |
| H7 | **Self-correction** | Errors are enriched so the next turn recovers (PGRST202 param hints, VAT period, automation required-args) | `agent-execute` + handlers | shipped, extended this week |
| H8 | **Escalation (HIL)** | Approval queue + staged operations for anything above the trust threshold | `approval_requests`, staged-op handshake | shipped |
| H9 | **Learning** | The Curator analyses failures → proposes better skill instructions → parks for human approval | `run_skill_curator`, Curator automation | shipped (BR2) |
| H10 | **Observability** | Every action + verbatim input/output/outcome, token + trace records | `agent_activity`, `_shared/trace.ts`, `_shared/agent-audit.ts`, `token-tracking.ts` | **data layer only — no product surface (§4)** |
| H11 | **Resumption** | Pause a multi-step chain and resume exactly where it stopped | Phases 0–2 shipped (approval-expiry · durable lifecycle · resumer + directive); sim proof (Phase 4) is the acceptance gate | **shipped, sim-gating** |

**Reading of the table:** ten of eleven components are built. The two open rows are the
whole of the next phase — one is a *legibility* gap (H10 has no UI), one is a *functional*
gap (H11 doesn't exist yet). Everything else is production-grade.

---

## 3. The design ruling

> **The harness is the platform's spine. Name it, keep it in `_shared/`, and treat "which
> harness component owns this?" as a first-class question when adding agent behaviour.**

Consequences for how we build:

- **New agent-reliability behaviour is placed by component, not by module.** A new guardrail
  is H5; a new enriched error is H7; a new ranking signal is H2. This is already how the
  week's work landed — the ruling just makes it explicit.
- **The harness is model-agnostic.** Every component sits between the model and the world,
  so swapping gpt-4.1-mini → Claude → a local model changes the engine, not the chassis.
  This is the A/B cost-config work (task #44): the harness makes model choice a dial.
- **Every incident becomes a harness component, permanently.** The week's three bug classes
  each hardened a component (H5 cadence, H5 automation-gate, H7 VAT self-correct) with a CI
  guardrail. That is the harness getting stronger as it ages — safe-by-construction.

---

## 4. Next build: the Trace (H10 → product)

**The insight:** this week's entire debugging method was *reading the harness's own logs* —
`agent_activity`, the verbatim input, what the loop chose, what a guard did. That method
found three bug classes and a P0. It is the most valuable thing we do, and today it requires
hand-written SQL. **Make it a surface.**

### What it is

A **Trace** view: one coherent, per-run story of a harness execution —

```
trigger (heartbeat / cron / chat / gateway)
   └─ context loaded      (objectives in scope, memory hits, KB retrieved)
       └─ skills surfaced  (relevance-engine top-N + why each ranked)
           └─ model chose  (skill + arguments, verbatim)
               └─ policy    (each guard: passed / gated / escalated — and why)
                   └─ result (verified outcome from agent_activity, not prose)
```

Every node is already recorded (H10 data layer). The Trace is the **read model** over
`agent_activity` + `trace.ts` + `approval_requests`, not new instrumentation.

### Why it beats everything else on the list — three audiences, one surface

- **Us (dev):** debugging drops from hand-written SQL to a click. The whole proof-week
  method becomes a tool.
- **The customer (trust):** *"audit the agent the way you audit an employee"* is literally
  the line in the tutorial video — but today they *can't*. The Trace is that promise made
  real: every autonomous action, why it was chosen, what gated it, what a human approved.
- **The market (positioning):** "FlowWink ships a production agent harness — and you can
  *watch* it decide" is a strong 2026 SaaS story. See §6.

### Where it lives

Read model + API in `_shared/` (so external-operator runs are traceable too, not just
FlowPilot's). One admin surface: **FlowPilot → Trace** (extends the existing Live-activity
tab — which, note, has a latent bug: it doesn't currently show gateway calls; the Trace
supersedes and fixes it).

### Scope discipline

The Trace is **read-only and derived**. It adds no new control path, no new writes — it
renders what the harness already emits. That keeps it cheap and keeps the harness's behaviour
unchanged (the safe way to ship observability).

---

## 5. Parallel: close resumption (H11)

The architecture benchmark flagged three gaps vs Hermes; two shipped (pipeline-collapse,
Curator). **Resumption is the third and still open** — see `flowpilot-2.0.md` FINDING 1. A
harness that can't pause a multi-step chain and resume exactly where it stopped is fragile
under real conditions (a heartbeat window ends, a rate limit hits, an approval is pending).

The Trace and resumption are the same shape from two angles: **a trace node is a resumption
point.** Building the Trace read model first gives resumption its checkpoints for free. So
the order is: **Trace (H10) → resumption (H11) on top of it.**

---

## 6. Positioning — so "harness" searches land here

A secondary goal of naming the harness: someone evaluating FlowWink (or reading clawable)
who searches *"agent harness"*, *"is this production-grade"*, *"how do you keep the agent
safe"* should find a concrete, implemented answer — not a claim. The framing to publish
(handbook / clawable / marketing), each line backed by a component above:

- **"FlowWink is a harness, not a chatbot."** The model is the engine; H1–H11 are the
  chassis. Swap the model, keep the reliability.
- **"Every autonomous action is on the record."** H6 + H10: objectives close on evidence,
  not on the model's word; the Trace shows the whole decision.
- **"The dial, not the gate."** H5 + H8: trust is a continuum (auto → notify → approve),
  set per skill, not an on/off switch.
- **"It gets safer as it ages."** H9 + the incident→guardrail discipline: every failure
  becomes a permanent component with a test.
- **"Bring your own agent."** The harness serves external operators through the same gateway
  — the reliability isn't locked to FlowPilot.

**Do not** over-claim H11 until it ships: resumption is "in build", not "done". The harness
story is strong *because* it's true — keep it that way.

---

## 7. Non-goals

- **No "harness module."** The harness is cross-cutting; a module would re-bury it. It is
  `_shared/` platform spine, surfaced through one admin view.
- **No new control paths in the Trace.** It is a read model. Behaviour changes go in the
  components (H1–H9), never in the observability layer.
- **No renaming of runtime identifiers.** Edge-function names, `agent_type` values, cron
  jobnames stay as deployed across the fleet (CLAUDE.md naming policy). We name the *story*,
  not the wire.

---

## 8. Build order

1. **Trace read model** (`_shared/`) over `agent_activity` + `trace.ts` + `approval_requests`.
2. **FlowPilot → Trace** admin surface (supersedes Live-activity; fixes the gateway-calls gap).
3. **Positioning pass** (§6) into handbook + clawable, once the Trace is demonstrable.
4. **Resumption (H11)** on top of the Trace's checkpoints.

Phases 1–2 are the immediate next step. Phase 4 is the last benchmark gap. After that, the
harness is complete *and legible* — which is the actual product.
