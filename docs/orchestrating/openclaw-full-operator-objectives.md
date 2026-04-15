---
title: "OpenClaw Full Operator — Objectives Edition"
summary: Workspace files with concrete objectives for autonomous FlowWink operation
read_when: Configuring ClawThree for autonomous heartbeat-driven operation with measurable goals
---

# OpenClaw Full Operator — Objectives Edition

> **Purpose:** Enhanced workspace files that give ClawThree concrete objectives
> to pursue autonomously via heartbeat. Builds on the base operator files with
> measurable goals and a reporting mechanism.
>
> **Difference from base:** The base `openclaw-full-operator.md` defines WHO the
> agent is. This file adds WHAT it should achieve and HOW to report back.

---

## What to Change

Only **AGENTS.md** and **HEARTBEAT.md** need updating. The other workspace files
(`SOUL.md`, `IDENTITY.md`, `TOOLS.md`, `USER.md`) remain as defined in
[openclaw-full-operator.md](./openclaw-full-operator.md).

---

## AGENTS.md — Replace the "FlowWink Operating Loop" Section

Find the `## FlowWink Operating Loop` section in AGENTS.md and replace it with:

```markdown
## FlowWink Operating Loop

Every session, follow this sequence:

1. **Briefing** — Read `flowwink://briefing` for full situational awareness
2. **Objectives** — Check your active objectives below and pick the most relevant
3. **Act** — Execute using MCP tools
4. **Verify** — Re-read relevant data to confirm changes took effect
5. **Report** — Submit findings via `openclaw_report_finding` (see Reporting below)

## Active Objectives

### OBJ-001: Content Pipeline Integrity
**Priority:** High
**Goal:** Ensure the content pipeline (research → proposal → blog post) is connected and functional.
**Success criteria:**
- Every published blog post traces back to a content proposal
- Every content proposal traces back to content research
- No orphan blog posts without strategic backing
- No stale proposals (>14 days without action)

**Actions:**
- List all blog posts, content proposals, and content research entries
- Map the chain: research → proposal → published post
- Flag broken links (posts without proposals, proposals without research)
- Report each gap as a finding

### OBJ-002: Quote-to-Cash (Q2C) Loop
**Priority:** High
**Goal:** Verify that the order → invoice → payment chain is complete and timely.
**Success criteria:**
- No orders pending >48h without status change
- Every completed/delivered order has a corresponding invoice
- No invoices overdue >30 days without follow-up flag
- SLA compliance: order acknowledgment within 24h

**Actions:**
- List all orders, check status and timestamps
- Cross-reference with invoices
- Flag SLA violations and missing invoices
- Report each violation as a finding

### OBJ-003: Lead Lifecycle Health
**Priority:** Medium
**Goal:** Ensure leads move through the pipeline and don't go stale.
**Success criteria:**
- No leads in "new" status >48h without qualification
- Lead scoring is being applied (check for scored vs unscored)
- Qualified leads have follow-up activities scheduled
- No leads stuck in the same stage >14 days

**Actions:**
- List all leads with status and timestamps
- Identify stale leads and qualify them
- Check for leads without any deal attached after >7 days
- Report stale/stuck leads as findings

### OBJ-004: Booking & Service Utilization
**Priority:** Medium
**Goal:** Monitor booking services for utilization and operational issues.
**Success criteria:**
- All active services have availability configured
- No confirmed bookings without confirmation sent
- Services with zero bookings in 14 days flagged for review
- No double-bookings or time conflicts

**Actions:**
- List services and their booking counts
- Check availability configuration
- Verify confirmation status on recent bookings
- Report gaps as findings

### OBJ-005: Expense & Financial Compliance
**Priority:** Medium
**Goal:** Ensure expenses follow local regulatory standards (Swedish context).
**Success criteria:**
- All expenses have valid VAT rates (6%, 12%, or 25% for Sweden)
- Representation expenses include attendee lists
- No unreconciled expenses older than 30 days
- Receipt attached to every expense >500 SEK

**Actions:**
- List all expenses and validate VAT rates
- Check representation metadata
- Flag missing receipts on high-value expenses
- Report compliance issues as findings

### OBJ-006: SEO & Content Quality
**Priority:** Low (weekly)
**Goal:** Maintain content quality standards across all published pages.
**Success criteria:**
- All published pages have meta descriptions (80-160 chars)
- All published pages have titles (30-60 chars)
- Blog posts have featured images and alt text
- No duplicate slugs or titles

**Actions:**
- List all published pages and blog posts
- Check meta descriptions, titles, images
- Flag missing or suboptimal metadata
- Report each issue as a finding

## Reporting — How to Submit Results

**CRITICAL:** After each objective check, report your findings using the MCP tool
`openclaw_report_finding`. This is how your work gets evaluated.

### Finding Format

Use `openclaw_report_finding` with these parameters:

```json
{
  "title": "OBJ-002: Order #xyz pending >48h without status change",
  "type": "sla_violation",
  "severity": "high",
  "description": "Order abc123 was placed 72h ago and remains in 'pending' status. Expected SLA: 24h acknowledgment.",
  "context": {
    "objective": "OBJ-002",
    "entity_type": "order",
    "entity_id": "abc123",
    "metric": "hours_pending",
    "value": 72,
    "threshold": 24
  }
}
```

### Finding Types

| Type | Use when |
|------|----------|
| `broken_chain` | Pipeline link missing (e.g., blog without proposal) |
| `sla_violation` | Time threshold exceeded |
| `missing_data` | Required field empty (meta desc, receipt, attendee list) |
| `compliance_issue` | Regulatory standard violated (VAT rate, format) |
| `stale_entity` | Entity hasn't progressed in expected timeframe |
| `quality_gap` | Content quality below threshold |
| `utilization_alert` | Service/resource underused |

### Severity Levels

| Severity | Meaning |
|----------|---------|
| `critical` | Revenue-impacting or compliance risk — act immediately |
| `high` | Operational issue — should be fixed within 24h |
| `medium` | Quality gap — fix within the week |
| `low` | Nice to have — fix when convenient |

## Objective Selection Logic

During each heartbeat, pick objectives based on:

1. **Priority** — High before Medium before Low
2. **Staleness** — Pick the objective you haven't checked the longest
3. **Time of day** — Save "Low" priority for quiet hours
4. **Previous findings** — Re-check objectives where you found issues last time

Track which objectives you checked in `memory/heartbeat-state.json`:

```json
{
  "lastObjectiveChecks": {
    "OBJ-001": "2026-04-15T08:00:00Z",
    "OBJ-002": "2026-04-15T08:00:00Z",
    "OBJ-003": "2026-04-14T20:00:00Z",
    "OBJ-004": null,
    "OBJ-005": null,
    "OBJ-006": "2026-04-13T10:00:00Z"
  },
  "findingsSubmitted": 0,
  "lastHeartbeat": "2026-04-15T08:00:00Z"
}
```
```

---

## HEARTBEAT.md — Replace Entirely

```markdown
# HEARTBEAT.md — Objective-Driven Heartbeat

When you receive a heartbeat, work through your objectives systematically.

## Every Heartbeat

1. Read `flowwink://briefing` — situational awareness (always, ~50ms)
2. Check `memory/heartbeat-state.json` — which objectives are stale?
3. Pick 1-2 objectives to work on (highest priority + most stale)
4. Execute the objective's actions via MCP
5. Submit findings via `openclaw_report_finding`
6. Update `memory/heartbeat-state.json` with timestamps
7. Write a brief summary to `memory/YYYY-MM-DD.md`

## Objective Rotation

| Heartbeat | Focus |
|-----------|-------|
| Morning (08-12) | OBJ-002 (Q2C) + OBJ-003 (Leads) — revenue-critical |
| Afternoon (12-18) | OBJ-001 (Content) + OBJ-004 (Bookings) — operations |
| Evening (18-22) | OBJ-005 (Compliance) + OBJ-006 (SEO) — quality |
| Night (22-08) | HEARTBEAT_OK — sleep unless critical alert |

## When to Escalate

If you find a `critical` severity issue:
- Submit the finding immediately
- Write to `memory/YYYY-MM-DD.md` with `## ⚠️ CRITICAL` header
- Do NOT wait for the next heartbeat cycle

## When to Stay Quiet

- Nothing new since last check (<30 min ago)
- FlowPilot just ran a heartbeat (check `flowwink://activity`)
- Night hours and no critical findings
- All objectives checked within last 4 hours with zero findings
```

---

## Evaluation

To evaluate ClawThree's autonomous performance, query the findings:

```sql
-- All findings from autonomous heartbeats
SELECT title, type, severity, context->>'objective' as objective,
       created_at
FROM beta_test_findings
WHERE context->>'objective' LIKE 'OBJ-%'
ORDER BY created_at DESC;

-- Findings per objective
SELECT context->>'objective' as objective,
       count(*) as findings,
       count(*) FILTER (WHERE severity = 'critical') as critical,
       count(*) FILTER (WHERE severity = 'high') as high
FROM beta_test_findings
WHERE context->>'objective' LIKE 'OBJ-%'
GROUP BY context->>'objective'
ORDER BY objective;
```

Or via MCP: list `beta_test_findings` and filter by `context.objective`.

---

*Base workspace files: [openclaw-full-operator.md](./openclaw-full-operator.md)*
*Simulation history: [Sim 001](../simulations/001-openclaw-flowpilot-processes.md) · [Sim 002](../simulations/002-openclaw-business-process-audits.md)*
