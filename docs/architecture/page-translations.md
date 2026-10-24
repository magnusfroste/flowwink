---
title: "Page translations — one structure, text per language"
description: A page is designed once; every other language is an overlay of strings on that structure, keyed per field and stale per field. Adding a language copies nothing.
category: architecture
status: proposed
---

# Page translations — one structure, text per language

> **Status: proposed (2026-10-24).** Design under discussion, no code written.
> Not before the demo. Medium-sized. The first site to convert is synclair;
> www.flowwink.com (16 pages × 2 languages = 32 rows today) is the second.
> This supersedes §2 "Adding a language to an existing site" in
> [`language.md`](./language.md) once built; everything else in that document
> — the four layers, `site_languages`, the `@<locale>` chrome overlays, the
> `pick_locale` ladder, `/{lang}/{baseSlug}` addresses — stays as it is.

## 0. TL;DR

Today a page in two languages is two rows with two copies of the block tree.
Design belongs to the page; text belongs to the language. The model below
stores the design once and keeps, per language, only the strings:

| | Today (row per language) | Proposed (overlay per language) |
|---|---|---|
| Add a language | `translate_site_into` copies every page | a checkbox; an empty overlay |
| Move a block | edit N pages | edit one page; every language follows |
| Change a heading | N pages, and `list_stale_translations` tells you *which page* is behind | one string goes stale, *that string* is listed |
| A hand-polished Swedish sentence | overwritten when someone "re-translates the page" | survives until its source sentence changes |
| A page the Swedish market needs differently | a sibling with a diverging tree, silently | its own page, no overlay — divergence is a decision, not drift |
| URL per language, `hreflang`, sitemap | from sibling rows | from overlays — same addresses, same output |

The source language is **the site's own language** (`site_languages.default`),
never a hardcoded English. On a Swedish site the Swedish text is the structure's
text and English is an overlay; on www.flowwink.com it is the other way around.

This is how Odoo does it: since v16 a translatable field is one jsonb value
`{"en_US": …, "sv_SE": …}` on the ONE record, with the company language as
source; before that, `ir.translation` was exactly an overlay table — `(model,
field, res_id, lang, src, value, state)`, where a changed `src` flipped the row
to `to_translate`. What follows is `ir.translation` at field granularity with a
hash where Odoo compared `src`.

## 1. Why the row-per-language model is wrong for pages

`language.md` §2 chose a row per language because *each language needs its own
address*. That reason is real and is kept (§4). But the row carried the whole
document, and the whole document is mostly not language:

- Of a 24-block home page, the block order, the variants, the colors, the image
  URLs, the column counts, the CTA destinations and the form field types are
  design. The strings are perhaps a fifth of the bytes and the only part a
  translator touches.
- Every design change is therefore N edits, and the N−1 that are forgotten do
  not fail — they drift. `list_stale_translations` exists to find that drift
  after the fact, by `updated_at`, with a 24-hour threshold *so that batch
  operations do not read as drift*. A model that needs a threshold to tell
  drift from editing is reporting on its own shape.
- `pagesInWorkingLanguage()` exists because Optic's admin list went from twelve
  pages to nineteen. It hides the rows. A storage model that has to be hidden
  from the person using it is leaking into a surface where it has no business
  (`src/lib/page-language-grouping.ts` says exactly this in its own header).
- Adding a language means copying every page. On www.flowwink.com that produced
  16 draft copies which FlowChat then "translated" through `manage_page` —
  published English as Swedish, cut the home page to 11 blocks, translated the
  wrong drafts (2026-09-04). `translate_page` fixed the *procedure*; the
  copies were the *cause*.

The conversation that settled this (2026-10-23, with the operator): "we do not
need different blocks for different languages." A page is one thing to the
person editing it. The storage should agree.

## 2. The model

### 2.1 The page row is the structure, in the source language

`pages` is unchanged in shape. `content_json`, `title`, `meta_json` hold the
page in **its** language, `pages.locale` — stamped by the existing
`pages_default_locale` trigger with `site_languages.default`, never a column
default (the `'en'`-asserts-English lesson stands).

`pages.locale` keeps a second meaning it already has: a page may exist in **one
language only**, deliberately. A Swedish-only legal page on a bilingual site
has `locale = 'sv'` and no overlays, and is honestly absent from `/en` — the
same answer `kbInVisitorLanguage()` already gives for KB lists.

`translation_group_id` on `pages` is **retired** after conversion (§6). It
stays nullable and ignored meanwhile; the fleet runs several schema versions at
once (Law 4) and the readers select strict-first with a legacy fallback.

### 2.2 The overlay: strings, keyed per field, stale per field

```sql
create table page_translations (
  page_id        uuid not null references pages(id) on delete cascade,
  locale         text not null,                       -- BCP-47, lowercased
  status         text not null default 'draft',       -- 'draft' | 'published'
  slug           text,                                -- per-language address, optional (§4)
  title          text,
  meta           jsonb not null default '{}',         -- meta_title, meta_description, og_* …
  strings        jsonb not null default '{}',         -- the overlay proper, see below
  coverage       integer,                             -- translated units / total units, cached
  translated_at  timestamptz,
  translated_by  text,                                -- 'translate_page' | user id | 'conversion'
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (page_id, locale)
);
```

`strings` maps a **unit key** to an entry:

```json
{
  "blk_7f3a.title":                { "text": "Våra tjänster",      "source_hash": "9c1e…" },
  "blk_7f3a.subtitle":             { "text": "Tre sätt att börja", "source_hash": "02ab…" },
  "blk_7f3a.features[0].title":    { "text": "Rådgivning",         "source_hash": "d41d…" },
  "blk_7f3a.features[0].description": { "text": "…",               "source_hash": "77be…" },
  "blk_2c90.content":              { "doc": { "type": "doc", "content": [ … ] }, "source_hash": "f00d…" }
}
```

- **A unit is a field of a block** — `<block.id>.<field path>`. Block ids are
  stable across reorders; array indices inside a block are not stable but are
  bounded to that block, so moving a block costs nothing and reordering three
  pricing tiers costs those three. *Never key by position in `content_json`*:
  the walker's `path` today is `[3, 'title']`, and inserting one block above
  would make every string on the page stale.
- **A rich-text field is one unit.** The Tiptap doc of a `rich-text` block, a
  `content` field, a testimonial quote with marks — the whole document is the
  entry (`doc`), not its individual text nodes. Half a translated paragraph is
  not a thing, and text-node paths change every time a sentence is split. The
  translator receives and returns the doc; `structureSignature` is checked on
  the doc, not on the page.
- **`source_hash`** is `sha256` of the source unit (the string, or the
  canonical JSON of the doc) *at the time the entry was written*. On read, a
  unit whose current source hash differs from the stored one is **stale**: the
  stored text is still shown (it is a translation of something very close, and
  better than the source language), but it is counted and listed. This is what
  lets a hand-polished sentence survive every re-translation that does not
  touch its source — `translate_page` only writes entries that are missing or
  stale.
- **Only text.** The overlay never carries layout, variants, colors, URLs,
  field types or anything `isTranslatable()` rejects. If a language needs a
  different design, that is §2.4.

Entries whose unit no longer exists in the source (a block deleted, a feature
removed) are **orphans**: kept until the next write to that overlay, then
dropped, counted in the result. They are never shown.

### 2.3 Resolution — the renderer is the walker

Reading page P in language L:

1. L is the page's own locale → the row, as today.
2. An overlay `(P, L)` with `status = 'published'` exists → walk `content_json`
   with the SAME `collectTranslatable()` that `translate_page` uses, and for each
   unit take the overlay's entry when present, else the source text. Title and
   meta likewise. The result is a `content_json` of identical structure — the
   block renderers never learn that language exists, which is why 76 block
   editors needed no change when the site became bilingual and need none now.
3. No published overlay → the page is absent in L: the switcher does not list
   it, `/en/<slug>` is a 404 (or, when the operator chooses, the source page
   under the source address — a site setting, default absent, same as KB).

Fallback to the source text (step 2, missing entry) is **visible but
accounted**: the public page shows it, the admin shows "138 of 140 strings
translated · 2 stale" on the language tab and the string list, and
`list_stale_translations` returns the two. Hidden fallback is how a visitor
finds the gap before the operator does.

The resolver is ONE function, `resolvePageInLocale(page, overlay)`, in
`_shared/i18n/` next to the walker, with a TypeScript twin for the admin
preview (the edge bundle cannot reach `src/`, so the twin is pinned by the same
fixture file, the `pagePath()` precedent). `get-page` grows `&lang=<locale>`
and returns the resolved tree plus `{ locale, fallback_units: [...] }`; the
cache key includes the language.

### 2.4 Divergence is a page, not an overlay

When the Swedish market genuinely needs a different page — another hero, a
local case study, a form with other fields — it is **its own page row**, in
`sv`, with its own slug, and no overlay joins it to anything. The switcher
offers it because it exists at `/sv/<its-slug>`; nothing calls it a
translation. There is no `translation_group_id` to keep in step and nothing to
list as stale, because nothing claims they are the same page.

This is a one-way door by design: an overlay cannot "become" a divergent page
by editing blocks in the English view — there are no blocks to edit in that
view, only strings (§5.3). To diverge, the operator duplicates the page and
unpublishes the overlay. The decision is visible in the pages list as two
pages.

## 3. What the walker already gives us

`supabase/functions/_shared/i18n/translate-walk.ts` is the model's foundation
and needs three changes, not a rewrite:

| Function | Today | For the overlay |
|---|---|---|
| `collectTranslatable(root)` | flat `{path, key, text}[]`, index-based paths | emit `unit` (`<block.id>.<field>`) alongside `path`; treat rich-text docs as one unit |
| `applyTranslations(root, [{path, text}])` | deep copy with strings replaced | unchanged — the resolver feeds it from the overlay by unit |
| `structureSignature(blocks)` | page-level block shape | per rich-text doc as well |
| `isTranslatable(key, value)` | decides prose vs. identifier | unchanged — it IS the definition of "text, not layout" |

The one OPEN gap in `language.md` moves from nice-to-have to prerequisite:
`collectTranslatable` skips **string items inside arrays** (`FormField.options[]`,
`PricingTier.features[]`). Under the row model a missed string meant one
untranslated dropdown; under the overlay model it means a unit that can never
be translated at all. Fix the walker first (unit key `…features[2]`, the
string itself as the value); the guardrail test gets the fixture.

The handler `_shared/handlers/translate-page.ts` keeps its loop — collect,
batch (`batchStrings`, 40 items / 6 000 chars, max 24 batches), `translateAll`,
apply — and changes its write: instead of `applyTranslations` into a sibling
row's `content_json`, the translated units are upserted into
`page_translations.strings` with their `source_hash`, and the resolved tree is
produced on read. The "structure preserved by construction" guarantee
strengthens: there is no second tree to get out of step.

## 4. Addresses, `hreflang`, the switcher

Nothing a visitor or a crawler sees changes.

- **Address form** stays `/{lang}/{baseSlug}` with the default language on the
  root. `pagePath()` in `src/lib/language-path.ts` stays the single owner and
  reads the base slug off the page row. `page_translations.slug` is an optional
  per-language slug (`/en/services` for `/tjanster`) — when set it wins in
  `pagePath()`, in the sitemap and in the switcher; when null the base slug is
  used, which is what the `/en/<baseSlug>` form already assumed.
- **`hreflang`** (`src/lib/hreflang.ts`, `_shared/sitemap-alternates.ts`)
  enumerates the page's published overlays plus the page itself, instead of
  the group's siblings. Every version still lists every version; `x-default`
  still points at the site default.
- **The `-en` suffixed slugs** that §2 of `language.md` kept as row identities
  disappear with the rows (§6). Each one gets a row in `redirects` to the
  resolved `/en/<baseSlug>` form, so the old internal address still arrives.
- **The switcher** lists the page's own locale plus its published overlays —
  which is exactly `pick_locale(available[], wanted, fallback)` over a
  different `available[]`.

## 5. The surfaces

### 5.1 Site Settings → Language & text

The **Languages** card's "add a language" stops offering to copy pages. Adding
a language writes it into `site_languages.enabled` and nothing else — an
overlay that does not exist is an empty overlay. The card shows, per enabled
language, the coverage across published pages ("English: 14 of 16 pages
published, 2 pages have stale strings") and one action: **Translate what is
missing**, which runs `translate_page` over the pages that need it.

### 5.2 The pages list

One row per page, by construction. `pagesInWorkingLanguage()` and the
working-language selector go; a language column shows per page which overlays
are published, draft, or missing, so the list answers "is the English site
complete?" at a glance.

### 5.3 The page editor

Editing a page in its own language is today's block editor. Switching the
editor to another language does **not** show the block canvas with other
text — it shows the **translation view**: the page's units in document order,
source text on the left, the overlay's text on the right, stale units marked,
a per-unit "re-translate" and a page-level "translate what is missing",
"publish this language". Rich-text units open the Tiptap editor on the overlay
doc with the shared `<AITiptapToolbar>` (translate is one of its utilities —
Law 3's refinement). The visual preview (`isEditing=false` path) renders the
resolved tree so the translator sees the page, not a spreadsheet.

That the English view has no block canvas is the point of §2.4: design is
edited where the design lives.

### 5.4 The MCP surface

| Skill | Today | Proposed |
|---|---|---|
| `translate_page(slug \| source_slug + locale)` | finds or creates the sibling row, translates into it | `translate_page(slug, locale, publish?, dry_run?, context?)` — upserts missing and stale units of the `(page, locale)` overlay. Result: `{ translated, kept, stale_cleared, orphans_dropped, coverage }`. The `source_slug` form becomes the only form; "slug of the target row" has no referent. |
| `translate_site_into(locale)` | copies every published page into drafts, adds the language | **`enable_language(locale, translate?: boolean)`** — adds to `site_languages`; with `translate` runs `translate_page` over published pages. Copies nothing. The old name stays as an alias one release, returning the new result. |
| `list_stale_translations(min_hours)` | pages older than their freshest sibling | `list_stale_translations(locale?, page?)` → **units**: `{ page, locale, unit, source_text, stale: true \| missing: true }`. No threshold — a hash is exact. |
| `manage_page_translation(create \| …)` | creates the sibling row in a group | **retired.** A separate page for a market is `manage_page create` with `locale` — the skill description names the two intents: *translate this page* (`translate_page`) vs *a different page for that market* (`manage_page`). |
| `manage_page get` | the row | adds `translations: [{ locale, status, coverage, stale_units, slug }]` so an operator never edits blind |
| `set_translation(slug, locale, unit, text)` | — | **new**: one unit, by hand — the agent-side of the translation view. Writes `source_hash` from the current source so the edit is fresh by definition. |
| `publish_translation(slug, locale)` | — | **new**: `status → 'published'`. Refuses when coverage is below a floor the operator sets (default none — Law 4, fail forward; the floor is for sites that want it). |

Skill descriptions carry the `Use when:` / `NOT for:` split so the Skill
Relevance Engine ranks them (Law 1, Law 2): `translate_page` is NOT for a
page that should differ per market; `manage_page` with `locale` is NOT for
translating.

`content-api` and `get-page` take `lang`. The chat context and the retrieval
index, which `language.md` lists as still monolingual, index the resolved tree
per published overlay — one chunk set per language, each tagged — when they
adopt language; that is the same follow-up it already was.

## 6. Converting today's sibling rows

The conversion is a skill (`convert_translation_groups`, `dry_run` first) and
a one-off, run per instance by whoever operates it; nothing in a migration
rewrites content.

For each `translation_group_id`:

1. **Source row** = the sibling whose `locale` is `site_languages.default`. If
   none (a group of two non-default languages), the oldest row; the report
   says so.
2. For each other sibling S in locale L: `collectTranslatable(source)` and
   `collectTranslatable(S)`. Pair units by **unit key** (block id + field).
   Blocks are matched by `id`; where ids differ but `structureSignature`
   agrees position-for-position, match by position and report it.
3. Every paired unit becomes an entry `{ text: S.text, source_hash:
   hash(source.text) }` — fresh by definition, since S was a translation of
   this source when the conversion runs. Title, meta and S's slug go to the
   overlay's `title`, `meta`, `slug`.
4. **Units in S with no counterpart in the source** (a block only the English
   page has, a feature the Swedish one dropped) are the finding. They are
   listed per page with the text, and the group is **not converted** until the
   operator answers one of two ways: *the source structure is right* (the
   extra text is reported and dropped — the conversion then runs) or *this is
   a different page* (S stays a page, `translation_group_id` cleared, no
   overlay — §2.4). Nothing is dropped silently.
5. The overlay is written with `status` = S's status (`published` if S was
   published), `translated_by = 'conversion'`. S is soft-deleted; a `redirects`
   row sends `/<S.slug>` to the resolved address. `translation_group_id` on the
   source is kept (nullable, unread) until the fleet is converted, then dropped
   by a later migration.

Dry run prints the whole plan — groups, paired units, findings — and writes
nothing. www.flowwink.com has 16 groups and will exercise step 4 (the home page
has been edited on both sides). synclair goes first because it is the smaller
and the operator is in the room.

## 7. What this does not change

- **KB articles** keep their row per language for now. An article is a body
  with a title, so the same overlay model would apply — but the conversion
  recipe above is page-shaped and `kb_articles` already has a working schema
  key per group. Decide after the pages are converted and the model has met a
  second site; do not answer it per table as it comes up (the rule
  `language.md` already set for products and blog posts).
- **Email templates** stay `(name, locale)` rows. They are not designed once
  and translated; each language is its own letter.
- **Chrome** stays `ui_text` with `@<locale>` overlays — this model is the
  content layer adopting the chrome layer's shape, not the other way round.
- **Products, blog posts, booking services, webinars, handbook chapters** are
  still the OPEN gap in `language.md`; when they get a language, a document
  with its own address gets the overlay model of this document, a label gets
  the `kb_categories` `translations` jsonb. One decision, applied twice.
- **No automatic detection, no admin catalogue** — the deliberate omissions of
  `language.md` stand.

## 8. Sequence

Medium-sized. Each step ships green on its own and leaves the fleet working
on the old model until step 5 runs on an instance.

1. **Walker**: unit keys, rich-text as one unit, array string items. Fixture +
   guardrail. No behaviour change for `translate_page` yet.
2. **Table + resolver**: `page_translations`, `resolvePageInLocale` (edge +
   TypeScript twin, one fixture), `get-page ?lang=`. Nothing writes the table.
3. **Writers**: `translate_page` writes the overlay when the page has no
   sibling rows (new pages on converted or fresh sites), `set_translation`,
   `publish_translation`, `enable_language`, `list_stale_translations` on
   units. `translate_site_into` aliases.
4. **Readers**: PublicPage, navigation (`siblingOf` → overlay title/slug),
   switcher, `hreflang`, sitemap, admin pages list, the translation view in
   the page editor. Legacy sibling rows still resolve through the old path.
5. **Conversion**: `convert_translation_groups`, dry run on synclair, then
   live; then www. `pagesInWorkingLanguage()` and the working-language
   selector are removed when no instance has groups.
6. **Retire**: `manage_page_translation`, `translation_group_id`, the `-en`
   slug rule in `language.md` §2 and "What is deliberately not here".

A fresh install is born on the new model from step 3; the conversion exists
for the sites that are already bilingual.
