# Plan: Full White-Label Social Sharing for Self-Hosted Instances

## Status: ✅ COMPLETED

## Summary
Enable complete rebranding of social sharing metadata so self-hosted instances show their own company name, logo, and description when links are shared on social media - not FlowWink branding.

## Implementation Complete

### Phase 1: Dynamic SSR Meta Tags ✅
- Created `supabase/functions/render-page/index.ts`
- Edge function detects page type (page, blog post, KB article)
- Fetches SEO and branding settings from database
- Returns fully rendered HTML with proper OG tags for social crawlers

### Phase 2: Remove Hardcoded Branding ✅
- `index.html` - Removed all FlowWink references, generic defaults only
- `src/pages/AuthPage.tsx` - Uses `branding.adminName` dynamically
- `src/pages/PricingPage.tsx` - Uses `seoSettings.siteTitle` dynamically
- `src/hooks/useSiteSettings.tsx` - Changed default `adminName` from "FlowWink" to empty

### Phase 3: Nginx Configuration ✅
- Added social crawler detection via User-Agent mapping
- Detects: Facebook, Twitter, LinkedIn, WhatsApp, Slack, Discord, Telegram, Pinterest, Google, Bing
- Proxy configuration template ready (requires uncommenting with actual Supabase URL)

### Phase 4: Documentation ✅
- Updated `docs/SETUP.md` with:
  - Branding configuration section (step 4)
  - Detailed social sharing / white-label configuration guide
  - Testing instructions with Facebook Debugger
  - Per-page override documentation

## Files Modified
1. `supabase/functions/render-page/index.ts` - NEW
2. `supabase/config.toml` - Added render-page function
3. `index.html` - Removed FlowWink branding
4. `nginx.conf` - Added crawler detection and proxy config
5. `src/pages/AuthPage.tsx` - Dynamic branding
6. `src/pages/PricingPage.tsx` - Dynamic site title
7. `src/hooks/useSiteSettings.tsx` - Empty default adminName
8. `docs/SETUP.md` - Added branding/social sharing docs

## User Benefit
When a self-hosted customer shares a link on social media:
- Shows their configured `Site Title` (not "FlowWink")
- Shows their configured `OG Image` (not FlowWink's)
- Shows their configured `Default Description`

All branding is 100% controlled via the Admin UI with zero code changes.
