# Feedback Loops — The Growth Engine

> FlowWink runs as a closed-loop system: every visitor interaction, every order, every email, every reconciliation feeds back into the next decision the agent makes.

---

## Why this matters

Most SaaS is open-loop: the tool produces output, a human reads it, the loop ends. FlowWink wraps every output in a measurement → reasoning → next-action cycle.

```
   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
   │   ACT        │───▶│   MEASURE    │───▶│   REASON     │──┐
   │ (skill run)  │    │ (event bus)  │    │ (FlowPilot)  │  │
   └──────────────┘    └──────────────┘    └──────────────┘  │
          ▲                                                   │
          └───────────────────────────────────────────────────┘
                            propose next act
```

---

## The four primary loops

### 1. Content → Conversion

Blog post published → page views tracked → low-CTR posts surfaced → FlowPilot proposes a rewrite or a new angle.

→ See [`processes/content-to-conversion.md`](../processes/content-to-conversion.md)

### 2. Lead → Customer

Form submit → enrichment (Sales Intelligence + Companies) → scoring → assigned to deal pipeline → won/lost feedback retunes scoring weights.

→ See [`processes/lead-to-customer.md`](../processes/lead-to-customer.md)

### 3. Order → Replenish

Order paid → inventory decremented → low-stock event → purchase order draft proposed via `purchasing` skills.

→ See [`processes/procure-to-pay.md`](../processes/procure-to-pay.md)

### 4. Bookkeeping → Insight

Bank import → 4D matching against expense templates → exceptions surfaced → autonomous booking after threshold confidence.

→ See [`processes/record-to-report.md`](../processes/record-to-report.md) and `mem://accounting/template-first-instrument-logic`.

---

## What makes loops actually close

Three pieces have to be in place for a loop to be more than a diagram:

1. **Event bus** — `agent_events` table + `event-dispatcher` cron. Every meaningful change emits a typed event. (`mem://architecture/event-bus-platform-layer`)
2. **Skill-driven reasoning** — FlowPilot consumes events, scores skills, proposes the next action.
3. **Trust gating** — actions either auto-execute, notify-then-execute, or require human approval per the trust matrix (`mem://architecture/agent-trust-and-gating-logic`).

If any layer is missing, the loop becomes a one-shot automation instead of a learning system.

---

## Designing a new loop

When adding a new module, ask:

1. **What event does it emit?** Add it to `agent_events` via `emit_platform_event(...)`.
2. **What skill should react?** Register it with `Use when:` metadata that includes the event name.
3. **What's the trust level?** Default to `notify` until you have enough samples to flip to `auto`.
4. **What's the success metric?** Add it to `/admin/automations` health view.

---

## See also

- [`mem://architecture/event-bus-platform-layer`]
- [`mem://philosophy/autonomy-execution-layers`]
- [`processes/`](../processes/) — every documented process is a loop
