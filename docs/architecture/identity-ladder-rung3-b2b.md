# Identity Ladder — Rung 3 (B2B) design sketch

**Status:** sketch for review (Magnus) · **Date:** 2026-07-14
**Author:** Claude (flowwink-local session) · **Track:** side-track design while rung-2 fleet-deploys
**Extends:** [conversation-and-retrieval.md](./conversation-and-retrieval.md) ladder row 3 + "Phase 3 — B2B rung"

---

## 1. Where rung 3 sits (the target, already named)

The identity ladder is one engine; each rung turns two dials — **context** (what grounds the
answer) and **skills+trust** (what it may do). Rungs 0–2 exist; rung 2 (B2C customer
self-service: own orders, `request_return`) shipped + was adversarially swept this week.

| Rung | Who | Context dial | Skills dial |
|---|---|---|---|
| 2 (built) | B2C customer (JWT → **email**) | own orders/invoices | own-record skills (`request_return`) |
| **3 (this sketch)** | **B2B contact (JWT → email → company + role)** | **company-level:** pricelist, contracts/SLA, open invoices, org order history | **org skills:** reorder, request_quote, company-scoped returns, approval flows — **gated by company role** |

Rung 3 is rung 2 lifted from "**your record**" to "**your company's records, within your role**."
Same engine, same safety pattern — one level of indirection deeper (email → membership → scope).

## 2. The keystone gap (verified in schema, 2026-07-14)

**Portal users carry role `customer` with NO company association.** There is a `companies`
table (org_number, vat_number, parent_company_id, credit_limit, account_owner) but **no
`company_contacts` membership table** linking an authenticated user ↔ a company ↔ their role
in it. Without that link, an authenticated portal session cannot resolve *which company it
acts for* — so **rung 3 cannot exist until this primitive does.** Everything else hangs off it.

Secondary schema facts:
- `orders.company_id` ✅ and `quotes.company_id` ✅ — org-scoping works for these today.
- `invoices.company_id` ❌ and `contracts.company_id` ❌ — need a company link (add the column,
  or resolve via the order/customer). Flag before promising "your company's invoices."

## 3. The primitive: `company_contacts` (contact → company + role)

The one new table rung 3 is built on. Server-side, forgery-proof, the read-model twin of the
rung-2 email match.

```
company_contacts
  id, company_id → companies, auth_user_id → auth.users (or contact_email),
  company_role: 'buyer' | 'approver' | 'admin' | 'viewer'  (per-contact agency)
  status: 'active' | 'invited' | 'revoked'
  unique (company_id, auth_user_id)      -- one membership row per user per company
```

A user MAY belong to **several** companies (a consultant serving many clients) — so the
resolver returns a *set* of memberships, and the conversation carries an **active company**
(defaulted to the sole membership; switched explicitly when >1). Parent/subsidiary
(`companies.parent_company_id`) is an **explicit opt-in** widening ("this contact may also
see subsidiaries"), never implicit — hierarchy must not silently leak a sibling's data.

## 4. Invariants (carry the rung-2 sweep pattern up one level)

These are the load-bearing rules the pre-fleet sweep must prove — the same shape that just
passed for rung 2, lifted from *email* to *company_id*:

1. **Server-injected scope.** The active `company_id` (and role) is resolved from the verified
   JWT → `company_contacts`, forced into `args._company_id` / `_company_role`. A model- or
   body-supplied company id is ignored/deleted. (Exact analog of rung-2 `_caller_email`.)
2. **Cross-company isolation.** A company-scoped skill resolves rows **ONLY** within the
   caller's active company; a query for company A can never return company B's order,
   invoice, contract, or `company:B` retrieval chunk. This is THE test.
3. **Role-gated writes.** Reads (list orders/invoices/contracts) open to any active contact;
   money and commitment actions (approve a quote, change credit terms, pay an invoice, add/
   remove contacts) require the matching `company_role` — and the truly destructive/financial
   ones stay **staff-gated** (trust=approve) exactly like rung 2's refund/approve.
4. **Membership, not assertion.** Belonging to a company is a `company_contacts` row set by
   an admin/invite flow — never inferred from a matching email domain, never from a claim in
   the conversation. (Domain-match is a rung-1 hint at most.)
5. **External agents ride the same rung.** A customer-scoped API key whose identity resolves
   to a `company_contacts` membership gets *exactly* rung 3 — no separate B2B API. (The
   read-side twin of MCP-as-platform: one ladder, agents included.)

## 5. Skills + dial placement (MVP → later)

| Skill | Dial | Notes |
|---|---|---|
| `list_company_orders` / `company_order_status` | read (auto) | scoped to `_company_id` |
| `list_company_invoices` / `invoice_status` | read (auto) | needs `invoices.company_id` (§2) |
| `list_company_contracts` / SLA view | read (auto) | needs `contracts.company_id` (§2) |
| `request_return` (company-scoped) | write (auto) | rung-2 skill, order resolved within company not just email |
| `reorder` (repeat a past order → draft) | write (auto) | draft only; checkout stays its own flow |
| `request_quote` | write (auto) | opens an RFQ/quote request for the company |
| `approve_quote` / `accept_quote` | **role-gated** (`approver`+) | commitment — role required |
| `manage_company_contacts` (invite/revoke) | **role-gated** (`admin`) | who else may act for the company |
| pay invoice / change credit terms | **staff-gated** (approve) | money never auto, even for admins |

MVP = the read row + `request_return`(company) + `reorder`. Approvals/contacts/money = phase 2.

## 6. Context dial (retrieval at company scope)

Reuse, don't rebuild: `customer-360` already aggregates orders/subscriptions/activities into
a timeline + KPIs (admin-only today). Refactor its aggregation into a shared helper callable
at **company scope** (the same move the doc proposes for rung 2 at customer scope) → inject
"your company's account summary" (open invoices, recent orders, active contracts, pricelist
tier) as rung-3 context. Retrieval chunks get a `company:<id>` visibility tag; the rung-3
query filters to the active company + `public` — never another company's chunks (invariant 2
on the read side).

## 7. Build plan

- **P0 — keystone.** ✅ SHIPPED 2026-07-14 (commit 6c784fb6, dev + local). `company_contacts`
  table + RLS + `current_user_company_ids()` + `resolveCompanyMembership()` resolver + server-
  inject `_company_id`/`_company_role` in agent-execute. Cross-company isolation proven at the
  data layer. (Admin invite/manage surface deferred to P2 — staff-provisioned via CRM for now.)
- **P1 — read rung.** ✅ SHIPPED 2026-07-14 (commit b8cd89fb, dev + local). `COMPANY_SCOPED_SKILLS`
  gate in chat-completion (offered only to a contact with an active membership) +
  `list_company_orders` / `list_company_invoices` (scope:external, auto) whose handler
  (`executeListCompanyRecords`) filters by the server-injected `_company_id`. Runtime-proven:
  Acme contact lists only Acme's orders, Globex only its own, no scope → denied; dev gateway
  smoke confirms enforcement live. Company-context injection + the adversarial second-company
  pre-fleet sweep deferred to P1.5/P2.
- **P2 — write + roles.** company-scoped `request_return`, reorder, request_quote, role-gated
  approvals, `manage_company_contacts` + the admin invite surface; invoices/contracts
  `company_id` backfill + set-on-create; the adversarial second-company sweep before any fleet.
- **P3 — hierarchy + multi-company UX.** parent/subsidiary opt-in, active-company switcher.

## 8. Pre-fleet gate (reuse the rung-2 sweep, lifted)

Same adversarial shape that just passed for rung 2, with a **second company** instead of a
second customer. Load-bearing: **cross-company isolation** (contact of company A cannot read
or write company B's orders/invoices/contracts) + **role-gated writes** (a `viewer` cannot
approve a quote) + **membership-not-assertion** (a matching email domain does not grant
access) + **regression** (public + rung-2 surfaces untouched). Green → ship; fail → stop.

## 9. Decisions (Magnus 2026-07-14) — validated against Odoo + B2B ERP practice

The unifying principle: **the membership row is the security boundary** — provision it
deliberately, widen it only explicitly, filter directly on it, never let the agent move money
on it. Each decision mirrors how Odoo's portal (`commercial_partner_id`) and Shopify/SAP B2B
units work; where they differ, the safer end was chosen.

1. **Membership source = staff-provisioned first, admin-self-invite in P2.** The first
   membership row is always human-provisioned (staff/account-owner in CRM) — a customer never
   grants the first company access. P2: a `company_role='admin'` contact invites colleagues
   with email confirmation. *(Odoo: staff "grant portal access"; SAP/Shopify: an org-admin
   manages users — same shape.)*
2. **Hierarchy = explicit opt-in, never implicit.** Default = own company only. Group
   visibility is a deliberate flag on the membership (`scope: 'company' | 'company+subsidiaries'`),
   never an automatic walk of `parent_company_id`. *(Odoo scopes to one commercial entity;
   cross-legal-entity is access-controlled multi-company, not inherited.)*
3. **Company link = add `company_id` columns to `invoices`/`contracts` (+ backfill).** A
   security boundary is a direct, auditable column — not a derived multi-hop join. *(Exactly
   what Odoo does: `commercial_partner_id` is denormalized onto documents so the scope filter
   is one predicate. Odoo issue #61702 — invoices leaking cross-company in the portal — is the
   cautionary tale for getting this filter wrong.)*
4. **Money = pay-your-own-open-invoice only, via the payment rail (not an agent write);
   everything else stays staff-gated.** The assistant never moves money — it routes to
   `create-invoice-payment`/Stripe with the invoice pre-selected; the customer completes it in
   the real payment UI. Refunds, credit-term changes, anything moving money *out* = trust=approve,
   staff, forever. *(Odoo portal pays own invoices online; refunds/credit notes are backend.)*

**Folded-in refinement (Odoo's own guidance): visibility is per document type.** Company-wide
reads are correct for orders/invoices; **sensitive types (contracts, credit terms, pricing)
default to contact-only or role-gated**, not company-wide. Encode this as a per-skill/per-source
visibility level, not a blanket "company sees all."

## 10. P0 — the keystone, concretely (buildable next step)

The one migration + one resolver + one inject that unlock everything above. Nothing
customer-facing ships in P0 — it is pure plumbing, adversarially testable on its own.

**(a) Migration — the membership table + the two missing links (idempotent, forward-dated):**
```sql
create table if not exists public.company_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete cascade,
  contact_email text,                                   -- resolve pre-signup / email-keyed
  company_role text not null default 'viewer'
    check (company_role in ('viewer','buyer','approver','admin')),
  visibility_scope text not null default 'company'
    check (visibility_scope in ('company','company_plus_subsidiaries')),
  status text not null default 'active'
    check (status in ('active','invited','revoked')),
  created_by uuid, created_at timestamptz not null default now(),
  constraint company_contacts_identity_ck check (auth_user_id is not null or contact_email is not null)
);
create unique index if not exists company_contacts_user_uk
  on public.company_contacts(company_id, auth_user_id) where auth_user_id is not null;
alter table public.company_contacts enable row level security;
-- RLS: a contact reads only their OWN membership rows; admins of the company manage;
-- staff (has_role) manage all. (Never "email domain matches" — membership is explicit.)

-- The two missing security-boundary columns (Decision 3), backfilled from linked order/customer:
alter table public.invoices  add column if not exists company_id uuid references public.companies(id);
alter table public.contracts add column if not exists company_id uuid references public.companies(id);
```

**(b) Resolver — twin of `resolveAuthenticatedCustomer` (in `_shared/customer-context.ts`):**
```ts
// Verified-JWT → set of active memberships → the active company for this turn.
export async function resolveCompanyMembership(authHeader, anonKey): Promise<{
  auth_user_id: string; email: string;
  memberships: Array<{ company_id: string; company_role: string; visibility_scope: string }>;
  activeCompanyId: string | null;   // sole membership, or the one the caller selected
} | null>
```
Resolution is strictly from the verified token → `company_contacts` (status='active'). One
membership → auto-active. Many → the conversation carries an explicit active company (a
switcher; default none until chosen — never guess).

**(c) Server-inject in agent-execute (exact analog of rung-2 `_caller_email`):**
```ts
// company-scoped skills read _company_id / _company_role — server-forced from the resolver,
// a model/body-supplied company id is deleted. chat-completion forwards ONLY the resolved
// activeCompanyId, gated behind COMPANY_SCOPED_SKILLS + an active membership.
if (companyCtx?.activeCompanyId) {
  args._company_id = companyCtx.activeCompanyId;
  args._company_role = companyCtx.activeRole;
} else { delete args._company_id; delete args._company_role; }
```

**P0 exit test (before any P1 skill):** a unit/guardrail proof that `_company_id` is
server-injected and un-forgeable, plus the RLS proof that a contact of company A cannot select
company B's `company_contacts`/invoices/contracts rows — the cross-company invariant, tested
at the data layer before a single skill is exposed.
