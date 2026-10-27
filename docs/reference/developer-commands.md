---
title: "Developer commands"
description: Every npm/bun script in the repo — what it does, when to run it, and what breaks if you skip it.
category: reference
---

# Developer commands

Verified against `package.json`. Everything here is safe to re-run.

## Day to day

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server. `predev` runs `scripts/run-migrations.js` first, so a fresh clone lands on a migrated database. |
| `npm run build` | Production build (also runs migrations first via `prebuild`). |
| `npm run lint` | ESLint over the repo. |
| `npx vitest run` | Full test suite. `npx vitest run <file>` for one file, `npx vitest` for watch mode. |
| `npm run cli` | The `scripts/flowwink.sh` operator CLI. |

## Modules, skills, blocks

| Command | What it does | Run it when |
|---|---|---|
| `npm run new:module` | Scaffolds a module in `src/lib/modules/`. | Adding a module |
| `npm run skills:json` | Regenerates `supabase/seed/module-skills.json` from `skillSeeds`. | Any skill change — the artifact feeds skill sync *and* the advertised-count guardrail |
| `npm run sync:skills` | Syncs skill definitions from code into `agent_skills` on an instance (dry-run; `-- --apply` writes). Needs `DATABASE_URL`. | After deploying skill changes |
| `npm run lint:skills` | Skill metadata linter (description quality, `Use when:` / `NOT for:`). | Before shipping a skill |
| `npm run lint:handler-args` | Checks handler argument contracts against `tool_definition`. | Before shipping a skill |
| `npm run lint:agent-contract` | Both of the above — the pre-release gate. | Before a release |
| `npm run sync-blocks` | Syncs block schema definitions into the block registry. | After changing a block's props |
| `npm run edge-map:json` | Regenerates the edge-function registry artifact. | After adding an edge function |
| `npm run manifest:json` | Regenerates the instance manifest. | Before provisioning/updating an instance |

## Documentation

| Command | What it does |
|---|---|
| `npm run docs:modules` | Regenerates every `docs/modules/<id>.md` **and** `docs/modules/index.md` (the catalog) from module code. Pages with `manual: true` in frontmatter are skipped. `-- --module <id>` for one module. |
| `npm run check:doc-drift` | Fails on a module without a doc, and on any dead relative link inside `docs/`. `-- --warn` to report without failing. |
| `npm run docs:frontmatter` | Reports docs missing `title` / `description` / `category`. Add `-- --write` to fill them in. |

## Verification and parity

| Command | What it does |
|---|---|
| `npm run verify:hr-modules` | HR module integrity check. |
| `npm run verify:mcp-invariant` | Asserts the MCP tool surface invariants. |
| `npm run test:mcp-regression` | MCP regression suite (runs the HR check first). |
| `npm run test:timesheet-regression` | Timesheet regression suite. |
| `npm run parity:report` | Regenerates the capability-benchmark scorecard (`docs/parity/parity-matrix.md`). `parity:check` fails on regressions. |
| `npm run local:smoke` | Local smoke run against a running instance. |
| `npm run flowpilot:sim` | Simulates a FlowPilot reasoning loop without touching production. |
| `npm run fleet:status` | Reports version/skill state across known instances. |

## Deploying to an instance

```bash
supabase db push --project-ref <ref>
supabase functions deploy <name> --no-verify-jwt --project-ref <ref>   # public functions
npm run skills:json && npm run sync:skills -- --apply                 # 4th layer: skills
```

A site is four layers — schema, skills, edge functions, frontend — and they drift
if deployed apart. Full runbook: [`../operators/provisioning-and-updates.md`](../operators/provisioning-and-updates.md).

---

*Slash commands inside FlowPilot chat are a different thing — see [`commands.md`](./commands.md).*
