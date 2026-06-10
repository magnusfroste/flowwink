---
title: "NN.x — <Issue title>"
epic: EPIC-NN
capability: "capabilities/<module>.json#<id>"
estimate: <S|M|L>
status: todo            # todo | in-progress | review | done
---

# NN.x — <Issue title>

## Context
<Why this exists. Link to the audit finding / capability. Enough that a fresh
agent needs no other reading.>

## Scope
**In:** <exact deliverable>
**Out:** <explicitly excluded, to keep the issue atomic>

## Exact changes
- **Migration:** `supabase/migrations/<new>.sql` — <tables/columns, idempotent>
- **Module:** `src/lib/modules/<module>-module.ts` — <new skill seed(s) + metadata>
- **Handler:** `supabase/functions/_shared/pilot/handlers.ts` (or edge fn) — <logic>
- **Admin UI:** `src/components/admin/<area>/...` — <what the human sees>
- **Types/contracts:** `src/types/module-contracts.ts` — <Zod schema if cross-module>

## Acceptance criteria
- [ ] <Concrete, verifiable behaviour 1>
- [ ] <Concrete, verifiable behaviour 2>
- [ ] Skill metadata passes `bun run scripts/skill-linter.ts` (if a skill is added)
- [ ] Migration is idempotent (re-runnable; uses IF NOT EXISTS / CREATE OR REPLACE)

## Test command
```bash
npx vitest run <path/to/new.test.ts>
# + any regression suite touched, e.g. npm run test:mcp-regression
```

## Definition of Done
- [ ] Acceptance criteria met
- [ ] `capabilities/<module>.json#<id>` flipped (`missing`→`partial`/`done`)
- [ ] `bun run scripts/parity-report.ts` run; regenerated matrix committed
- [ ] `npm run lint` clean
- [ ] Draft PR opened with this checklist
