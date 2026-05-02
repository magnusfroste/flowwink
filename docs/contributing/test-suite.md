# Test Suite — Master Spec

> **Single source of truth for every test, guardrail, snapshot and regression script in FlowWink.**
> If you contribute code that touches skills, modules, RPCs, MCP, agents or templates: read this first.

Last updated: 2026-04-29

---

## TL;DR — What runs where

| Layer | Runner | Scope | Trigger |
|---|---|---|---|
| **Vitest unit + guardrails** | `npx vitest run` (Node, jsdom) | Pure logic, schema contracts, registry invariants, fixture diffs | Every PR (`ci.yml`) |
| **Deno edge tests** | `supabase--test_edge_functions` | Edge function HTTP contracts, validation logic | Manual / pre-deploy |
| **Server-side autonomy tests** | `run-autonomy-tests` edge function | L1–L6 of FlowPilot reasoning loop, live AI behaviour | Admin UI `/admin/autonomy-tests` |
| **Snapshot scripts** | `bun run scripts/snapshot-*.ts` | Refresh DB-derived fixtures when schema changes | Manual after migrations |
| **Regression scripts** | `npm run test:*-regression` | Live end-to-end against deployed Supabase | CI (`ci.yml`, `mcp-regression.yml`) + cron |
| **Skill Linter** | `bun run lint:skills` / MCP `lint_skill` | 4-layer Agent Contract Integrity check before release | Local + CI + agents |

---

## 1. Vitest unit + guardrail tests

Located in `src/lib/__tests__/`. Run all locally with `npx vitest run`, or one file with `npx vitest run <path>`.

### 1a. Agent Contract Integrity (the 4-layer model)

These enforce `mem://architecture/agent-contract-integrity` — every skill exposed to agents must match its handler/DB contract.

| File | Layer | What it asserts | Fix when red |
|---|---|---|---|
| `rpc-skill-arg-drift.guardrails.test.ts` | L1 Arg-mapping | Every `rpc:*` skill's properties resolve (after `p_` prefix) to real `pg_proc` arguments. Live snapshot, catches direct-DB seeds. | Either fix RPC signature OR update skill schema, then `bun run scripts/snapshot-rpc-skill-args.ts`. |
| `agent-execute-rpc-arg-mapping.test.ts` | L1 Arg-mapping | Unit test for the `mapRpcArgs()` transform itself (strip `_*`, prefix `p_`). | Don't change `mapRpcArgs` without updating this test. |
| `skill-schema-not-null-coverage.guardrails.test.ts` | L2 Schema coverage | Every `db:<table>`-backed `manage_*` skill exposes all NOT NULL columns (no default), marked `required` per write action. | Add column to schema OR list as auto-filled in `fixtures/db-not-null-columns.json`. Run `snapshot-db-not-nulls.ts`. |
| `manage-leads-status-aliases.test.ts` | L3 Value domain | `normalizeLeadStatus()` maps every alias (new→lead, won→customer, etc.) to a real DB enum. | Update both the resolver in `agent-execute` and the test together. |

**Fixtures** under `src/lib/__tests__/fixtures/`:
- `rpc-skill-args.json` — live snapshot of `(skill_name, rpc_name, pg_args, skill_props)` from DB
- `db-not-null-columns.json` — `(table, column)` pairs + `_skill_auto_filled_columns.<skill>` exemption list

### 1b. Module / MCP / Federation registry

| File | What it asserts |
|---|---|
| `module-registry.guardrails.test.ts` | Every module exported from `src/lib/modules/index.ts` is wired into `module-registry.ts`; manifest shape valid. |
| `mcp-contract.guardrails.test.ts` | MCP server's exposed tool list matches `skillSeeds` of all modules with `mcp_exposed=true`. |
| `mcp-flowpilot-decoupling.test.ts` | MCP and skill bootstrap happen even when FlowPilot module is OFF (Law: MCP is platform-level). |
| `hr-suite-mcp-registry.guardrails.test.ts` | Static CI version of `verify-hr-modules.ts` — HR-suite skills reachable via MCP. |
| `recruitment-module.e2e.test.ts` | Toggle module → bootstrap → MCP exposure pipeline end-to-end. |
| `federation-invite-peer.test.ts` | `invite_peer` flow generates valid gateway tokens + connection rows. |

### 1c. Domain logic

| File | What it asserts |
|---|---|
| `period-lock.test.ts` | `close_accounting_period` locks `time_entries` via trigger. Requires Supabase env. |
| `reconciliation.test.ts` | `reconciliation/import-image` preview→commit two-step never auto-commits. Requires Supabase env. |
| `manage-deal-auto-lead.test.ts` | `manage_deal` auto-creates a lead if none exists, never duplicates. |

### 1d. Templates & locale

| File | What it asserts |
|---|---|
| `template-validation.test.ts` | Every entry in `ALL_TEMPLATES` passes `validateTemplate` (block schemas, required fields). |
| `locale-packs.guardrails.test.ts` | Every locale pack declares ≥1 `accounting_export_adapters[]` and required chart-of-accounts fields. |

### 1e. Other unit tests

- `src/lib/utils.test.ts` — generic helpers
- `src/lib/csv-utils.test.ts` — CSV import/export round-trip

---

## 2. Deno edge function tests

Located in `supabase/functions/tests/`. Run via `supabase--test_edge_functions` MCP tool (Deno + `--allow-net --allow-env`).

| File | Coverage |
|---|---|
| `integration-autonomy.test.ts` | `agent-execute` rejects missing skill, returns 404 for unknown, accepts `objective_context`, blocks external scope from chat. `flowpilot-heartbeat` CORS + structured response. |
| `manage-page-blocks-validation.test.ts` | `manage_page_blocks` skill validates block schema before writing `content_json`. |
| `scenario-eval-suite.test.ts` | Scenario-based agent evaluation harness. |

These run **outside** the Vitest pipeline because they hit live edge functions. Use before deploying changes to `agent-execute`, `flowpilot-heartbeat`, or block-related edges.

---

## 3. Server-side autonomy tests (L1–L6)

Lives entirely in `supabase/functions/run-autonomy-tests/index.ts`. Triggered from `/admin/autonomy-tests`.
**Full guide:** [`testing.md`](./testing.md).

| Layer | Tests |
|---|---|
| L1 Unit | Pure functions in `agent-reason.ts` (prompt builders, token math) |
| L2 Integration | Edge endpoints (`agent-execute`, `flowpilot-heartbeat`) |
| L3 Scenario | DB persistence, RLS, atomic checkout, stale-recovery |
| L4 Autonomy Health | Soul/skills/objectives seeded for active modules |
| L5 Wiring | End-to-end data flow: soul→prompt, memory→context, lock→skip |
| L6 Behavior | OMATS Stage 3 — personality, idle discipline, grounding, scope |

Add new layer-N tests inside `layer{N}Tests()` in the runner, then redeploy `run-autonomy-tests`.

---

## 4. Snapshot scripts

These regenerate fixtures from the **live database** so guardrail tests reflect reality. Run after any migration that adds/changes RPCs or NOT NULL columns.

| Script | What it does | Output |
|---|---|---|
| `scripts/snapshot-rpc-skill-args.ts` | Joins `agent_skills` (rpc:* handler) with `pg_proc` to capture `(skill_name, rpc_name, pg_args, skill_props)`. | `src/lib/__tests__/fixtures/rpc-skill-args.json` |
| `scripts/snapshot-db-not-nulls.ts` | Reads `information_schema.columns` for all NOT NULL columns without default. | `src/lib/__tests__/fixtures/db-not-null-columns.json` |
| `scripts/sync-block-schema.ts` | Regenerates block JSON schemas from TypeScript types. | Block schema files |
| `scripts/templates-to-json.ts` | Compiles `src/data/templates/*.ts` into installable JSON. | `templates/*.json` |

**Workflow:** modify migration → push → run snapshot → guardrail tests now compare against new reality.

---

## 5. Regression scripts (live)

Run against deployed Supabase. Require env vars (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `MCP_ADMIN_JWT`, `MCP_PROJECT_ID`).

| Script | npm script | What it does |
|---|---|---|
| `scripts/mcp-regression.ts` | `test:mcp-regression` | Live JSON-RPC handshake + `tools/list` diff against deployed `mcp-server`. Detects drift between code-declared skills and what MCP actually exposes. |
| `scripts/timesheet-regression.ts` | `test:timesheet-regression` | Full timesheet → invoice flow against live DB; verifies quote-to-cash automation. |
| `scripts/verify-hr-modules.ts` | `verify:hr-modules` | Static check that every HR skill is registered in module + MCP exposure flag. Runs as `pretest:mcp`. |

CI wiring:
- `.github/workflows/ci.yml` — runs Vitest + `verify:hr-modules` + `test:timesheet-regression` on every PR (last two `continue-on-error`).
- `.github/workflows/mcp-regression.yml` — runs `mcp-regression` on module changes + daily 06:00 UTC cron. Opens GitHub Issue on drift.

---

## 6. Skill Linter — pre-release Agent Contract check

The Skill Linter executes the full Agent Contract Integrity checklist as a single command. See `mem://architecture/skill-linter`.

```bash
bun run lint:skills              # all enabled skills
bun run lint:skill <skill_name>  # one skill
bun run lint:skill --json        # CI-friendly output
```

Also exposed as MCP skill `lint_skill` (handler `internal:lint_skill`) so FlowPilot/peers can self-audit before merging.

**4 layers checked:**
1. Arg-mapping (rpc:* properties ↔ `p_`-prefixed `pg_proc` args)
2. NOT NULL coverage (db:* schemas vs `information_schema`, with auto-fill exemptions)
3. Description quality (≥30 chars, contains `Use when:` and `NOT for:` per Law 2)
4. Registry (category set, mcp_exposed status correct)

Exit code 1 if any `severity=error` finding → CI-blockable.

SQL helpers (SECURITY DEFINER, read-only):
- `lint_get_rpc_signatures()` — function + parameter names
- `lint_get_not_null_columns()` — NOT NULL columns without default

---

## 7. Pre-release checklist for new skills/modules

Before merging a PR that adds an `rpc:*`, `db:*`, `edge:*` or `internal:*` skill:

1. ☐ Handler exists and is callable (RPC migration / edge deployed / `internal:` case in `agent-execute`)
2. ☐ All RPC params use `p_` prefix
3. ☐ Skill schema mirrors DB NOT NULL (or listed in `_skill_auto_filled_columns`)
4. ☐ Per-action `required` set in `allOf/if/then` for `create`/`update`/`delete`
5. ☐ Description has `Use when:` and `NOT for:` (Law 2)
6. ☐ Module declares skill in `skillSeeds` (not just direct DB seed)
7. ☐ Snapshots regenerated (`snapshot-rpc-skill-args.ts` + `snapshot-db-not-nulls.ts`)
8. ☐ `bun run lint:skills` exits clean
9. ☐ `npx vitest run src/lib/__tests__/*.guardrails.test.ts` green
10. ☐ Module + MCP guardrails green (`module-registry`, `mcp-contract`)

Reference: `mem://architecture/agent-contract-integrity`, `mem://constraints/rpc-skill-arg-prefix-convention`, `mem://constraints/skill-schema-must-mirror-db-not-null`.

---

## 8. Where to add a new test

| You changed… | Add test to… |
|---|---|
| A pure function | New `*.test.ts` next to source OR in `src/lib/__tests__/` |
| A new RPC | Migration → re-run `snapshot-rpc-skill-args.ts` (existing guardrail covers it) |
| A new NOT NULL column | Migration → re-run `snapshot-db-not-nulls.ts` |
| A new module | `module-registry.guardrails.test.ts` auto-covers; add E2E like `recruitment-module.e2e.test.ts` if it has a multi-step flow |
| A new MCP-exposed skill | Run `lint:skills` — it'll tell you what's missing |
| New edge function endpoint | Add Deno test in `supabase/functions/tests/` |
| New agent reasoning step | Add L1/L3 test in `run-autonomy-tests/index.ts` |
| A new template | `template-validation.test.ts` auto-covers |

---

## 9. Conventions

- **Naming:** `subject: describes behavior` — e.g. `"manage_leads: status alias 'won' maps to 'customer'"`
- **Cleanup:** any test inserting DB rows uses `try/finally` with markers like `"TEST — safe to delete"`
- **Assertions:** prefer `expect(actual, msg).toEqual(expected)` so failure messages are self-explanatory
- **Don't gate PRs on flaky live tests** — wrap in `continue-on-error` in CI when they hit deployed Supabase
- **Guardrail vs unit:** `*.guardrails.test.ts` = invariants over generated/seeded data; `*.test.ts` = behaviour of one function/module
