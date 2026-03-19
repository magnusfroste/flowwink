

# Unified Company Profile Extraction During Migration

## Current Architecture (Two Migration Paths, One Engine)

```text
FlowPilot Copilot (/admin/copilot)          MigratePageDialog (/admin/pages)
         │                                            │
    copilot-action                                    │
    (AI decides to call migrate_url)                  │
         │                                            │
    useCopilot.ts → startMigration()                  │
         │                                            │
         └──────────► migrate-page (Edge Function) ◄──┘
                      │
                      ├── Firecrawl scrape (markdown, html, rawHtml, screenshot)
                      ├── Platform detection (WordPress, Wix, Shopify, etc.)
                      ├── Video extraction (hero video, YouTube, Vimeo)
                      ├── Image extraction
                      ├── Lottie/SVG animation extraction
                      ├── AI block mapping (34 block types)
                      └── analyze-site action (discovers all pages + sitemap)
```

Both paths use `migrate-page` as the engine. Quality is identical.

FlowPilot adds on top:
- Block-by-block approve/skip/edit flow
- Footer contact extraction (`update_footer` tool)
- Auto module detection from platform
- Blog + KB phase migration
- Site structure discovery via `analyze-site`

## The Plan: Add Company Profile Extraction as Side-Effect

### What changes in `migrate-page/index.ts`

Extend the AI response format to also return `companyProfile` when migrating the **homepage** (first page / root URL):

```text
Response format addition:
{
  "title": "...",
  "blocks": [...],
  "companyProfile": {              // NEW - only for homepage
    "company_name": "Acme AB",
    "about_us": "We help...",
    "services": ["Web design", "SEO"],
    "industry": "Digital Agency",
    "value_proposition": "...",
    "differentiators": ["..."],
    "contact_email": "info@acme.se",
    "contact_phone": "08-123 45 67",
    "address": "Storgatan 1, Stockholm"
  }
}
```

After AI responds, if `companyProfile` is present, save it to `site_settings` using the service role client. This happens server-side — no frontend changes needed for storage.

### What changes in `useCopilot.ts`

When `startMigration` receives the response, check for `data.companyProfile`. If present, show a toast: "Company profile extracted and saved". No extra user action needed.

### What changes in `copilot-action/index.ts`

The `update_footer` tool already extracts contact info. No changes needed — it continues working as-is. The company profile extraction in `migrate-page` is complementary (about, services, ICP vs. phone/address/hours).

### What changes in `CompanyProfileCard.tsx`

- Add sales-specific fields: `value_proposition`, `icp`, `competitors`, `pricing_notes`
- Add domain field + "Enrich from website" button (for cases where admin didn't migrate but wants profile data)
- Show "Auto-filled from migration" badge on fields populated by the migration

### What changes in `SalesProfileSetup.tsx` + `SalesIntelligencePage.tsx`

- Remove company card from SalesProfileSetup — keep only user/sender profile
- Remove duplicate "Company Profile" tab from SalesIntelligencePage
- All company data reads from `site_settings.company_profile`

### What changes in `sales-context.ts`

- Read exclusively from `site_settings.company_profile` instead of `sales_intelligence_profiles`

## Summary: Zero Quality Loss

The migration engine (`migrate-page`) stays **exactly as it is** for block creation. We only add a parallel extraction: "while you're reading this page for blocks, also extract structured company data." Same scrape, same AI call, just an extended response format.

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/migrate-page/index.ts` | Extend AI prompt to return `companyProfile`; save to `site_settings` |
| `src/hooks/useCopilot.ts` | Read `companyProfile` from response, show toast |
| `src/components/admin/integrations/CompanyProfileCard.tsx` | Add sales fields, domain + enrich button |
| `src/components/admin/sales-intelligence/SalesProfileSetup.tsx` | Remove company section |
| `src/pages/admin/SalesIntelligencePage.tsx` | Remove Company Profile tab |
| `supabase/functions/_shared/sales-context.ts` | Read from unified `site_settings.company_profile` |

No database migration needed. No quality loss. Company profile comes free from the same scrape.

