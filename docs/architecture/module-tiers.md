# Module Tiers

> **Why this exists:** OpenClaw shipped everything as "core" until the project
> could no longer be reasoned about. Tiers are FlowWink's budget against that
> drift — an explicit, test-enforced contract for what counts as platform
> foundation vs. opt-in capability.

## The four tiers

| Tier | Budget | Default enabled | Shown in catalog | Examples |
|---|---|---|---|---|
| `core` | **≤ 8 modules** | Yes (no opt-out) | No | `developer`, `federation`, `documents`, `email` |
| `standard` | unlimited | Yes (opt-out per site) | Yes | `crm`, `blog`, `pages`, `invoicing`, `flowpilot` |
| `extended` | unlimited | No (opt-in) | Yes | `payroll`, `manufacturing`, `pos`, `fixed-assets` |
| `experimental` | unlimited | No (opt-in via dev flag) | No | new / preview modules |

## Where it lives

- **Source of truth:** `src/lib/module-tiers.ts` (`MODULE_TIER_MAP`)
- **Type on each module:** `UnifiedModuleDef.tier?` in `src/lib/module-def.ts`
- **Guardrail:** `src/lib/module-tiers.test.ts` — fails CI if the core budget is exceeded

## Adding a module

1. Pick the **lowest tier** that fits. Bias towards `extended` for new verticals.
2. Add the entry to `MODULE_TIER_MAP`.
3. Run `bun run lint:skills` + `npx vitest run module-tiers`.

## Promoting a module to `core`

Promoting to `core` is an **architectural decision**, not a refactor.

1. Open an RFC describing why the capability is foundational (used by
   ≥ 90% of installs, owns shared schema, or is required by the agent loop).
2. If approved, raise `CORE_TIER_BUDGET` in `src/lib/module-tiers.ts`.
3. Update this doc and `mem://architecture/module-tiers`.

## Anti-patterns

- ❌ Marking a module `core` because it "feels important". Use `standard`.
- ❌ Bumping `CORE_TIER_BUDGET` without an RFC.
- ❌ Vertical modules (industry-specific) at `standard`. Use `extended`.
