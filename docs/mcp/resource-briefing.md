---
title: "resource://briefing — Aggregated Context Briefing"
summary: One-call situational awareness for external orchestrators
read_when: Building or debugging external agent integrations (Scenario B/C)
---

# resource://briefing

> **Purpose:** Deliver complete situational awareness in a single MCP resource call (~50ms), eliminating the need for 8–10 sequential resource fetches.

---

## Problem

An external orchestrator (e.g., ClawOne / OpenClaw) needs to understand the full system state before acting. Without `briefing`, it must poll individually:

```
resource://identity     →  ~15ms
resource://health       →  ~25ms
resource://objectives   →  ~10ms
resource://activity     →  ~10ms
resource://modules      →  ~5ms
resource://automations  →  ~10ms
resource://heartbeat    →  ~10ms
resource://skills       →  ~15ms
─────────────────────────────────
Total:                     ~500ms+ (sequential) + ~2000 tokens overhead
```

Each call adds network roundtrip, JSON parsing, and token cost from MCP protocol framing.

## Solution

`resource://briefing` runs **all queries in parallel** server-side and returns a single aggregated JSON payload:

```
resource://briefing     →  ~50ms (one call, parallel DB queries)
```

**Token savings:** ~60% reduction vs individual calls (no repeated protocol framing).

---

## Access

### MCP (Native)
```
URI: flowwink://briefing
```

### REST (Compatibility)
```
GET /rest/resources/briefing
Authorization: Bearer <api-key>
```

---

## Response Schema

```json
{
  "identity": {
    "soul": { "...": "FlowPilot's soul/persona summary" },
    "identity": { "...": "Role, mission, behavioral directives" }
  },
  "health": {
    "pages": 12,
    "blog_posts": 8,
    "leads": 45,
    "active_bookings": 3,
    "orders": 120,
    "products": 15,
    "subscribers": 230
  },
  "objectives": [
    {
      "id": "uuid",
      "goal": "Qualify 5 new leads this week",
      "status": "active",
      "progress": { "qualified": 3, "target": 5 }
    }
  ],
  "recent_activity": [
    { "skill": "manage_lead", "status": "success", "at": "2026-04-14T08:30:00Z" },
    { "skill": "publish_blog", "status": "success", "at": "2026-04-14T07:15:00Z" }
  ],
  "active_modules": {
    "crm": { "enabled": true },
    "content": { "enabled": true },
    "booking": { "enabled": true }
  },
  "automations": {
    "active": [
      { "name": "Daily lead digest", "next_run": "2026-04-15T06:00:00Z", "last_run": "2026-04-14T06:00:00Z" }
    ],
    "count": 3
  },
  "heartbeat": {
    "status": "success",
    "duration_ms": 4200,
    "last_run": "2026-04-14T04:00:00Z",
    "token_usage": { "prompt_tokens": 3200, "completion_tokens": 800, "total_tokens": 4000 }
  },
  "skill_count": 110,
  "timestamp": "2026-04-14T09:00:00Z"
}
```

---

## Architecture

```
External Agent (ClawOne)
    │
    │  GET /rest/resources/briefing  (1 HTTP call)
    ▼
┌─────────────────────────────────────────┐
│  MCP Server (Edge Function)             │
│                                         │
│  Promise.all([                          │
│    health counts (7 parallel queries)   │
│    identity (soul + identity)           │
│    objectives (active/pending)          │
│    activity (last 10)                   │
│    modules config                       │
│    automations (enabled only)           │
│    heartbeat (last run)                 │
│    skill count                          │
│  ])                                     │
│                                         │
│  → Single aggregated JSON              │
└─────────────────────────────────────────┘
```

All database queries execute in parallel via `Promise.all`. The edge function has direct database access (L2 data locality), so each query completes in ~5–15ms.

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Identity includes only `soul` + `identity` | Full bootstrap (agents, tools, user) is too large; agent can fetch individually if needed |
| Objectives limited to 10 active/pending | Prevents payload bloat; completed objectives are irrelevant for situational awareness |
| Activity limited to 10 entries | Recent context is sufficient; full history available via `resource://activity` |
| Only enabled automations included | Disabled automations add noise without actionable value |
| Heartbeat is last run only | Historical heartbeats are rarely needed for current decision-making |

---

## Usage Pattern (Recommended)

```
1. Agent starts session
2. GET resource://briefing          ← Full context in ~50ms
3. Analyze objectives + health
4. SELECT appropriate tool/skill
5. Execute via POST /rest/execute
6. (Optional) GET resource://briefing again after major operations
```

---

## Relationship to Other Resources

`briefing` is a **read-only aggregation** — it doesn't replace individual resources. Use individual resources when you need:

- **Full skill registry** → `resource://skills` (includes descriptions, parameters)
- **Full identity** → `resource://identity` (includes agents, tools, user config)
- **Deep activity history** → `resource://activity` (20 entries vs briefing's 10)
- **Template browsing** → `resource://templates`

---

## Convenience Gradient Impact

This resource directly addresses the [Data Locality Law](../strategy/data-locality-law.md) and [Convenience Gradient](../strategy/embedded-agent-convenience-gradient.md):

| Metric | Without briefing | With briefing |
|--------|-----------------|---------------|
| HTTP calls | 8–10 | 1 |
| Latency | ~500ms+ | ~50ms |
| Token overhead | ~2000 | ~800 |
| Context completeness | Depends on which calls agent makes | Guaranteed complete |

---

*See also: [Embedded vs Orchestrated Autonomy](../orchestrating/embedded-vs-orchestrated-autonomy.md) · [Convenience Gradient](../strategy/embedded-agent-convenience-gradient.md) · [Data Locality Law](../strategy/data-locality-law.md)*
