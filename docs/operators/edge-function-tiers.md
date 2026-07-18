# Edge-function tiers — mandatory vs optional

The fleet keeps a **deliberately partial** edge-function set per instance: not every
module is enabled everywhere, and each Supabase project stays **under ~100 edge
functions** (with margin) by design. So a "missing function" is usually intentional,
**not** a bug. This doc is the mental model for what must be there vs what may be absent.

**Guiding principle (Magnus, 2026-07-18):** *core must work; an optional function missing
for an enabled module is not the end of the world.* The coherence fix for optional gaps is
to **align the skill layer down to what's deployed** (disable the exposed skill so the agent
never 404s) — not to deploy up and blow the budget. See
`memory: project-fleet-edge-skill-alignment`.

## Tier 1 — CORE (mandatory on EVERY instance)

The platform/agent cannot function without these. If any is missing on an instance,
**deploy it** — non-negotiable, module-independent.

| Function | Why core |
|---|---|
| `get-page` | serves every public page (the site itself) |
| `content-api` | programmatic content access |
| `chat-completion` | THE AI endpoint — FlowPilot + visitor chat + all AI calls |
| `agent-execute` | skill-execution engine (every skill runs through it) |
| `mcp-server` | outward MCP gateway + `/rest/*` (external agents) |
| `automation-dispatcher` | the per-minute automation tick |
| `flowpilot-heartbeat` | the autonomous ReAct loop |
| `flowpilot-learn` | learning loop (nightly) |
| `flowpilot-followthrough` | resumption of staged/multi-step ops |
| `knowledge-indexer` | RAG chunk index (grounding) |
| `web-search` + `web-scrape` | FlowPilot research (any research-driven objective) |
| `instance-health` | ops/health monitoring |
| `newsletter` | scheduled dispatch (`/newsletter/dispatch-scheduled` cron target) |

Verified present on all four fleet instances 2026-07-18 (liteit, www, demo, autoversio).

## Tier 2 — LIFECYCLE-optional

FlowPilot lifecycle niceties that aren't loop-critical. Deploy where wanted; a missing one
with **no cron referencing it** is dormant, not broken.

- `flowpilot-distill` — periodic memory consolidation (no cron on the fleet → dormant, fine)
- `flowpilot-briefing` — daily business briefing (deploy only where a `run_daily_briefing`
  automation is wanted; e.g. skipped on www to hold its 100-function margin)

## Tier 3 — MODULE-optional (deploy iff the module is enabled)

Present only when the owning module is on. If the module is **off**, the function is
absent by design → the matching skill must be **disabled** (align-down), not the function
deployed. Examples:

- commerce: `create-checkout`, `create-invoice-payment`
- subscriptions: `subscriptions`, `subscription-billing-cron`
- reconciliation: `reconciliation`
- accounting (SE): `accounting-vat-return-se`, `fetch-fx-rates`
- recruitment: `parse-resume`, `process-job-application`
- sales-intelligence: `prospect-research`, `prospect-fit-analysis`, `sales-profile-setup`,
  `qualify-lead`, `enrich-company`, `contact-finder`
- field-service: `field-service-skill`
- contact-center / live-support: `contact-center`, `support-router`, `telegram-ingest`
- customer360: `customer-360`
- surveys: `survey-send`, `csat-dispatch`
- sla: `sla-check`
- media/site: `media-optimize`, `migrate-page`, `analyze-brand`, `github-content-sync`
- integrations: `composio-proxy`, `browser-fetch`, `firecrawl-account`, `hunter-account`

## Tier 4 — ADMIN / infra-optional

Admin tooling, deployed as needed. These SHOULD stay `verify_jwt=true` (admin-authenticated):
`create-user`, `setup-database`, `check-secrets`, `system-integrity-check`,
`test-ai-connection`, `run-autonomy-tests`, `run-platform-tests`, `*-account` (openai,
elevenlabs, hunter, firecrawl). Webhooks (`stripe-webhook`, `email-webhook`,
`composio-webhook`) are `verify_jwt=false` but only relevant with their integration.

## Operational rules

1. **Core-verify on every deploy/provision:** confirm all Tier-1 functions are present on
   the instance. Missing → deploy (`--no-verify-jwt` for the public ones).
2. **Optional gap ≠ bug:** a Tier-3 function missing while its module is enabled → disable
   the exposed skill (align-down), don't blow the budget. Reversible.
3. **Skill surface must mirror deployed capability** (Law 2): an `enabled + mcp_exposed`
   skill whose `edge:` function isn't deployed 404s — disable it.
4. **⚠️ `config.toml` is incomplete for full deploys.** 46/124 functions have no
   `[functions.X]` entry → a full `supabase functions deploy` defaults them to
   `verify_jwt=true`, which would JWT-gate public/webhook/payment functions
   (`create-checkout`, `create-invoice-payment`, `quote-pay`, `stripe-webhook`, …).
   **Do NOT do a blanket full deploy** until config.toml lists `verify_jwt=false` for the
   public set. Deploy targeted with `--no-verify-jwt` instead.
5. **Budget:** stay under ~100 edge functions per project with margin. www currently sits at
   100 — reclaim before adding (e.g. drop `web-search`/`web-scrape` there if research isn't used).
