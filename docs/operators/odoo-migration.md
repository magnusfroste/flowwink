---
title: "Migrating a CRM from Odoo"
category: operators
description: import_from_odoo reads Odoo over its API and writes companies, leads, deals, the chatter, open to-dos and attachments — re-runnable, relations intact.
---

# Migrating a CRM from Odoo

One skill, `import_from_odoo`, run by an admin or an agent. It reads Odoo over
the external API (JSON-RPC — every edition, Odoo Online included) and writes
the tables the FlowWink UI reads. Every row remembers its Odoo id in
`import_links`, so the run is **re-runnable**: dry-run today, for real on
go-live day, the delta in between. Nothing is duplicated on a second run.

## Before you start

1. **An Odoo API key.** In Odoo: the user's avatar → Preferences → Account
   Security → New API Key. Use a user who can read Contacts and CRM.
2. **Secrets on the importing instance** (never arguments — an argument is
   logged):
   ```bash
   supabase secrets set ODOO_URL=https://<company>.odoo.com ODOO_DB=<database> \
     ODOO_USERNAME=<login> ODOO_API_KEY=<key> --project-ref <ref>
   ```
   Integrations shows **Odoo** as configured once `check-secrets` sees them.
3. **Invite the sellers first.** Odoo users match FlowWink profiles on email.
   An Odoo user with no profile leaves their leads and to-dos unassigned; the
   dry run names each one.

## Run it

```
import_from_odoo { dry_run: true }                 # 1. read inventory + notes, settle them
import_from_odoo { dry_run: false }                # 2. write; while status="partial", call again with next
import_from_odoo { dry_run: false, since: "2026-10-20" }   # 3. before go-live: what changed in Odoo since the first run
```

A long import answers `status: "partial"` with `next: { phase, cursor }` —
call again with those. The edge function has 150 s on the Free tier; the
importer stops itself at 90 and hands back the cursor.

## What maps where

| Odoo | FlowWink | Notes |
|---|---|---|
| `res.users` (internal) | `profiles` | by email only; unmatched → reported |
| `res.partner`, `is_company` | `companies` | org_number ← company_registry, vat_number ← vat, address, tags ← categories, parent_company_id, lifecycle_stage `customer` when customer_rank > 0 |
| `res.partner`, person, type contact | `leads` | status `customer` / `prospect`, company_id ← commercial partner; **needs an email** (see below) |
| `crm.lead` | `leads` (+ `deals`) | status: `lost` when archived or a lost reason is set, `customer` when the stage is won, `opportunity` for type opportunity, else `lead`. Opportunities, won and lost leads also get a `deals` row: value ← expected_revenue, stage by the mapping below, expected_close, closed_at, lost_reason/lost_note |
| `crm.lead.partner_name` with no partner | `companies` | created at import, as Odoo would at conversion; listed in the notes |
| `crm.stage` | fixed stages | won → closed_won; by name (qualified, proposal, negotiation, prospecting, new); else by position. The dry run prints the mapping |
| `crm.lost.reason` | `lost_reason` enum | price / timing / competitor / no_response / other, the words in lost_note |
| `crm.tag` | note on the lead | and `companies.tags` for companies |
| `mail.message` comment / email | `lead_activities` (person) or `activities` (company) | body as text, author, email_from; **notifications are skipped** |
| `mail.activity` | `activities` | due_at, assignee, type call / meeting / email / task |
| `ir.attachment` | `documents` | same path as `upload_document`; linked to the lead or company; 10 MB cap |

After writing, `backfill_partners` runs so the partners backbone follows.

## What the chatter contains, and what it does not

Odoo's chatter holds the mail that went **through Odoo**: sent from a record,
replies to those, mail to an alias. It does not hold what a seller wrote in
Outlook or Gmail directly, unless they used Odoo's mail plug-in. The import
brings exactly what Odoo has. Ask the customer how they worked before you
promise "all history".

## Rules worth knowing

- **A FlowWink lead needs an email.** Odoo contacts and leads without one are
  reported and skipped. `synthesize_missing_email: true` invents
  `odoo-<model>-<id>@import.invalid` for them instead.
- **A re-run never demotes.** A lead FlowWink moved to `customer` stays there
  when Odoo still says prospect.
- **A person is one row.** `leads.email` is unique: an Odoo contact and an
  Odoo lead with the same address become the same FlowWink lead, and the
  opportunity hangs off it as a deal.
- Credentials are secrets, never arguments. The skill refuses to run without
  all four.

## Proven

2026-10-20, Odoo 19 demo database against a fresh local stack: 12 companies,
48 contacts, 44 leads (26 leads + 18 opportunities, 5 archived), 17 chatter
messages, 14 to-dos, 1 attachment. Second run: no new rows anywhere. The same
run against sandbox.flowwink.com is the acceptance test before a customer's
database.
