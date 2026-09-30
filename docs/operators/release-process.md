---
title: "Release process"
description: FlowWink releases were sporadic (tags abandoned at v2.0.0/Feb, changelog abandoned at 1.3.0/May, both stale while main moved 9,000+ commits). 
category: operators
---

# Release process

FlowWink releases were sporadic (tags abandoned at v2.0.0/Feb, changelog abandoned at
1.3.0/May, both stale while main moved 9,000+ commits). This is the lightweight process
that keeps them honest. **A release is a statement: "this state is verified and
reproducible"** — for the fleet, for forks, and for self-hosted deployments pulling
the ghcr image.

## The moving parts (what a tag triggers)

Pushing a tag `vX.Y.Z` automatically:

1. **`release.yml`** → creates the GitHub Release, with the body extracted from the
   `## [X.Y.Z]` section of `CHANGELOG.md` (keep the heading format exact).
2. **`docker-image.yml`** → builds the self-hosted frontend image for
   linux/amd64 + arm64 and pushes **`ghcr.io/<owner>/flowwink-frontend:vX.Y.Z`**
   and **`:stable`**. (`:dev` / `:dev-<sha>` keep building from every main push.)

Nothing else is automatic — Supabase layers ship per instance (below).

## Release checklist

### 1. Verify (before touching version numbers)
- [ ] `npx vitest run` — full suite green (includes all guardrail tests).
- [ ] `npm run build` — production build passes.
- [ ] `bun run scripts/check-doc-drift.ts` — no drift.
- [ ] Skill metadata: `DATABASE_URL=<instance> bun run scripts/skill-linter.ts` → 0 errors.
- [ ] Core edge functions present per instance (Tier 1 in
      [edge-function-tiers.md](edge-function-tiers.md)).

### 2. Version + changelog
- [ ] Move the release-worthy `[Unreleased]` items into a new `## [X.Y.Z] - YYYY-MM-DD`
      section in `CHANGELOG.md`. Write for the reader (operator/fork owner), not the diff.
- [ ] `npm pkg set version=X.Y.Z` — package.json is the single version source.
- [ ] Commit: `chore(release): vX.Y.Z`.

### 3. Tag (this IS the release)
```bash
git tag -a vX.Y.Z -m "FlowWink vX.Y.Z"
git push origin main --follow-tags
```
- [ ] Watch the two workflow runs go green (`gh run list --limit 2`).
- [ ] Confirm the GitHub Release body picked up the changelog section.

### 4. Ship to instances (the 4-layer reality)
A "site" is four layers that drift unless shipped together — see
[provisioning-and-updates.md](provisioning-and-updates.md) for the full runbook:

| Layer | How |
|---|---|
| Schema | `supabase db push --project-ref <ref>` (forward-dated, idempotent migrations) |
| Edge functions | targeted `supabase functions deploy <fn> --no-verify-jwt --project-ref <ref>` — **never a blanket full deploy** (config.toml lacks verify_jwt entries for ~46 fns; see tiers doc) |
| Skills | `npm run sync:skills -- --apply` per instance, or admin "Sync skills from code" — **then re-run align-down (below)** |
| Frontend | Vercel auto (www/demo) · **self-hosted: bump the image tag to `:vX.Y.Z`** |

> ⚠️ **Order matters: skills sync → align-down.** `sync:skills` re-enables every skill
> its module owns, which silently resurrects skills whose edge function isn't deployed
> on that instance (18 came back across the fleet during the v3.0.0 ship). Always
> re-run the align-down afterwards: disable every `enabled` skill with an `edge:`
> handler whose function is absent, so the skill surface can't promise a 404.

> ⚠️ **Edge function cap is a hard wall.** At 100 functions a project rejects **all**
> deploys with `402 Max number of functions reached` — including updates to functions
> that already exist. www hit this during v3.0.0 and could not receive security fixes
> until two dead aliases were deleted. Keep margin; check the count before adding.

- [ ] After each instance: core-verify + cron health via `net._http_response`
      status codes (NOT `cron.job_run_details.status` — it lies).
- [ ] **Forks (autoversio.ai) do NOT auto-anything** — sync the fork, repeat the
      layers, **notify the owner**.

### 5. Announce
- [ ] Note the release + image tag in the ops channel / to fork owners.

## Versioning policy
- **MAJOR**: architecture arcs (identity ladder, FlowPilot 2.0) or breaking
  skill/API contracts external operators depend on.
- **MINOR**: new modules/skills/surfaces, backwards-compatible.
- **PATCH**: fixes only.
- The old `v2.0.0` tag (Feb, CMS era) is historical; numbering merged at v3.0.0.

## Cadence
Aim for a tagged release at the end of each major arc (every 2–4 weeks of active
work) rather than calendar-driven. `[Unreleased]` in the changelog is the staging
area — add lines as arcs land, so the release step is a rename, not archaeology.
