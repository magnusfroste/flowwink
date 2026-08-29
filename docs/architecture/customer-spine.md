---
title: "The customer spine — one party register"
description: FlowWink had five parallel dialects for "who is the customer". The party register (Odoo's res.partner, deliberately copied) makes it one, and carries both buying journeys end to end.
category: architecture
---

# The customer spine — one party register

**Status:** steps 1–4 merged, step 5 in flight · **Date:** 2026-08-30
**Author:** Claude (dev lead) · **Trigger:** Optic's only project carried
`client_name = 'potentiella'` while three real companies sat unlinked beside it.
A free-text field asks for a word, so it gets a word.
**Source of truth:** the six migrations listed in §6. Where this page and a
migration header disagree, the migration wins.

---

## 0. TL;DR

FlowWink could not answer *"who is this customer, and what have they done with
us?"* — not because the data was missing, but because five different columns
each answered a piece of the question in a different dialect. Sales knew a
`lead_id`, billing knew a `customer_email` string, purchasing knew a
`vendor_id`, the portal knew a `user_id`, and projects knew a name someone
typed.

The fix is **one party register** — `public.partners`, the shape of Odoo's
`res.partner`, borrowed rather than invented. People and organisations live in
the same table; `parent_id` carries both "this person works at that company" and
"that company belongs to this group"; addresses are child rows, not a second
table; and customer/vendor is a pair of integers on the party, not two
registers to keep in sync.

Three things follow, and they are the whole point:

1. **Every document points at a party** — quote, invoice, order, subscription,
   contract, ticket, project, booking, service order, deal, and the purchasing
   chain. One join, not five dialects.
2. **The ledger books on the *commercial* party** (§3) — the nearest ancestor
   that is a company. The document may be addressed to Jane; the receivable
   accumulates on Jane's employer, which is the entity that owes the money.
3. **Both buying journeys acquire a party the same way** (§5) — the
   contract-driven Optic journey through `ensure_lead_partner`, the anonymous
   webshop checkout through `find_or_create_partner_by_email`. Same table, same
   invariants, and a sandbox chain that runs both for real every night.

What is **not** done yet is as important as what is (§6): the columns exist and
are backfilled, but **no writer sets them**, the ledger tables deliberately have
no `partner_id`, and there is no merge/dedup.

---

## 1. The problem: five dialects for one question

The mapping behind step 1 found five parallel ways of saying "who is the
customer", each already load-bearing somewhere:

| Dialect | Tables | What it actually identifies |
|---|---|---|
| `lead_id` | 15 | A **pipeline record**, not a counterparty. The same person can be several leads over the years. |
| `customer_email` (free text) | 13 | A string. Not a foreign key, not validated, not deduplicated. |
| `company_id` | 11 | An organisation — but never the person inside it. |
| `user_id` | 4 | A portal login, which only exists if they registered. |
| `client_name` | 2 | Whatever someone typed. |

The step-4 write-site survey put numbers on the same problem from the writing
side: **151 places write a customer identity**. In 80 of them a party is already
derivable (there is a `lead_id` or a `company_id` to follow). In **38 there is
nothing but an email string** — guest checkout, public forms, the Stripe
webhook. The remaining 33 are not about customers at all (channel handles, demo
seeds, staff chat threads) and were left alone.

**Why a free-text field is the specific failure, not just an untidy one.** A
foreign key is a claim someone can be wrong about but cannot be *vague* about:
it points at a row or it does not exist. A text field accepts the shape of an
answer without the substance of one. `client_name = 'potentiella'` is not a
data-entry mistake; it is the field working exactly as designed. Nothing in the
schema could have caught it, no report could have flagged it, and the three
real companies sitting unlinked one table away were invisible to every query
that started from the project.

One more consequence, easy to miss: a free-text customer field makes *history*
impossible. Two invoices to "Anna Svensson" and "anna@bolaget.se" are two
customers as far as the database is concerned. Lifetime value, credit exposure
and duplicate detection all need a stable identity to aggregate on, and a
string is not one.

---

## 2. The model, copied from Odoo on purpose

`partners` is Odoo's `res.partner`, deliberately transcribed rather than
designed from scratch. Odoo has run this shape across hundreds of thousands of
installations for fifteen years; each of its decisions is a scar. Copying the
shape means inheriting the scars for free. The decisions, and why each exists:

**One table for people and organisations** (`is_company boolean`). The
alternative — a `companies` table and a `contacts` table — forces a choice at
the moment of creation that you often cannot make yet ("is this a sole trader
or a person?") and then makes every downstream join a union of two shapes. One
table means a document can point at *whoever the counterparty actually is*
without the schema having an opinion about their legal form.

**`parent_id` carries two relationships that are the same relationship.**
Jane → Acme AB ("works at") and Acme AB → Acme Holding ("subsidiary of") are
both "belongs to, commercially". Modelling them separately means two
hierarchies to walk and two places for the answer to disagree. One self-
reference gives you contact→company and group structure in a single tree — and
makes §3 computable.

**Addresses are child parties, not an address table** (`type` ∈ `contact`,
`invoice`, `delivery`, `other`). This looks strange until you notice that a
delivery address frequently *has its own contact person and phone number* — a
warehouse manager, a site foreman. Odoo's answer is that such a thing is not an
address, it is a party that happens to be an address of another party. A
separate `addresses` table would need to grow those fields back one by one.

**Customer and vendor are integers, not booleans** (`customer_rank`,
`supplier_rank`). Odoo increments them on each sale and purchase. The important
part is not the counting — it is that they are *properties of one party*, so a
company that both buys from you and supplies you is one row with two non-zero
integers, not two records nobody knows belong together. We currently only mark
that a party *is* a customer or supplier (`greatest(rank, 1)`); the actual count
has no consumer yet.

**`crm.lead` stays a separate model.** In Odoo a lead is the pipeline record
(status, score, stage, lost reason) and carries a **nullable** `partner_id` — a
lead has no party until someone decides it is a real counterparty. Our `leads`
table was those two models fused into one. Step 2 splits them by adding
`leads.partner_id`; the pipeline fields stay on `leads`, the identity moves to
the party. NULL is a valid and *common* state there, not an error to backfill
away.

**Archive, never delete** (`active`, added in step 5). A party with history does
not disappear because the relationship ended.

### What we deliberately did *not* copy

**The spelling.** `leads.name` and `leads.email` already play exactly the role
Odoo's `contact_name` and `email_from` play. Renaming them would touch fifteen
tables, hooks, skills and UI for an orthography. **The form is copied, the
spelling is not.**

**`type = 'private'`.** Step 1 was transcribed from Odoo 14 and inherited a
fifth address type that Odoo removed in 17.0. Step 3 narrows the check
constraint to the modern four, and does it *fail-closed*: if any row still uses
`'private'` the migration raises rather than silently rewriting data. No row
used it, so the correction was free — but only on that day.

**Commercial-field inheritance.** In Odoo, payment terms and currency live on
the commercial party and are inherited downward. Step 5 adds `payment_terms` and
`currency` to `partners` so the vendor fold-in does not lose them, but the
*inheritance* is a later step and is not guessed at now.

---

## 3. `commercial_partner_id` — bill-to versus booked-on

This is the subtlest part of the model and the one most worth reading twice.

Step 3 came out of reading Odoo 18's `res_partner.py` and finding a hole in our
own design. Odoo computes:

```python
if partner.is_company or not partner.parent_id:
    partner.commercial_partner_id = partner
else:
    partner.commercial_partner_id = partner.parent_id.commercial_partner_id
```

That is the **nearest ancestor that is a company — not the topmost one**. In the
chain `Acme Holding → Acme Sverige AB → Jane`, Jane's commercial partner is
**Acme Sverige AB**, because that is the legal person the invoice is issued to.
The holding company is her ancestor but not her counterparty. The field encodes
*legal invoice recipient*, not *group membership* — and the two diverge exactly
where it matters most, in a group.

**Why the model needs it at all.** A document is addressed to whoever you are
dealing with: Jane, or a delivery child-party at a warehouse, or the company
itself. The **ledger has no such freedom**. Odoo rewrites every accounting move
line onto `commercial_partner_id` at posting time, and the receivables ledger,
the credit limit, DSO and duplicate detection all group on it. Without the
field, every contact person at a customer accumulates a *separate* receivable
balance, and the question *"what does this company owe us?"* has no answer that
the database can compute — only one a human can assemble by hand, wrongly.

So the distinction is:

> **Bill-to** — the party the document is addressed to (`<document>.partner_id`).
> May be a person, a company, or an invoice/delivery child address.
>
> **Booked-on** — the party the ledger accumulates against
> (`partners.commercial_partner_id` of the bill-to). Always a company, or a root
> party that has no company above it.

Three mechanics keep the field honest:

- A **BEFORE trigger** (`partners_set_commercial`) computes it on insert and on
  any change to `parent_id` or `is_company`. If the parent's own value is not
  yet computed — possible mid-backfill — it falls back to the parent itself
  rather than leaving NULL.
- An **AFTER trigger** (`partners_cascade_commercial`) recomputes the **entire
  subtree** via a recursive CTE. Odoo's compute is `recursive=True` for the same
  reason: moving a person under a different company must move everyone below
  them too, or half the tree books against the old entity.
- A **cycle guard** (`partners_reject_cycle`, Odoo's `_check_recursion`) refuses
  to let a party become its own ancestor, and refuses hierarchies deeper than 64
  levels. Without it the computation can loop forever, and a cycle in `parent_id`
  is never meaningful anyway.

After the step-3 backfill the column is `NOT NULL`. A root party is its own
commercial partner, so the field is always answerable.

**The ledger does not carry it yet — on purpose.** `journal_entries` and
`accounting_corrections` were deliberately left without a `partner_id` in step 5.
Those rows must carry the *commercial* party, not the document's addressee, and
that difference deserves its own step with its own assertions. Adding the column
"while we were in there" is precisely how a receivables ledger ends up split
across contact persons.

---

## 4. Three lenses over one table

Odoo has no customer table and no vendor table. There is one party, and
`customer_rank` / `supplier_rank` record what it has been through. "Contacts",
"Customers" and "Vendors" are three **views**, not three registers to reconcile.

Step 5 makes that literal:

| View | Filter | Note |
|---|---|---|
| `v_contacts` | `active` | Every live party, unfiltered. |
| `v_customers` | `active AND customer_rank > 0` | A party can appear here **and** in `v_vendors`. |
| `v_vendors` | `active AND supplier_rank > 0` | Same rows, different lens. |

All three are declared `WITH (security_invoker = true)`. That is not a detail: a
view without it runs with the *owner's* rights, and the role-module matrix
becomes a no-op behind it — exactly the blind spot the `USING(true)` sweep found
in August.

`backfill_vendor_partners` is where the payoff shows up. A vendor whose email
already belongs to a party **becomes** that party, gaining `supplier_rank > 0`
and contributing its payment terms, currency and website where the party had
none. It does not become a second record. The report's
`both_customer_and_vendor` count is the number of relationships that were
previously two disconnected rows.

**RLS caveat, stated plainly:** the lenses filter *rows by rank*, not
*visibility by role*. The policies live on the base table and grant read to
anyone with the `companies`, `crm` **or** `purchasing` module (step 5 widened
step 1's pair). So a purchasing role can read customer parties and vice versa.
That is a consequence of folding two registers into one table, and if it turns
out to be wrong it is a policy change, not a model change.

---

## 5. Two buying journeys, one spine

The architecture exists to serve two genuinely different journeys with one
model.

### 5.1 Optic — contract-driven

```
lead → quote → contract → subscription → invoice → ticket
```

The party is born at an explicit operator decision, exactly like Odoo's "convert
to opportunity": someone says *this is a real counterparty*, and
`ensure_lead_partner(lead_id)` creates it. The function is idempotent — calling
it twice returns the same party and writes nothing — and it does three things
in order:

1. If the lead has a `company_id`, the **company party is created first**, so
   the person lands under their organisation rather than floating as a root.
2. The person party is created with `parent_id` pointing at that company.
3. `leads.partner_id` is set.

It **refuses** a lead with neither a name nor an email. A party without an
identity cannot be recognised next time and gets duplicated on the next call —
so the function raises rather than creating one. The degenerate case in
practice was not NULL but *empty*: `leads.email` is NOT NULL, so a row with
`name = '   '` and `email = ''` would have produced a party named `''`. The
database found that, not the code review.

Downstream, each document acquires the party from the strongest reference it
has (§7).

### 5.2 Webshop — card checkout

```
Stripe checkout → customer.subscription.created → subscription row
```

There is no lead and often no company — just an email address on a Stripe
customer. `find_or_create_partner_by_email(email, name, company_id, as_customer)`
is the workhorse for those 38 write sites. Its rules:

- **No email, no party.** It returns NULL rather than creating something with no
  recognition key, because that would mint a new customer on every purchase.
- **The guest becomes a root party**, never a child of a placeholder. Odoo's
  answer to anonymous checkout is that the first real address is its own root,
  and the order is repointed onto it in the same transaction.
- **Person before company** when resolving an existing match
  (`ORDER BY is_company ASC, created_at ASC`): an invoice to `info@bolaget.se`
  should find the company, one to `anna@bolaget.se` should find Anna.
- **The lookup is serialised on the address** with
  `pg_advisory_xact_lock(hashtext('partner_by_email:' || email))`. Stripe emits
  `customer.subscription.created` and `checkout.session.completed` with no
  ordering guarantee and they can land simultaneously; without the lock both
  read "does not exist" and the card customer gets two parties. A UNIQUE index on
  email would be the wrong fix — in this model a company and its contact person
  legitimately share an address, and that freedom is worth keeping.

**Stripe-backed subscriptions are billed by Stripe, and our engine refuses
them.** `generate_subscription_invoice` raises *"only applies to manual
subscriptions"* for anything with `provider <> 'manual'`. That refusal is the
interface to the provider: the card customer is charged at Stripe, and the
webhook writes the row here. If the refusal ever disappears quietly we start
double-charging card customers — which is why it is asserted, not assumed (§5.3).

A trap worth knowing: `subscriptions.provider` **defaults to `'stripe'`**. A
contract-driven subscription that forgets to set `provider = 'manual'` is born
provider-backed and is therefore silently unbillable by us. Every platform path
sets it; the sandbox chain sets it explicitly because it walked straight into
the trap the first time it ran.

### 5.3 The subscription chain as a regression test

Subscriptions are the only entity that carries **both** journeys, which makes
them the right place to prove the spine does not break anything.
`sandbox_seed_subscriptions()` is a fourth sandbox chain alongside
`sandbox_seed_p2p` / `_o2c` / `_rma`, wired into `seed_demo_operations` and
therefore into the nightly demo cycle. Sandbox/demo only, same guard as the
other three.

It does not simulate billing — it calls the real
`generate_subscription_invoice()` — and it raises on every invariant it cares
about:

- `ensure_lead_partner` returns a party for a lead that has a name and an email;
- that contact's `commercial_partner_id` **is not itself** (if it were, the
  company party was never created or never linked, and the invoice would book on
  the person);
- guest checkout produces a party, and that party has **no parent**;
- the two journeys do not collapse into the same party;
- the same guest email twice returns the **same** party;
- billing an active manual subscription produces exactly one invoice, with an
  amount;
- billing the **provider-backed** subscription *fails*, and fails with the
  expected message;
- after `backfill_document_partners`, every subscription and the generated
  invoice carry a party, and each subscription points at the party its own
  journey created.

The chain was written to run **before** the writers are wired, so it measures
the starting state. Running the same chain afterwards is the only part of "we
didn't break anything" that is worth anything.

---

## 6. Migration state — done, and explicitly not done

| # | Migration | What it adds | State |
|---|---|---|---|
| 1 | `20260831100000_partsregistret-steg-1.sql` | `partners` table, RLS, `backfill_partners()` | merged |
| 2 | `20260831120000_partsregistret-steg-2.sql` | `leads.partner_id`, `ensure_lead_partner()`, extended backfill | merged |
| 3 | `20260831140000_..._steg-3-den-kommersiella-parten.sql` | `commercial_partner_id` + triggers, cycle guard, `type` narrowed to four | merged |
| 4 | `20260831160000_..._steg-4-dokumentkedjan.sql` | `partner_id` on ten document tables, `find_or_create_partner_by_email()`, `backfill_document_partners()` | merged (+ advisory-lock fix) |
| — | `20260831180000_prenumerationskedjan-som-regressionstest.sql` | `sandbox_seed_subscriptions()`, wired into `seed_demo_operations` | merged |
| 5 | `20260831200000_..._steg-5-samma-part-tre-linser.sql` | vendor fold-in, `active`/`payment_terms`/`currency`, the three views, purchasing columns + backfills | **in flight** (present in the working tree, not yet committed at the time of writing) |

### What is NOT done

**No writer sets `partner_id` on documents.** Step 4 adds the columns and fills
them; it changes no behaviour. Nothing in `create-checkout`, the Stripe webhook,
the invoice writers or the quote writers calls
`find_or_create_partner_by_email` today. The columns are nullable *and stay
nullable*, and the old identity fields (`customer_email`, `company_id`,
`lead_id`) remain the truth until the writers are converted. That conversion is
a separate step on purpose: it actually changes how the system behaves, and it
should not hide inside a column migration.

One honest exception: `ensure_lead_partner` **is** registered as a CRM agent
skill (`src/lib/modules/crm-module.ts`, `rpc:ensure_lead_partner`), so an
operator or agent can create parties from leads today. Nothing else in the chain
is wired.

**The ledger has no `partner_id`.** `journal_entries` and
`accounting_corrections` were deliberately skipped (§3).

**There is no merge/dedup.** Nothing detects that two parties are the same
counterparty, and nothing merges them. `partners_email_idx` is intentionally
**not** unique. `find_or_create_partner_by_email` deduplicates *only* on an
exact lowercased email match at creation time; two parties with different emails
for the same human stay two parties forever. The `companies` module has
`find_duplicate_companies`, but there is no party-level equivalent, and a
schema-driven merge (repoint every `partner_id`, sum the ranks, archive the
loser) does not exist.

**`projects` will stay at zero.** It has nothing but `client_name` free text —
no `lead_id`, no `company_id`, no email column. The backfill reports it
unlinked. That is not a bug in the backfill; it is what the chain actually
carries.

**The old tables are still there.** `companies`, `vendors` and the free-text
columns all still exist and are still written. `source_company_id`,
`source_lead_id` and `source_vendor_id` are the provenance and idempotency keys
that make the backfills re-runnable; they may only disappear when the old tables
do.

---

## 7. Operator runbook

Four backfill functions exist. All require the **admin role or service_role**,
all default to `p_dry_run => true`, and none is registered as an agent skill —
call them over PostgREST RPC or `psql`.

> **Dry run first, every time.** Read the report, then re-run with
> `p_dry_run => false`. The functions are idempotent and safe to re-run; the
> point of the dry run is to see whether the numbers make sense *before* rows
> move.

**Order matters:**

```
1. backfill_partners()            -- parties from companies + converted leads
2. backfill_vendor_partners()     -- vendors fold in (step 5)
3. backfill_document_partners()   -- needs leads.partner_id from (1)
4. backfill_purchase_partners()   -- needs source_vendor_id from (2)
```

### `backfill_partners(p_dry_run)`

Creates parties from every `companies` row and from **converted** leads only
(`status = 'customer'` or `converted_at IS NOT NULL`) — a lead that is still
pipeline gets no party, by design. It never guesses a person→company link: the
only link it trusts is `leads.company_id`, which a human set. Name similarity is
not identity; "Redeye" and "Redeye AB" may be one company or two, and only a
person can say.

| Report field | Meaning |
|---|---|
| `pending.companies` | Companies with no party yet. |
| `pending.converted_leads` | Converted leads with no party yet. |
| `pending.parent_links` | Company parties whose `parent_id` does **not** match their company's `parent_company_id` (both parties existing). |
| `pending.lead_links` | Leads whose party exists but whose `leads.partner_id` does not point at it. |
| `written.*` | Rows actually written — always `0` in a dry run. |
| `skipped.leads_still_pipeline` | Unconverted leads. **Expected to be non-zero**; reported as a number rather than a warning nobody reads. |
| `skipped.leads_pointing_at_missing_company` | Dangling `company_id`. Reported, never repaired here. |
| `partners_total` | Rows in `partners`. |

Every `pending` figure is written to reach **zero** after a successful write
run. A `pending` that stays at 1 is a claim that work remains — treat it as one.

### `backfill_document_partners(p_dry_run, p_match_by_email)`

Links the ten document tables, each from its **strongest** dialect in order:
`lead_id` → `leads.partner_id`, then `company_id` → `partners.source_company_id`,
then exact lowercased email match.

| Report field | Meaning |
|---|---|
| `linked_by_reference` | Rows linked via `lead_id` or `company_id` — facts someone registered. |
| `linked_by_email` | Rows linked by exact email match — a **conclusion**, reported separately for that reason. Disable with `p_match_by_email => false` if the figure looks wrong. |
| `still_without_partner` | Rows in that table with `partner_id IS NULL`, counted **after** the pass. |

⚠ **Dry-run asymmetry.** Unlike `backfill_partners`, this function computes
`linked_by_reference` and `linked_by_email` from `ROW_COUNT` of the actual
UPDATEs — so in a dry run **both are always 0**. The only meaningful dry-run
number here is `still_without_partner`, which tells you how many rows lack a
party *now*, not how many would be linked. Plan for that when reading the first
report. The same applies to `backfill_purchase_partners`.

### `backfill_vendor_partners(p_dry_run)`

| Report field | Meaning |
|---|---|
| `pending` | Vendors with no party yet. |
| `merged_into_existing_party` | Vendors whose email already belonged to a party; that party gained `supplier_rank > 0` instead of a second record being created. |
| `created` | Vendors that became new parties. |
| `both_customer_and_vendor` | Parties with **both** ranks non-zero — the number that shows the model earning its keep. |
| `vendors_total` | Rows in `vendors`. |

### `backfill_purchase_partners(p_dry_run)`

Links `purchase_orders`, `vendor_invoices`, `vendor_credit_memos`,
`return_to_vendor`, `rfq_bids`, `vendor_products` and `inventory_receipts` from
`vendor_id` → `partners.source_vendor_id`. Reports `linked` and
`still_without_partner` per table, with the same dry-run asymmetry as above.

### Verifying the chain still works

On a sandbox or demo instance, `select sandbox_seed_subscriptions();` runs both
buying journeys through real billing and raises on any broken invariant (§5.3).
It is also part of `seed_demo_operations`, so the nightly demo cycle runs it.
A failure there is a regression, not a seeding problem.

---

## 8. Open questions and non-goals

- **Not a rename programme.** `leads.name` / `leads.email` keep their spelling;
  the old tables and free-text columns stay until their writers are converted.
- **Not an inheritance model (yet).** `payment_terms` and `currency` sit on the
  party; Odoo inherits them down from the commercial party. That step is
  deliberately unwritten rather than guessed.
- **Open: writer conversion order.** 80 write sites can derive a party today and
  38 need `find_or_create_partner_by_email`. Which chain converts first, and
  whether the old column is written in parallel during the transition, is not
  decided here.
- **Open: merge/dedup.** See §6. This is the largest missing piece, and the one
  that gets more expensive the longer parties accumulate.
- **Open: RLS granularity.** One table read by three modules (§4). Whether
  purchasing should see customer parties is a policy question, not a modelling
  one.
- **Open: the ledger step.** `journal_entries` / `accounting_corrections` need
  the **commercial** party, and the assertions for that step have not been
  written.

---

## See also

- [`ownership-and-coverage.md`](./ownership-and-coverage.md) — who *owns* a
  record, which is a different question from who the record is *about*.
- [`identity-ladder-rung3-b2b.md`](./identity-ladder-rung3-b2b.md) — the read
  side of the same B2B problem: a portal user resolving to a company.
- [`recurring-value-model.md`](./recurring-value-model.md) — MRR/ARR dimensioned
  down the same document chain.
- [`../processes/lead-to-customer.md`](../processes/lead-to-customer.md) and
  [`../processes/quote-to-cash.md`](../processes/quote-to-cash.md) — the Optic
  journey as a business process.
