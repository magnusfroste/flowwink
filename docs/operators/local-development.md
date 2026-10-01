---
title: "Local development — a Supabase stack on your machine"
description: This is the safety net for everything in provisioning-and-updates.md: the fleet drift, the lockstep traps, the risky prod migrations — all of it is validated here first. 
category: operators
---

# Local development — a Supabase stack on your machine

> Run the whole backend locally (Postgres + auth + storage + edge functions) so
> you can test migrations, skill changes, and provisioning against a **throwaway
> database** before anything touches a production site.

This is the safety net for everything in
[provisioning-and-updates.md](./provisioning-and-updates.md): the fleet drift,
the lockstep traps, the risky prod migrations — all of it is validated here
first. If a change is wrong, you break a local container, not a customer site.

## Prerequisites

- **A container runtime** — [OrbStack](https://orbstack.dev/) (lighter than
  Docker Desktop, great on Mac) or Docker Desktop. Just needs to be running.
- **Supabase CLI** — `supabase --version` (2.x).

Verify: `docker ps` should respond, and `supabase --version` should print 2.x.

## Start the stack

```bash
supabase start         # pulls images on first run, then boots the local stack
```

This gives you (CLI defaults — no extra config needed):

| Service | URL |
|---------|-----|
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| API / REST / Auth | `http://127.0.0.1:54321` |
| Studio (dashboard) | `http://127.0.0.1:54323` |

`supabase start` applies every migration in `supabase/migrations/` to the local
DB. To re-apply from scratch (clean slate):

```bash
supabase db reset      # drops + recreates + re-runs all migrations
```

Stop everything with `supabase stop` (add `--no-backup` to discard local data).

## Point the tooling at local

The same scripts you run against the fleet work against local — just set the
local connection string:

```bash
LOCAL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'

# Sync skills from code into the local DB (dry-run, then --apply)
DATABASE_URL="$LOCAL" npm run sync:skills
DATABASE_URL="$LOCAL" npm run sync:skills -- --apply

# Lint the local skill surface
DATABASE_URL="$LOCAL" npm run lint:skill
```

> `npm run fleet:status` is for the **cloud** fleet (it builds
> `db.<ref>.supabase.co` URLs from `scripts/fleet.local.json`). For local, use
> `sync:skills` / `lint:skill` with the local `DATABASE_URL` directly.

## Run edge functions locally

```bash
supabase functions serve              # serves all functions against the local DB
# → http://127.0.0.1:54321/functions/v1/<name>
```

Functions read secrets from `supabase/.env` (or `--env-file`). Functions that
call external services (Stripe, OpenAI, Resend, Firecrawl…) need those keys set
locally, or stub them. Agent/DB-only functions work out of the box.

## The validation workflow (what this unlocks)

Before pushing a risky change to the fleet:

1. `supabase db reset` — clean local DB with all migrations applied.
2. Apply your new migration (it runs as part of the reset, or `supabase migration up`).
3. `DATABASE_URL=$LOCAL npm run sync:skills -- --apply` + `npm run lint:skill`.
4. If you touched edge functions: `supabase functions serve` and call the route.
5. Green locally → ship to prod with confidence (see the update runbook).

`predev` (`npm run dev`) runs `scripts/run-migrations.js`, which actually
*applies* migrations when linked to a local project — unlike on Vercel, where it
silently skips. So local dev keeps your DB in step automatically.

## The same stack in a Claude cloud container

Verified 2026-09-30: the full battery (17 processes, 1402 green) ran from a
fresh `supabase start` inside a Claude Code cloud session. Three things differ
from a laptop, all caused by the session's egress proxy:

- **Images:** `docker.io` is denied; `public.ecr.aws` is not. `supabase start`
  already pulls from ECR, but skip what the battery never needs so fewer pulls
  can fail: `-x studio,imgproxy,inbucket,logflare,vector,pgadmin-schema-diff,migra,supavisor`.
- **Edge functions:** the runtime container fetches `deno.land` / `esm.sh`
  imports on first boot and rejects the proxy's TLS certificate (`invalid peer
  certificate: UnknownIssuer`). It ignores `DENO_CERT`, so seed its cache from
  the host instead: download the Deno that matches the runtime (edge-runtime
  1.76 ↔ Deno 2.1.4), run `DENO_CERT=<proxy CA> DENO_DIR=<tmp> deno cache` over
  every `supabase/functions/*/index.ts` (with `--config` where a function has a
  `deno.json`), and copy `remote/`, `gen/` and `npm/` into the volume
  `docker volume inspect supabase_edge_runtime_<project>` points at. Then
  `supabase functions serve` boots offline.
- **The prerequisites are one command:** `npm run qa:prep` — syncs skills,
  installs the template with a country through agent-execute (walking both
  approval gates), enables every module, syncs skills again. The order matters
  and the script owns it. Right after `supabase db reset` the runtime restarts
  and the first call can 503; the script retries three times.

The same sequence runs every night on a GitHub runner
(`.github/workflows/fresh-install-nightly.yml`): stack from zero, `qa:prep`,
battery, smoke, MCP regression, view sweep — and a green battery commits the
pulse stamp to main, so nobody hand-stamps any more.

A run here is the fresh-install test dev can never fail: it found a trigger
helper that existed only in one migration and a proof that passed or failed on
a coin flip. Both fixes are in this repo because of it.

## Caveats

- **No data on first start** — run the per-module demo seeders (or
  `seed_module_demo` skills) to get realistic content.
- **External services** need local keys or stubs.
- Local is a dev convenience, **not** a fifth production site — it never receives
  customer traffic.

## Related

- [provisioning-and-updates.md](./provisioning-and-updates.md) — fleet runbook + the baseline-squash procedure that this validates.
