---
title: "Benchmarking policy"
description: What we benchmark FlowWink against, which sources contributors may use, and how we treat other vendors' code, text and trademarks.
category: contributing
---

# Benchmarking policy

FlowWink measures its modules against established business software — mostly
Odoo, as the best-known open ERP, and sometimes HubSpot, Salesforce, NetSuite,
ERPNext and others. The benchmark tells us *which capabilities a small business
expects*. It does not tell us how to build them.

## What we benchmark

- **Capabilities and workflows** — what a user can do, which documents exist,
  which states a document passes through, what gets posted where.
- **Observable behaviour** — what the product does when you use it, as
  described in its public documentation or seen in a demo or trial.

We do not reproduce another product's code, UI design, screenshots or
documentation text. Data-model *patterns* that mature ERPs share — one party
table for people and companies, a quant per product and location, a posted
journal entry that never changes — are common domain knowledge and fair to
use; where we follow one, we write our own schema and say so (the party
register uses the same field names as Odoo's `res.partner` on purpose, so a
team moving in from Odoo recognises them).

## Allowed sources

1. **Public functional documentation** — user manuals and help pages
   (e.g. odoo.com/documentation), release notes, public demos.
2. **Domain standards and law** — BAS, Skatteverket, Bokföringslagen, ISO
   standards, UBL/Peppol, SIE, SEPA, GS1 and similar.
3. **Our own requirements** — customer processes, operator feedback, and the
   design decisions recorded in this repository.

## Not allowed

- **We do not read or reuse competitor source code.** No copying, translating
  or paraphrasing of another product's code, regardless of its licence, and no
  linking to it as the basis for a design.
- No copying of another vendor's documentation text, screenshots or UI
  assets into FlowWink.

The one exception is **interoperability**: the importers (for example the Odoo
importer in `supabase/functions/_shared/import/`) read another system's
*public API and data format* so a customer can move their own data. That is
integration, not reuse.

## Attribution

If a document in this repository quotes another vendor's documentation, keep
the quote short, put it in quotation marks and link the source. Prefer
describing the behaviour in our own words.

## Trademarks

Odoo is a trademark of Odoo S.A.; Salesforce, HubSpot, NetSuite, ERPNext and
other product names are trademarks of their respective owners. Name them only
to compare capabilities or to support migration — never as a design label for
a FlowWink feature ("X-style"), and never in a way that suggests affiliation or
endorsement. FlowWink is an independent project, not affiliated with or
endorsed by any of them.
