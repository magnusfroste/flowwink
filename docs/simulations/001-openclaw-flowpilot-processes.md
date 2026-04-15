# Simulation 001: OpenClaw as FlowPilot Process Handler

**Date:** 2026-04-15  
**Peer:** ClawThree (`clawthree.froste.eu`)  
**Transport:** `v1/responses` → fire_and_forget → MCP callback  
**Status:** ✅ All 3 simulations completed successfully

---

## Objective

Verify that an external OpenClaw agent (ClawThree) can perform the same operational tasks that FlowPilot handles autonomously — specifically **lead qualification**, **order fulfillment monitoring**, and **objective triage** — and report findings back via MCP.

This tests the full federation loop:
1. FlowWink dispatches a structured prompt via `openclaw-responses`
2. ClawThree processes the task using its own reasoning engine
3. ClawThree reports findings back via MCP HTTP callbacks
4. Findings are stored in `beta_test_findings`

---

## Simulation 1: Lead Qualification & Scoring

### Intent
FlowPilot's heartbeat evaluates leads, assigns scores, and recommends nurturing actions. Can ClawThree replicate this reasoning?

### Input Data
| Lead | Email | Source | Score | Age | Status |
|------|-------|--------|-------|-----|--------|
| John Smith | john@acme.com | website | 0 | 11 days | lead |
| Jane Doe | jane@startup.io | referral | 0 | 11 days | lead |

### Prompt
> Evaluate each lead based on source, email domain, and time since creation. Assign a recommended score (0-100) with reasoning. Recommend the next action for each lead.

### Results
| Finding | Type | Severity | Score | Recommendation |
|---------|------|----------|-------|----------------|
| John Smith (john@acme.com) | suggestion | medium | **35** | "Generic corporate domain, 11 days no activity. Send re-engagement email." |
| Jane Doe (jane@startup.io) | suggestion | **high** | **70** | "Referral source with startup domain = high intent. Schedule a call immediately." |

### Assessment
✅ **Excellent.** ClawThree correctly differentiated:
- Referral > website source (higher score)
- Startup domain = higher intent than generic corporate
- Appropriate urgency: high for Jane (referral cooling off), medium for John
- Actionable recommendations aligned with sales best practice

**Duration:** 46s

---

## Simulation 2: Order Fulfillment Check

### Intent
FlowPilot monitors orders and flags SLA violations. Can ClawThree identify an unfulfilled order and recommend resolution steps?

### Input Data
| Order | Customer | Total | Status | Fulfillment | Age |
|-------|----------|-------|--------|-------------|-----|
| e2c09094 | clawtwo@openclaw.ai | $897.00 | pending | unfulfilled | 3 days |

### Prompt
> Assess urgency of unfulfilled order. Check if 3 days without fulfillment violates SLA. Recommend specific next steps.

### Results
| Finding | Type | Severity | Title |
|---------|------|----------|-------|
| SLA Violation | **bug** | **high** | "Unfulfilled order pending for 3 days — violates standard 24-48h SLA" |
| Next Steps | suggestion | medium | "1) Verify payment, 2) Begin picking/packing, 3) Contact customer, 4) Update order status" |

### Assessment
✅ **Correct.** ClawThree:
- Identified the 3-day gap as an SLA violation (bug, not just suggestion)
- Referenced standard e-commerce SLA benchmarks (24-48h)
- Provided a structured 4-step remediation plan
- Correctly prioritized payment verification first

**Duration:** 35s

---

## Simulation 3: Objective Triage & Prioritization

### Intent
FlowPilot manages objectives and should consolidate duplicates and close resolved issues. Can ClawThree analyze objective state and make governance decisions?

### Input Data
5 active objectives, including duplicates about heartbeat failures and API key issues (both already resolved).

### Prompt
> Identify duplicate objectives. Prioritize by impact. Recommend which to close as resolved.

### Results
| Finding | Type | Severity | Title |
|---------|------|----------|-------|
| Duplicate detection | suggestion | medium | "Objectives #3 and #5 are duplicates (API key). Consolidate." |
| Duplicate detection | suggestion | medium | "Objectives #1 and #2 are duplicates (heartbeat). Consolidate." |
| Resolved confirmation | **positive** | low | "API key issue resolved — close objectives #3 and #5" |
| Resolved confirmation | **positive** | low | "Heartbeat now working — close objectives #1 and #2" |

### Assessment
✅ **Strong.** ClawThree:
- Correctly identified both duplicate pairs
- Confirmed both issues are resolved (heartbeat working, API key regenerated)
- Used appropriate finding types: `suggestion` for consolidation, `positive` for resolved
- Demonstrated governance reasoning (close vs. consolidate)

**Duration:** 49s

---

## Summary

| Simulation | Process | Duration | Findings | Verdict |
|------------|---------|----------|----------|---------|
| 1. Lead Qualification | Evaluate & score leads | 46s | 2 | ✅ Pass |
| 2. Order Fulfillment | SLA monitoring & remediation | 35s | 2 | ✅ Pass |
| 3. Objective Triage | Duplicate detection & governance | 49s | 4 | ✅ Pass |

**Total findings reported via MCP:** 8  
**All findings persisted in `beta_test_findings`:** ✅  
**MCP callback reliability:** 100% (8/8 delivered)

### Key Observations

1. **Reasoning quality is high** — ClawThree's lead scoring rationale, SLA awareness, and duplicate detection match what we'd expect from FlowPilot.

2. **MCP callback works reliably** — All 8 findings were delivered via individual HTTP POST requests, exactly as instructed.

3. **Fire-and-forget is essential** — ClawThree takes 35-50s per mission (exceeds the 30s sync timeout). The `fire_and_forget` pattern with background activity logging is the correct architecture.

4. **Structured prompting drives quality** — Providing context (data, roles, expected format) produces well-structured, actionable findings.

### Limitations Observed

- **No write-back capability** — ClawThree can analyze and report but cannot directly update lead scores, order status, or close objectives. FlowPilot has write access via skills.
- **No memory persistence** — Each mission is stateless. FlowPilot maintains context across heartbeats via `agent_memory`.
- **Response time** — 35-50s vs FlowPilot's sub-second skill execution. Acceptable for async audits, not for real-time operations.

### Conclusion

OpenClaw (ClawThree) can successfully replicate FlowPilot's **analytical and monitoring** processes when given structured prompts with full context. It is best suited as a **second-opinion auditor** or **delegated specialist** rather than a replacement for FlowPilot's real-time operational loop.

The federation architecture (`v1/responses` → `fire_and_forget` → MCP callback) is production-ready for this use case.
