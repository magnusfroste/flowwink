# Edge-function tiers — mandatory vs optional

> **Updated 2026-07-21 after the edge-surface consolidation.** The deployable
> surface shrank from ~115 to **75 functions** (see
> [`docs/architecture/edge-surface-classification.md`](../architecture/edge-surface-classification.md)
> for the thesis and the executed migration). The **code source of truth** for
> which functions exist and which modules own them is
> `src/lib/edge-function-registry.ts` (guardrail-tested against the
> filesystem); this doc is the operator's mental model on top of it.

The fleet keeps a **deliberately partial** edge-function set per instance: not every
module is enabled everywhere, and each Supabase project stays **under ~100 edge
functions** (now with real margin — the full surface is 75) by design. So a
"missing function" is usually intentional, **not** a bug.

**Guiding principle (Magnus, 2026-07-18):** *core must work; an optional function missing
for an enabled module is not the end of the world.* The coherence fix for optional gaps is
to **align the skill layer down to what's deployed** (disable the exposed skill so the agent
never 404s) — not to deploy up and blow the budget.

## What the consolidation changed

Former standalone functions now live as **tasks/handlers inside a small kernel**:

- `flowpilot-lifecycle` (`?task=briefing|distill|learn|followthrough|curator`)
  replaced `flowpilot-briefing`, `flowpilot-distill`, `flowpilot-learn`,
  `flowpilot-followthrough`, `skill-curator`.
- `comms-send` consolidated the outbound-email senders
  (booking/order/invoice/quote/contact confirmations, reminders, newsletter send).
- `integrations-account` consolidated the `*-account` provider-key functions
  (openai, elevenlabs, hunter, firecrawl, unsplash).
- `instance-health?check=cron` absorbed the cron-health report surface.
- Dozens of thin "handlers in disguise" (reconciliation, sla-check, survey-send,
  extract-receipt-style workers, …) moved to `internal:` skill handlers executed
  by `agent-execute` — no HTTP function at all.

Cron jobs were repointed to the new endpoints host-preservingly during the
refactor; old function names in an instance's cron table are drift — the
Observability tab's cron-health card flags them.

## Tier 1 — CORE (mandatory on EVERY instance)

The platform/agent cannot function without these. If any is missing on an instance,
**deploy it** — non-negotiable, module-independent.

| Function | Why core |
|---|---|
| `get-page` | serves every public page (the site itself) |
| `content-api` | programmatic content access |
| `chat-completion` | THE AI endpoint — FlowPilot + visitor chat + all AI calls |
| `agent-execute` | skill-execution engine (every skill runs through it, incl. all `internal:` handlers) |
| `mcp-server` | outward MCP gateway + `/rest/*` (external agents) |
| `automation-dispatcher` | the per-minute automation tick |
| `flowpilot-heartbeat` | the autonomous ReAct loop |
| `flowpilot-lifecycle` | briefing/distill/learn/followthrough/curator tasks |
| `knowledge-indexer` | RAG chunk index (grounding) |
| `web-search` + `web-scrape` | FlowPilot research (any research-driven objective) |
| `instance-health` | ops/health monitoring (incl. `?check=cron`) |
| `comms-send` | all transactional/outbound email |
| `newsletter` | scheduled dispatch (`/newsletter/dispatch-scheduled` cron target) |

The exact core set = functions NOT claimed by any module in
`MODULE_EDGE_FUNCTIONS` (`src/lib/edge-function-registry.ts`,
`coreEdgeFunctions()`). Fail-open: an unmapped function counts as core.

## Tier 2 — MODULE-optional (deploy iff the module is enabled)

Present only when the owning module is on. If the module is **off**, the function is
absent by design → the matching skill must be **disabled** (align-down), not the function
deployed. The authoritative module→function map is `MODULE_EDGE_FUNCTIONS` in
the registry; the Modules admin page shows the computed footprint per plan tier.

## Tier 3 — ADMIN / infra-optional

Admin tooling, deployed as needed. These SHOULD stay `verify_jwt=true` (admin-authenticated):
`create-user`, `setup-database`, `check-secrets`, `system-integrity-check`,
`test-ai-connection`, `run-autonomy-tests`, `run-platform-tests`,
`integrations-account`. Webhooks (`stripe-webhook`, `email-webhook`,
`composio-webhook`) are `verify_jwt=false` but only relevant with their integration.

## Operational rules

1. **Core-verify on every deploy/provision:** confirm all Tier-1 functions are present on
   the instance. Missing → deploy (`--no-verify-jwt` for the public ones).
2. **Optional gap ≠ bug:** a module function missing while its module is enabled → disable
   the exposed skill (align-down), don't blow the budget. Reversible.
3. **Skill surface must mirror deployed capability** (Law 2): an `enabled + mcp_exposed`
   skill whose `edge:` function isn't deployed 404s — disable it.
4. **Check `config.toml` before a blanket full deploy.** Functions without a
   `[functions.X]` entry default to `verify_jwt=true` on deploy. Most of the
   unlisted ones are admin functions where that's correct, but verify the
   public/webhook/payment set (`create-checkout`, `create-invoice-payment`,
   `quote-pay`, `stripe-webhook`, …) has explicit `verify_jwt=false` entries,
   or deploy targeted with `--no-verify-jwt`.
5. **Budget:** with 75 total functions the full surface now fits the Free-tier
   ceiling (100) even with everything enabled — the freeze principle
   (no new small edge functions; new capability = skill/handler) keeps it that way.
