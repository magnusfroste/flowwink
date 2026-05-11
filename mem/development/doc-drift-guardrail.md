---
name: Doc-drift guardrail
description: scripts/check-doc-drift.ts verifies every registered module has docs/modules/<id>.md; CI runs in --warn mode
type: preference
---

`bun run check:doc-drift` (or `--warn` for advisory) iterates
`getAllUnifiedModules()` and asserts a matching `docs/modules/<id>.md`
exists. Aliases handled for kebab/camel mismatches (e.g. `multiCurrency` →
`multi-currency.md`).

**CI:** Runs in `.github/workflows/ci.yml` as `Doc drift` step with
`--warn + continue-on-error` until backlog is cleared, then flip to hard-fail.

**Current backlog (3):** `multiCurrency`, `fixedAssets`, `payroll` — need
docs/modules/*.md files written.

**How to apply:** Every new module manifest MUST ship with a matching
`docs/modules/<id>.md`. Add to alias map in the script if id doesn't
naturally kebab-case to a filename.
