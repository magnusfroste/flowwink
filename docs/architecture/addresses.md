---
title: "Addresses — what is fixed, what is yours, and how languages fit"
description: Three kinds of address and one rule for each. System routes are fixed, content slugs are editable per language, and settings point at pages rather than spelling addresses.
category: architecture
status: built
---

# Addresses — what is fixed, what is yours, and how languages fit

> **The rule:** the language lives in the **prefix**, never in the slug. System
> routes are **fixed**. Content has **its own slug per language**. A setting
> that needs a page **points at the page**; the address follows the page.

## 0. Why (2026-10-26)

Three kinds of address had grown up side by side with no rule between them:

| Kind | Example | Editable? |
|---|---|---|
| System route | `/blog`, `/kb`, `/shop`, `/checkout`, `/account`, `/invoice/<token>` | no — in the router |
| Content slug | `/villkor`, `/tjanster`, `/blog/<post>` | yes |
| Setting that names a page by slug | `homepageSlug`, `termsSlug`, `archiveSlug` | free text |

…and the mix leaked: `archiveSlug` promised "Blog will be accessible at
/blogg" and changed nothing (the router has only ever served `/blog`);
`termsSlug` was a text field, so a typo linked every agreement to a 404; and a
translated page could carry its own slug (`content_translations.slug`) that the
blog honoured and the pages ignored — `/villkor` became `/en/villkor` for an
English reader however the translation was set up.

## 1. What the reference systems do

- **Shopify** — resource routes are fixed English (`/products/`, `/collections/`,
  `/blogs/`, `/pages/`) in every market; the *handle* after them is
  translatable per language (Translate & Adapt); markets live in a prefix
  (`/en-se/…`).
- **Odoo** — controller routes are fixed (`/shop`, `/blog`, `/contactus`); the
  language is a prefix (`/sv_SE/shop`), records carry slugs.
- **WordPress + WPML/Polylang** — the language is a directory; page and post
  slugs are translated per language; translating custom post-type base slugs
  is possible but an advanced, off-by-default option.
- **Google** (multi-regional sites) — one URL per language version, the
  language visible in the URL (subdirectory recommended), `hreflang` between
  them; translated words in the URL are welcome but not required.

## 2. The rules

1. **Language = prefix.** The site's language owns the root (`/villkor`);
   every other declared language gets `/<lang>/…` (`/en/terms`). One owner:
   `pagePath()` (`src/lib/language-path.ts`), its edge twin in
   `_shared/sitemap-alternates.ts`, and `blog-address.ts` for posts.
2. **System routes are fixed and the same everywhere** — `/blog`, `/kb`,
   `/shop`, `/docs`, `/checkout`, `/cart`, `/account`, `/invoice/…`,
   `/quote/…`, `/contract/…`. What the visitor reads is the *name* — the menu
   label, the archive title, the visitor texts — and that is translated. The
   address is code: stable links, one router, no per-language routing tables,
   no collision between a page called `blogg` and a renamed blog. (`archiveSlug`
   is retired.)
3. **Content slugs are yours, per language.** A page or post has its slug in
   its own language; a translation may carry its own (`publish_translation
   … translated_slug`): `/villkor` ↔ `/en/terms`, `/blog/hosten` ↔
   `/en/blog/autumn`. Without one the translation lives at `/<lang>/<source
   slug>`. The source slug always wins where both could answer, so no existing
   address changes meaning; `/en/villkor` moves to `/en/terms` once the
   translation has its own slug (the client redirects, `rel=canonical` says
   so to crawlers).
4. **Settings point at pages.** The home page is set from the pages list
   ("Set as homepage"); the terms page is chosen from the site's pages (Site
   settings → Terms page). The stored value is still the page's slug (what
   the SQL reads), but nobody types it. Every link built from such a setting
   goes through the page's address in the reader's language —
   `terms_page_url(site_url, slug, language)` for agreements: a Swedish
   agreement links `/villkor`, an English one `/en/terms`, and a language the
   page is not translated into gets the page that exists, never a 404.

## 3. Where it is built

| Piece | File |
|---|---|
| Page address, `pathSlug` | `src/lib/language-path.ts` `pagePath` |
| Edge twin | `supabase/functions/_shared/sitemap-alternates.ts` |
| Translated slug → page | `get_page_translations` (`20261026060000`), `api/html.ts` |
| Switcher, nav, hreflang | `LanguageSwitcher.tsx`, `usePageSiblings.ts`, `hreflang.ts` |
| Terms link per language | `terms_page_url` (`20261026070000`) |
| Blog addresses | `supabase/functions/_shared/i18n/blog-address.ts` |

## 4. Not (yet)

- `/<lang>/kb`, `/<lang>/shop`, `/<lang>/docs` — the routes follow rule 2 when
  those modules get their language model (KB articles are rows per language
  today; products have no translation model).
