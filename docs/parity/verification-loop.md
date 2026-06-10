---
title: Verification Loop — verify locally, then deploy
description: The third leg of the parity program. "done" means run green through the real runtime, not "the code exists".
category: concepts
---

# Verification Loop — verify locally, then deploy

The parity program has three legs:

1. **Decide first, code later** — every capability is a written spec before code.
2. **Dual-surface** — every capability ships as both an admin UI and an MCP skill.
3. **Verify locally, then deploy** — *this doc*. A capability is `done` only when the
   skill has been **run through the real runtime** and its effect confirmed — not when
   the code merely exists.

This leg exists because of a concrete failure: the `payroll` scorecard marked
`payroll_runs` and `journal_integration` as `done`, but when actually invoked over
MCP they were **broken** (schema drift: `full_name`→`name`, `journal_entry_lines(entry_id)`
→`journal_entry_id`). The code existed; the capability did not work. "Done on paper,
broken in reality" is exactly what this leg prevents.

## Why production hides these bugs

You cannot find this class of bug on a live customer instance:

1. **Write-skills can't be exercised freely on prod** — they mutate customer data,
   trigger emails, and hit auth gates. Locally the data is disposable; no emails, no
   consequences.
2. **Auth-gated RPCs are dead code until invoked** — dozens of RPCs had never been
   called, so their internal drift never threw an error anywhere. Locally you call
   them with the service role and see the exact Postgres error.
3. **Accounting bugs are silent until you post *and* read the balance** — locally you
   post a journal entry, introspect `journal_entry_lines`, and see debit ≠ credit. On
   prod it just sits there, quietly wrong.

## The loop

```
orb start                         # OrbStack: local Supabase + edge functions
supabase start && functions serve # hot-reload runtime
   → invoke the skill through the REAL runtime (service role, real args)
   → read the exact Postgres / handler error
   → fix the function
   → re-test in seconds (no deploy)
   → ONLY THEN: migrate + deploy to the fleet
```

This is the difference between "deploy and hope" and "verify first". The agentic
lever is that the agent can **start and drive OrbStack + Supabase + `functions serve`
from Bash** — the local-dev loop is the capability, not the editor.

## Per-capability verification recipe

Before flipping a capability to `done` in `capabilities/<module>.json`:

1. **Run it locally** — invoke the skill through the real runtime with realistic
   arguments (the same path an external MCP operator would take).
2. **Confirm the effect** — query the DB: rows created with the right columns, a
   **balanced** journal posting (Σ debit = Σ credit), the expected status transition.
3. **Confirm both surfaces** — the admin UI performs the same operation; the skill is
   `mcp_exposed=true` and passes `bun run scripts/skill-linter.ts`.
4. **Only then** set `status: "done"` and make the `verify` field state what was run
   and observed (e.g. *"create_payroll_run produced 3 lines, gross/tax/social/net
   non-zero; approve posted balanced JE 7210/2710"*).

`npm run local:smoke` exercises skills through the runtime and is the standing
regression gate — run it before marking anything `done` and in CI where possible.

## Definition of "done", restated

> A capability is **done** when: the admin UI does it **and** the MCP skill does it
> **and** the skill has been run green through the real runtime with its DB effect
> confirmed. Anything less is `partial`.

That makes `done` a *measured, executed* fact — the property that exposed payroll as
broken despite being marked done.
