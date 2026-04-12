# Agent-Driven Development (ADD)

> A development methodology where autonomous agents inspect, audit, and report — while humans triage and decide. Every source-level fix permanently raises the quality baseline.

## The Problem

Traditional development relies on human QA cycles: manual testing, code review, and periodic audits. These are slow, incomplete, and don't scale. Meanwhile, your platform keeps evolving.

## The Solution: Three-Layer Quality Loop

ADD combines autonomous detection with human judgment and compounding remediation:

```
┌──────────────────────────────────────────────────────────┐
│                    THE ADD LOOP                          │
│                                                          │
│  1. DETECTION    Agent inspects via MCP/A2A              │
│        ↓                                                 │
│  2. TRIAGE       Human classifies each finding           │
│        ↓                                                 │
│  3. REMEDIATION  Fix at source → quality ratchets up     │
│        ↓                                                 │
│     (repeat)     Agent verifies → finds new issues       │
└──────────────────────────────────────────────────────────┘
```

### Layer 1: Detection (Autonomous)

An external agent (e.g., OpenClaw) connects via MCP and inspects the platform:

- Reads `flowwink://health`, `flowwink://skills`, `flowwink://templates`
- Inspects pages, products, leads, blog posts via MCP tools
- Discovers issues: missing meta descriptions, SEO gaps, broken flows
- Reports findings via `openclaw_report_finding`

The agent operates continuously without human prompting. It finds what you haven't thought to look for.

### Layer 2: Triage (Human)

This is the critical filter. Not every finding deserves action. The human developer classifies each report into one of three categories:

| Classification | Action | Example |
|---|---|---|
| **False Positive** | Dismiss — intentional design choice | Placeholder images in comparison tables |
| **Runtime Fix** | Patch the specific instance | Fix a typo on one deployed page |
| **Source Fix** | Fix in template/seed data | Add meta descriptions to template source |

The human decides *what kind* of fix is appropriate. The agent provides the signal; the human provides the judgment.

### Layer 3: Remediation (The Quality Ratchet)

Source Fixes are where the real value compounds:

```
Template Source Code (src/data/templates/*.ts)
     ↓ fix applied here
Every Future Installation
     ↓ inherits the fix
Quality Baseline Permanently Raised
```

A Source Fix means:
- The improvement survives site resets
- Every new installation starts at a higher quality baseline
- The fix is permanent — it can never regress
- The agent will verify it's resolved in the next inspection cycle

This is **The Quality Ratchet** — it only turns one way.

## The Three Channels

ADD uses a multi-channel architecture for agent-platform communication:

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

**Purpose:** Give the external agent direct read access to the platform.

The MCP server exposes ~40 tools and 7 inspection resources:

- `flowwink://health` — site statistics and active objectives
- `flowwink://skills` — full skill registry with metadata
- `flowwink://activity` — recent FlowPilot actions
- `flowwink://modules` — module configuration
- `flowwink://peers` — federation peer status
- `flowwink://identity` — FlowPilot's soul and configuration
- `flowwink://templates/{id}` — detailed template structure for auditing

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

## Real-World Example: Template SEO Audit

This is how ADD played out in practice:

```
1. OpenClaw connects via MCP
2. Reads flowwink://templates for all 5 templates
3. Discovers: 16 meta descriptions too short, 18 blog titles too long
4. Reports findings via openclaw_report_finding (8 findings total)

--- Human Triage ---

5. Developer reviews findings:
   - "Missing header/footer configs" → FALSE POSITIVE (intentional)
   - "Product images missing" → FALSE POSITIVE (comparison table placeholders)
   - "Meta descriptions <50 chars" → SOURCE FIX needed
   - "Blog titles >60 chars" → SOURCE FIX needed

--- Remediation ---

6. Developer edits src/data/templates/*.ts:
   - Extends 16 meta descriptions to 80-140 characters
   - Shortens 18 blog titles to ≤60 characters
7. Findings marked resolved in database
8. Every future FlowWink installation inherits these improvements
```

**Result:** Quality baseline permanently raised. Zero regression possible.

## Auto-Objective Creation

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
| Reports → Jira → Sprint | Reports → Triage → Source Fix |
| Fixes are instance-specific | Fixes compound across all installations |

## Strategic Implications

By letting a more resource-rich agent (OpenClaw) inspect and audit FlowWink:

1. **Leverage asymmetry** — OpenClaw's community invests in agent capabilities; FlowWink benefits automatically
2. **Quality ratchet** — every source fix is permanent, every inspection finds fewer issues
3. **Development velocity** — the external agent discovers issues you haven't thought to look for
4. **Human judgment preserved** — triage ensures false positives don't waste effort
5. **Architecture evolution** — structural recommendations become documented objectives

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
