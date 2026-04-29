# Running the Test Suite

Quick reference for running FlowWink's tests locally and in CI, plus how to refresh snapshots when the database schema or skill contracts change.

> Full overview of every test layer: [`test-suite.md`](./test-suite.md)
> Server-side L1–L6 autonomy tests: [`testing.md`](./testing.md)

---

## TL;DR

```bash
# Run everything Vitest knows about (guardrails + units)
npx vitest run

# Watch mode while developing
npx vitest

# A single file
npx vitest run src/lib/__tests__/recruitment-module.e2e.test.ts

# Filter by test name
npx vitest run -t "rpc skill"

# Lint all skills against Agent Contract Integrity
bun run lint:skills

# Lint a single skill
bun run lint:skill -- hire_application
```

---

## Local workflow

### 1. Install once

```bash
npm install
```

### 2. Run tests

```bash
npx vitest run        # one-shot, used by CI
npx vitest            # watch mode for development
npx vitest --ui       # browser UI (optional)
```

### 3. Coverage

```bash
npx vitest run --coverage
```

Reports land in `coverage/` (HTML in `coverage/index.html`).

### 4. Server-side autonomy tests (L1–L6)

These run **inside an edge function** — not via Vitest. Trigger from the admin UI:

```
/admin/autonomy-tests
```

See [`testing.md`](./testing.md) for details.

---

## CI

GitHub Actions runs the suite on every PR and push to `main` via `.github/workflows/ci.yml`:

| Step | Command | Blocks merge? |
|------|---------|--------------|
| ESLint | `npm run lint` | no (continue-on-error) |
| TypeScript | `npx tsc --noEmit` | no (continue-on-error) |
| **Vitest** | `npx vitest run` | **yes** |
| MCP module guard | `npm run verify:hr-modules` | no |
| Timesheet regression | `npm run test:timesheet-regression` | no |
| Build | `npm run build` | yes |

The MCP **live** regression runs in its own workflow (`.github/workflows/mcp-regression.yml`) on module changes + daily cron — kept out of PR CI so a flaky edge function doesn't block PRs.

---

## Updating snapshots

Some guardrails compare code against the **live database**. When a real-world schema or RPC changes, refresh the snapshot before the test will pass again.

### When to update which snapshot

| Symptom | Likely fix |
|---------|-----------|
| `rpc skill ↔ pg_proc arg mapping` fails after RPC signature change | `bun run scripts/snapshot-rpc-skill-args.ts` |
| `db NOT NULL coverage` fails after column added/changed | `bun run scripts/snapshot-db-not-nulls.ts` |
| New `rpc:*` skill seeded in code | `bun run scripts/snapshot-rpc-skill-args.ts` |
| New module added | re-run the full guardrail suite — module-registry will tell you exactly what's missing |

### How to update

```bash
# Refresh the RPC ↔ skill arg mapping snapshot
bun run scripts/snapshot-rpc-skill-args.ts

# Refresh the NOT NULL columns snapshot
bun run scripts/snapshot-db-not-nulls.ts

# Verify it all passes again
npx vitest run
```

Snapshots live in `src/lib/__tests__/fixtures/` and **must be committed** with the change that caused the drift.

### Why two layers?

The snapshot tests catch **drift between code and reality** — a skill that promises argument `template_id` while the live RPC actually expects `contract_template_id` would silently 500 in production. The guardrail forces the mismatch into the PR diff where humans can see it.

---

## Pre-release checklist for new skills

Before merging a PR that adds or changes a skill, run the **Skill Linter**:

```bash
bun run lint:skill -- <skill_name>
```

It runs the 4-layer Agent Contract Integrity checks:

1. **Arg-mapping** — every property maps to a real `p_*` RPC parameter
2. **NOT NULL coverage** — schema declares every required DB column
3. **Prompt quality** — `description` ≥ 30 chars + has `Use when:` / `NOT for:`
4. **Registry** — valid category + correct MCP exposure

Full checklist + theory: [`mem://architecture/agent-contract-integrity`](../../mem/architecture/agent-contract-integrity.md)
Linter details: [`mem://architecture/skill-linter`](../../mem/architecture/skill-linter.md)

---

## Edge function tests (Deno)

Lives under `supabase/functions/tests/` and runs with Deno, not Vitest:

```bash
# Use the supabase--test_edge_functions tool, or directly:
deno test --allow-net --allow-env supabase/functions/tests/
```

Requires `.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

---

## Common pitfalls

- **"7 vs 8 skills" failures** — a module's `skills:` array got an extra entry but `skillSeeds` (or the test's hardcoded list) didn't. Sync them.
- **Module not imported into `module-registry.ts`** — every `defineModule()` module must be imported in `src/lib/module-registry.ts` to self-register. The guardrail will name the missing module.
- **Snapshot mismatch but you didn't change the RPC** — someone else did and forgot to refresh the snapshot. Pull `main`, re-run snapshot scripts, commit.
- **`PGHOST` missing** in scripts that hit the database — make sure "Read database" is enabled in Lovable Cloud settings, or set `SUPABASE_DB_URL` manually.
