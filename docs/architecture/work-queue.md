---
title: "The work queue — durable tasks instead of a cron job per feature"
description: One dispatcher that decides nothing, and work that lives as rows with a due time, a lease and an attempt count.
category: concepts
status: proposed
---

# The work queue

> **Status: proposed (2026-08-01).** No code written. This describes a target
> shape and a migration path that does not require a big bang — the queue and
> today's cron jobs coexist indefinitely, and jobs move one at a time.

## The problem, stated from evidence

Scheduled work in FlowWink is 25 pg_cron jobs, each its own schedule, each its
own HTTP hop into an edge function. Every incident below is from the last three
weeks and every one of them is the *same* failure mode wearing a different hat:

| Incident | What actually happened |
|---|---|
| Newsletter + visitor-intent baked to dev's URL | a job's command carried another instance's host; it "succeeded" forever |
| `publish-scheduled-pages` 404ing a ghost function | the target was deleted; pg_cron still reported success |
| ~16 pg_net timeouts/24h clustered at `:00`/`:30` | many jobs fire on the same minute; DNS alone ate the 5 s budget and the request never left |
| 103 stray monthly runs, weekday `1-5` → Mondays only | cron-expression parsing, twice |
| `quote-expiry-reminders` 404ing every run for weeks | it invoked a function deleted in the consolidation |

The common root is not any one bug. It is that **pg_cron's unit of work is "a
command fired at a time", and its notion of success is "the command dispatched"**
— not "the work happened". `job_run_details.status = 'succeeded'` is true when
the HTTP call was *queued*. Everything above lived in the gap between those two
statements, and we only found each one by looking.

We have since made that gap loud (`cron_health_report`, foreign-host detection,
a 10 s pg_net timeout). That is monitoring. This document is about removing the
gap.

## What we have today — precisely

Two of the 25 jobs are already the right shape:

- **`automation-dispatcher`** (`* * * * *`) reads `agent_automations` where
  `next_run_at <= now()` and runs each one's skill through `agent-execute`.
- **`event-dispatcher`** (`* * * * *`) matches `agent_events` against
  automations with `trigger_type='event'`.

So the *pattern* — one per-minute tick that hands work to the skill layer —
already exists and is proven. What is missing is everything that makes it
durable. Reading `automation-dispatcher/index.ts` and the
`agent_automations` columns as they stand:

| Missing | Consequence today |
|---|---|
| **No lease** — rows are selected, not claimed | two overlapping dispatcher invocations select the same due row and both execute it. A slow run plus the next minute's tick is enough |
| **No attempt cap** | `next_run_at` is only advanced *after* a successful pass, so a permanently failing automation retries every minute, forever, silently |
| **No `priority`** | a backlog drains in `next_run_at` order; nothing can jump the queue |
| **Definition, not instance** | `agent_automations` is a *rule* ("run this skill on this cron"). There is no row that means *"research **this** contact, due Tuesday, because **this** happened"* |

That last row is the important one, and it is the whole design.

## The distinction that unlocks it: rules vs work items

A cron expression answers *"when do we look?"*. A due date answers *"when is
**this thing** ready?"*. Those are different questions and we currently only
have machinery for the first, so every feature that really needed the second
was written as a **sweep**:

> `comms-send?kind=booking_reminders` runs every 15 minutes, scans **every**
> confirmed booking, and sends to the few starting within 24 h — using
> `reminder_sent_at IS NULL` to avoid double-sending.

That is O(all bookings) of work, every tick, to do O(a few) sends. And the
`reminder_sent_at` column exists only to compensate for the fact that the tick
has no memory. The same shape repeats in calendar reminders, webinar ticks,
dunning, invoice reminders, quote expiry, contract and subscription billing.

Under a work queue, a booking that gets confirmed **enqueues one row** due at
`starts_at - 24h`. The tick no longer scans; it drains what is due. The
"already sent?" bookkeeping disappears, because *the task's existence is the
marker* and its completion is the receipt.

## The design

### One table

```sql
create table agent_tasks (
  id             uuid primary key default gen_random_uuid(),

  -- what to do: the existing skill layer, unchanged
  skill_name     text not null,
  skill_arguments jsonb not null default '{}',

  -- what it is about (nullable — some work is not entity-scoped)
  subject_type   text,          -- 'booking' | 'invoice' | 'contact' | …
  subject_id     uuid,

  -- when, and in what order
  due_at         timestamptz not null default now(),
  priority       int not null default 0,

  -- why (shown to humans; see "the reason rule" below)
  reason         text not null,

  -- durability
  leased_until   timestamptz,
  attempts       int not null default 0,
  max_attempts   int not null default 3,

  status         text not null default 'pending',
    -- pending | running | done | failed | cancelled
  outcome        text,          -- human-readable, set on done/failed
  last_error     text,

  -- provenance
  created_by     text not null default 'platform',  -- platform | flowpilot | user:<id>
  session_id     uuid,
  created_at     timestamptz not null default now(),
  completed_at   timestamptz
);

-- the only index the dispatcher needs
create index on agent_tasks (status, due_at, priority desc)
  where status = 'pending';

-- idempotency: one open task per (subject, skill) unless deliberately queued twice
create unique index on agent_tasks (subject_type, subject_id, skill_name)
  where status in ('pending', 'running');
```

### One claim function

```sql
create or replace function claim_due_tasks(p_limit int default 10)
returns setof agent_tasks
language sql
as $$
  update agent_tasks t
     set status       = 'running',
         leased_until = now() + interval '5 minutes',
         attempts     = t.attempts + 1
   where t.id in (
     select id from agent_tasks
      where status = 'pending'
        and due_at <= now()
        and attempts < max_attempts
      order by priority desc, due_at asc
      limit p_limit
      for update skip locked          -- ← the whole concurrency story
   )
  returning t.*;
$$;
```

`FOR UPDATE SKIP LOCKED` is what makes this safe without a distributed lock:
two dispatchers running at the same instant take **disjoint** rows. A run that
dies mid-flight leaves its row `running` with an expired `leased_until`; a
reaper returns it to `pending` (attempts already incremented) or, past
`max_attempts`, marks it `failed` with an explicit outcome:

> *"Gave up after 3 attempts — the run never reported back."*

That sentence is the point. Today a job that dies is indistinguishable from a
job that never had work.

### One dispatcher that decides nothing

`automation-dispatcher` gains a second lane: after processing due automations,
it calls `claim_due_tasks(N)` and hands each row to `agent-execute` exactly as
it already does for automations. **It contains no business logic and no
per-feature branches** — if a decision has to be made about *what* to do, that
decision belongs in the skill, and *when* to do it belongs in `due_at`.

### The reason rule

`reason` is `not null` on purpose, and it is shown in the admin UI next to the
task. Borrowed verbatim in spirit from comp.ai's `schedule_recheck`:

> An agent that cannot say why it will be back in fourteen days does not have a
> reason, it has a default.

This matters more for us than for them: FlowPilot already schedules its own
follow-ups, and "why is the agent going to do this on Thursday" is currently
answerable only by reading code.

## Coexistence — what moves, what stays, what never moves

Nothing is deleted to start. The queue lands empty next to the 25 jobs and
they migrate one at a time, each with its own before/after verification.

**Move first — per-entity work with a natural due date (the sweeps):**

| Job today | Becomes |
|---|---|
| `booking-reminders` (`*/15`) | one task per confirmed booking, due `starts_at − 24 h` |
| `calendar-reminders` (`*/15`) | same shape, per event |
| `webinar-reminder-tick-15min`, `webinar-tick-5min` | one task per registration per window (confirm / T‑24 h / T‑1 h / post) |
| `dunning-processor` (`*/30`) | one task per dunning step, due at that step's date |
| `invoice-reminders-daily` | one task per unpaid invoice, due at its reminder date |
| `recurring-quotes-cron`, `contract-billing-daily`, `subscription-billing-daily`, `service-recurring-orders` | one task per document — `subscriptions.next_invoice_date` is *already* a due date; the cron only exists to go looking for it |
| `flowpilot-followthrough` (`*/5`) | one task per approved pending operation |

That is 11 of 25 jobs, and it is where every reminder/billing incident has come
from.

**Stay cron — genuine heartbeats and periodic maintenance with no per-entity
identity:** `automation-dispatcher`, `event-dispatcher`, `knowledge-indexer`,
`instance-health-check`, `audit-logs-retention-purge`, `backfill-embeddings-daily`,
`flowpilot-heartbeat`, `flowpilot-distill`, `flowpilot-learn`,
`flowpilot-daily-briefing`, `social-post-scheduler-daily`,
`newsletter-dispatch-scheduled`, `publish-scheduled-pages`,
`voice-calls-sweep-stale`.

**Never moves:** the per-minute dispatcher tick itself. Something has to ask
"what is due?" and pg_cron is the right tool for exactly that one question.

### Who enqueues

Tasks are created where the fact becomes true, not on a schedule:

- **DB triggers** for state changes we already emit (`booking.confirmed` →
  enqueue the reminder). The event bus is already wired for this.
- **Skills**, via a new `schedule_task` skill — which is what lets FlowPilot say
  "look at this again on Thursday, because the customer asked for a follow-up".
- **Backfill migration** per moved job, so the first deploy of each migration
  enqueues tasks for the rows that would have been swept.

## What this buys, concretely

1. **A dead run is visible.** `status='failed'` with an outcome sentence, versus
   today's silence.
2. **A stuck job stops.** `max_attempts` ends the infinite-retry loop that
   `next_run_at`-after-success creates.
3. **No double-execution.** `SKIP LOCKED` + lease replaces "select and hope".
4. **The `:00`/`:30` pile-up dissolves.** Work is spread by its own due time
   instead of 11 jobs sharing four cron minutes — which is the actual cause of
   the pg_net timeouts, not the timeout value we just raised.
5. **Cheaper.** Sweeps stop reading whole tables to find a handful of rows.
6. **One place to look.** "What is the platform about to do, and why" becomes a
   query instead of reading 25 cron commands.

## Guardrails this needs

Consistent with how we lock every other structural fix:

- `work-queue.guardrails.test.ts` — a moved job may not leave its cron entry
  behind (a job name in `cron.job` whose work also exists as a task enqueuer is
  a double-fire).
- Extend `cron_health_report` with a queue lane: oldest `pending` past due,
  count of `failed` in 24 h, tasks whose lease expired more than once.
- The unique partial index above is itself the idempotency guardrail — a
  double-enqueue raises instead of double-sending.

## Non-goals

- **Not a general job runner.** No arbitrary code in a task; a task names a
  **skill**, so everything stays inside the trust/audit rails we already have.
- **Not a replacement for the event bus.** Events say *something happened*;
  tasks say *something should happen at a time*. Events enqueue tasks.
- **Not distributed.** One Postgres, `SKIP LOCKED`. If we ever outgrow that,
  the interface does not change.
- **No new edge function.** The dispatcher gains a lane (freeze principle).

## Sequencing

1. Table + `claim_due_tasks` + reaper, dispatcher lane, admin list view. Queue
   ships **empty** — zero behaviour change, fully reversible.
2. Move **one** job end-to-end (`booking-reminders` — smallest blast radius,
   easiest to verify: confirm a booking, see the task, watch it fire once).
   Prove the dedupe by running the old and new path in parallel for a day with
   the old one in dry-run.
3. Then the rest of the reminder family, then billing.
4. `schedule_task` skill last — once the machinery is boring, give FlowPilot
   the pen.

## Prior art

The shape is lifted from [`trycompai/crm`](https://github.com/trycompai/crm)
(`apps/agent/agent/lib/tasks.ts` + `schedules/dispatch.ts`), which runs one
`* * * * *` schedule that "decides nothing" over a leased task table, and from
Vercel's `eve` beneath it. Their formulation is worth keeping in mind while
reviewing this:

> Anything that looks like "every N minutes, the oldest ten contacts" belongs in
> a task's `dueAt`, not in a cron expression.

Read against our 25 jobs, that sentence classifies 11 of them immediately.
