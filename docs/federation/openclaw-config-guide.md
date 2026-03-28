# OpenClaw → FlowPilot: Configuration Guide

> Exact commands to configure OpenClaw's A2A gateway to work with FlowPilot.

---

## Prerequisites

- OpenClaw ≥ 2026.3.0 with `openclaw-a2a-gateway` v1.2.0+ installed
- FlowPilot peer registered in Federation admin (gives you an **Inbound Token**)
- FlowPilot endpoint: `https://demo.flowwink.com/functions/v1/a2a-ingest`
- Agent Card: `https://demo.flowwink.com/functions/v1/agent-card`

---

## 1. Add FlowPilot as Peer

```bash
openclaw config set plugins.entries.a2a-gateway.config.peers '[
  {
    "name": "FlowPilot",
    "agentCardUrl": "https://demo.flowwink.com/functions/v1/agent-card",
    "auth": {
      "type": "bearer",
      "token": "<FLOWPILOT_INBOUND_TOKEN>"
    }
  }
]'
```

> Replace `<FLOWPILOT_INBOUND_TOKEN>` with the token generated in FlowWink's Federation admin.

---

## 2. Configure Routing Rules (Optional but Recommended)

Route specific patterns to FlowPilot automatically:

```bash
openclaw config set plugins.entries.a2a-gateway.config.routing.rules '[
  {
    "name": "site-audit-to-flowpilot",
    "match": { "pattern": "(audit|review|analyze|check).*(site|page|seo|content)" },
    "target": { "peer": "FlowPilot" },
    "priority": 10
  },
  {
    "name": "booking-to-flowpilot",
    "match": { "pattern": "(book|appointment|schedule|availability)" },
    "target": { "peer": "FlowPilot" },
    "priority": 10
  },
  {
    "name": "cms-ops-to-flowpilot",
    "match": { "pattern": "(publish|draft|blog|page|lead|crm)" },
    "target": { "peer": "FlowPilot" },
    "priority": 5
  }
]'
```

---

## 3. Configure Timeouts for Long Operations

FlowPilot's AI skills can take 10-30 seconds. Increase timeout:

```bash
openclaw config set plugins.entries.a2a-gateway.config.timeouts.agentResponseTimeoutMs 120000
```

---

## 4. Update Agent Card with FlowPilot-Aware Skills

Expose skills that reflect what OpenClaw can do *for* FlowPilot:

```bash
openclaw config set plugins.entries.a2a-gateway.config.agentCard.skills '[
  {"id": "chat", "name": "Chat", "description": "Natural language conversation"},
  {"id": "code_review", "name": "Code Review", "description": "Review GitHub repository code and architecture"},
  {"id": "site_visit", "name": "Site Visit", "description": "Visit a website and analyze UX/content/SEO"},
  {"id": "test_scenario", "name": "Test Scenario", "description": "Run structured test scenarios against services"}
]'
```

---

## 5. Add A2A Section to TOOLS.md

This is **critical** — without this, OpenClaw's LLM won't know how to call FlowPilot proactively.

Add to `~/.openclaw/workspace/TOOLS.md` (or your agent's TOOLS.md):

````markdown
## A2A Gateway — FlowPilot Peer

You have an A2A peer called **FlowPilot** — an autonomous CMS operator.

### What FlowPilot Can Do
- **Site audit**: SEO analysis, content quality, broken links
- **Booking management**: Check availability, manage appointments
- **CMS operations**: Publish pages, manage blog posts, handle leads
- **Beta testing**: Run structured test scenarios
- **Metrics**: Provide real-time site health and visitor data

### How to Send a Message

```bash
node ~/.openclaw/workspace/plugins/a2a-gateway/skill/scripts/a2a-send.mjs \
  --peer-url https://demo.flowwink.com/functions/v1/a2a-ingest \
  --token <FLOWPILOT_TOKEN> \
  --message "YOUR MESSAGE HERE"
```

### How to Request Structured Data

Include `skill:` prefix to invoke a specific FlowPilot skill:

```bash
node ~/.openclaw/workspace/plugins/a2a-gateway/skill/scripts/a2a-send.mjs \
  --peer-url https://demo.flowwink.com/functions/v1/a2a-ingest \
  --token <FLOWPILOT_TOKEN> \
  --message "skill:site_audit {\"url\": \"https://demo.flowwink.com\", \"focus\": \"seo\"}"
```

### Async Mode (for long operations)

```bash
node ~/.openclaw/workspace/plugins/a2a-gateway/skill/scripts/a2a-send.mjs \
  --peer-url https://demo.flowwink.com/functions/v1/a2a-ingest \
  --token <FLOWPILOT_TOKEN> \
  --non-blocking --wait --timeout-ms 120000 \
  --message "Run a full site audit on demo.flowwink.com"
```

### Example Conversations
- "Ask FlowPilot for a site audit"
- "Tell FlowPilot to check booking availability for next week"
- "Send FlowPilot a code review finding about the auth module"
- "Ask FlowPilot what their current active objectives are"
````

---

## 6. Enable OpenClaw's Built-in Capabilities for FlowPilot

OpenClaw has native skills that can help FlowPilot. Configure them to act proactively:

### Code Review (GitHub)
If OpenClaw has GitHub access, it can review FlowWink's codebase:

```bash
# In OpenClaw's agent prompt or TOOLS.md:
# "You can review the FlowWink repository at github.com/[owner]/flowwink"
# "When asked to review code, clone/fetch the repo and analyze architecture, security, and quality"
```

### Site Visit (Browser/Fetch)
OpenClaw can visit FlowPilot's website and report findings:

```bash
# In TOOLS.md:
# "You can visit https://demo.flowwink.com to analyze the live site"
# "Check page load times, SEO tags, mobile responsiveness, and content quality"
# "Report findings back to FlowPilot via A2A"
```

### Scheduled Audits
Use OpenClaw's task scheduling to periodically audit FlowPilot:

```bash
# In TOOLS.md or agent instructions:
# "Every Monday, send FlowPilot a site audit request via A2A"
# "After reviewing code changes, send architectural findings to FlowPilot"
```

---

## 7. Restart and Verify

```bash
openclaw gateway restart

# Verify Agent Card
curl -s http://localhost:18800/.well-known/agent-card.json | python3 -m json.tool

# Test sending a message to FlowPilot
node ~/.openclaw/workspace/plugins/a2a-gateway/skill/scripts/a2a-send.mjs \
  --peer-url https://demo.flowwink.com/functions/v1/a2a-ingest \
  --token <FLOWPILOT_TOKEN> \
  --message "Hello from OpenClaw! Can you share your current site status?"
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `messages_received` high but `tasks_started` low | Messages arriving but not dispatched as tasks | Check OpenClaw logs for "no agent dispatch" — ensure AI provider is configured |
| `401 Unauthorized` | Wrong token | Verify token matches FlowPilot's Federation admin inbound token exactly |
| Timeout errors | FlowPilot skill takes too long | Increase `agentResponseTimeoutMs` or use `--non-blocking --wait` |
| Free-text responses instead of JSON | OpenClaw's LLM ignores responseSchema | Expected — OpenClaw serializes to text. Use `skill:` prefix for structured calls |
| Agent doesn't call FlowPilot | Missing TOOLS.md section | Add the A2A section to TOOLS.md (step 5) |

---

## Architecture: How the Bridge Works

```
OpenClaw LLM                    A2A Gateway Plugin              FlowPilot
┌─────────────┐               ┌─────────────────┐            ┌──────────────┐
│ Reads       │──exec tool──►│ a2a-send.mjs    │──HTTPS───►│ a2a-ingest   │
│ TOOLS.md    │               │ (SDK client)    │  Bearer    │              │
│             │               │                 │  Token     │ Skill router │
│ Decides to  │               │ Auto-discovers  │            │ → a2a_chat   │
│ call peer   │               │ Agent Card      │◄──JSON────│ → site_audit │
│             │               │ Handles auth    │  Response  │ → 40+ skills │
└─────────────┘               └─────────────────┘            └──────────────┘

Inbound (FlowPilot → OpenClaw):
FlowPilot's a2a-outbound → OpenClaw's :18800/a2a/jsonrpc → LLM processes → response
```

---

*Updated: 2026-03-28*
