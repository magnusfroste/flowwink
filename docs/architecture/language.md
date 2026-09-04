# Language — a light internationalization system

FlowWink is an English product that publishes content in whatever language the
operator writes. This document names the four layers that make that work, so
the next translatable thing lands on the rail instead of inventing a fifth rule.

## 0. TL;DR

Four layers, four owners:

| Layer | Owner | Shape |
|---|---|---|
| Product interface (admin) | the code | English, always. Not translated. |
| Visitor chrome — buttons, empty states | `site_settings.ui_text` | one blob, `@<locale>` overlays |
| Content — pages, KB articles, email templates | the row | `locale` + `translation_group_id` |
| Number, date, currency format | `site_settings.platform_locale` | not language; never confuse the two |

And one shared rule for *which version to show*: `pickLocale()` in TypeScript,
`public.pick_locale()` in SQL.

---

## 1. The site declares its languages

```json
site_settings.site_languages = { "default": "sv", "enabled": ["sv", "en"] }
```

Before this existed the set was **computed** by scanning which pages happened to
carry a locale, and the default was read off `platform_locale` — a formatting
setting. Adding a language was therefore a side effect of creating a page, and
the default could not be changed at all.

`ensure_site_languages()` seeds it, re-assertably. An instance **with no pages**
is born English; one with pages inherits from `platform_locale` once, because
that is the only clue about what is already written there. A decision already
made always beats the inference.

**English is not enabled for free.** For the product's own chrome it genuinely is
the floor — every `t()` call site carries English and it cannot be removed. But
a page has no English version unless somebody wrote one, and listing a language
nobody has published puts a door in the visitor's switcher that opens onto
nothing.

## 2. Content: a row per language

Any table holding translatable *documents* gets two columns:

- **`locale`** — the language this row is written in, BCP-47
- **`translation_group_id`** — rows sharing it are versions of each other

`pages` has them, `kb_articles` has them. The rules that follow are the
convention:

- **One row per language per group.** Enforced in `manage_page_translation`.
- **Each language keeps its own address.** That is the whole reason to store it
  as separate rows rather than `{sv, en}` fields: one URL per language is what
  lets a search engine index both and `hreflang` work at all. The declaration
  itself lives in `src/lib/hreflang.ts` — every version lists every version
  including itself, the hrefs are absolute, and `x-default` points at the site's
  default language rather than at whichever version came first.
- **The address form is `/{lang}/{baseSlug}`** — the default language owns the
  root (`/product`), other languages get a prefix on the GROUP's base slug
  (`/en/product`), and the homepage in another language is the bare prefix
  (`/en`). `pagePath()` in `src/lib/language-path.ts` is the single owner;
  seven consumers (canonical, switcher, nav, hreflang, sitemap, prerender,
  redirect) all call it, and the sitemap's edge twin mirrors it because the
  edge bundle cannot reach `src/`. This is ADDITIVE: storage keeps the `-en`
  suffixed slugs, the old address still resolves and then redirects home —
  the prefix is presentation, which is what made it safe to introduce days
  before a launch. A prefix only counts when it is a DECLARED non-default
  language, so `/blog/...` and a site without English keep their meanings.
- **A new row is born in the site's default language** (`pages_default_locale`
  trigger). Do not put a literal default on the column — `pages.locale` once
  defaulted to `'en'`, which asserted English about every page on every
  instance and forced every reader to guess whether an `'en'` meant *English*
  or meant *nobody chose*.
- **Blocks know nothing about language.** A block is content; the page carries
  the language. This is why 76 block editors needed no changes when the site
  became bilingual.

### Adding a language to an existing site

`translate_site_into(locale)` copies every published page into drafts in the new
language and adds it to `site_languages`. It **copies; it does not translate** —
the drafts carry the source text. Idempotent: a page that already has a version
is skipped.

Translating is its own rail, server-side, so the text never travels through an
agent's context: `translate_page(slug | source_slug + locale)` walks the draft's
title, meta and block tree, translates the prose in bounded batches through the
instance's AI and writes the same tree back (structure preserved by
construction; the result counts strings translated vs. untranslated), and
`translate_ui_text(locale)` fills the `@<locale>` overlay of the chrome from the
code's catalogue. Before these existed (www.flowwink.com, 2026-09-04) FlowChat
had to re-send 40 KB of content_json through `manage_page` per page: it
published English as Swedish, cut the home page from 24 blocks to 11, and
translated the drafts of "se" — Northern Sami, typed for Swedish. The Languages
card now names the tag next to the input and flags that trap.

## 3. Chrome: one blob, `@<locale>` overlays

`site_settings.ui_text` holds the strings *around* block content. The shape is
additive:

```json
{
  "chat.send": "Skicka",
  "@en": { "chat.send": "Send" }
}
```

Flat keys are the base layer, in the site's own language. `@<locale>` keys are
overlays. Resolution for a page in language L:

1. the `@L` overlay (exact tag, then the same language)
2. the flat base layer — **only when L is the site's own language**
3. the English written at the call site

Step 2's condition is the point: on a Swedish site, an English page must not
fall through to the Swedish base layer. Falling to the call-site English instead
is both correct and free.

The editor is **Site Settings → Language & text**: the **Languages** card first
(the set decides which layers exist), then the **Visitor text** card, which edits one
layer at a time — the base layer or one `@<locale>` overlay — from the catalogue
in `src/data/ui-text-catalog.json`. The catalogue is generated from the call
sites, so a key nobody has translated is listed, not hidden; each field shows the
English fallback as its placeholder. Saving merges: other layers and unknown keys
are carried through.

Block chrome rides the same rail. The form block reads `form.required`,
`form.invalidEmail`, `form.invalidPhone`, `form.select`, `form.submit`,
`form.sending`, `form.success`, `form.sendAnother`, `form.errorTitle` and
`form.errorBody` through `t()` with the English as the code fallback, while the
block's own `submitButtonText`, `successMessage` and field placeholders go
through `operatorText`: they win on a page in the site's language and never on a
page in another. The `no-new-hardcoded-visitor-text` guard ratchets the count of
public files that still carry a bare English string.

The key list comes from `src/data/ui-text-catalog.json`, generated from the call
sites — the stored pack only holds what someone already translated, so an editor
built on it could never show the untranslated keys, which are exactly the ones
still showing English on a Swedish site.

Two rules the generator imposes on the code:

- **`t()` takes literals.** A key hidden behind a helper or a variable is
  invisible to the generator, which means invisible in the editor — a
  translatable string nobody can find. This has caught me three times.
- **Hardcoded visitor English may only shrink.** Every string baked into a
  public component is one that cannot follow the visitor's language, and they
  were being found one at a time, by eye, on a live site. The count is now a
  number: `no-new-hardcoded-visitor-text.guardrails.test.ts` fails on any public
  file that grows past its baseline, and `regen-visitor-text-baseline.mjs`
  lowers it when strings move to the pack. The product's own interface
  (`admin/`) is never scanned — it stays English on purpose.
- **A setting that competes with the pack goes through `operatorText`.** Several
  settings predate the language layer and hold ONE value: the blog's archive
  title, the cookie banner's copy, the maintenance message, the known footer
  legal links. The operator wrote them for THEIR language, so they act as the
  base layer — they win for the site's own language and lose to the pack on any
  other. Writing `settings.title || 'English'` bypasses that and puts Swedish on
  an English page; `operator-text-adoption.guardrails.test.ts` refuses it.

### One fact, one reader

`site_languages.default` is the ONLY answer to "what language is this site
written in". `platform_locale` is the FORMAT setting (dates, numbers, currency)
and must never be read as a language — the `ui_text` provider once did, the
key was missing on an instance, and every Swedish page showed English chrome
while the English page showed Swedish (#430). The admin translations editor
read it too (#432). Readers: `useSiteLanguages().defaultLanguage` in React,
`site_settings.site_languages ->> 'default'` in SQL.

## 4. The ladder, once

Both halves of the system answer *"which version?"* the same way:

1. **the exact tag** — `sv-SE` answers `sv-SE`
2. **the same language** — `sv` answers `sv-SE`, and `en-GB` answers `en`
3. **the site's default**
4. **nothing** — the caller decides what an absence means

Step 4 is deliberate and is why this is a function rather than a policy. A page
with no version in the wanted language must **not** silently become another
language (the admin list shows what exists, marked as such); a string with no
translation must fall to the English in the code. Different answers to the same
absence.

- `pickLocale()` — `src/lib/pick-locale.ts`
- `public.pick_locale(available[], wanted, fallback)` — same ladder, server side

The shared cases are pinned twice: `pick-locale.guardrails.test.ts` for the
TypeScript side, and a `DO` block in migration `20260903090000` that proves the
SQL side **every time it is applied**, because no CI has a database.

---

## Email templates

`email_templates` adopted §2: `locale` on the row, key `(name, locale)` where
`name` is the KIND (`booking_confirmation`, `quote_email`, `quote_reminder`,
`contract_email`, `contract_reminder`). `resolve_email_template(name, locale)`
walks the ladder with the recipient's language from `partner_language()`, with
one deliberate deviation at step 4: ANY active version rather than nothing — an
email that does not go out is worse than one in the wrong language, and the
deviation is logged.

Senders wired so far: booking confirmation, quote (+reminder), contract
(+reminder). The product seeds are English with `locale='en'` EXPLICITLY — the
insert trigger would otherwise stamp the site's language onto templates that
are written in English. All language lives in the template text (labels
included); the sender prerenders only data: item rows, amounts, links.

Conditional text is expressed in the template too, never in code:
`{{#notes}}…{{/notes}}` keeps its content when the variable is filled and
disappears when it is empty (one engine for senders and the admin preview:
`_shared/template-render.ts`; sections do not nest). This is what moved the
booking note box — label and all — out of `booking_confirmation.ts` and into
the template (migration `20260903190000`); the code-rendered `{{notes_block}}`
variable, English label baked in, is still sent for templates that predate the
move, but new templates use the section.

Still hardcoded: invoice_email, order_confirmation and the rest of comms-send —
same recipe when they matter.

## Knowledge base

Found live before it was designed: optictunnels.se/en/help showed English
chrome around all-Swedish articles and category names — `kb_articles` had no
language dimension, so the English help page could not do anything but lie.

`kb_articles` adopted §2 wholesale (migration `20260904140000`): `locale` +
`translation_group_id` on the row, no column default, the
`kb_articles_set_locale` trigger stamping the site's language, existing rows
backfilled with it. One deliberate strengthening: **one row per language per
group is a schema key** (`kb_articles_group_locale_key`), not just a rule in a
skill — cheaper than cleaning up the duplicates an agent would otherwise
create. Each language version keeps its own `/kb/<slug>` address; a colliding
slug gets a `-<locale>` suffix at create time, the pages convention.

**Categories are labels, not documents** — every article version points at ONE
category row (`category_id`), so a row per language would have forced each
version to re-point to "its" language's category and made the hierarchy
per-language. They translate as chrome instead (§3): a `translations` overlay
on the row (`{"en": {"name": …, "description": …}}`), base columns being the
site's own language, resolved by `localizedCategoryText()`. A label with no
overlay falls back VISIBLY to the base name — hiding the category would hide
its already translated articles.

What an absence means, per surface (`src/lib/kb-language.ts`, pinned by
`kb-language.guardrails.test.ts`):

- **Lists** (kb-hub, kb-accordion, kb-featured, and the help page built from
  them): `kbInVisitorLanguage()` — one row per group in the page's language
  (read off the `ui_text` context that PublicPage already fills), and a group
  with no version in it is honestly absent. The site default is NOT a
  substitute; it enters only as the reading language of a surface that
  declared none.
- **Search** (the hub's search box): an other-language match may surface, but
  marked with its locale badge (`splitSearchMatchesByLanguage()`), and never
  when the group already answered in-language.
- **Rows with no locale** predate the rail — an un-migrated instance — and are
  always shown; the blocks also SELECT the language columns strict-first with
  a legacy fallback, because the fleet runs several schema versions at once
  (Law 4).
- **`/kb/<slug>`** is a language declaration in itself: the article page pushes
  the row's locale into the `ui_text` pack, so the chrome follows the article.

Writers: `manage_kb_article` grew `locale` (create/update/list) and
`translation_of` (create) — the new version joins the source's translation
group and inherits its category; `get` returns `language_versions` so a
translator never edits blind. The admin KB list reuses
`pagesInWorkingLanguage()` — the grouping helper was generic all along — plus
the same working-language selector as the pages list.

Still monolingual, same recipe when they matter: the chat context
(`_shared/chat-context.ts` mixes every language into one FAQ block), the
retrieval index (chunk metadata carries no locale yet), `content-api`'s
`/kb/*` endpoints, admin global search (will list every language version), and
`translate_site_into` (copies pages only — KB translations are created
per-article via `translation_of`). The admin article editor has no locale
field either; the skill is the way to set one today.

## What is deliberately not here

- **No message catalogue for the admin UI.** The product interface stays
  English. That is what keeps this system light: the heavy half of i18n —
  extraction, catalogues, `t()` everywhere, translator tooling — is the half we
  do not need.
- **No automatic language detection.** `Accept-Language` is not read. The
  ladder for a visitor is: explicit URL → the page's own language → the site
  default. Adding browser detection means deciding what happens to crawlers and
  to an explicit choice, and that is a separate decision.
- **The internal `-en` slugs stay.** The suffix is now invisible to visitors —
  canonical, sitemap, nav, switcher and prerender all speak `/en/product`, and
  the old address redirects. What remains is a row identity in the database and
  the admin slug column. Renaming would make `pages.slug` non-unique on its own
  (unique per `(slug, locale)` instead), turning every slug lookup ambiguous —
  real risk for zero visitor-visible gain. Unlike the id alignment in the party
  register, this does NOT get more expensive with time, so it can be revisited
  whenever a real need appears.
- **The blog archive has no translated address.** Its LABEL now follows the
  language (`nav.blog` in the pack, with the operator's `archiveTitle` acting as
  the base layer for the site's own language — see `operator-text.ts`), but
  the destination stays `/blog`. The prefix is hardcoded in six places
  including canonical URLs and KB cross-links; moving it is its own piece of
  work, not a setting. The setting that pretended otherwise was removed.
