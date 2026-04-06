---
title: "Lovable Review — Round 2"
description: "Second audit pass: new chapters delivered, consolidation recommendations, and remaining gaps."
order: 999
---

# Lovable Review — Round 2

*Generated: 2026-04-06*
*Context: FlowPilot development sessions + handbook audit*

---

## New Chapters Delivered This Round

| File | Title | Covers |
|---|---|---|
| `14d-tool-hallucination-recovery.md` | Tool Hallucination Recovery | Malformed tool calls, continuation nudges, SSE keepalives, forced summary fallback |
| `15b-browser-operator.md` | The Browser Operator | Chrome Extension relay, walled gardens, Signal Capture (⌘⇧S), grounding rules |
| `06c-intent-scoring.md` | Intent Scoring | Synonym expansion, multilingual support, 6-dimension scoring, historical boosting |
| `11b-federation-in-practice.md` | Federation in Practice | ClawOne as QA, Single Architect Policy, beta test framework, feedback loop |
| `07b-token-economy.md` (updated) | Context Stack section added | Exact token breakdown (~25-35K of 128K), scaling thresholds at 200/500 skills |

---

## Consolidation: OPENCLAW-LAW.md

**Recommendation: Remove `docs/OPENCLAW-LAW.md` and merge unique content into `docs/FLOWPILOT.md`.**

### What to keep (move to FLOWPILOT.md)

The "FlowWink vs OpenClaw" architectural decisions table (lines 63-76) is valuable reference material not duplicated elsewhere:

```
| Decision | OpenClaw | FlowWink | Rationale |
| Storage  | Markdown | PostgreSQL | Relational, RLS |
| Transport | WebSocket | HTTP/SSE | Serverless |
| etc.
```

### What's already covered

| OPENCLAW-LAW.md section | Already in |
|---|---|
| The 10 Laws | `04-flowwink-laws.md` (handbook) + CLAUDE.md |
| 9-layer prompt | `07b-token-economy.md` |
| Workspace file mapping | `07-memory-architecture.md` |

### References to update

4 files reference OPENCLAW-LAW.md:
- `docs/FLOWPILOT.md` line 860
- `docs/PRD.md` lines 30, 279
- `docs/pilot/README.md` line 504

---

## Chapter Ordering Issues

The `order` field has accumulated drift. Current sequence with gaps:

```
0    00-foreword
1    01-introduction
2    02-evolution
3    02b-clawable-openclaw
4    02c-claw-ecosystem
5    03-openclaw-architecture
6    03b-control-plane
6.5  03c-models-lifecycle
7    04-flowwink-laws
8    05-heartbeat-protocol
8.5  05c-concurrency-observability
9    06-skills-ecosystem
9.5  06b-skill-self-creation
9.7  06c-intent-scoring          ← NEW
10   07-memory-architecture
10.3 07b-token-economy
10.7 05b-api-layer               ← WRONG: should be ~8.3
11   08-feedback-loops
12   08b-stagnation-and-drift
13   09-human-in-the-loop
14   13b-agent-governance
15   10-digital-employee
16   11-a2a-communication
16.3 11b-federation-in-practice  ← NEW
16.5 14-security
16.7 14b-testing-agents
16.9 14c-resilience-patterns
16.95 14d-tool-hallucination     ← NEW
17   17-clawstack
17.3 15b-browser-operator        ← NEW
18   12-the-future
19   16-sponsors
20   19-closing
```

**Priority fix**: `05b-api-layer` has order 10.7 but its filename suggests it belongs between 05 and 06. Change to order 8.3.

---

## Still Missing (Lower Priority)

| Topic | Why it matters | Suggested chapter |
|---|---|---|
| **Module Readiness System** | `useModulePublish` dependency pre-flight — unique production pattern | Section in existing chapter |
| **Visitor = Agent unification** | Same soul for visitors and admin — "website IS the consultant" | Section in 10-digital-employee |
| **Autonomy level classification** | view-required / config-required / agent-capable modules | Section in 10-digital-employee |
| **Cost Model Worksheet** | Practical $/month estimates per heartbeat frequency | Appendix |
| **Trust Tiers** (auto/notify/approve) | Graduation from binary approval to 3-tier model | Section in 09-human-in-the-loop |

These are enhancements, not structural gaps. The handbook is comprehensive as-is.

---

## Summary

The handbook now covers **33 chapters + 4 appendices**, spanning from theory (evolution, architecture, laws) through implementation (heartbeat, skills, memory, token economy, intent scoring) to operations (testing, resilience, federation, browser operator, governance) and failure modes (stagnation, drift, hallucination recovery).

The strongest unique contributions — content that no other agentic handbook covers:
1. **Tool Hallucination Recovery** — the production failure nobody writes about
2. **Browser Operator with Chrome Extension relay** — hybrid browsing architecture
3. **Intent Scorer with multilingual synonym expansion** — agentic UX in any language
4. **ClawOne as persistent QA partner** — agents testing agents in production
5. **Context Stack breakdown** — exact token accounting for a 109-skill agent
