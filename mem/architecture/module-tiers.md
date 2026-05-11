---
name: module-tiers
description: Core/Standard/Extended/Experimental tier budget that prevents OpenClaw-style platform drift; CORE_TIER_BUDGET=8, enforced by vitest guardrail
type: architecture
---

# Module Tiers

OpenClaw-prevention measure: every module MUST have a tier. Source of truth =
`src/lib/module-tiers.ts` (`MODULE_TIER_MAP`). Guardrail =
`src/lib/module-tiers.test.ts`.

| Tier | Budget | Default | Catalog |
|---|---|---|---|
| `core` | **≤ 8** | always on | hidden |
| `standard` | ∞ | on (opt-out) | shown |
| `extended` | ∞ | off (opt-in) | shown |
| `experimental` | ∞ | off (dev flag) | hidden |

**Promoting to `core` requires an RFC** + raising `CORE_TIER_BUDGET`. Bias
new verticals to `extended`. See `docs/architecture/module-tiers.md`.

Today's core: `developer`, `federation`, `documents`, `email` (4/8).
FlowPilot is `standard` — it's an operator layer, not platform foundation.
