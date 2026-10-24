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
  locale         text not null,                       -- BCP-47, lowercased (CHECK)
  status         text not null default 'draft',       -- 'draft' | 'published' (CHECK)
  slug           text,                                -- per-language address, optional (§4); unique per (locale, slug)
  strings        jsonb not null default '{}',         -- the overlay proper, see below
  coverage       integer,                             -- fresh units / total units, %, cached
  translated_at  timestamptz,
  translated_by  text,                                -- 'translate_page' | user id | 'conversion'
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (page_id, locale)
);
```

Migration `20261025010000_sidoversattningar-overlagget-foljer-sidan.sql` (step
2). The page's title and SEO meta are NOT separate columns: they are units
too (`page.title`, `page.meta.<key>`) and live in `strings` — one mechanism,
one staleness rule, one resolver. RLS: anon and signed-in users read a
PUBLISHED overlay of a PUBLISHED page (the `pages` boundary); staff read and
write everything; the migration proves lower-casing, the status check and
the delete cascade on every apply.

`strings` maps a **unit key** to an entry:

```json
{
  "page.title":                         { "text": "Tjänster",           "source_hash": "9c1e…" },
  "page.meta.seoTitle":                 { "text": "Tjänster — Synclair", "source_hash": "4a7b…" },
  "b7f3a.data.title":                   { "text": "Våra tjänster",      "source_hash": "02ab…" },
  "b7f3a.data.items[0].title":          { "text": "Rådgivning",         "source_hash": "d41d…" },
  "b7f3a.data.items[0].description":    { "text": "…",                  "source_hash": "77be…" },
  "b2c90.data.content":                 { "doc": { "type": "doc", "content": [ … ] }, "source_hash": "f00d…" }
}
```

- **A unit is a field of a block** — `<block.id>.<path inside the block>`,
  dots for keys and brackets for indices (`b7f3a.data.items[0].title`); the
  page's own fields are `page.title` and `page.meta.<key>`. Block ids are
  stable across reorders (checked 2026-10-24: 451 template blocks and 276 live
  blocks on www, none without an id); array indices inside a block are not
  stable but are bounded to that block, so moving a block costs nothing and
  reordering three pricing tiers costs those three. *Never key by position in
  `content_json`*: the walker's `path` is `[3, 'data', 'title']`, and
  inserting one block above would make every string on the page stale. A
  block with no id (legacy data) is keyed `#<index>` so nothing is dropped —
  the key then moves with the block, which is why the normaliser assigns ids.
- **A rich-text field is one unit.** The Tiptap doc of a `rich-text` block, a
  `content` field, a testimonial quote with marks — the whole document is the
  entry (`doc`), not its individual text nodes. Half a translated paragraph is
  not a thing, and text-node paths change every time a sentence is split. The
  unit's text is the doc's text nodes in order — marks, attrs and node ids are
  not text, so a link moved or a paragraph id regenerated by the editor does
  not stale the translation; a changed word does. Translating a doc still
  happens node by node inside it (the existing walk); the doc is the unit of
  storage and staleness, not of the model call.
- **`source_hash`** is a fingerprint of the unit's text *at the time the entry
  was written* — FNV-1a 64 as 16 hex chars (`unitHash`), synchronous and
  identical in Deno and Node; it is a staleness check, not a credential, so a
  cryptographic hash would buy nothing but an `await`. On read, a
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

The resolver is ONE function, `resolvePageInLocale(page, overlay)` in
`_shared/i18n/resolve-page.ts` next to the walker — and one module, not a
twin: `src/` already imports from `_shared/` directly
(`forms/delivery-plan`, `email/sender-identity`), so the admin preview and
PublicPage's DB fallback call the same code the edge runs. `get-page` takes
`&lang=<locale>` (step 2): with the page's own language or no `lang` the
response is byte-identical to before; with another language it returns the
resolved tree plus `language: { requested, served, slug, coverage,
fallback_units, stale_units }`, or `{ found: false, error: 'No published
translation', requested_lang, page_lang, available }` when no published
overlay exists — the caller (step 4) decides what that absence means. The
cache key is `<slug>@<lang>`. An instance that has not applied the migration
yet reads as "no overlays" (the fleet runs several schema versions at once).

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
| `collectTranslatable(root)` | flat `{path, key, text}[]`, index-based paths | unchanged; `collectUnits(page)` in `translation-units.ts` builds on it — `unit` key, `hash`, rich-text docs as one unit (**built, step 1**) |
| `applyTranslations(root, [{path, text}])` | deep copy with strings replaced | unchanged — the resolver feeds it from the overlay by unit |
| `structureSignature(blocks)` | page-level block shape | per rich-text doc as well |
| `isTranslatable(key, value)` | decides prose vs. identifier | unchanged — it IS the definition of "text, not layout" |

The "string items inside arrays" gap `language.md` lists as OPEN was closed
on 2026-10-23 (synclair's chips: `tags[0]`, `options[]`, `features[]` are now
judged by the array's key) — under the overlay model a missed string would
have been a unit that can never be translated, so this was a prerequisite and
it is done. `language.md`'s table is stale on that row.

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

## 8. Build plan

Decided 2026-10-24 ("kör på"). The decisions §2 left implicit, settled so the
code has one answer each:

| Question | Decision | Why |
|---|---|---|
| Unit key | `<block.id>.<path>`, `page.title`, `page.meta.<key>`; `#<index>` for an id-less block | every block has an id (verified); position only as a visible fallback |
| Arrays inside a block | index within the block, no item-id matching | reordering three tiers costs three units; matching list items by content is a heuristic that would guess |
| Rich text | one unit; hash over text nodes in order | marks/attrs/ids churn on every save; words are what a translator translated |
| Hash | FNV-1a 64, 16 hex, synchronous | a fingerprint; `crypto.subtle` is async and buys nothing |
| Absence (`/en/<slug>` with no published overlay) | 404, honest, like the KB lists | a site setting `fallback_to_source_language` (default off) for operators who prefer the source under the prefixed address |
| Overlay publishing | `page_translations.status` per `(page, locale)`; the switcher lists published overlays only | a page has ONE tree with a status (no draft tree), so per-language publish lives on the overlay |
| Translating a doc unit | node by node inside the doc, as today; the translated doc is stored whole | translation quality unchanged; storage granularity is what changes |
| Stale text | shown, counted, listed | better than the source language; hidden fallback is how the visitor finds the gap first |
| Who builds | the cloud session builds the PR sequence; the local session runs conversions on live instances with the operator present | one builder per step — the #597 double-stamp |
| Tests | unit tests per step (no DB), a migration applied twice on a local stack, and one process-battery scenario for the nightly run (add a language → translate → switcher, hreflang, sitemap → conversion dry run) | PR CI is offline; a translation regression must fail the night, not a visitor |

### Steps and acceptance

Each step is one or two PRs, green on its own, behaviour-preserving until the
step that says otherwise. Steps 1–2 change no visitor-facing behaviour and
may land before the demo; 3–6 wait until it is done.

1. **Units** *(built — this PR)*: `_shared/i18n/translation-units.ts` —
   `collectUnits`, `unitHash`, `docText`, `diffOverlay`, `overlayReplacements`,
   `applyOverlay`. `translate-walk.ts` untouched; `translate_page` unchanged.
   Accepted when: `translation-units.test.ts` pins the key scheme, reorder
   stability, doc-as-unit, hash semantics and the four diff buckets.
2. **Table + resolver** *(built)*: migration `page_translations` (idempotent,
   applied twice locally, self-proving), RLS (anon reads published overlays
   of published pages; staff writes), `resolvePageInLocale(page, overlay)` in
   `_shared/i18n/resolve-page.ts` — one module imported by edge and app, no
   twin — and `get-page ?lang=` returning the resolved tree plus `language:
   {…}`, cache key per language. Nothing writes the table. Accepted when:
   `resolve-page.test.ts` pins no-overlay / complete / partial / stale /
   orphan; `get-page` without `lang` is byte-identical to before. Found on
   the way: #725 had narrowed `pages` (and `blog_posts`, `handbook_chapters`,
   `profiles`) to `is_staff()` for authenticated — a signed-in customer saw an
   empty menu; fixed first, generically (#744).
3. **Writers**: `translate_page(slug, locale)` upserts missing + stale units
   (fresh ones untouched, orphans dropped and counted) when the page has no
   sibling rows; `set_translation`, `publish_translation`, `enable_language`
   (adds the language, copies nothing), `list_stale_translations` on units;
   `translate_site_into` becomes an alias with the new result. Skill
   descriptions with `Use when:` / `NOT for:`. Accepted when: on a fresh local
   install, enable `en` → translate one page → the overlay has every unit
   fresh; edit one source string → exactly that unit is stale; translate again
   → only it is rewritten.
4. **Readers**: PublicPage (`?lang` / prefix → overlay), navigation
   (`siblingOf` → overlay title and slug), switcher, `hreflang`, sitemap,
   `api/html.ts` title/meta per language, the admin pages list (one row per
   page, language column), the page editor's translation view (source |
   translation, stale marked, per-unit retranslate, publish language).
   Sibling rows keep resolving through the old path. Accepted when: a site
   with ONLY overlays and a site with ONLY sibling rows both pass the view
   sweep and the battery scenario.
5. **Conversion**: `convert_translation_groups` with `dry_run`, per §6.
   synclair first (operator present), then www (16 groups, home page expected
   to hit step 4's finding). Accepted when: the dry run on www lists every
   group with paired units and findings, nothing written; the live run leaves
   `pagesInWorkingLanguage()` with nothing to group; redirects from every
   `-en` slug resolve.
6. **Retire**: `manage_page_translation`, `translation_group_id` readers,
   `pagesInWorkingLanguage()` and the working-language selector; the `-en`
   slug rule and this section's "proposed" status in `language.md`.

A fresh install is born on the new model from step 3; the conversion exists
for the sites that are already bilingual.
