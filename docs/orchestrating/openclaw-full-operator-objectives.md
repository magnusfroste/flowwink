---
title: "OpenClaw Full Operator — Prescriptive Objectives"
summary: Business context and severity rules for ClawThree's autonomous heartbeat runbook
read_when: Understanding WHY the heartbeat checks exist and what business rules drive severity
---

# OpenClaw Full Operator — Prescriptive Objectives

> **Purpose:** This file defines the *business context* behind each heartbeat
> check. ClawThree's `HEARTBEAT.md` defines HOW to execute (exact tool calls);
> this file defines WHY each check matters and what thresholds trigger findings.
>
> **Relationship:** `HEARTBEAT.md` (runbook) + this file (business rules) = complete autonomous operation.

---

## Architecture: Two Complementary Layers

```
┌─────────────────────────────────┐
│  HEARTBEAT.md (ClawThree-side)  │  ← HOW: exact tool calls per time window
├─────────────────────────────────┤
│  This file (FlowWink-side)      │  ← WHY: business rules, thresholds, severity
└─────────────────────────────────┘
```

The agent doesn't need to reason about *which* tools to use — that's in the runbook.
It only needs to reason about *what the results mean* — that's defined here.

---

## Morning (08–12) — Revenue & Pipeline

### Lead Qualification (OBJ-003)
**Business rule:** Unqualified leads decay in value ~15% per day. A lead sitting
in "new" for 48h has lost nearly a third of its conversion potential.

| Condition | Severity | Why |
|-----------|----------|-----|
| Lead in "new" >48h | `medium` | Conversion window closing |
| Lead in "new" >96h | `high` | Likely lost opportunity |
| >5 unqualified leads simultaneously | `high` | Pipeline bottleneck |

### Deal Velocity (OBJ-002)
**Business rule:** Deals in "negotiation" are the highest-value pipeline stage.
Stalled negotiations indicate lost momentum or competitor engagement.

| Condition | Severity | Why |
|-----------|----------|-----|
| Deal with no activity >7d | `high` | Momentum lost |
| Deal with no activity >14d | `critical` | Revenue at risk |
| >3 stalled deals simultaneously | `critical` | Systemic sales problem |

### Invoice Collection (OBJ-002)
**Business rule:** Cash flow is oxygen. Overdue invoices compound — the longer
they sit, the less likely collection becomes.

| Condition | Severity | Why |
|-----------|----------|-----|
| Invoice overdue 1-3d | `medium` | Normal follow-up needed |
| Invoice overdue >3d | `high` | Cash flow impact |
| Invoice overdue >14d | `critical` | Bad debt risk |
| Total overdue amount >10k SEK | `critical` | Material cash flow impact |

### Order Fulfillment (OBJ-002)
**Business rule:** Orders without invoices block the Q2C loop. Every day an
order sits without an invoice is a day revenue isn't recognized.

| Condition | Severity | Why |
|-----------|----------|-----|
| Order pending >24h no acknowledgment | `medium` | SLA at risk |
| Order pending >3d no invoice | `high` | Q2C loop broken |
| Order pending >7d | `critical` | Customer likely churning |

---

## Afternoon (12–18) — Content & Operations

### Content Pipeline (OBJ-001)
**Business rule:** Draft blog posts are sunk cost until published. Stale drafts
indicate a broken content pipeline.

| Condition | Severity | Why |
|-----------|----------|-----|
| Draft not updated >7d | `low` | Might be abandoned |
| Draft not updated >14d | `medium` | Content pipeline stalled |
| >5 stale drafts | `medium` | Systemic content problem |

### SEO Hygiene (OBJ-006)
**Business rule:** Pages without meta descriptions get ~30% fewer clicks from
search results. It's the lowest-effort, highest-ROI SEO fix.

| Condition | Severity | Why |
|-----------|----------|-----|
| Published page missing meta_description | `low` | Lost search traffic |
| Published page missing title | `medium` | Severe SEO gap |
| >50% of pages missing meta | `high` | Systemic SEO failure |

### Booking Operations (OBJ-004)
**Business rule:** Unconfirmed bookings cause no-shows. Every hour without
confirmation reduces show-up rate.

| Condition | Severity | Why |
|-----------|----------|-----|
| Booking unconfirmed >12h | `low` | Should confirm soon |
| Booking unconfirmed >24h | `medium` | No-show risk increasing |
| Booking for today, unconfirmed | `high` | Immediate action needed |

### Knowledge Base Gaps
**Business rule:** Repeated support questions without KB coverage means the
chat agent is improvising instead of referencing authoritative content.

| Condition | Severity | Why |
|-----------|----------|-----|
| Common query pattern with no KB match | `low` | Opportunity to reduce support load |

---

## Evening (18–22) — Compliance & Quality

### Expense Compliance (OBJ-005)
**Business rule:** Swedish VAT compliance is non-negotiable. Invalid VAT rates
on expenses create audit risk. Standard rates: 25%, 12%, 6%.

| Condition | Severity | Why |
|-----------|----------|-----|
| Expense with non-standard VAT rate | `high` | Tax compliance risk |
| Expense >500 SEK pending >3d | `low` | Review bottleneck |
| Expense >500 SEK pending >7d | `medium` | Approval workflow broken |
| Representation expense missing attendees | `medium` | Regulatory requirement |

### Contract Renewals (OBJ-005)
**Business rule:** Contracts that expire without renewal discussion lead to
service gaps or unfavorable auto-renewals.

| Condition | Severity | Why |
|-----------|----------|-----|
| Contract expiring in <30d, no renewal flag | `medium` | Planning window closing |
| Contract expiring in <14d, no renewal flag | `high` | Urgent action needed |
| Contract expiring in <7d | `critical` | Imminent service disruption |

### Site Health
**Business rule:** Performance degradation affects conversion. Catching drops
early prevents revenue impact.

| Condition | Severity | Why |
|-----------|----------|-----|
| Significant metric drop vs previous run | `medium` | Needs investigation |
| Multiple metrics degraded | `high` | Systemic issue |

---

## Night (22–08) — Sleep

No active checks. Respond with `HEARTBEAT_OK` unless:
- A `critical` finding was logged during the day and remains unresolved
- `consecutive_failures > 3` in `heartbeat-state.json`

---

## Finding Types Reference

| Type | Use when |
|------|----------|
| `broken_chain` | Pipeline link missing (blog without proposal, order without invoice) |
| `sla_violation` | Time threshold exceeded (lead >48h, order >24h) |
| `missing_data` | Required field empty (meta description, receipt, attendee list) |
| `compliance_issue` | Regulatory standard violated (VAT rate, format) |
| `stale_entity` | Entity hasn't progressed in expected timeframe |
| `quality_gap` | Content quality below threshold |
| `utilization_alert` | Service/resource underused |

## Severity Reference

| Severity | Meaning | Expected response time |
|----------|---------|----------------------|
| `critical` | Revenue blocked, compliance risk, data loss | Immediate |
| `high` | Operational issue with business impact | Within 24h |
| `medium` | Quality gap or approaching threshold | Within the week |
| `low` | Improvement opportunity | When convenient |

---

## Evaluation Queries

```sql
-- Findings by time window
SELECT
  CASE
    WHEN extract(hour from created_at AT TIME ZONE 'Europe/Stockholm') BETWEEN 8 AND 11 THEN 'morning'
    WHEN extract(hour from created_at AT TIME ZONE 'Europe/Stockholm') BETWEEN 12 AND 17 THEN 'afternoon'
    WHEN extract(hour from created_at AT TIME ZONE 'Europe/Stockholm') BETWEEN 18 AND 21 THEN 'evening'
    ELSE 'night'
  END as window,
  severity,
  count(*) as findings
FROM beta_test_findings
WHERE context->>'objective' LIKE 'OBJ-%'
GROUP BY window, severity
ORDER BY window, severity;

-- Most common finding types
SELECT type, severity, count(*) as occurrences
FROM beta_test_findings
WHERE created_at > now() - interval '7 days'
GROUP BY type, severity
ORDER BY occurrences DESC;
```

---

*Runbook (execution): ClawThree's `HEARTBEAT.md`*
*Base workspace files: [openclaw-full-operator.md](./openclaw-full-operator.md)*
*Simulation history: [Sim 001](../simulations/001-openclaw-flowpilot-processes.md) · [Sim 002](../simulations/002-openclaw-business-process-audits.md)*
