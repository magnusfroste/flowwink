---
title: "Provisioning & Updates — keeping every FlowWink site in sync"
description: FlowWink is self-hosted, one Supabase project per customer. 
category: operators
---

# Provisioning & Updates — keeping every FlowWink site in sync

> How to stand up a new FlowWink site and how to ship changes to the sites
> already in production — without the layers drifting apart.

FlowWink is **self-hosted, one Supabase project per customer**. That distribution
model is its strength (run on a VPS or a free Supabase micro instance) and its
main operational challenge: a "site" is not one artifact, it's **four layers**,
each deployed by a different mechanism. When they fall out of sync, skills break
in ways that pass local tests — exactly the class of bug we chased across the
fleet in mid-2026.

> **Standing up a single new instance?** There is now a zero-tooling path —
> GitHub fork + Vercel + the Supabase GitHub integration, dashboards only:
> [`provisioning-without-cli.md`](provisioning-without-cli.md). This page
> remains the fleet maintainer's runbook.

## The mental model: a site is 4 layers

| Layer | Source of truth | How it reaches an instance | Drift risk |
|-------|-----------------|----------------------------|------------|
| **Schema** | `supabase/migrations/*.sql` | `supabase db push` (or `flowwink.sh`) | Replay is slow; re-running migrations never pulls *current* code |
| **Skills / module metadata** | `src/lib/modules/*.ts` (`skillSeeds`) | **bootstrap** → `agent_skills` rows | ⚠️ Only synced on module-enable or a manual sync — **the #1 drift source** |
| **Edge functions** | `supabase/functions/*` | `supabase functions deploy` | Not deployed by Vercel; must be pushed per instance |
| **Frontend** | the repo build | Vercel (auto) or a manual build | Forks don't auto-deploy from the upstream repo |

**Key insight:** running migrations over and over does *not* fix skill drift —
`agent_skills` rows come from **bootstrap**, not migrations. A skill improved in
code only reaches an instance when bootstrap runs there. DB-only skills (seeded
directly by a migration, with no code seed) are never reached by bootstrap at
all and freeze at whatever the migration wrote — bugs included. See
[`mem://project/mcp-surface-drift`] and the skill-sync tool below.

## Deployment topology (the three shapes)

Which sites *you* run belongs in `scripts/fleet.local.json` (gitignored — see
"Fleet drift detector" below). What belongs here is the shape each one takes,
because that determines how a change reaches it:

| Shape | Frontend | Backend (migrations + functions) |
|-------|----------|----------------------------------|
| **Same repo, same account** | Vercel auto from `main` | Supabase GitHub integration, or `supabase db push` / `functions deploy` |
| **Same repo, separate Supabase account** | Vercel auto from `main` | That account's own token — your default CLI login returns 403 |
| **Fork** | Does **not** auto-deploy from upstream | Only after the fork is synced. **Notify the owner.** |

> **Read a ref out of the instance, never out of a list.** When a site is
> reinstalled onto a new project, the retired one stays fully alive: it answers
> psql, edge calls and ledger queries with confident, internally consistent,
> completely irrelevant data. On 2026-08-12 a stale ref produced a whole
> measurement round concluding "www has had no migrations since 8 August" — the
> real instance was current to that morning. Nothing errored; the readings were
> simply about a project no traffic reaches. A ref you did not just confirm is a
> hypothesis:
>
> ```bash
> curl -sL https://<site>/ | grep -oE '[a-z]{20}\.supabase\.co'
> ```

- **Pushing to `main`** auto-deploys the *frontend* to flowwink.com only.
- **Backend auto-deploy (dev instance):** `.github/workflows/supabase-deploy.yml`
  runs `supabase db push` + `supabase functions deploy` on every push to `main`
  that touches `supabase/**`, targeting the `SUPABASE_PROJECT_REF` variable
  (default: the dev instance `rzhjotxffjfsdlhrdkpj`). This closes the historical
  gap where Lovable reflected git changes in its GUI but never applied migrations
  or deployed functions — so backend changes no longer need a manual nudge.
  Requires the `SUPABASE_ACCESS_TOKEN` + `SUPABASE_DB_PASSWORD` secrets; without
  them the job skips (never red-fails main). Per-function `verify_jwt` comes from
  `supabase/config.toml`, so public functions stay anon-reachable automatically.
- **The production fleet is still deployed per instance** (the steps below) —
  the auto-deploy above points at ONE ref. Point it at prod, or extend it to a
  matrix, only deliberately.
- **Forks (autoversio.ai, optictunnels.se, demo.labs1100.com)**: `sync-forks.sh` pushes the fork, and
  both now auto-deploy Vercel AND Supabase (migrations + edge functions) from that
  push — verified 2026-08-31 (deployed sha == fork main). What NO fork rail covers
  is the **skills layer**: run `sync:skills -- --apply` against the fork's DB (or
  the admin "Sync skills from code" button) after changes that add/alter skills.

## Skill sync — closing the drift gap

The single most important tool. It is the CLI/server-side equivalent of the
**"Sync skills from code"** button in `/admin/modules`, and it should run as a
step of every update. It mirrors `src/lib/module-bootstrap.ts` upsert semantics
exactly: for every **enabled** module it upserts that module's `skillSeeds` into
`agent_skills` (refreshing description, tool_definition, handler, scope,
instructions; inserting any missing skill).

A guardrail test (`skills-artifact-fresh.guardrails.test.ts`) fails CI if the
committed artifact drifts from the code seeds, so a stale artifact can't ship.

```bash
# 1. Regenerate the versioned artifact whenever skillSeeds change in code.
#    Decouples the DB sync from the frontend graph (no React/browser imports).
npm run skills:json          # → supabase/seed/module-skills.json

# 2. Dry-run against a target instance (default — writes nothing).
DATABASE_URL='postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres' \
  npm run sync:skills

# 3. Apply once the dry-run looks right.
DATABASE_URL='postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres' \
  npm run sync:skills -- --apply
```

The dry-run reports, per skill, whether it would be **inserted** (missing) or
**updated** (which fields drifted), and skips modules that are disabled on that
instance. It is **idempotent** — re-running after `--apply` reports zero changes.
Comparisons are canonical (key-order-insensitive) so Postgres `jsonb` re-ordering
never shows up as a false diff.

> Always run `skill-linter` after a sync to confirm the surface is clean:
> `DATABASE_URL=… npm run lint:skill`.

### Fleet drift detector

For a one-glance health snapshot across **every** instance (read-only), run:

```bash
PGPW='<db password>' npm run fleet:status
```

It reports, per site: skill counts, malformed `tool_definition`s, drift vs. the
code artifact, and unresolvable `rpc:` / `edge:` handlers — and flags forks
(which don't auto-deploy from `main`). Instances live in `scripts/fleet.local.json` (gitignored — it lists the
projects *you* run; start from `scripts/fleet.example.json`)
(refs only, no secrets). Run it after a fleet-wide update, or on a schedule, to
catch a site that has drifted.

## Performance mode — the instance's pulse

Every instance runs the same platform cron jobs, and on Supabase's smallest
compute the *pulse* is what starves the database, not the functions: three
jobs fire every minute, two of them make an HTTP hop (pg_net → edge-function
cold start) even when the queue is empty, and everything fires at :00. The
autoversio signature (2026-09-04) was 117 of 220 ticks in one hour timing out
on "job startup" — more than half never began.

Two layers, one dial (`20260906170000_pulsen-far-en-ratt.sql`):

1. **Guarded pulse, mode-independent.** The dispatcher, indexer and newsletter
   jobs call `pulse_lane(lane, url, headers)` instead of `net.http_post`
   directly. `lane_has_work(lane)` asks the database first — unprocessed
   `agent_events`, due automations/workflows/tasks (or an empty vault), rows in
   `knowledge_index_queue` / chunks without an embedding / pending extractions,
   a scheduled newsletter that is due — and the HTTP hop happens only then. A
   cheap SELECT replaces a cold start. `gmail-reconcile` already guarded itself.
2. **Performance mode.** `cron_cadence` says what each platform job fires in
   `low` / `balanced` / `high`; `apply_performance_mode(mode)` is the **only
   writer** of those schedules (it alters only where the live schedule differs)
   and stores the mode in `site_settings.performance_mode`. Offsets are spread
   (`1-59/5`, `3-59/5`, `7-59/15`…) so jobs stop firing together.

| Mode | Dispatchers | Index / newsletter / gmail | Heartbeat | Fit |
|---|---|---|---|---|
| **low** (born default) | every 5 min | every 15 min | 1×/day | a site with light traffic on the smallest compute |
| **balanced** | every minute | every 5 min | 2×/day | a team working in FlowBox during the day |
| **high** | every minute | index every 2 min | 4×/day | busy inbox + chat; needs Small compute or larger |

Where the dial lives: **System → Observability → Performance mode** (admin),
the platform skills `performance_mode_status` / `set_performance_mode` (any
operator on the gateway), or `SELECT apply_performance_mode('low')` in SQL.
`performance_mode_status()` returns pg_cron's own evidence — ticks, failures
and startup timeouts in the last hour — so the card can say whether the
instance keeps up. A mode is a promise about reaction time, not a compute
upgrade: startup timeouts on `low` mean the database itself is too small.

Instances that already had their pulse when the migration landed keep it
(`balanced`); fresh installs are born `low`. The registrars
(`register_flowpilot_cron`, `register_knowledge_indexer_cron`) schedule in
pulse form and re-apply the mode after themselves, so a bootstrap gives the
right cadence without anyone remembering the dial.

## Runbook: ship a change to the fleet

> **One sync per day.** Every `sync-forks.sh` push makes Supabase's GitHub
> integration run a migration diff, an edge deploy and a PostgREST schema
> reload on *every* fork. Six syncs on 2026-09-04 plus the every-minute pulse
> exhausted autoversio's IO budget on Micro compute. Merge PRs to main as they
> go green; sync the forks **once a day**, or one fork alone when something is
> urgent for that instance. The forks' own "Supabase Deploy" GitHub jobs are
> no-ops without secrets — verify in `supabase_migrations.schema_migrations`,
> not on the green check.

After merging a change that touches **skills, handlers, or edge functions**:

1. **Regenerate the artifact** (if `skillSeeds` changed): `npm run skills:json`,
   commit `supabase/seed/module-skills.json`.
2. **Push to `main`** → flowwink.com frontend auto-deploys.
3. **Migrations** (if any) — apply to every instance:
   `supabase db push --project-ref <ref>` (or via `flowwink.sh`). All migrations
   are idempotent (`IF NOT EXISTS` / `CREATE OR REPLACE` / conditional `UPDATE`).
4. **Edge functions** (if changed) — deploy to every instance:
   `supabase functions deploy <fn> --no-verify-jwt --project-ref <ref>`.
   Public/agent-called functions **must** be `--no-verify-jwt` (and listed in
   `supabase/config.toml`) or server-to-server calls 401.
5. **Sync skills** to every instance: `DATABASE_URL=… npm run sync:skills -- --apply`.
6. **Forks** (autoversio.ai): `sync-forks.sh`; migrations/edge auto-deploy from the
   fork push (verify the fork's "Supabase Deploy" run) — step 5 (skills) is the one
   you still run by hand against the fork's DB.
7. **Verify**: `DATABASE_URL=… npm run lint:skill` per instance.

## Provisioning a brand-new site

1. Create the Supabase project (or point at a self-hosted Postgres + Deno).
2. Apply schema: `supabase db push --project-ref <ref>`.
3. Deploy edge functions (all of them) with `--no-verify-jwt` where required.
4. Seed skills: `DATABASE_URL=… npm run sync:skills -- --apply`.
5. Enable the modules the customer actually runs in `/admin/modules` (opt-in —
   inactive modules are deliberate, not "unused waste").
6. Register the instance-bound DB hooks (they bake THIS instance's URL + anon
   key into pg_cron jobs / trigger functions, so migrations alone can't do it):
   ```sql
   SELECT register_flowpilot_cron('https://<ref>.supabase.co', '<anon-key>');
   SELECT register_visitor_intent_trigger('https://<ref>.supabase.co', '<anon-key>');
   ```
7. Build/host the frontend (Vercel, VPS, or static).
8. **Set Supabase Auth's SITE_URL + redirect allowlist to the public domain.**
   Instance config, like secrets — no code can substitute for it. Auth SILENTLY
   REPLACES any redirect it does not recognise with SITE_URL, and a fresh
   project ships with `http://localhost:3000` and an EMPTY allowlist. Found the
   hard way on optic: the first real colleague invitation mailed a working,
   branded email whose button pointed at the recipient's own machine. It hits
   every auth mail — password reset and magic links too, not just invites.
   ```bash
   curl -X PATCH "https://api.supabase.com/v1/projects/<ref>/config/auth" \
     -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"site_url":"https://www.example.com",
          "uri_allow_list":"https://www.example.com/**"}'
   ```
   Include every domain the app is reachable on (apex, www, staging) —
   comma-separated, `/**` suffix. Verify with a GET on the same endpoint;
   `site_url` echoing back your domain is the proof.
9. **Point Supabase Auth at the operator's SMTP** (optional but recommended).
   Without it, auth mails go through Supabase's shared sender: wrong domain,
   unbranded, and a couple-per-hour cap that silently drops the third invite.
   Resend's SMTP credentials work directly. NOTE: this is separate from the
   platform's own `email-send` router — invite-colleague already routes its
   mail through that, but password resets and confirmations are sent by Auth
   itself and can only be branded here.

`scripts/flowwink.sh` (run via `npm run cli`) automates much of the per-project
plumbing (keys, migration status, function list, secrets).

## ⚠️ Avoid: renaming RPC params the frontend calls directly

Renaming a Postgres function's parameters (e.g. `_x` → `p_x`) forces a
**frontend + cron + DB lockstep** that cannot be coordinated under Vercel
auto-deploy — and Postgres can't expose both signatures at once. The currently
live frontend will break until all layers redeploy everywhere. Instead, keep the
param names and special-case the mapping in `agent-execute`
(`UNDERSCORE_PARAM_RPCS`). General rule: **fix frontend↔agent RPC-convention
mismatches in the dispatch layer, not by renaming the shared DB function.**

## Roadmap — hardening the distribution path

These are designed but not yet built; tackle before more developers distribute:

### 1. Baseline-squash the schema

450+ imperative migrations (~2.6 MB) make new-site setup slow and brittle; a
baseline replaces them with a single ~1 MB schema file (225 tables) + future
deltas. **This is a coupled prod operation** — the repo squash and a
`migration repair` on every existing instance must happen together, or the next
`supabase db push` to an existing site tries to re-create tables that already
exist and fails. **Validate on local Supabase first** (see
[local-development.md](./local-development.md)). Procedure:

```bash
# 1. Generate the baseline from a clean, fully-migrated instance (read-only).
supabase db dump --db-url 'postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres' \
  -f supabase/migrations/00000000000000_baseline.sql

# 2. VALIDATE LOCALLY before touching prod:
#    - archive the 450+ historical files (git mv supabase/migrations/2025*  …/_archive/)
#    - supabase db reset  → applies ONLY baseline + post-baseline deltas
#    - diff the resulting schema against a fully-migrated instance; they must match
#    - run sync:skills + lint:skill against the local DB → clean

# 3. Only once local is green, on EACH existing instance:
supabase migration repair --status applied 00000000000000 --db-url '<conn>'
#    (marks the baseline as already-applied so db push never re-runs it)

# 4. Commit the baseline + archived migrations.
```

Re-baseline every ~6 months as deltas accumulate.

### 2. Edge-function footprint vs the Supabase Free ceiling

Supabase caps functions per project by plan (Free 100 · Pro 500 · Team 1000).
FlowWink ships 100+, so a Free-tier fork that deploys all of them hits the wall.

**Selective deploy (implemented).** `flowwink.sh /update-funcs` deploys only the
functions a site's enabled modules need. The map is
`src/lib/edge-function-registry.ts` → `supabase/seed/edge-function-map.json`
(regenerate: `npm run edge-map:json`): ~37 **core** functions always deploy; the
rest are **module-bound** and skip only when *every* owning module is explicitly
disabled (fail-open — missing/unknown modules and brand-new functions always
deploy). Admins see the live footprint vs 100 on `/admin/modules`
(EdgeFunctionUsageCard) with an upgrade-to-Pro nudge as they grow into modules.
Force the old behaviour with `FLOWWINK_DEPLOY_ALL=1`. Adding a module with its
own function? Add it to `MODULE_EDGE_FUNCTIONS` and rerun `edge-map:json`.

Selective deploy only *skips* unneeded functions — it does not remove ones a
prior full deploy already pushed, so an existing instance won't drop below 100
from a deploy alone. To actually reduce the count, run `/update-funcs --prune`
(or `FLOWWINK_PRUNE=1`): it deploys first, then deletes only the extras
(deployed − required) after confirmation — **deploy-then-prune**, so a required
function is never momentarily missing. Prune is skipped if the deploy had
failures. Do NOT blind `delete-all` then redeploy on a live instance — that's a
multi-minute outage window; `--prune` achieves the same clean state with none.

**Consolidation into domain routers (DONE, 2026-07).** The edge-surface
refactor executed exactly this: transactional emails → `comms-send?kind=…`,
provider probes → `integrations-account`, FlowPilot lifecycle →
`flowpilot-lifecycle?task=…`, and dozens of thin functions → `internal:` skill
handlers in `agent-execute`. The surface is now ~75 functions — a fully-loaded
site fits the Free tier. Cron jobs were repointed host-preservingly by
migration; see `docs/architecture/edge-surface-classification.md` for the full
classification and the freeze principle (no new small edge functions).
3. **Fail loud on migrations.** `scripts/run-migrations.js` swallows errors so a
   Vercel build "succeeds" against a DB that never migrated — a prime drift
   source. Either fail the build, or decouple migrations from the build and run
   them only in the update runbook above.
4. **Release manifest.** A `flowwink.release.json` (schema baseline version,
   edge-function list, skill-seed version) so a site can report its version and
   an updater knows exactly what to apply.

## Related

- `src/lib/module-bootstrap.ts` — the upsert logic `sync-skills` mirrors.
- `src/pages/admin/ModulesPage.tsx` — the in-app "Sync skills from code" button.
- `scripts/skills-to-json.ts` / `scripts/sync-skills.ts` — the tools above.
- `docs/contributing/contributing.md` — idempotent migration patterns.
- `CLAUDE.md` → "Database Migrations" and "Deployment".
