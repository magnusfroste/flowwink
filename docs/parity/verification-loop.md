---
title: Verification Loop — verify locally, then deploy
description: The third leg of the parity discipline. A capability is "done" only when it has been RUN through the real runtime, not when it's claimed.
category: concepts
order: 51
---

# Verification Loop

The parity program already says **decide first, code later** (a written capability
+ issue spec before any change). This adds the missing third step:

> **Verify locally, then deploy.** A capability is `done` only when it has been
> **run through the real runtime** and observed to do the right thing — never on
> the strength of "the code looks right" or "the scorecard says done".

This is not bureaucracy. It is the single practice that catches the most-common,
most-expensive class of bug in FlowWink: **drift in code that was never actually
run.** On 2026-06-10 the scorecard marked payroll `payroll_runs` and
`journal_integration` as `done` — yet `create_payroll_run` crashed on the first
real call (`column "full_name" does not exist`), and `register_fixed_asset` posted
to a non-existent column. Both were "done" on paper and **dead over MCP**. Only
running them surfaced it.

## Why external instances hide these bugs

You cannot find this class of bug by reading code or by poking production:

1. **You can't freely run write-skills against a customer instance** — you'd mutate
   real data, trigger emails, hit auth gates. So nobody ever ran them there.
2. **Dead-behind-a-gate RPCs never raise.** Dozens of skill RPCs were gated by
   `has_role(auth.uid(),'admin')` and run only via the service key (`auth.uid()`
   NULL) → they *always* failed, so their internal schema-drift never surfaced as
   an error anywhere.
3. **Posting bugs are silent.** A journal that posts `Dt ≠ Cr`, or revenue that
   never reaches the ledger, looks fine until you actually post and read the
   balance back.

The local stack removes all three constraints: throwaway data, no email, instant
re-run, and full DB introspection.

## The loop

```
orb start                                    # OrbStack → Docker
supabase start                               # local Postgres :54322 + gateway :54321
supabase functions serve --no-verify-jwt \   # hot-reload edge functions
  --env-file supabase/functions/.env

# run the capability's skill through the REAL runtime:
curl -s -X POST http://127.0.0.1:54321/functions/v1/agent-execute \
  -H 'Authorization: Bearer local-sim' -H 'Content-Type: application/json' \
  -d '{"skill_name":"<skill>","arguments":{<REAL args>},"agent_type":"flowpilot"}'

# observe the DB effect (and balance, where money moves):
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -c "select source, sum(debit_cents)=sum(credit_cents) balanced
      from journal_entries je join journal_entry_lines l on l.journal_entry_id=je.id
      where je.created_at > now()-interval '2 min' group by source;"
```

`functions serve` hot-reloads on file save, so the cycle **edit → re-run** is
seconds — versus a production deploy per iteration. Fix against the real error,
re-run, and only when it's green do you migrate + deploy the fleet.

## Per-capability recipe (the gate for marking `done`)

For each capability in `capabilities/<module>.json`:

1. **Run it locally with REAL arguments** (not empty/placeholder) via
   `agent-execute`. Read the exact error if it fails; fix the function/handler;
   re-run until green.
2. **Verify the effect in the DB** — the row exists, totals are right, and any
   journal entry is **balanced** (`Dt = Cr`).
3. **Verify BOTH surfaces (dual-surface law).**
   - 🤖 MCP/agent path: also run it via the gateway —
     `POST /functions/v1/mcp-server/rest/execute` (or `?mode=dispatch`) — so you
     prove it works for an external agent, not just `agent-execute`.
   - 👤 UI path: the admin screen for the same operation exists and works.
4. **Only now** set the capability `status: "done"` and regenerate the matrix
   (`bun run scripts/parity-report.ts`). A `done` you didn't run is a lie the
   next agent inherits.

## Regression net

```bash
npm run local:smoke   # drives EVERY enabled skill through agent-execute (empty args)
```
It classifies each skill `success` / `validation-rejected (expected)` / `BUG`
(handler crash). Keep **BUGS at 0** — a non-zero count is a handler that throws
instead of validating. It won't exercise full business flows (that's the
per-capability recipe above), but it's the cheap, always-on tripwire for the
"never run" class.

## Deploy only after green

Once verified locally:

- **DB / RPC / trigger changes** → a timestamped idempotent migration
  (`CREATE OR REPLACE`, `IF NOT EXISTS`), applied to every instance.
- **Edge-function changes** → `supabase functions deploy <fn> --no-verify-jwt
  --project-ref <ref>` per instance (these do **not** auto-deploy).
- **Skill metadata** (seeds in `src/lib/modules/*`) → `npm run skills:json` then
  `npm run sync:skills -- --apply` per instance.

See [`docs/operators/provisioning-and-updates.md`](../operators/provisioning-and-updates.md)
for the fleet refs and the four-layer sync.

## The one-line rule

**If you didn't run it, it isn't done.** The scorecard measures verified reality,
not intentions — that's what makes the parity `%` a fact.
