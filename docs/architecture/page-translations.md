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
| `translate_site_into(locale)` | copies every published page into drafts, adds the language | **`enable_language(locale, dry_run?)`** — adds to `site_languages` and returns the pages without a published overlay (the todo). Copies nothing, translates nothing itself: one `translate_page` per page keeps each call inside the 150 s wall clock. The old name is an alias. |
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
| Absence (`/en/<slug>` with no published overlay) | **redirect to the source address** — today's behaviour, kept in step 4 | the address then says what it shows; the 404 the first draft of this table chose would have changed live sites (synclair, www) in the same release as the readers. A `404` option can come as a setting once the overlay model is the only one |
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
3. **Writers** *(built)*: `translate_page(slug, locale)` upserts missing +
   stale units (fresh ones untouched, orphans dropped and counted) when the
   page has no sibling row in that language — a sibling row takes the legacy
   path until the conversion runs; `set_translation`, `publish_translation`
   (with `min_coverage` and the per-language `translated_slug`),
   `enable_language` (adds the language, copies nothing, returns the todo
   list), `list_stale_translations` on units with `legacy_siblings` from the
   old RPC; `translate_site_into` is an alias of `enable_language`. The write
   rule is pure (`_shared/i18n/overlay-write.ts`: plan → number → assemble)
   and pinned by `overlay-write.test.ts`: a fresh entry is kept, a doc with one
   node missing is not written half-done, an undelivered stale unit keeps its
   old entry, every entry is stamped with the unit's own hash. Live proof on
   sandbox is the acceptance: enable `en` → translate one page → every unit
   fresh; edit one source string → exactly that unit stale; translate again →
   only it rewritten.
4. **Readers** — in two PRs.
   **4a, public** *(built)*: `get_page_translations(slug)` returns versions
   from BOTH models (`source: 'row' | 'overlay'`, an overlay carrying the
   page's slug and its translated title); PublicPage resolves `/en/<slug>`
   to `get-page ?lang=` for an overlay (DB fallback through the same
   resolver) and `?lang=` to the prefixed address; `usePageSiblings` builds
   its lookup from rows + published overlays (`siblingRowsFromModels`), so
   nav and footer follow; the switcher and `hreflang` need no change (they
   consume the version list); the sitemap lists an overlay at
   `/<lang>/<slug>` with the full alternate set (`overlayUrls`);
   `api/html.ts` reads title, meta, `lang` and alternates from the overlay.
   Sibling rows keep resolving through the old path, unchanged. The
   per-language `translated_slug` is STORED by `publish_translation` but not
   yet honoured by the readers — every overlay lives at `/<lang>/<page slug>`
   until 4b; honouring it means a per-version base in `pagePath`'s seven
   consumers and belongs in one change.
   **4b, admin** *(built)*: the pages list shows one chip per other language
   on each source page (✓ published, N% draft, — missing; a click opens the
   editor on that language), `PageTranslationsSheet` in the editor is the
   translation view — units in document order, source | translation, stale
   and missing marked, per-unit save through `set_translation` (fresh by
   definition), "Translate missing" / retranslate-all through
   `translate_page`, publish/unpublish through `publish_translation`; rich-text
   units are shown whole with reset-then-retranslate. The Languages card shows
   "N of M pages published · k draft" per language (`languageCoverage`) and
   "Translate what is missing" runs `translate_page(publish: true)` per page
   (one call per page, inside the wall clock) — the copy action is gone.
   `manage_page get` returns `translations[]` from both models. The pure
   state helpers are in `src/lib/page-translation-state.ts`, pinned by test.
   **Not in 4b**: `translated_slug` honoured by the readers (moved to step 6
   with the `-en` slug retirement: both are "the address per language" and
   belong in one change).
   Accepted when: a site with ONLY overlays and a site with ONLY sibling
   rows both pass the view sweep and the battery scenario.
5. **Conversion** *(built)*: `convert_translation_groups` (trust `approve`,
   `dry_run` by default), pairing in `_shared/i18n/convert-siblings.ts`
   (`pairSiblingUnits`, pinned by test). Text identical to the source (an
   untranslated copy, or a brand name) is left out of the overlay — it shows
   the source text either way. The source's `translation_group_id` is
   cleared once every sibling is an overlay or its own page; the overlay
   keeps the sibling's status (a draft sibling becomes a draft overlay).
   **Rehearsed 2026-10-25** on a local copy of www's 16 groups: 0 blocked,
   16 converted, 16 redirects (`/home-sv → /sv/home`); 15 of 16 Swedish
   pages resolve byte-identical to the old sibling row; the 16th (flowpilot)
   differs only where the Swedish row had OMITTED a field the English one
   has (`accentText`) — it now shows the source text, listed as missing.
   Per §6:
   synclair first (operator present), then www (16 groups, home page expected
   to hit step 4's finding). Accepted when: the dry run on www lists every
   group with paired units and findings, nothing written; the live run leaves
   `pagesInWorkingLanguage()` with nothing to group; redirects from every
   `-en` slug resolve.
6. **Retire**: `manage_page_translation`, `translation_group_id` readers,
   `pagesInWorkingLanguage()` and the working-language selector; the `-en`
   slug rule and this section's "proposed" status in `language.md`. Also
   here: the address per language — `translated_slug` honoured by
   `pagePath`'s consumers (switcher, nav, hreflang, sitemap, SEO shell,
   PublicPage's resolution of `/en/<translated slug>`).

A fresh install is born on the new model from step 3; the conversion exists
for the sites that are already bilingual.

## 9. Step 7 — blog posts on the overlay model (build contract)

Proposed 2026-10-25 (local session, Magnus). **Built 2026-10-25** (cloud
session, one PR) — see "As built" at the end of this section for the choices
the table below left open. **Why:** an agent writes a post once and
it exists in every language the site sells in, kept in sync — what in-page
browser translation cannot give (search and answer engines index only what the
server sends; link previews and the site's own terms follow the language) and
what WPML/Weglot give only as a per-post workflow or a paid proxy. Today
`blog_posts` has no language at all: nordbrygg (default `en`, `sv` enabled)
lists its Swedish posts on the English site.

| Question | Decision |
|---|---|
| Table | **Generic** `content_translations (entity, entity_id, locale, status, slug, strings, coverage, translated_at, translated_by)`, key `(entity, entity_id, locale)`. `page_translations` becomes `entity = 'page'` through a view or a one-time move with a compatibility view — KB articles, products and handbook chapters (the OPEN rows in `language.md`) follow without a new table each. |
| Units | The same walker: `page.title` → `post.title`, `post.excerpt`, `post.meta.<key>`, the body as ONE doc unit (`post.content`), `post.featured_image_alt`. `collectUnits` gets an entity-aware root, not a second walker. |
| Source language | **Per post**, a `locale` column born from `site_languages.default` by trigger (the pages rule). nordbrygg has 13 Swedish and 3 English posts — mixed sources are real. |
| Address | `/blog/<slug>` in the site language, `/<lang>/blog/<slug>` otherwise, through `pagePath`'s rules (one owner of the address form). The archive is `/<lang>/blog`. Overlay `slug` (per-language slug) honoured here from day one. |
| Writers | `write_blog_post` gains `languages` (default: every enabled language but the source) and fills the overlays after creating the source; `manage_blog_posts update` re-translates only stale units; `translate_page`'s engine generalised to `translate_content(entity, id, locale)`. |
| Readers | BlogPostPage, BlogArchivePage, BlogCategoryPage, BlogTagPage, BlogAuthorPage, LatestPostsBlock, sitemap, content-api, `api/html.ts` (/blog/*), RSS. A list in language L shows the post's L title/excerpt, the source where the overlay is missing (visible, counted). A post with no published L overlay is absent from L's lists. |

**Acceptance (nordbrygg):** one `write_blog_post` call yields a post at
`/blog/<slug>` (en) and `/sv/blog/<slug>` (sv), hreflang both ways in the
sitemap and the SEO shell; the Swedish archive and the Swedish home's
LatestPostsBlock show Swedish titles; editing one paragraph of the source
marks exactly that unit stale; a battery check in content-to-conversion pins
it nightly.

**Who builds what (agreed 2026-10-25, cloud + local):** ONE fresh cloud
session builds all the code in one PR — `content_translations` + the
compatibility view, entity-aware units, `translate_content`,
`write_blog_post` languages, every reader in the table above and the battery
check. Readers and writers are not split across branches: they meet in the
same files (BlogPostPage, sitemap, `api/html.ts`, `usePageSiblings`). The
local session owns everything that needs the live fleet: (1) before merge, a
read-only inventory of nordbrygg's 16 posts' real source languages (13 sv,
3 en) to check the trigger default and the backfill against; (2) after merge +
deploy, correcting each existing post's `locale` where the default is wrong;
(3) backfilling overlays with `translate_content` and publishing them; (4) the
acceptance run above on nordbrygg; (5) the same read-only check on optic and
www. The cloud session tells Magnus when the PR is up; local runs (1) against it.

### As built

- **Table.** Migration `20261025030000_bloggen-far-sprak-overlagget-blir-generiskt.sql`
  creates `content_translations` (entity `page` | `blog_post`, CHECKed — a
  new entity is a migration that also teaches the public-read policy its
  source table), moves every `page_translations` row in as `entity = 'page'`,
  and replaces the table with a `security_invoker` VIEW of the same columns.
  The view is for READING: the Vercel frontend (PublicPage, usePageSiblings,
  `api/html.ts`'s page path) still reads it, so a frontend deployed before or
  after the migration both work. Everything that writes — and every edge
  reader — uses `content_translations`. No foreign key can point at two
  tables: `AFTER DELETE` triggers on `pages` and `blog_posts` cascade.
- **Source language.** `blog_posts.locale`, stamped by `blog_posts_set_locale`
  (insert, or an update that sets it). Every existing post is backfilled to
  the site's language — the local inventory (1) corrects the ones written in
  another (`manage_blog_posts update locale`). `write_blog_post`'s `language`
  argument now IS the source language; omitted, the trigger decides (it used
  to default to a hardcoded `'en'` in `meta_json`).
- **Units.** `collectPostUnits` / `collectEntityUnits` in
  `translation-units.ts`: `post.title`, `post.excerpt`, `post.meta.<key>`,
  `post.content` (one doc), `post.featured_image_alt`; a legacy block-array
  body is keyed per block under `post.content.<id>`. Resolver:
  `resolveContentInLocale(entity, row, overlay)`.
- **Writers.** `_shared/handlers/content-overlay.ts` is the one store and the
  one engine (`translateContentIntoOverlay`); `translate_page`'s overlay path
  is a wrapper over it. `translate_content` (blog module; `entity: "page"`
  routes to translate_page) takes `locale` or `languages` (`"all"`).
  `set_translation`, `publish_translation` and `list_stale_translations` take
  `entity: "blog_post"`. `write_blog_post` translates into `languages`
  (default: every enabled language but the source) and PUBLISHES each overlay
  that comes back complete — the post's own status still gates visibility, so
  publishing the post later publishes it in every language. A translation
  failure never loses the post (`translation_note`). `manage_blog_posts
  update` re-translates the stale units of the overlays that exist
  (`retranslate: false` skips), and `get` returns `translations[]`.
- **Readers.** One rule, `postInLanguage` (`_shared/i18n/post-language.ts`):
  own language → the post; published overlay → the post with its text,
  missing units in the source language; neither → absent. One address owner,
  `_shared/i18n/blog-address.ts` (`blogPostPath`, `blogIndexPath`,
  `postVersions`, `postAlternates`), re-exported by `src/lib/language-path.ts`.
  Lists filter through the RPC `blog_posts_in_language(p_lang)` (SETOF
  `blog_posts`, SECURITY INVOKER — embeds and pagination unchanged). Routes
  `/:lang/blog`, `/:lang/blog/:slug`, `/:lang/blog/{category,tag,author}/:slug`;
  a post with no version in the requested language redirects to its own
  address (the pages rule, §8). The sitemap lists every published version with
  the full alternate set; `api/html.ts` serves title, description, `lang`,
  canonical and hreflang for `/blog/*` and `/<lang>/blog/*`; RSS and
  content-api take a language — REST `?lang=`, GraphQL `blogPosts(lang:)` /
  `blogPost(slug:, lang:)` with `language` and `path` on every post, so a
  headless client (a mobile app) reads the blog in the visitor's language. A one-language site lists every post as
  before — the language filter only applies when more than one is enabled.
- **Battery.** `postInAnotherLanguage` in `content-to-conversion`: written in
  the site language → hand overlay → anon reads (draft hidden, RPC, content-api
  `?lang`, sitemap hreflang) → one paragraph edited → exactly `post.content`
  stale, the title's translation intact.
- **Not built.** A per-language blog SEGMENT (`/sv/blogg`); the admin translation view for posts
  (the editor has no language tab yet — the skills are the surface).
