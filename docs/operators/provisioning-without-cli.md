---
title: "Provisioning without a CLI — fork, Vercel, Supabase, done"
description: Stand up a complete FlowWink instance using only web dashboards — no local tooling, no scripts, no agent.
category: operators
---

# Provisioning without a CLI — fork, Vercel, Supabase, done

> The zero-tooling install path: a GitHub fork, a Vercel project and a Supabase
> project, wired together entirely from their dashboards. Proven end-to-end on
> a fresh instance 2026-08-11: 385 migrations, 77 edge functions, storage,
> cron, seeds and the public site — without one terminal command.

This is the recommended path for new operators. The classic
[`scripts/flowwink.sh` + Supabase CLI route](provisioning-and-updates.md) still
works and remains the right tool for fleet maintainers; this page is for
someone standing up **one instance of their own**.

## What makes it possible

The **Supabase GitHub integration** deploys, on every push to the production
branch: all pending SQL migrations (tracked in a ledger — each version runs
exactly once), every edge function declared in `supabase/config.toml`
(with its declared `verify_jwt`), and nothing else. The repo is arranged so
that a from-scratch replay is safe:

- **All storage DDL lives in one always-last finalizer migration**
  (`*_fresh-install-finalizer.sql`, timestamped like any migration) with a
  deadlock-retry loop —
  mid-stream storage statements race Supabase's own storage service at project
  birth (SQLSTATE 40P01).
- **Cron jobs are born quiesced.** Every migration that schedules jobs
  deactivates them; the finalizer activates everything once the schema is
  complete, so nothing fires into a half-built database.
- **Platform config is seeded by migrations** (chart of accounts, automations,
  role defaults); business data is born empty on purpose.

CI guards all of this (`fresh-install-replay.guardrails.test.ts`), so the
properties hold for future migrations too.

## The install, step by step

### 1. Fork and connect Vercel

1. Fork `magnusfroste/flowwink` (or clone-push to your own GitHub org).
2. Create a Vercel project from the fork. The first deploy will show a
   **"connect your backend"** page — expected, the env vars aren't set yet.

### 2. Create the Supabase project

Create a project in the Supabase dashboard. Note from **Project Settings →
API Keys**:

- the **Project URL** (`https://<ref>.supabase.co`)
- the **publishable key** (`sb_publishable_…`) — the recommended, rotatable
  key family. The legacy `anon` JWT (`eyJ…`) also works.

### 3. Set the Vercel env vars

In Vercel → Settings → Environment Variables (Production):

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | the Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | the publishable key |

Then **Redeploy** — env vars are read at build time.

> ⚠️ The most common mistake in live testing: pasting the **URL into the key
> field**. The site then loads but every request fails with 401. If the site
> spins forever, check that the key variable actually starts with
> `sb_publishable_` (or `eyJ`), not `https://`.

### 4. Pair the GitHub integration

Supabase dashboard → Project Settings → Integrations → GitHub → connect the
fork, set the production branch (usually `main`), enable migrations + functions
deploy.

**Pairing alone may not trigger anything.** The integration acts on *push*
events — if nothing happens after pairing, make any small commit (edit a
whitespace) and push. Fork syncs that fast-forward also count as pushes.

### 5. Watch the first replay — and expect one possible retry

The replay applies every migration in order, then deploys every declared edge
function. A healthy run ends with the finalizer's receipts in the database
logs:

```
Fresh-install finalizer: N cron job(s) activated.
Fresh-install finalizer complete: 5 bucket(s), 17 storage policies.
```

**Known flake, with a known cure:** the *first* run after pairing can die with
`deadlock detected (SQLSTATE 40P01)` on a migration that touches no storage at
all — the platform's own pairing-time machinery (storage reconciliation,
schema-cache reloads) races the replay. This is inside Supabase's pipeline,
not the SQL. **Push again.** The ledger resumes exactly where it stopped, and
the second run goes clean — verified live.

### 6. First login = admin

Open your Vercel URL → **Administrator Login** → register. On a virgin
instance (zero admins), the first account is automatically granted the admin
role — that's a hard gate in the signup trigger, valid exactly once.

Two auth settings worth visiting in Supabase → Authentication:

- **URL Configuration → Site URL**: set to your Vercel domain (and update when
  you attach a custom domain). Confirmation mails, password resets and magic
  links redirect here — a stale value sends users to the wrong site.
- **Sign In/Up → Confirm email**: on by default. For a self-hosted instance
  you may prefer to switch it off and skip the confirmation-mail roundtrip.

### 7. Open the admin once — the skills seed themselves

Migrations never touch `agent_skills`. The edge deploy carries the skill
artifact, and the admin shell reconciles the registry against it every time an
admin opens the site (`sync_skills_from_code`): missing skills are inserted,
drifted definitions rewritten, `trust_level` never touched. The readiness
checklist shows the coverage. Admin → **Modules → "Sync skills from code"**
forces the same thing; use it if the frontend deployed before the edge
functions, or just to be sure.

### 8. Make it yours

- **Install a template** (admin → new site) — pages, navigation and FlowPilot
  soul + objectives in one step. The public site renders immediately.
- **AI provider key** (admin → Settings → AI) — FlowPilot, the public chat
  launcher and every AI feature need one. OpenAI, Gemini, local and n8n
  providers are supported.
- **Mint an operator key** (admin → Developer → API keys) if an external agent
  (Claude, OpenClaw, …) should run the instance through the MCP gateway. The
  onboarding block it produces contains both URL and key — keys are minted per
  instance and rejected everywhere else.

## Updates, forever after

The same rails keep the instance current:

| Layer | How it updates |
|---|---|
| Schema + edge functions | **Sync your fork** (GitHub "Sync fork" button or an auto-sync app) — the push triggers the Supabase integration, which applies only new migrations and redeploys functions |
| Frontend | The same push — Vercel builds automatically |
| Skills | Automatic on the first admin visit after the push; Admin → Modules → **"Sync skills from code"** forces it |

No CLI at any point. The one thing to remember: **skills are the fourth
layer** — they follow the edge deploy on the first admin visit, so an instance
nobody opens after a sync keeps its old skills until someone does (or presses
the sync button).

## Verifying an instance (what good looks like)

From the SQL editor in the Supabase dashboard:

```sql
SELECT
  (SELECT count(*) FROM supabase_migrations.schema_migrations)          AS migrations,
  (SELECT max(version) FROM supabase_migrations.schema_migrations)     AS head,
  (SELECT count(*) FROM storage.buckets)                               AS buckets,     -- 5
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage')      AS policies,    -- 17
  (SELECT count(*) FILTER (WHERE active) FROM cron.job)                AS active_jobs, -- all of them
  (SELECT count(*) FROM public.agent_skills)                           AS skills;      -- 0 until step 7
```

Cron health: `SELECT status, count(*) FROM cron.job_run_details GROUP BY 1` —
everything `succeeded`, and `SELECT status_code, count(*) FROM
net._http_response GROUP BY 1` should show only 200s. A pile of 401s means an
edge function's `verify_jwt` doesn't match how cron calls it — see
`supabase/config.toml`, where every function declares it explicitly.

## The branch status field is not evidence

The Supabase GitHub integration keeps a *branch object* per connected project,
readable through the Management API:

```bash
curl -s -H "Authorization: Bearer $SBP_TOKEN" \
  "https://api.supabase.com/v1/projects/<ref>/branches"
```

Its `status` walks `MIGRATIONS_PASSED` / `MIGRATIONS_FAILED` → `FUNCTIONS_DEPLOYED`,
and reading it is the fastest way to learn *why* a fresh instance is empty — it
is how the 2026-08-22 wedge was diagnosed (`MIGRATIONS_FAILED` on a project
whose ledger claimed 14 rows while the database held 233 tables).

**But the status is a state machine, not a measurement.** Minutes after
connecting a brand-new project — before any push — the same field read
`FUNCTIONS_DEPLOYED` while the project had **0 migrations, 0 tables and 0
edge functions**. A run that did nothing still ends in the terminal state.

So: use `status` to explain a failure, never to confirm a success. Confirm
success against the objects themselves — the ledger, `information_schema.tables`,
and `GET /v1/projects/<ref>/functions`. Same rule as everywhere else in this
repo: the name in the ledger is weak evidence, the object is the strong one.

Connecting the repo does not itself deploy. **A push to the production branch is
what triggers a run**, so an instance connected but never pushed to sits at zero
with a green-looking status field.

## When a run stops short

A run can end before the chain does — a time budget, a transient error. It
happened on 2026-08-22: the ledger reached **449 of 489** and stopped, with no
migration at fault (the next five in the queue each applied cleanly when tested
against the instance in a rollback transaction).

This used to be fatal. Before the chain was made re-runnable, a resumed run died
on `already exists` at the first non-idempotent statement, and every subsequent
attempt died on the same one — the instance was wedged permanently.

**The fix is a push.** Every migration is now re-runnable, so a new run resumes
where the last one stopped:

```bash
git commit --allow-empty -m "trigger: resume provisioning" && git push
```

Verified: the 2026-08-22 run picked up at 449 and finished all 489.

The onboarding checklist on `/admin` says this too. A lagging ledger on an
instance that has *never been finished* (platform skills unseeded **and** no
module choice saved) reads as **an unfinished install**, not as release lag —
and its note names the push. On a mature instance the same lag stays
non-gating, because a frontend that deployed minutes before its migrations is
normal and gating on it would turn the checklist into furniture.

### If you cannot push

The dashboard SQL editor will run the missing files' contents — they are
idempotent, so running one twice is safe. Two caveats:

- **It does not write the ledger.** `supabase_migrations.schema_migrations`
  will still list the run as short, so the next integration run re-applies what
  you pasted. Harmless now (that is what re-runnable buys), but it means the
  ledger stops being a reliable account of what is applied. Verify against the
  objects — `information_schema.tables`, `pg_proc` — not the ledger.
- **Order matters.** Apply them in filename order; the chain assumes it.

The same is true of anything else that runs the SQL for you, including the
dashboard's assistant: it can execute the statements, but the ledger and the
ordering are yours to keep straight. Prefer the push.
