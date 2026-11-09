---
title: "Companies Module"
module_id: "companies"
version: "1.0.0"
category: "data"
autonomy: "view-required"
generated: true
generated_at: "2026-11-09"
description: Create and manage company records with optional AI enrichment
---

# Companies

> Create and manage company records with optional AI enrichment

Ships with **16 agent skills**, **1 database table**, an **admin UI**.

## Quick Facts

| Property | Value |
|----------|-------|
| **Module ID** | `companies` |
| **Version** | 1.0.0 |
| **Category** | data |
| **Autonomy** | view-required |
| **Core** | No |
| **Capabilities** | `content:receive`, `data:write` |
| **MCP-exposed skills** | 16 |
| **Owns tables** | 1 |

## Skills

These skills are seeded into `agent_skills` when the module is enabled and exposed via MCP.
External operators (FlowPilot, OpenClaw, Claude Desktop, custom MCP clients) can call them directly.

| Skill | Scope | Description |
|-------|-------|-------------|
| `search_partners` | internal | Search the PARTY REGISTER — the one table that holds customers, suppliers and contact people, seen through one of three lenses. Use when: finding a customer or supplier by name, email, organisation… |
| `read_partner` | internal | Read the full customer card for one party: who they are, which legal entity they are billed as, their addresses, bank accounts, payment terms, tax treatment, receivable balance and how many documen… |
| `manage_partner_address` | internal | Register an invoice or delivery address on a party. Addresses are CHILD PARTIES, not fields — that is what lets you invoice a company centrally while delivering to its store, and lets a repeat cust… |
| `approve_partner_bank_account` | internal | Approve (or revoke) a partner bank account for OUTGOING payments. A newly registered account is never payable until someone approves it, and the approval LAPSES automatically whenever the account n… |
| `archive_partner` | internal | Retire a party from the register, or bring one back. Use when: a party was created by mistake, is a duplicate that could not be merged, or is a counterparty you no longer deal with; also to RESTORE… |
| `merge_duplicate_partners` | internal | Find and merge parties that share an email address. One person as two parties means two receivable balances, two credit limits and two DSO figures for one customer. Use when: a duplicate is suspect… |
| `manage_company` | internal | Manage companies: list, get, create, update, delete — incl. B2B fields (org/VAT number, parent company hierarchy, employee count, revenue, credit limit, account owner, tags). Use when: adding a com… |
| `find_duplicate_companies` | internal | Find likely duplicate companies by name similarity or identical domain (read-only). Use when: cleaning the CRM, before creating a company that might already exist. NOT for: merging (manual for now)… |
| `list_company_orders` | external | List the orders of the signed-in B2B contact's OWN company (identity ladder rung 3). Use when: an authenticated company contact asks about their organisation's orders. NOT for: an individual's pers… |
| `list_company_invoices` | external | List the invoices of the signed-in B2B contact's OWN company (identity ladder rung 3), including which are unpaid. Use when: an authenticated company contact asks about their organisation's invoice… |
| `request_company_return` | external | Open a return (RMA) for one of the signed-in B2B contact's OWN company's orders (identity ladder rung 3, write). Use when: an authenticated company contact with the buyer role or higher wants to re… |
| `approve_company_quote` | external | Accept/approve a sales quote addressed to the signed-in B2B contact's OWN company (identity ladder rung 3, commitment). Use when: an authenticated company contact with the approver role or higher w… |
| `manage_company_contacts` | external | Manage who else may act for the signed-in B2B contact's OWN company: list contacts, invite a colleague by email with a role, change a role, or revoke access (identity ladder rung 3, admin only). Us… |
| `reorder_company_order` | external | Place a repeat of one of the signed-in B2B contact's OWN company's earlier orders (identity ladder rung 3, write). Use when: an authenticated company contact with the buyer role or higher wants to … |
| `request_company_quote` | external | File a quote request on behalf of the signed-in B2B contact's OWN company (identity ladder rung 3, write). Use when: an authenticated company contact with the buyer role or higher asks for pricing/… |
| `initiate_company_invoice_payment` | external | Get the secure payment link for one of the signed-in B2B contact's OWN company's unpaid invoices (identity ladder rung 3). Use when: an authenticated company contact with the buyer role or higher w… |

## Data Model

Tables this module owns (declared by the module, or created in its migrations):

- `public.companies`

All tables ship with Row-Level Security policies. See migration files for the exact rules.

## Used in Processes

This module participates in the following end-to-end business processes:

- [lead-to-customer](../processes/lead-to-customer.md)

## File Map

| Purpose | Path |
|---------|------|
| Module definition | `src/lib/modules/companies-module.ts` |
| Hook | `src/hooks/useCompanies.ts` |
| Admin page | `src/pages/admin/CompaniesPage.tsx` |
| Migration | `supabase/migrations/20260821020000_f2a3b4c5-companies-follow-the-matrix.sql` |

## Contributing

To enhance this module, see [Contributing Guide](../contributing/contributing.md).

Key rules:
- Follow `ModuleDefinition<I, O>` contract pattern
- All schema changes require idempotent migrations
- Skills must be self-describing ([Law 2](../concepts/openclaw-law.md))
- Blocks are interfaces, not pipelines ([Law 3](../concepts/openclaw-law.md))
- New skills must pass the [Agent Contract Integrity](../../mem/architecture/agent-contract-integrity.md) checklist (`bun run lint:skills`)

---

*This file is auto-generated by `scripts/generate-module-docs.ts`. Do not edit manually — re-run the script after changing the module definition.*