---
title: "Self-hosted frontend (Docker / Easypanel / any VPS)"
description: The frontend normally deploys to Vercel (auto-deploy on push, vercel.json). 
category: operators
---

# Self-hosted frontend (Docker / Easypanel / any VPS)

The frontend normally deploys to Vercel (auto-deploy on push, `vercel.json`).
For enterprise/self-hosted scenarios — an internal server behind the company
firewall — the repo ships a `Dockerfile` that builds the Vite SPA and serves
it with nginx using the checked-in `nginx.conf` (SPA routing, asset caching,
`/health` endpoint).

## Runtime configuration (one image, any instance)

The image reads its Supabase target from **container env vars at startup**:
an entrypoint script (`docker/40-runtime-env.sh`) regenerates
`/runtime-config.js` from `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`
/ `VITE_SUPABASE_PROJECT_ID` on every start, and the bundle resolves those
values through `__FLOWWINK_RUNTIME__` (see `RUNTIME_ENV_DEFINES` in
`vite.config.ts`) — runtime override first, build-time baked value as
fallback.

Consequences:

- **In Easypanel, just set the three vars under Environment** on a
  Docker-Image service. Switching instance = change env + **Restart**. No
  rebuild, no registry round-trip.
- One generic image serves every customer/instance — the values baked at
  build time (dev by default) are only the fallback when no env is set.
- On Vercel and `vite dev`, `public/runtime-config.js` sets no overrides, so
  the baked values apply — behavior unchanged.

Verify what a running container resolved: `curl https://<host>/runtime-config.js`.

## Build-time values (the fallback)

`VITE_*` values are also baked into the bundle at build time as the fallback
when no container env is set. They reach `docker build` as build args:

| Build arg | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | the anon/publishable key |
| `VITE_SUPABASE_PROJECT_ID` | `<ref>` |

## Prebuilt image (recommended for small VPSes)

The Vite build needs ~4 GB RAM — on a small VPS the builder gets OOM-killed
mid-`transforming...` with **no error in the Easypanel log** (it just stops).
Two fixes:

- **Pull instead of build (recommended):** the
  `docker-image.yml` GitHub Action builds on every release tag (`v*`) and on
  demand (workflow_dispatch), publishing `ghcr.io/<owner>/flowwink-frontend:stable`
  (+ `:vX.Y.Z`). It no longer builds on every push to main. In Easypanel,
  create the App with source **Docker Image** instead of GitHub. If the ghcr
  package is private, either make it public (it contains only public code +
  the anon key) or add registry credentials in Easypanel (GitHub username +
  a PAT with `read:packages`). Instance targeting: set the `VITE_*` env vars
  on the service (runtime override, see above); with no env set the image
  falls back to the dev instance baked at build time.
- **Build on the VPS anyway:** add swap first —
  `fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`
  (persist with an `/etc/fstab` entry), then rebuild.

Build-log canary: with the `VITE_*` build args present, the prebuild step
prints `📦 Checking for pending database migrations...` /
`ℹ️ Supabase CLI not available` — if you instead see
`⚠️ Supabase not configured`, the env vars did not reach the build.

## Easypanel (building from source)

1. Create an **App** service from the GitHub repo, **Build: Dockerfile**
   (the repo-root `Dockerfile`; no custom build/start commands).
2. Add the three `VITE_*` variables under **Environment** — Easypanel passes
   service env vars as `--build-arg` to Dockerfile builds, which is exactly
   what the `ARG` declarations expect.
3. Container port: **80**. Attach your domain; Easypanel's proxy handles TLS.
4. Health check path: `/health`.
5. Redeploy after changing any `VITE_*` value (rebuild, see above).

## Plain Docker

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=https://<ref>.supabase.co \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=<anon-key> \
  --build-arg VITE_SUPABASE_PROJECT_ID=<ref> \
  -t flowwink-frontend .

docker run -d -p 8080:80 flowwink-frontend
curl http://localhost:8080/health   # → healthy
```

## What differs from Vercel

`vercel.json` wires three serverless functions (`api/og.ts`, `api/robots.ts`,
`api/sitemap.ts`) plus a social-crawler rewrite. In the Docker deployment
nginx covers these instead:

- `/robots.txt`, `/sitemap.xml` — nginx returns sane static fallbacks.
- **Social-crawler SSR (OG tags)** — opt-in: uncomment the `proxy_pass`
  blocks in `nginx.conf` and set your Supabase URL to route crawlers to the
  `render-page` / `sitemap-xml` edge functions. Until then, crawlers get the
  SPA's default meta tags. Fine for an internal server; configure it for a
  public-facing self-hosted site.

## Scope reminder — this is 1 of 4 layers

A FlowWink site is schema + skills + edge functions + frontend
(see [provisioning-and-updates.md](./provisioning-and-updates.md)). The
sections above only move the **frontend** off Vercel. With a cloud Supabase
backend, run migrations (`supabase db push`), deploy edge functions, and sync
skills exactly as for any other instance. For a fully self-hosted backend on
the same box, see the next section.

## Fully self-hosted: FlowWink against a self-hosted Supabase

Verified 2026-07-13 on one Easypanel VPS: frontend image + Easypanel's
Supabase template ("din data, din AI, din hårdvara" — everything behind your
own firewall). The frontend container doesn't care where the Supabase URL
points; the work is bootstrapping the backend's three layers.

**Key CLI fact:** `supabase login` / `supabase link` / `supabase functions
deploy` talk to Supabase's cloud **Management API** — a self-hosted instance
has no control plane, so they don't apply. The self-hosted equivalents:

| Layer | Cloud | Self-hosted |
|---|---|---|
| Schema | `supabase link` + `db push` | `supabase db push --db-url 'postgresql://postgres:<pw>@<host>:5432/postgres'` (no login/link; records applied migrations in the ledger so re-runs only apply new ones). Postgres usually isn't exposed publicly — run on the server, tunnel via `ssh -L`, or fall back to looping `supabase/migrations/*.sql` (baseline first, sorted) through `docker exec -i <db-container> psql -U postgres -d postgres -q` — all migrations are idempotent. |
| Edge functions | `supabase functions deploy` | Copy files into the functions volume and restart: `cp -r supabase/functions/* <easypanel-project>/volumes/functions/ && docker restart <functions-container>`. **Keep the existing `main/` router** (the repo has none — the edge runtime routes through it). `VERIFY_JWT=false` is fine: FlowWink functions do their own auth. |
| Skills | `npm run sync:skills` or admin UI | Same as cloud once you're in: **/admin/modules → "Sync skills from code"** (migrations seed only a handful of skills; bootstrap seeds all ~470). |

**First admin user** (no signup flow on a fresh instance): create via GoTrue's
admin API with the service-role key (found in the functions container's env),
then grant the role:

```bash
curl "https://<supabase-host>/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"<temp>","email_confirm":true}'
# then, in the db container:
# insert into public.user_roles (user_id, role) values ('<returned id>', 'admin');
```

Then log in, install a template (New Site), and run "Sync skills from code".

**Before real data goes in:**

- **Rotate the JWT secret.** Easypanel/docker Supabase templates often ship
  Supabase's *published demo keys* (`iss: supabase-demo`) — anyone can mint a
  service_role token against your instance until you change `JWT_SECRET` and
  regenerate the anon/service keys (then update the frontend env + restart).
- Change the default Postgres password; configure SMTP (password resets) and
  an AI provider key (admin → Integrations) as needed.

Build notes: the `prebuild` migration script self-skips inside the image (no
Supabase CLI present) — migrations never run from the image build. The build
stage sets `NODE_OPTIONS=--max-old-space-size=4096`; the Vite build is large,
so give the builder VPS ~4 GB (or build the image elsewhere and push to a
registry Easypanel pulls from).
