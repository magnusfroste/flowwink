

# Company Insights Module

## The Insight

You're right. The current `CompanyProfileCard` sitting in Settings feels wrong — it's CMS plumbing, not the strategic identity layer it should be. The company's identity deserves the same first-class treatment as Branding (visual identity) and Sales Intelligence (prospect analysis).

The hierarchy becomes clear:

```text
Branding Module        → Visual identity (colors, fonts, logos)
Company Insights       → Business identity (who we are, what we do, financials)
Sales Intelligence     → Prospect analysis (uses Company Insights as "our side")
SEO / AEO Settings     → Consumes Company Insights for meta, structured data
Chat / FlowAgent       → Consumes Company Insights for context
```

## What "Company Insights" Becomes

A proper module with its own nav entry, page, and enrichment capabilities:

1. **Core Identity** — Company name, about, industry, services, value proposition, differentiators
2. **Financial Insights** — Data from public sources (Allabolag.se, etc): revenue, employees, org number, board, financial health
3. **Market Position** — Competitors, ICP, pricing strategy, target industries
4. **Contact & Legal** — Registered address, contact info, org number
5. **Enrichment Log** — When data was last enriched, from which sources

The module gets populated via three paths:
- **Migration side-effect** (already built) — extracts identity from homepage scrape
- **Manual entry** — admin fills in what they know
- **Auto-enrichment** — FlowAgent or admin triggers enrichment from Allabolag, website, etc.

## Architecture

### Data Storage

Keep `site_settings.company_profile` as the JSON store — it works, no migration needed. But the module reads/writes it through a dedicated hook (`useCompanyInsights`) rather than raw queries.

### New Files

| File | Purpose |
|------|---------|
| `src/pages/admin/CompanyInsightsPage.tsx` | Full page with tabs: Identity, Financials, Market, Enrichment |
| `src/hooks/useCompanyInsights.ts` | Read/write hook for `site_settings.company_profile` |
| `src/lib/modules/company-insights-module.ts` | Module definition (agent-capable) |
| `supabase/functions/enrich-company-profile/index.ts` | Edge function for Allabolag + web enrichment |

### Navigation

Add "Company Insights" to the **Sales & CRM** nav group (next to Sales Intelligence), with its own icon (e.g. `Building2` or `TrendingUp`). Remove the orphaned `CompanyProfileCard` from integrations.

### Module Registration

Register as `companyInsights` in the module system — `agent-capable` autonomy level, so FlowAgent can enrich it autonomously.

### Page Layout (Tabs)

- **Identity** — Name, about, services, value proposition, differentiators (moved from current `CompanyProfileCard`)
- **Market** — ICP, competitors, pricing strategy, target industries
- **Financials** — Revenue, employees, org number, board members (enriched from Allabolag etc.)
- **Enrichment** — Domain field + "Enrich from website" button, enrichment history, source badges

### Consumers (Read-Only)

SEO/AEO settings, Chat AI, Sales Intelligence, and FlowAgent all read from the same `site_settings.company_profile` via `useCompanyInsights` or `sales-context.ts`. No duplication.

### Allabolag Enrichment (Future-Ready)

The `enrich-company-profile` edge function will:
1. Accept a domain or org number
2. Scrape/API Allabolag.se for financial data (revenue, employees, board)
3. Merge into `site_settings.company_profile` without overwriting manual entries
4. Log enrichment source and timestamp

This is scaffolded now but can be extended with more sources (Bisnode, LinkedIn, etc.) later.

## Files to Create/Modify

| Action | File |
|--------|------|
| Create | `src/pages/admin/CompanyInsightsPage.tsx` |
| Create | `src/hooks/useCompanyInsights.ts` |
| Create | `src/lib/modules/company-insights-module.ts` |
| Create | `supabase/functions/enrich-company-profile/index.ts` |
| Modify | `src/components/admin/adminNavigation.ts` — add nav entry |
| Modify | `src/App.tsx` — add route |
| Modify | `src/lib/modules/index.ts` — export new module |
| Delete/Deprecate | `src/components/admin/integrations/CompanyProfileCard.tsx` — move logic to page |

