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

## Claws & Integration
- Claws (external agents) use `?openai_safe=true` for compatibility. Schemas are now flat in the DB, so this flag is a no-op but remains supported for existing configurations.
