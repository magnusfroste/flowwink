# Process battery

One scenario per process doc (`docs/processes/<process>.md` → `scenarios/<process>.ts`).
A scenario drives the process through skills exactly as an external operator
would, then reads the END STATE from the database: books balance, stock adds
up, no more money out than came in, refusals refuse.

The parity matrix says a capability exists. The battery says the process holds.

## Run (local stack only — the battery writes business data)

```bash
export SUPABASE_SERVICE_ROLE_KEY=…        # the LOCAL stack's key: supabase status -o env
bun run scripts/process-battery/run.ts                      # every process
bun run scripts/process-battery/run.ts return-to-refund     # one
```

The stack needs every module enabled, skills synced, and an accounting locale
(install a template with `country: "SE"`). A non-local target is refused.

## Writing a scenario

- `s.must(step, skill, args)` — a step the process cannot continue without.
- `s.mustRefuse(step, skill, args, /why/)` — a step the platform must refuse.
- `s.skill(...)` — when you need to look at the outcome yourself.
- `s.sql / s.one / s.asService` — read the end state; never write business data with SQL.
- `s.check / s.equal / s.booksBalance` — the assertions. `s.skip(name, why)` — an ANNOUNCED skip.
- `s.idOf(data, 'order')` — the id of what a skill just created.
- `s.tag` — unique per run; put it in every natural key so reruns never collide — and in every
  person/company NAME: duplicate detection scores names, so a constant "Anna Berg" becomes thousands of
  cross-run pairs and crowds the pair under test out of the answer.
- Approval handshakes (staged operation, human approval) are walked by the harness
  and recorded in `s.handshakes`.

Look up a skill's contract with `node scripts/process-battery/skill-contract.cjs <skill> …`.

## The ratchet: `known-red.json`

The list of checks that are red because of a product finding nobody has fixed
yet. A run exits 1 on a red check that is NOT listed (a regression, or a new
finding to triage) and on a listed check that turned green (the fix landed —
shrink the list with `--update-known-red`). The list may only shrink. A check's
NAME is its key: never put a number that moves with the clock in it, and never
key a ratchet on a race — assert the structure (constraint, lock) instead.

**A red check that is a real product bug stays red.** Never weaken an assertion
to get green — fix the platform, or the scenario if the scenario was wrong.
