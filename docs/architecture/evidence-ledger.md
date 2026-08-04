---
title: "The evidence ledger — observed facts, not asserted ones"
description: Enrichment writes claims with provenance and a band; strong evidence lands in the record, weak evidence becomes a suggestion a human settles.
category: concepts
status: proposed
---

# The evidence ledger

> **Status: proposed (2026-08-04).** No code written. Companion to
> [`work-queue.md`](./work-queue.md); the two are independent — neither blocks
> the other.

## The problem, from our own code

`enrich_company` scrapes a company's website and then does this
(`_shared/handlers/enrich-company.ts`):

```ts
.from('companies').update({
  website: enrichment.website,
  notes:   enrichment.description || undefined,   // og:description
  phone:   enrichment.phone       || undefined,   // regex over page text
  enriched_at: new Date().toISOString(),
})
```

Three things are true about that write, and all three are invisible afterwards:

1. **`notes` is a human field.** A rep's notes about the account get replaced by
   whatever the site's `og:description` says. The `|| undefined` guard only
   protects the case where nothing was found — when the scrape *succeeds*, the
   human's text is gone.
2. **`phone` is a regex guess.** The first phone-shaped string on a page
   overwrites a number someone typed after actually speaking to the customer.
3. **Nothing records where any of it came from.** `enriched_at` says *when*, never
   *from what*. Re-running enrichment overwrites again, silently, with equal
   confidence.

The deeper issue is not any of those lines. It is that **the record has one slot
per field and no notion of how strongly we believe it**. "A rep typed this after
a call" and "a regex found it on a page" land in the same column and become
indistinguishable one second later.

That matters more for us than for a normal CRM: our enrichment is agent-driven,
runs unattended, and is reachable by *external* operators through the MCP
gateway. The blast radius of a confident guess is a whole customer base, applied
overnight.

> A confidently wrong fact about a customer is worse than a blank field, because
> nobody can tell it is wrong.

## The rule that makes it work: no self-graded confidence

The temptation is to let the model return a confidence and store that. Don't.
comp.ai's formulation is exactly right and worth adopting verbatim as a rule:

> A model asked to grade its own certainty will, and it will be wrong in the
> direction that makes it look useful.

So **no tool accepts a confidence score**. A tool reports *what it observed* —
a typed `evidence_kind` — and the platform prices it. The weights live in code,
in one table, reviewable in a diff. If the score changes it is because we changed
the pricing, not because a model was feeling assertive.

This is the same instinct as Law 1 (no hardcoded intent routing): the decision
belongs to a general, inspectable mechanism, not to a per-call judgement.

## What we already have

We invented three-quarters of this once already, for one domain:

| Existing | What it does | Gap |
|---|---|---|
| **`procurement_suggestions`** | a real suggestion queue — `status` (pending/approved/rejected/**materialized**), `source`, `reasoning` jsonb, `resolved_by/at`, `materialized_ref_*` | domain-specific; `reasoning` is free-form, so nothing can be *scored*, ranked or thresholded |
| **`approval_requests`** | human decisions on **actions**, with role gating and thresholds | about doing things, not about believing things |
| **Trust levels / staged ops** | per-skill `approve`⇔`notify` dials | gates the *call*, not the *claim* |

So the shape is proven in-house and the review surfaces exist. What is missing
is a **generic, scored** version — and, crucially, one that sits on the *write
path* of enrichment rather than beside it.

## The design

### Typed observations, priced in one place

```ts
export type EvidenceKind =
  | 'human.entered'          // someone typed it in the admin UI
  | 'customer.self_reported' // they wrote it to us (form, signature, reply)
  | 'document.extracted'     // parsed from a document they sent us
  | 'site.structured'        // schema.org / meta tags on their own domain
  | 'site.text_pattern'      // regex over page text  ← today's phone guess
  | 'registry.official'      // company register, VAT validation
  | 'vendor.enrichment'      // a data vendor's API
  | 'web.cited'              // a web source that cites where it got it
  | 'model.inference'        // an LLM concluded it from context
  | 'contradiction';         // another source disagrees

const WEIGHTS: Record<EvidenceKind, { weight: number; primary: boolean }> = {
  'human.entered':          { weight: 0.95, primary: true  },
  'registry.official':      { weight: 0.95, primary: true  },
  'customer.self_reported': { weight: 0.85, primary: true  },
  'document.extracted':     { weight: 0.75, primary: true  },
  'site.structured':        { weight: 0.60, primary: false },
  'vendor.enrichment':      { weight: 0.50, primary: false },
  'web.cited':              { weight: 0.40, primary: false },
  'site.text_pattern':      { weight: 0.30, primary: false },
  'model.inference':        { weight: 0.25, primary: false },
  contradiction:            { weight: 0,    primary: false },
};
```

Independent observations compound (noisy-OR), never exceed a ceiling, and a
contradiction caps the result:

```
score = min(0.99, 1 − Π(1 − wᵢ))
if contradicted: score = min(score, 0.45)

VERIFIED  ≥ 0.85  AND at least one primary source
PROBABLE  ≥ 0.55
POSSIBLE  ≥ 0.30
below     → not recorded at all
```

The **primary requirement** is what stops a pile of weak signals from
manufacturing certainty: three web citations and a regex can reach 0.85
numerically, but none of them is a primary source, so the fact stays PROBABLE
and a human decides.

### One table

```sql
create table agent_facts (
  id            uuid primary key default gen_random_uuid(),

  -- what the claim is about
  subject_type  text not null,          -- 'company' | 'lead' | 'contact' | …
  subject_id    uuid not null,
  field         text not null,          -- 'phone' | 'industry' | 'employee_count'
  value         jsonb not null,

  -- how strongly, and why
  score         numeric not null,
  band          text not null check (band in ('verified','probable','possible')),
  evidence      jsonb not null,         -- [{kind, detail, source_url}]
  rationale     text not null,          -- human sentence, generated from evidence

  -- lifecycle (mirrors procurement_suggestions deliberately)
  status        text not null default 'proposed'
                check (status in ('proposed','applied','dismissed','superseded')),
  decided_by    uuid references auth.users(id),
  decided_at    timestamptz,

  -- provenance
  observed_by   text not null,          -- 'skill:enrich_company' | 'user:<id>' | 'mcp:<key>'
  session_id    uuid,
  observed_at   timestamptz not null default now(),
  superseded_at timestamptz
);

create index on agent_facts (subject_type, subject_id, field, status);
create index on agent_facts (status, observed_at desc) where status = 'proposed';
```

### The write policy

| Band | What happens |
|---|---|
| **VERIFIED** | written to the record; fact stored `applied` |
| **PROBABLE** / **POSSIBLE** | record untouched; fact stored `proposed` and surfaced for a human |
| **contradicted** | never written, always surfaced — a disagreement is a question, not an answer |

And one rule that solves today's `notes` problem outright:

> **A fact never overwrites a field whose current value came from a stronger
> source.** `human.entered` outranks every automated kind, so enrichment can no
> longer silently replace what a person typed — it proposes instead.

This is also how the ledger *creates* field-level provenance, which we do not
have today: once facts are the write path, "who last established this field" is
a query, not a guess.

### What flows through it — and what deliberately does not

This is the boundary that keeps the ledger honest and small:

**Through the ledger** — claims about the outside world that we *observed*:
`enrich_company`, `contact_finder`, `prospect_research`,
`enrich_company_profile`, `parse_resume` (a CV is a self-report about a person),
`find_duplicate_companies` (a match is a claim), `analyze_brand`.

**Not through the ledger** — values we *compute* from data we already own:
`qualify_lead`'s score is deterministic point-based arithmetic over our own
`lead_activities`; it is reproducible, has no external source, and re-running it
is the correct behaviour. Putting it behind a suggestion queue would be
ceremony. Same for pipeline forecasts, ageing reports, VAT returns.

The test: **if re-running it on unchanged data can produce a different answer,
it is an observation; if not, it is a calculation.**

## A FlowWink-shaped extension: who observed it

comp.ai is single-tenant and internal, so their weights depend only on *what*
was observed. Ours are reachable through the MCP gateway by external operators
with scoped keys, so we can price *who* observed it too — the identity ladder we
already have becomes an evidence input:

```
effective_weight = kind_weight × source_factor
  service role / platform skill  1.0
  authenticated admin            1.0
  external MCP key (trusted)     0.8
  external MCP key (default)     0.5
```

That means a federated peer or a customer's own agent can contribute facts
*without* being able to assert them into the record — its observations land as
proposals. This is the same posture as the company-scope guards, applied to
belief instead of access. **Flagged as an extension, not core:** ship the ledger
first with `source_factor = 1.0` everywhere, add the dial once the base is boring.

## Migration — shadow mode first

The whole point is that this can be proven before it changes any behaviour.

1. **Ledger + writers, shadow mode.** Handlers record facts *and keep writing as
   they do today*. Nothing changes for users. After a week we can answer, with
   data: how many enrichment writes would have been VERIFIED, how many would
   have become proposals, and — the interesting one — **how many silently
   overwrote a human-entered value**.
2. **Flip one field on one skill.** `enrich_company.phone` is the best first
   move: high-frequency, clearly a guess today, low blast radius. It stops
   writing and starts proposing unless VERIFIED.
3. **Suggestion UI**, reusing the Approvals surface — a "Proposed facts" tab
   next to the existing inbox, not a new page (we consolidated those routes for
   a reason).
4. **The rest of the enrichment family**, one skill at a time.
5. **Generalise `procurement_suggestions`** onto the same table last, once the
   shape has survived contact with reality — or leave it alone if it has earned
   its domain specifics.

## Guardrails

- `evidence-ledger.guardrails.test.ts`: no handler in the enrichment set may
  call `.update()` on a subject table directly once that skill is migrated —
  writes go through `record_fact`. Frozen allowlist for the not-yet-migrated
  ones, same pattern as `table-ownership`.
- A tool definition that accepts a `confidence`/`score`/`certainty` argument
  fails CI. The rule only holds if it is mechanical.
- `WEIGHTS` changes require a test update — the numbers are a policy, so moving
  one should be a deliberate diff, not a tweak.

## Non-goals

- **Not a fact store for everything.** Only fields where an outside claim can
  disagree with us. See the boundary above.
- **Not a replacement for `approval_requests`.** That queue is about *actions*
  (money, sends). This one is about *beliefs*. A proposal is not an approval
  request; conflating them makes both worse.
- **Not model-graded.** If a future tool wants to pass a confidence, the answer
  is a new `evidence_kind` with a reviewed weight.
- **No new edge function.** `record_fact` is a skill; scoring is `_shared`.

## Prior art

[`trycompai/crm`](https://github.com/trycompai/crm) —
`apps/agent/agent/lib/evidence.ts` (typed kinds, noisy-OR, primary requirement,
contradiction cap) and the `ContactFact` model in `packages/db/prisma/schema.prisma`
(band + status + provenance + supersession). Their rule about self-graded
confidence is the load-bearing idea; the rest is bookkeeping around it.

What we add: the observation/calculation boundary, human-value protection as an
explicit ranking rule, source-weighting via the identity ladder, and reuse of an
approval surface we already built.
