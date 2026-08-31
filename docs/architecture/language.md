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
| Content — pages, and next: email templates | the row | `locale` + `translation_group_id` |
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

`pages` has them. The rules that follow are the convention:

- **One row per language per group.** Enforced in `manage_page_translation`.
- **Each language keeps its own address.** That is the whole reason to store it
  as separate rows rather than `{sv, en}` fields: one URL per language is what
  lets a search engine index both and `hreflang` work at all. The declaration
  itself lives in `src/lib/hreflang.ts` — every version lists every version
  including itself, the hrefs are absolute, and `x-default` points at the site's
  default language rather than at whichever version came first.
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

The key list comes from `src/data/ui-text-catalog.json`, generated from the call
sites — the stored pack only holds what someone already translated, so an editor
built on it could never show the untranslated keys, which are exactly the ones
still showing English on a Swedish site.

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

## Next: email templates

`email_templates` is selected by `name` (the kind: `booking_confirmation`,
`invoice_email`, …). It should adopt §2, not invent anything:

- add `locale`, make the key `(name, locale)`
- the recipient's language is already known — `partner_language(partner_id)`,
  since a party carries its own language
- choose with `pick_locale(available_locales, recipient_language, site_default)`
- and keep Law 4: a missing translation must fall back to a template that
  exists, never to no email at all

The reason this is a small step and not a project is that the ladder, the
declaration and the fallback discipline are already built and already shared.

## What is deliberately not here

- **No message catalogue for the admin UI.** The product interface stays
  English. That is what keeps this system light: the heavy half of i18n —
  extraction, catalogues, `t()` everywhere, translator tooling — is the half we
  do not need.
- **No automatic language detection.** `Accept-Language` is not read. The
  ladder for a visitor is: explicit URL → the page's own language → the site
  default. Adding browser detection means deciding what happens to crawlers and
  to an explicit choice, and that is a separate decision.
- **The blog archive has no translated address.** Its LABEL now follows the
  language (`nav.blog` in the pack, with the operator's `archiveTitle` acting as
  the base layer for the site's own language — see `blog-link-label.ts`), but
  the destination stays `/blog`. The prefix is hardcoded in six places
  including canonical URLs and KB cross-links; moving it is its own piece of
  work, not a setting. The setting that pretended otherwise was removed.
