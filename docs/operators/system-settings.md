---
title: System Settings (`/admin/settings`)
description: Reference for every tab in the site-wide settings panel — what each field does, when to change it, and recommended values for production.
---

# System Settings

`/admin/settings` is the single panel for **site-wide configuration**. Every value here is stored in the `site_settings` table (one row per `key`) and is editable by administrators. Module-specific settings live on each module's own page (e.g. `/admin/chat`, `/admin/accounting`).

> **Scope:** site-wide, single-tenant. Each FlowWink deployment has its own `site_settings` row set.

---

## Tabs at a glance

| Tab | Stores key | Use for |
|---|---|---|
| **General** | `general`, `customer_portal`, `branding` (separate page) | Homepage routing, content review, customer self-signup |
| **System AI** | `system_ai` | Default AI provider/model for internal tools (text gen, enrichment, qualification) |
| **SEO** | `seo` | Title/description templates, OG image, robots, dev-mode noindex |
| **AEO** | `aeo` | Answer-Engine Optimization — `llms.txt`, schema.org, sitemap, org metadata |
| **Maintenance** | `maintenance` | Site-wide maintenance banner / lockdown |
| **Scripts** | `custom_scripts` | Inject head/body scripts (analytics, pixels, A/B testing) |
| **Cookies** | `cookie_banner` | GDPR consent banner copy & links |
| **Performance** | `performance` | Lazy loading, prefetch, edge caching |

Other related settings panels:

- `/admin/branding` — logo, colors, typography (`branding` key)
- `/admin/modules` — toggle modules on/off (`modules` key)
- `/admin/integrations` — API keys for OpenAI, Gemini, Stripe, etc.
- `/admin/chat` — visitor chat widget (`chat` key)
- `/admin/users` — staff invites & roles (uses `auth.users` + `user_roles` table)

---

## 1. General

| Field | Default | Recommendation |
|---|---|---|
| **Homepage slug** | `home` | Slug of the page rendered at `/`. Keep `home` unless you've created a custom landing page. |
| **Content review enabled** | `false` | Turn ON in regulated industries — forces draft → approval before any blog/page goes live. |

### Customer Portal (sub-section)

Controls **end-customer** self-registration (separate from staff signup, which is governed by the global Supabase flag `auth.disable_signup`).

| Field | Default | When to change |
|---|---|---|
| **Portal enabled** | `true` | OFF for internal-only sites (no `/account` area at all). |
| **Allow self-signup** | `true` | OFF if all customer accounts are created manually or via integration. |
| **Require email verification** | `true` | Keep ON in production. Only turn off for closed pilots. |
| **Guest checkout** | `true` | E-commerce only. OFF forces account creation before paying. |

> **Why separate from staff signup?** A self-hosted instance often disables general signup (`auth.disable_signup=true`) to lock down admin access, but still wants customers to register through e-commerce or bookings. The `customer-signup` edge function bypasses the global flag using the service role and respects the policy above. See `mem://architecture/platform-modules-operators-layering`.

---

## 2. System AI

The provider/model used by **internal tools** — content generation in the Tiptap toolbar, company enrichment, lead qualification, summarization, etc. Distinct from FlowPilot's reasoning engine (configured in `/admin/flowpilot`).

| Field | Recommendation |
|---|---|
| **Provider** | `openai` for highest quality, `gemini` for lowest cost, `local` for air-gapped (Ollama / LM Studio). |
| **Default model** | Cheap & fast (e.g. `gpt-4.1-mini`, `gemini-2.5-flash`). Used for bulk tasks. |
| **Reasoning model** | More capable (e.g. `gpt-4.1`, `gemini-2.5-pro`). Used for hard tasks: enrichment, classification, planning. |
| **Default tone** | Matches your brand voice. Used as fallback when blocks/skills don't specify. |
| **Default language** | ISO-639-1 (`en`, `sv`, `de`, …). |

> API keys are **never** stored here. Add them in `/admin/integrations` (or as Supabase secrets `OPENAI_API_KEY`, `GEMINI_API_KEY`). If the key is missing, AI features degrade gracefully — see `mem://ui/graceful-degradation-and-upsell-pattern`.

---

## 3. SEO

Controls `<title>`, meta description, OG/Twitter cards, and crawler directives.

| Field | Recommendation |
|---|---|
| **Site title** | Brand name. Becomes the homepage `<title>` and fallback. |
| **Title template** | Use `%s | Brand` to suffix every page title. `%s` is the page-specific title. |
| **Default description** | <160 chars. Shown when a page has no own description. |
| **OG image** | 1200×630 PNG/JPG. Used for social sharing previews. |
| **Twitter handle** | `@yourbrand`. |
| **Google site verification** | Token from Google Search Console (HTML-meta-tag method). |
| **Index / Follow** | Both ON in production. OFF on staging or hidden environments. |
| **Development mode** | ON during pre-launch — forces `noindex,nofollow` regardless of page-level settings. |
| **Require auth in dev mode** | ON in pre-launch — blocks anonymous visitors entirely. |

**Best practice:** keep `Development mode = ON` until DNS cutover, then flip it OFF in one move so search engines don't index the staging URL.

---

## 4. AEO (Answer Engine Optimization)

Makes your site readable by LLM crawlers (ChatGPT browsing, Perplexity, Claude, Gemini) and rich-result engines.

| Section | What it produces |
|---|---|
| **Organization metadata** | `name`, `description`, `contactEmail`, `primaryLanguage`, social profiles, business hours — emitted as `schema.org/Organization` JSON-LD on every page. |
| **`llms.txt`** | Served at `/llms.txt` — short list of canonical pages for LLM crawlers. ON in production. |
| **`llms-full.txt`** | Served at `/llms-full.txt` — full content concatenation. Set `maxWordsPerPage` to cap size (~2000). |
| **schema.org type** | `Organization`, `LocalBusiness`, `ProfessionalService`, etc. Pick the most specific that applies. |
| **FAQ / Article schema** | Auto-injected on FAQ blocks and blog posts. Keep ON. |
| **Sitemap** | Served at `/sitemap.xml`. `changefreq=weekly`, `priority=0.5` are sane defaults; raise priority on key landing pages individually. |

**Best practice:** AEO Enabled = ON in production. The hit is small (one JSON-LD block + 2 text files) and the upside for LLM-driven discovery is large.

---

## 5. Maintenance

| Field | Notes |
|---|---|
| **Enabled** | When ON, public site shows the maintenance page; `/admin` remains accessible. |
| **Title / Message** | What visitors see. Keep it short and human. |
| **Expected end time** | Optional ISO timestamp. Rendered as a countdown. |

**Best practice:** turn ON before destructive migrations, then OFF immediately after smoke-testing.

---

## 6. Custom Scripts

Inject raw HTML/JS at four slots: `head start`, `head end`, `body start`, `body end`.

| Use case | Slot |
|---|---|
| Plausible / Fathom / GA tag | `head end` |
| Meta Pixel base code | `head end` |
| Crisp / Intercom widget | `body end` |
| A/B-testing snippet (must run before paint) | `head start` |

**HTML5 constraint:** never put `<noscript><img/></noscript>` (pixel fallbacks) in `<head>`. Use `body start` instead — see project rules.

**Security:** anything you paste here runs with full page privileges. Only paste code you trust.

---

## 7. Cookies

Copy and behavior of the consent banner.

| Field | Notes |
|---|---|
| **Enabled** | ON in EU markets, OFF for purely internal tools. |
| **Title / Description** | GDPR-compliant copy. Keep it short. |
| **Policy link** | Must point to a real `/privacy-policy` page. |
| **Accept / Reject buttons** | Reject must be equally prominent — GDPR requirement. |

The banner controls whether **non-essential** scripts (analytics, pixels) load. Essential scripts always run.

---

## 8. Performance

| Field | Default | Notes |
|---|---|---|
| **Lazy load images** | ON | Keep ON. Native `loading="lazy"`. |
| **Prefetch links** | ON | Prefetches in-viewport links on hover. Negligible cost. |
| **Minify HTML** | OFF | Vite already optimizes JS/CSS; rarely worth the build complexity. |
| **Service worker** | OFF | Only enable if you've tested offline behavior. Can cache stale UI in admin. |
| **Image cache max-age** | `31536000` (1 year) | Standard for immutable assets. |
| **Edge caching** | OFF | ON when fronting with a CDN (Cloudflare, Vercel) for the public site. |
| **Edge cache TTL** | `5` min | Long enough to absorb bursts, short enough that publishing feels live. |

---

## Where settings live in code

| Concern | File |
|---|---|
| Type definitions + defaults + hooks | `src/hooks/useSiteSettings.tsx` |
| UI panel | `src/pages/admin/SiteSettingsPage.tsx` |
| Customer Portal card | `src/components/admin/CustomerPortalCard.tsx` |
| Customer signup edge function | `supabase/functions/customer-signup/index.ts` |
| Storage table | `site_settings` (one row per key, JSONB value) |

Each `useXxxSettings()` hook reads from `site_settings.{key}` with a fallback to the typed default — so the UI always renders even before the row exists. `useUpdateXxxSettings()` upserts the JSON blob.

---

## Best practices summary

1. **Set SEO + AEO before launch.** Both default to safe-but-empty; without them the homepage has no real `<title>` and no LLM discoverability.
2. **Use `Development mode` (SEO tab)** for staging — single switch to block all crawlers.
3. **Keep Customer Portal aligned with active modules.** If you turn off all customer-facing modules (e-commerce, bookings, …), set `Portal enabled = false` to hide `/account`.
4. **Never paste secrets into Custom Scripts.** They are server-rendered into HTML; use `/admin/integrations` for API keys.
5. **Document deviations from defaults.** If your operator changes anything non-obvious here, note it in your runbook — these settings rarely surface in monitoring.

---

## See also

- [`../guides/security.md`](../guides/security.md) — auth model, RLS, role separation
- [`../guides/maintenance.md`](../guides/maintenance.md) — operational runbook
- [`../architecture/module-tiers.md`](../architecture/module-tiers.md) — module on/off semantics
- [`../concepts/ai-dependencies.md`](../concepts/ai-dependencies.md) — which AI keys each feature needs
