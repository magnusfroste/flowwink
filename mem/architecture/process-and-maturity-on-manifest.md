---
name: process-and-maturity-on-manifest
description: Every defineModule() declares processes[] (ProcessId) + maturity (L1..L5); enforced by guardrail; powers /admin/process-coverage
type: architecture
---

# Process + Maturity on Module Manifest

Every module under `src/lib/modules/` declares **which business processes it
participates in** and **at what maturity level**, directly on the
`defineModule()` manifest. This is the single source of truth used by:

- `docs/processes/README.md` — sales-facing coverage map
- `/admin/process-coverage` (planned) — live grid grouping modules per process
- `scripts/process-smoke.ts` (planned) — happy-path tests per process

## Shape

```ts
defineModule({
  id: 'invoicing',
  name: 'Invoicing',
  version: '1.0.0',
  processes: ['quote-to-cash', 'procure-to-pay', 'record-to-report'],
  maturity: 'L4',
  capabilities: [...],
  inputSchema, outputSchema,
  // ...
});
```

## ProcessId enum

Canonical list in `src/lib/processes.ts`:

```
lead-to-customer | quote-to-cash | procure-to-pay | order-to-delivery |
hire-to-retire   | content-to-conversion | record-to-report | support-to-resolution
```

Add a new process: update `PROCESS_IDS` + write `docs/processes/<id>.md`.
Guardrail `process-coverage.guardrails.test.ts` fails if a process has zero
owning modules (orphan in docs).

## Maturity scale

`L1` stub · `L2` manual · `L3` operational · `L4` agent-augmented · `L5` production-grade

If a module spans multiple processes at different maturities, declare the
**lowest** level. Process-level overrides live in `docs/processes/<process>.md`.

## Guardrails

`src/lib/__tests__/process-coverage.guardrails.test.ts` enforces:
1. Every module has a valid `maturity`
2. Every module has a literal `processes: [...]` (empty allowed for platform modules: `email`, `developer`, `federation`, `flowpilot`, `composio`, `templates`, `river`, `workspaceChat`)
3. All declared process IDs are known
4. Every `ProcessId` has ≥1 owner module

## Retro-fill script

`scripts/inject-process-maturity.ts` — one-shot idempotent injector used to
backfill all 63 modules in 2026-05. Kept for reference and re-runs after adding
a new module (script is a no-op for already-tagged modules).
