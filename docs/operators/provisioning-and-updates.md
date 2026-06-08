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

1. **Baseline-squash the schema.** 450+ imperative migrations make new-site setup
   slow and brittle. Generate `supabase/migrations/00000000000000_baseline.sql`
   from a clean, fully-migrated instance (`supabase db dump --schema-only`),
   `supabase migration repair --status applied 00000000000000` on the existing
   fleet, archive the historical migrations, and keep only post-baseline deltas.
   Re-baseline every ~6 months.
2. **Consolidate edge functions into domain routers.** ~99 functions sits at the
   Supabase free-tier ceiling. Merge thin senders behind one router each (the
   `reconciliation` / `a2a` functions already route sub-paths via
   `url.pathname`): `send-*-email` → `notify`, `newsletter-*` → `newsletter`,
   `enrich-*` / `prospect-*` → `enrich`. Target well under 100.
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
