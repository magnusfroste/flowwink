---
title: "Locale and formatting — the business has a home"
description: Three facts about the business (country, currency, time zone) are chosen from lists; every format is derived from them plus the reader's language. One resolver serves the admin, every e-mail, the invoice PDF and every reminder.
category: architecture
status: proposed
---

# Locale and formatting — the business has a home

> **The rule:** an amount, a date or a time is written in **the reader's
> language** and **the business's region**, on **the business's clock**. An
> English mail from a Swedish business says "Friday, 3 July 2026, 10:00" and
> "1 234,50 kr" — `en-SE`.

## 0. Why — what we had (2026-10-25)

Six settings answered overlapping questions, and the server read none of them:

| Setting | Edited in | Answers |
|---|---|---|
| `general.country` | General | where the business is (only used to pick a chart of accounts) |
| `site_languages` | Languages | which languages the content is in |
| `platform_locale` | Locale & formatting card | format locale, currency, time zone, amount decimals |
| `accounting_locale` | Accounting | which locale pack (BAS / IFRS) |
| `accounting_preferences` | Accounting → Settings | currency, decimals, separators, date format — **again**, for the accounting tabs only |
| `autonomy_schedule.timezone` | FlowPilot | a second time zone |

…plus `pack.currency.intl_locale`, a seventh. On nordbrygg "whole units" was
set twice, once per dial. The card's three fields were free text:
`Europe/Stockholl` saved without a word.

And the edge never asked. ~30 call sites hard-coded a locale: invoices and
quotes `sv-SE`, bookings and orders `en-US`, and reminder times went through a
bare `toLocaleTimeString` in a runtime whose zone is UTC — **a 10:00 Stockholm
booking was mailed as "08:00 AM"**. Webinar reminders printed UTC on purpose.

## 1. The model

**Facts** — chosen by the admin (or an agent), from lists:

| Fact | Default | Override when |
|---|---|---|
| Country (ISO 3166) | — | always asked |
| Currency (ISO 4217) | the country's | the business invoices in another |
| Time zone (IANA) | the country's main zone | the country has several |

**Derived** — never stored:

- **Format locale** = language + home region. The admin's language comes from
  the site's default language; a mail's from its template (`resolve_email_template`
  returns the locale it chose) or from the recipient (`partner_language`).
  `sv` + SE → `sv-SE`; `en` + SE → `en-SE`.
- **Separators, date shape, 12/24 h** — from the format locale, via Intl.
  Not settings.
- **Accounting pack** — `packForCountry(country)`, as today.
- **Book (functional) currency** — the home currency.

**One display preference** stays: *decimals in amounts* (auto / whole units /
two). It is a reading aid for the **admin** only — a customer document always
shows the currency's own digits, because an invoice saying 1 235 kr for
1 234,50 kr is a wrong invoice.

**Accounting keeps only accounting:** chart of accounts, fiscal-year start,
rounding mode.

## 2. One resolver

`supabase/functions/_shared/locale/home.ts` — no imports, read by Deno and by
Vite/vitest alike (the `se-vat-boxes.ts` pattern):

```ts
resolveHome(rows)          // site_settings rows → { country, locale, currency, timeZone, amountDecimals }
formatLocale(home, lang)   // 'en' + sv-SE home → 'en-SE'
homeFormat(home, lang, { audience })  // money / date / dateTime / time
```

`_shared/locale/load-home.ts` — `loadHome(supabase)` reads exactly
`HOME_SETTING_KEYS` in one query; a failed read logs and falls back, never
throws (formatting is not worth a lost invoice).

Read order, so no instance changes what it shows on deploy (Law 4):
`platform_locale` → `accounting_preferences.currency` → the country's defaults
→ `sv-SE` / `SEK` / `Europe/Stockholm`. Invalid values (a typo'd zone, a junk
currency) are skipped, not used.

The admin's `usePlatformFormat` keeps its contract (`formatDate` never
zone-shifts a date-only value; `formatDateTime` uses the home clock) and moves
onto the same resolver in step 2.

## 3. Build plan

1. **The server writes the business's way** *(built, #764)* — `home.ts`,
   `load-home.ts`; booking confirmation and reminders, calendar reminders,
   webinar reminders (the zone is now named: "10:00 CEST"), invoice and quote
   mails, order confirmation, quote-sign receipt, contract-billing reminders,
   agent-execute's order-invoice mail and the invoice PDF all format through
   `homeFormat`. Guard: `business-home.test.ts` scans every edge file for a
   hard-coded locale in a formatter and ratchets the count (11 left: zone
   arithmetic, the briefing, the workspace-chat date line, 46elks).
2. **The card asks three questions** *(built)* — Site settings → *Where the
   business is*: Country / Currency / Time zone as searchable lists from Intl
   (`src/lib/business-home-options.ts`), the admin decimals choice, and a
   preview of the admin and of an English e-mail, computed from the draft with
   the same `resolveHome` / `homeFormat`. One Save (the page's). Saving writes
   `general.country` and `platform_locale` **without** `default_locale`, so an
   instance with a stored locale (nordbrygg: `sv-SE` on an English-default
   site) moves to the derived one (`en-SE`: English month names, Swedish
   numbers) the first time the card is saved — and only then.
   `usePlatformFormat` reads `useBusinessHome()` (the four keys, one query,
   invalidated whenever any of them is saved); the date-fns locale and the
   prospect-fit prompt language follow it. The accounting Settings tab keeps
   chart, fiscal year and rounding; its eight report tabs format through
   `formatAmount` (no symbol, U+2212 minus) instead of eight copies of a
   separator formatter.
3. **The agent sets it the same way** *(built)* — `get_business_home` (the
   resolved home, each value's source, worked examples) and
   `set_business_home({ country, currency?, time_zone?, amount_decimals? })`,
   platform skills (`_shared/handlers/business-home.ts`). A new country brings
   its currency and zone unless the call names them; a mistyped zone is refused
   with the nearest real ones ("Europe/Stockholl" → "Europe/Stockholm").
   Still open: retire `accounting_preferences.currency` / separators and
   `autonomy_schedule.timezone` once the fleet has been rewritten.

### A runtime that pretends

Chrome ships trimmed locale data: `en-NO`, `en-IS`, `en-EE` are "supported"
but resolve to plain `en` — US numbers and a 12-hour clock. `localeFor` only
accepts a tag whose resolved locale keeps its region; otherwise English falls
back to `en-GB` (day-month, 24-hour) and other languages to the language
alone. Deno has the full data, so a mail can say `en-NO` where the admin's
browser shows `en-GB` — same clock and order, different grouping.

## 4. Rules

- **Locale controls format, currency controls the symbol.** Never derive one
  from the other at format time; never convert in a formatter.
- **Timestamps on the home clock; date-only values never shifted.**
- **The reader's language, the business's region.** Not the reader's region:
  the business invoices in its own conventions.
- **No `toLocale*('xx-XX')` / `Intl.*Format('xx-XX')` for something a person
  reads.** Go through `homeFormat` (edge) or `usePlatformFormat` (app).
