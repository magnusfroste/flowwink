# Project Memory & Architecture

## Core
- Stack: React+Vite SPA, Tiptap, Supabase. React Query, React Router.
- Coding Agent alters code. FlowPilot alters DB/content via skills. FlowPilot cannot create React components.
- Tool Calls: Always use explicit `tool_calls`. Never simulate actions in text.
- Unified Reasoning: FlowPilot is the sole reasoning engine. No shadow brains in edge functions.
- Content Models: `content_json` for Pages is blocks array. For Blogs is Tiptap doc (`type: 'doc'`).
- Strict CRUD Limits: `DEDICATED_SKILL_TABLES` block generic CRUD. Use domain skills (e.g., `place_order`).
- Module states are controlled by flags: `requiresFlowPilot`, `enhancedByFlowPilot`, `requiresAI`.
- MCP = platform-level. Skills seedas alltid med mcp_exposed=true när modul aktiveras, oberoende av FlowPilot. Skills-UI bor i /admin/developer.
- Bridge polling: ALLTID `since_id=0` vid "läs bridge" — hela tråden, inte bara nyaste. Visa råa msgs vid tvekan.
- Modules = real Odoo-style SaaS (real tables/RLS/admin-UI) that expose skills for agent operation. NEVER build sandbox/simulation/demo modes.
- Skill schemas MUST use FLAT top-level (OpenAI gpt-4.1 strict-mode kräver det). Per-action required → `x-action-required` extension, INTE `allOf/if-then`. Guardrail-test enforcer detta.
- Generic CRUD i agent-execute har TABLE_ALIASES + COLUMN_ALIASES per tabell + ACTION_ALIASES (list_pending etc) — externa agenter får använda naturliga namn.
- MCP exposure invariants: (1) `mcp_exposed=true → enabled=true` (inga orphan tools); (2) utility-skills (migrate_url, scrape_url, search_web, extract_pdf_text, sla_check, process_signal, competitor_monitor) är ALLTID MCP-exposade så externa operatörer kan köra t.ex. site-migration utan FlowPilot. Operator-internal skills (a2a_*, openclaw_*, dispatch_claw_mission) förblir ej-MCP. Se mem://architecture/mcp-exposure-invariants.
- Agent Contract Integrity = paraplyprincip: 4 lager (arg-mapping, NOT NULL-täckning, värde-domän/enums, modul-registrering) MÅSTE vara guardrail-verifierade innan en skill släpps. Se mem://architecture/agent-contract-integrity.
- Composite MCP groups (`marketing`, `sales`, `operations`) i mcp-server expanderar till flera kategorier — externa department-claws frågar `?groups=marketing` och får hela toolkit:en utan att veta intern taxonomi. Mall för fler departments finns. Se mem://federation/marketing-claw-department-pattern.
- Lifecycle events: 11 DB-triggers emittar `invoice.paid`, `quote.accepted`, `contract.signed`, `subscription.created/churned`, `shipment.dispatched`, `return.received`, `expense.approved`, `application.received`, `employee.hired`, `ticket.resolved`. Se mem://architecture/lifecycle-event-emitters.

## Claws & Integration
- Claws (external agents) use `?openai_safe=true` for compatibility. Schemas are now flat in the DB, so this flag is a no-op but remains supported for existing configurations.
- MCP best practices: Anthropic Sept 2025-guidance applied (self-describing tools, `Use when:`/`NOT for:`, composite high-impact tools). Gaps: ingen `response_format`-enum än, ingen per-tool token-budget. Se mem://architecture/anthropic-mcp-best-practices-applied.
- MCP-dokumentation: docs/architecture/mcp-overview.md är operational reference (endpoints, auth, schemas, gruppfiltrering, caching). docs/architecture/mcp-as-platform.md = arkitektoniskt varför.
- [Pricelist Auto-Resolution on Lines](mem://ecommerce/pricelist-auto-resolution-on-lines) — Sprint 3: invoice/quote-rader med product_id resolvas automatiskt via resolve_pricelist_price RPC, locked rows och free-text-rader passerar oförändrat
- [AI Task Hub](mem://architecture/ai-task-hub) — Sprint 4: konsoliderar tunna AI-edge-functions till en `ai-task` router. Nya AI-arbetsflöden = TaskSpec i `tasks.ts`, INTE ny edge function.
- [New Module Checklist](mem://development/new-module-checklist) — Mandatory PR-checklista. Scaffolding via `bun run new:module <id>`. Konsoliderad doc: `docs/contributing/building-a-module.md`.
- [Copilot Builder as MCP Skill](mem://federation/copilot-builder-as-mcp-skill) — `copilot-action` (admin /admin/copilot site-builder loop) exponerad som MCP-skill `build_site_step`. En implementation, två konsumenter (admin UI + externa claws).
