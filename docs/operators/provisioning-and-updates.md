# Provisioning & Updates — keeping every FlowWink site in sync

> How to stand up a new FlowWink site and how to ship changes to the sites
> already in production — without the layers drifting apart.

FlowWink is **self-hosted, one Supabase project per customer**. That distribution
model is its strength (run on a VPS or a free Supabase micro instance) and its
main operational challenge: a "site" is not one artifact, it's **four layers**,
each deployed by a different mechanism. When they fall out of sync, skills break
in ways that pass local tests — exactly the class of bug we chased across the
fleet in mid-2026.

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

## Deployment topology (the live fleet)

| Site | Supabase ref | Frontend deploy |
|------|--------------|-----------------|
| www.flowwink.com | `hebytraibjmbqntsljph` | **Vercel auto** from `magnusfroste/flowwink` `main` |
| demo.flowwink.com | `lcztuuaxulxivhbnkcpm` | **Vercel auto** from `main` |
| www.autoversio.ai | `trpejhoieysrwiuhskkm` | **Fork** of the repo → does **not** auto-deploy. Sync the fork + redeploy manually. **Notify the owner.** |
| www.liteit.se | `cdwpqcevbcbqxhycsqhm` | Separate Supabase account — deploy with that account's token |

- **Pushing to `main`** auto-deploys the *frontend* to flowwink.com + demo only.
- **Edge functions and DB migrations are never deployed by a git push** — they
  go out per instance via the steps below.
- **Forks (autoversio.ai)** need a manual fork-sync + redeploy. Always flag when
  a change needs to reach a fork.

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
(which don't auto-deploy from `main`). Instances live in `scripts/fleet.json`
(refs only, no secrets). Run it after a fleet-wide update, or on a schedule, to
catch a site that has drifted.

## Runbook: ship a change to the fleet

After merging a change that touches **skills, handlers, or edge functions**:

1. **Regenerate the artifact** (if `skillSeeds` changed): `npm run skills:json`,
   commit `supabase/seed/module-skills.json`.
2. **Push to `main`** → flowwink.com + demo frontends auto-deploy.
3. **Migrations** (if any) — apply to every instance:
   `supabase db push --project-ref <ref>` (or via `flowwink.sh`). All migrations
   are idempotent (`IF NOT EXISTS` / `CREATE OR REPLACE` / conditional `UPDATE`).
4. **Edge functions** (if changed) — deploy to every instance:
   `supabase functions deploy <fn> --no-verify-jwt --project-ref <ref>`.
   Public/agent-called functions **must** be `--no-verify-jwt` (and listed in
   `supabase/config.toml`) or server-to-server calls 401.
5. **Sync skills** to every instance: `DATABASE_URL=… npm run sync:skills -- --apply`.
6. **Forks** (autoversio.ai): sync the fork, then repeat 3–5 against it. **Notify
   the fork owner** — a `main` push does not reach it.
7. **Verify**: `DATABASE_URL=… npm run lint:skill` per instance.

## Provisioning a brand-new site

1. Create the Supabase project (or point at a self-hosted Postgres + Deno).
2. Apply schema: `supabase db push --project-ref <ref>`.
3. Deploy edge functions (all of them) with `--no-verify-jwt` where required.
4. Seed skills: `DATABASE_URL=… npm run sync:skills -- --apply`.
5. Enable the modules the customer actually runs in `/admin/modules` (opt-in —
   inactive modules are deliberate, not "unused waste").
6. Build/host the frontend (Vercel, VPS, or static).

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

**Consolidation into domain routers (optional, not done).** If even a
fully-loaded site (all modules on → full count → needs Pro) must fit Free, fold
clusters — transactional emails → `email-send`, provider probes → one function.
`reconciliation` / `a2a` already route sub-paths via `url.pathname`, so the
pattern exists. **Same lockstep tail as the RPC rename above:** functions are
invoked by the admin frontend directly and forks don't auto-deploy — ship the
router additively, migrate all callers, redeploy all frontends, *then* delete the
old functions. No dead functions to delete outright (zero-reference ones are
crons/webhooks/test runners). A planned migration, not a quick win.
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
