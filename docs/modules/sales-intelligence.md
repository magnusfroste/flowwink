---
title: "Sales Intelligence Module"
module_id: "salesIntelligence"
version: "3.0.0"
category: "data"
autonomy: "agent-capable"
manual: true
description: The prospecting chain — research a company once, remember everything it read, score fit against your own ICP, and send verified, suppressible outreach.
---

# Sales Intelligence

> **Status:** manually maintained — describes the process as verified live
> (Svalner test run, 2026-08-13/14). The auto-generator skips this file.
> **Source of truth:** `src/lib/modules/sales-intelligence-module.ts` + this file.

Sales Intelligence is the **prospecting chain**: from a company name to a
grounded, verified, deliverable outreach email — with every step leaving
evidence. The design principle throughout is *find → verify → gate*: discovery
is cheap and broad, verification is explicit and paid, and sending is gated on
deliverability and consent.

## The chain

```
Research (company name / website)
  ├─ web search + site scrape (provider-routed: Firecrawl → Jina)
  ├─ AI distillation → industry, size, offerings, pain points  → companies row
  ├─ raw material archived with provenance                     → companies.web_raw
  └─ Hunter domain search (1 credit TOTAL)                     → leads rows
        each lead carries: email_confidence, email_status='unverified',
        email_provenance {provider, method, position, seniority, sources_count, found_at}
  ↓
Fit Analysis (one button)
  ├─ aggregator collects BOTH sides: their record (incl. web_summary)
  │   and OUR side: Business Identity ICP + published pages
  ├─ FlowPilot scores 0-100 against the ICP; analysis in the platform
  │   language, the letter in the language the PROSPECT publishes in
  ├─ decision maker ranked by seniority > personal-address > confidence
  └─ assessment persisted on the company (fit_score / fit_analysis) —
      survives the tab, restored on re-research
  ↓
Outreach (per contact — the seller picks targets)
  ├─ Verify (1 Hunter credit, explicit button) → email_status valid/invalid/…
  ├─ send gate: invalid/disposable BLOCK, accept_all/unknown warn
  └─ send → RFC 8058 unsubscribe headers → global suppression on click/bounce
```

## What makes it honest

- **Research remembers what it read.** The scrape is distilled into
  firmographics AND archived raw (`web_raw`, with URL + fetch date) — free
  re-distillation, deeper personalization, future breadth search.
- **Provenance is the GDPR Art. 14 answer.** Every found address knows where
  it came from, when, and how confident the source was — the evidence for
  "where did you get my address" and "that person left."
- **A data-only score never wears the assessment's colors.** If the AI
  reasoning step fails, the fallback number is visibly labeled *"data only —
  not an AI fit assessment"* instead of masquerading as a perfect fit.
- **Two doors, one reader.** The company page's Enrich button and the research
  flow share the same distillation (`company-distill`), fill the same fields,
  and never overwrite operator-entered master data.

## Grounding

Fit scoring and letters ground in **Business Identity** (ICP, value
proposition, services — editable by sales/accounting/marketing, not only
admins) plus the prospect's own distilled website. This is deliberate: the
people who prospect can refine the identity they ground in.

## Costs (Hunter free tier: 50/month)

| Action | Cost |
|---|---|
| Domain search (all contacts found) | 1 credit total |
| Verify one address | 1 credit |
| Fit analysis, letters, distillation | AI tokens only |

<!-- generated:skills:start — written by scripts/generate-module-docs.ts, edits here are overwritten -->
## Skills

These skills are seeded into `agent_skills` when the module is enabled and exposed via MCP.
External operators (FlowPilot, OpenClaw, Claude Desktop, custom MCP clients) can call them directly.

| Skill | Scope | Description |
|-------|-------|-------------|
| `prospect_research` | internal | Research a company — search web, scrape website, find contacts via Hunter.io. Found contacts are saved as PROSPECTS (pre-leads in the Contacts → Prospects triage tab), never directly as leads: a hu… |
| `verify_email` | internal | Verify one email address via Hunter (1 credit). Updates the lead when lead_id is given. |
| `prospect_fit_analysis` | internal | Collect company data, related leads, and deals to evaluate prospect fit. Returns raw data for FlowPilot to analyze. Use when: evaluating a new prospect; scoring company fit before outreach; compari… |
| `process_signal` | internal | Process an incoming signal from Chrome extension or external webhook. Analyzes content and determines next actions. Use when: a website event is detected; an external system sends an update; respon… |
| `sales_profile_setup` | internal | Set up or update the per-seller sales profile (type "user"): name, title, personal pitch, tone, signature — the sender context outreach is written in. Use when: a salesperson configures how their o… |

<!-- generated:skills:end -->
