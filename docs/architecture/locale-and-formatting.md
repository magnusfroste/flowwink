---
title: "Locale and formatting — the business has a home"
description: Three facts about the business (country, currency, time zone) are chosen from lists; every format is derived from them plus the reader's language. One resolver serves the admin, every e-mail, the invoice PDF and every reminder.
category: architecture
status: built
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

## 3b. Decisions (2026-10-25) — what the reference systems do

**Amounts: `*_cents` is fixed-point hundredths in every currency.** One integer
column, scale 2, whatever the currency — what the inputs (`× 100`), the SQL
(`/ 100.0`), accounting and the Stripe calls already assume. It is Stripe's own
answer for ISK and UGX ("transitioned to zero-decimal, but backward
compatibility requires a two-decimal value where the decimals are always 00")
and Odoo's (a fixed-precision numeric; the currency only decides *rounding* and
*displayed* decimals). So:
- **Storage** never changes scale. 1 000 JPY is `100000`.
- **Display** divides by 100 and shows the currency's own decimals
  (JPY/ISK/KRW: none). The old formatter divided by 10^digits — 1 000 JPY
  showed as ¥100,000. Fixed in both formatters.
- **Rounding** at entry follows the currency (Odoo's `currency.round`): a
  zero-decimal amount is whole units.
- **The Stripe boundary** converts: Stripe's zero-decimal list (JPY, KRW, …)
  takes whole units, so `cents / 100`; ISK and UGX stay two-decimal, as Stripe
  says. `toStripeAmount` / `fromStripeAmount`, one place.

**The ledger is in the business's currency** *(built 2026-10-26, `20261026100000`)*.
Odoo keeps `amount_currency` on the line and `balance` in the company
currency; here the document (invoice, order) keeps its own currency and
amounts, and the journal lines are converted — at the issue-date rate for the
receivable, revenue and VAT (Skatteverket: the invoice date's rate), at the
payment-day rate for the bank, with the difference realised on 3960/7960. The
rate is stamped on the invoice (`exchange_rate`, `fx_rate_source` = same_currency
| rate_table | manual | missing) when it is issued; a foreign invoice with no
rate is refused with the fix, never booked at 1 (`get_exchange_rate` no longer
answers 1 for a missing pair). The purchase side follows the same rule
(`20261026110000`): the vendor invoice carries its rate, the debt is booked and
settled in the business's currency, the payment-day difference is realised.
`business_currency()` is the one reader; `platform_default_currency()` reads
the same setting first and `currencies.is_base` is a mirror.

**A new row's currency is the business's.** Odoo's
`default=lambda self: self.env.company.currency_id`. Here: every `currency`
column's default is `public.business_currency()`, the SQL twin of
`resolveHome().currency`; code that writes a row and has no currency from the
user OMITS the field. A literal `'SEK'` default wrote Swedish crowns into a
Norwegian business's deals.

**Dates are the business's dates.** Odoo computes "today" with
`fields.Date.context_today` in the user's zone, never the server's; an
accounting entry carries a date-only value. Here, single-tenant: the business's
zone (`business_timezone()` in SQL, `home.timeZone` in TypeScript). A posting
at 00:30 on 1 November in Stockholm belongs to November.

**Words follow the reader, numbers the business.** Odoo formats by the
reader's language (`res.lang`); Shopify by a store-wide money format. A mix:
the reader's language in the business's region (`en-SE`), so a Swedish
business's English invoice still says "1 234,50 kr".

## 3c. Inventory (2026-10-25)

Found by a pattern sweep of `src`, `supabase/functions` and the SQL, then read:

| Class | Where | Plan |
|---|---|---|
| Wrong data written | 51 `DEFAULT 'SEK'` columns and ~30 SQL functions coalescing to 'SEK'; ~20 agent handlers and ~65 frontend payloads/forms defaulting to SEK; checkout / quote-pay / invoice-payment falling back to SEK; Stripe zero-decimal amounts ×100; document dates ("today") on the UTC calendar | step 4a *(built)*: `business_currency()` / `business_timezone()` / `format_business_amount()` in SQL with a self-discovering rewrite (`20261025040000`), `toStripeAmount` / `fromStripeAmount`, `dateInZone` / `businessToday`, `homeCurrency()` for forms; guards: SQL twin == `COUNTRY_DEFAULTS` + Intl separators, no new SEK literal (code ratchet 11, SQL zero after the floor) |
| Customer sees it wrong | ~~contract body (`to_char` under `en_US`: "1,234.50 SEK")~~ (4a); webshop `formatPrice` (always sv-SE: Checkout, Cart, Shop, ProductDetail, Pricing, OrderTracking, three blocks); public quote / contract pages, portal, chat (hard-coded sv-SE); 6 public blocks on the browser's locale; admin decimals rounding the cart; dunning's own `toFixed` | step 4b *(built)*: `useCustomerFormat` (same engine as `usePlatformFormat` — `makePlatformFormat` — over the reader's language in the business's region, `amount_decimals: 'auto'`); the shop's sv-SE `formatPrice` removed (admin callers → `usePlatformFormat`, customer callers → `useCustomerFormat`); 24 public/portal pages, chat times, blog dates, public number blocks, empty cart currency; guard `customer-surfaces-read-the-business-home` scans every customer file. Dunning's text is admin-facing → 4d |
| Wrong clock | ~50 server "today / this week / last month" on the UTC clock (briefing, heartbeat, timesheets, period stats); `platform_timezone()` unvalidated, no country fallback; ~700 SQL `CURRENT_DATE` in UTC; 19 hard-coded `Europe/Stockholm` | step 4c |
| Admin, own formatters | ~25 modules with `toFixed` / `/100` / `" kr"` (HR, timesheets, expenses, consultants, purchasing, manufacturing, payroll + its PDF, POS, subscriptions, reconciliation, shipping, fixed assets, discount codes, inventory, quote and contract templates); 66 browser-locale calls | step 4d, ratchet guard |

## 3d. Second pass (2026-10-26) — decisions and what is left

Three independent audits (admin formatting, server/SQL clock, language) after
#769–#772; fixed in #773 and #774.

**Decisions**
- **One clock for the business.** `autonomy_schedule.timezone` is retired:
  FlowPilot's schedule, voice callbacks and every automation without its own
  `trigger_config.timezone` run on the home time zone. A default of
  Europe/Stockholm in the schedule ran FlowPilot on Swedish time elsewhere.
- **pg_cron only knows UTC, so jobs ask.** Heartbeat and learn are
  registered every half hour (`LOCAL_HOUR_CRON`) with their LOCAL hours in the
  body; `isDueLocalHour` (`_shared/locale/local-hour-gate.ts`) decides on
  today's offset. A fixed UTC hour froze the offset of the day it was saved.
- **Automation cron is read on a clock.** `calculateNextRun(expr, from, tz)`
  with `readCronTimeZone(trigger_config, home)`; system jobs that must run at a
  UTC instant say `timezone: 'UTC'` explicitly.
- **Amounts in different currencies never add.** `sumByCurrency` /
  `formatTotals` (`src/lib/currency-totals.ts`): "1 000 kr + 300 €". A trend
  (month over month) compares the home currency only.
- **Date-only arithmetic is done on the parts.** `src/lib/calendar-date.ts`
  (app) and `addDaysToDate` / `businessDateIn` (edge). `Date` + `setMonth` +
  `toISOString` loses a day across DST.

**Done in the third round (#775, #776)**
- *Addresses:* one rule for every address — docs/architecture/addresses.md.
- *The reader's language on customer mail:* orders, bookings, webinar
  registrations and newsletter subscribers store the language the visitor
  read (`lang`); a party without a language learns it from its first order or
  booking. Order and booking confirmation, booking/calendar/webinar reminders,
  return confirmation and the newsletter opt-in resolve their template in that
  language (`booking_reminder`, `calendar_reminder`, `webinar_reminder`,
  `return_confirmation`, `newsletter_confirm` seeded in en and sv).
- *Header button, menu links, footer legal links* carry `labels` per language.
- *Meeting-poll* slot times are written in the template's language.

**Left (roadmap)**
- *Broken fiscal years* — **built** (`20261026120000`): a fiscal year is keyed
  by the calendar year it ends in, dated by the start month or an explicit
  `fiscal_years` row; every period computation reads `fiscal_year_of` /
  `fiscal_year_range` (SQL) or the twin in `src/lib/fiscal-year.ts`.
- *Products in every language* — the shop is one-language however much the
  rest is translated; the next thing to build.
- *The public KB hub per language* (`/<lang>/kb`) — **todo, not prioritised**
  (Magnus, 2026-10-26): FlowPilot answers in the visitor's language whatever
  language the article is written in, so the chat path already works; only a
  publicly indexed `/kb` help centre would show articles in their source
  language. Same for `/<lang>/shop` and `/<lang>/docs` (addresses.md §4).
- *Retire* `accounting_preferences.currency` / separators once the fleet has
  been rewritten.
- *Smaller:* Customer 360 totals assume one currency.

## 4. Rules

- **Locale controls format, currency controls the symbol.** Never derive one
  from the other at format time; never convert in a formatter.
- **Timestamps on the home clock; date-only values never shifted.**
- **The reader's language, the business's region.** Not the reader's region:
  the business invoices in its own conventions.
- **No `toLocale*('xx-XX')` / `Intl.*Format('xx-XX')` for something a person
  reads.** Go through `homeFormat` (edge) or `usePlatformFormat` (app).
