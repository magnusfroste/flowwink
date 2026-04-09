# Agent-Driven Development (ADD)

> A development methodology where an external AI agent continuously inspects, audits, and reports on a platform — driving quality improvements autonomously.

## The Problem

Traditional development relies on human QA cycles: manual testing, code review, and periodic audits. These are slow, incomplete, and don't scale. Meanwhile, your platform keeps evolving.

## The Solution: Let Agents Drive Quality

FlowWink implements a three-channel architecture that enables an external agent (e.g., OpenClaw) to act as a **persistent development partner**:

```
┌─────────────────────────────────────────────────┐
│              External Agent (OpenClaw)           │
│                                                  │
│  MCP ──────► FlowWink Shell (inspect data)      │
│  A2A ──────► FlowPilot (report & converse)      │
│  /v1/resp ─► Structured tasks (QA audits)       │
└─────────────────────────────────────────────────┘
```

### Channel 1: MCP (Model Context Protocol)

**Purpose:** Give the external agent direct read/write access to the platform.

The MCP server (`mcp-server` edge function) exposes:

- **37 tools** — manage pages, blog posts, leads, products, bookings, orders, settings, and more
- **6 resources** — read-only inspection endpoints:
  - `flowwink://health` — site statistics and active objectives
  - `flowwink://skills` — full skill registry with metadata
  - `flowwink://activity` — recent FlowPilot actions
  - `flowwink://modules` — module configuration
  - `flowwink://peers` — federation peer status
  - `flowwink://identity` — FlowPilot's soul and configuration

Authentication uses API keys (`fwk_` prefix) managed in the Developer hub.

### Channel 2: A2A (Agent-to-Agent)

**Purpose:** Natural conversation and structured reporting between agents.

- `a2a-ingest` — receives JSON-RPC `message/send` from peers
- `a2a-chat` — contextual conversation with site intelligence
- `a2a-outbound` — sends messages to peers

The A2A channel preserves conversation history per peer, enabling multi-turn dialogues with full context.

### Channel 3: OpenResponses (`/v1/responses`)

**Purpose:** Synchronous, structured task delegation.

- `openclaw-responses` — sends prompts with optional JSON schema enforcement
- Used for deterministic tasks that require validated output (QA reports, audits)

## The Feedback Loop

The magic happens when these channels combine:

```
1. OpenClaw connects via MCP
2. Reads flowwink://health, flowwink://skills, flowwink://activity
3. Inspects pages, products, leads via MCP tools
4. Discovers issues (missing meta descriptions, broken flows, etc.)
5. Reports via openclaw_report_finding (MCP tool)
6. High/critical findings auto-create FlowPilot objectives
7. FlowPilot acts on objectives in next heartbeat
8. OpenClaw verifies fixes in next inspection cycle
```

### Auto-Objective Creation

When `openclaw_report_finding` is called with `severity: "high"` or `"critical"`, FlowPilot automatically creates an active objective:

```json
{
  "goal": "Fix: Missing meta description on /pricing",
  "status": "active",
  "created_by": "peer_report",
  "constraints": {
    "source": "openclaw_report_finding",
    "finding_id": "uuid",
    "severity": "critical"
  }
}
```

FlowPilot picks this up in its next heartbeat cycle and executes the fix autonomously (if within its operational boundaries) or flags it for developer attention.

## Why This Works

| Traditional QA | Agent-Driven Development |
|---|---|
| Periodic, manual | Continuous, autonomous |
| Human bottleneck | Scales with compute |
| Reactive | Proactive |
| Siloed knowledge | Shared context via MCP |
| Reports → Jira → Sprint | Reports → Objectives → Auto-fix |

## Strategic Implications

By letting a more resource-rich agent (OpenClaw) inspect and audit FlowWink:

1. **Leverage asymmetry** — OpenClaw's community invests in agent capabilities; FlowWink benefits automatically
2. **Quality ratchet** — every finding becomes an objective, every fix is permanent
3. **Development velocity** — the external agent discovers issues you haven't thought to look for
4. **Architecture evolution** — structural recommendations become documented objectives for developers

## Configuration

### For OpenClaw operators

1. Create a FlowWink API key in **Developer → MCP Keys**
2. Configure OpenClaw workspace to use FlowWink as an MCP server:
   ```
   URL: https://your-instance.supabase.co/functions/v1/mcp-server
   Auth: Bearer fwk_your_api_key
   ```
3. The agent can now discover tools via `tools/list` and resources via `resources/list`

### For FlowWink administrators

1. Control which skills are exposed via the **Shield toggle** in Skills management
2. Monitor peer activity in **Federation → Activity Log**
3. Review auto-created objectives in **FlowPilot → Objectives**

## Relationship to the Agentic Handbook

This methodology is documented as a chapter in the [Agentic Handbook](https://github.com/magnusfroste/clawable) — a practical guide to building agentic systems. It demonstrates how federation between specialized agents creates emergent quality improvements that neither agent could achieve alone.
