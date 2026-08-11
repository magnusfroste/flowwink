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

### 7. Sync skills from code

Admin → **Modules → "Sync skills from code"**. Migrations never touch
`agent_skills` — this button runs the module bootstrap and seeds every enabled
module's skills (hundreds of rows). Without it, the agent surface is empty.

Re-run it after every frontend update that changes skills. It updates
definitions but never touches `trust_level`, so runtime trust overrides
survive.

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
| Skills | Admin → Modules → **"Sync skills from code"** after the frontend deploy |

No CLI at any point. The one thing to remember: **skills are the fourth
layer** — a fork sync updates code and schema, but the skill registry only
moves when you press the sync button.

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
