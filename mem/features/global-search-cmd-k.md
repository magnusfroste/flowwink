---
name: Global Search (⌘K)
description: Unified tsvector-backed search across 16 entity types via global_search RPC + ⌘K palette + MCP skill
type: feature
---
**Endpoint:** `global_search(search_query text, result_limit int default 8) RETURNS (entity_type, entity_id, title, subtitle, url, rank)`. SECURITY DEFINER, gated on `has_role(auth.uid(), 'admin')`.

**Entities indexed (GIN tsvector, 'simple' config):** companies, leads, deals, orders, invoices, quotes, tickets, contracts, documents (incl. content_md), kb_articles, products, pages, blog_posts, employees, vendors, projects.

**Query:** `websearch_to_tsquery('simple', q)` + ILIKE fallback on identifier columns (email, name, invoice_number, barcode).

**MCP wrapper:** `mcp_global_search(p_search_query, p_result_limit)` — same signature with p_-prefixed args matching agent-execute convention. Skill `global_search` (handler `rpc:mcp_global_search`, category `search`, scope `internal`, trust `auto`, mcp_exposed=true) seeded via `developerModule.skillSeeds` so it survives module-reset.

**UI:** `AdminSearchCommand` (⌘K) calls the RPC with 200ms debounce, groups hits by entity_type with icons, renders above the navigation shortcuts. Empty/short queries fall back to nav-only.

**Add a new entity:** (1) add GIN index, (2) add UNION ALL branch in `global_search()`, (3) add row to `ENTITY_META` in `AdminSearchCommand.tsx` with icon + group label + URL pattern.
