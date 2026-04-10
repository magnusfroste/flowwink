---
title: "The Skills Ecosystem"
description: "Skills as knowledge containers — how agents learn, evolve, and share capabilities."
order: 12
icon: "puzzle-piece"
---

> **TL;DR:** Skills are the agent's capabilities — self-describing functions with metadata that the reasoning engine selects autonomously. With 100+ skills organized by business function, dynamic compression keeps the token budget manageable.


# The Skills Ecosystem — How Agents Learn New Capabilities

> **A skill is a knowledge container. It's not just a function definition — it's everything the agent needs to know to use that function well.**

---

In the previous chapters we've described what an agent *is* (chapter 1), how it *wakes up and acts* (the heartbeat, chapter 8), and *what rules govern its behavior* (the 10 laws, chapter 7). But we haven't answered a more basic question: **what can it actually do?**

Skills are the answer. Skills are the atomic unit of capability — each one teaches the agent a new thing it's able to accomplish. Without skills, the heartbeat loop has nothing meaningful to execute. The laws constrain behavior, but skills define what behavior is even possible.

Think of it this way: SOUL.md is the agent's character. The heartbeat is its daily routine. Skills are its job description.

---

## What Is a Skill?

In agentic architecture, a skill is the atomic unit of capability. It contains:

1. **What it does** — Name and description
2. **When to use it** — Routing rules (Use when / NOT for)
3. **How to call it** — JSON schema (OpenAI function-calling format)
4. **How to think about it** — Rich instructions (edge cases, decision tables, examples)
5. **Where it runs** — Handler string (edge/module/db/webhook/a2a)
6. **Who can use it** — Scope (internal/external/both)
7. **Whether it needs approval** — Safety gate

```json
{
  "name": "qualify_lead",
  "description": "AI-powered lead qualification. Use when: new lead needs scoring. NOT for: existing customers.",
  "handler": "edge:qualify-lead",
  "scope": "internal",
  "requires_approval": false,
  "instructions": "When qualifying a lead:\n1. Check company domain for enrichment\n2. Score based on: job title (seniority), company size, industry match\n3. Generate a 2-sentence qualification summary\n4. If score > 70, suggest creating a deal\n5. Always link to existing company if domain matches",
  "tool_definition": {
    "type": "function",
    "function": {
      "name": "qualify_lead",
      "description": "Qualify a lead with AI analysis",
      "parameters": {
        "type": "object",
        "properties": {
          "lead_id": { "type": "string", "description": "UUID of the lead" },
          "context": { "type": "string", "description": "Additional context for qualification" }
        },
        "required": ["lead_id"]
      }
    }
  }
}
```

---

## The Skill Lifecycle

Skills go through a lifecycle that mirrors how an employee learns:

```
Create → Instruct → Test → Enable → Use → Reflect → Improve → Disable
  │         │        │       │       │       │         │          │
  │         │        │       │       │       │         │          └─ Quarantine
  │         │        │       │       │       │         └─ Update instructions
  │         │        │       │       │       └─ Self-assessment
  │         │        │       │       └─ Execution + logging
  │         │        │       └─ Available to agent
  │         │        └─ Validation
  │         └─ Rich knowledge added
  └─ Basic definition registered
```

### Creation

Skills can be created:
- **By developers** — Via admin UI or database migration
- **By the agent itself** — Via `skill_create` tool (defaults to `requires_approval = true`)
- **By skill packs** — Bundled installation

### Instruction

The `skill_instruct` tool lets the agent (or admin) add rich knowledge:

```
skill_instruct("qualify_lead", "
When qualifying leads from the tech industry:
- Weight company size more heavily (startups = higher score)
- Check if they have a GitHub presence (developer-friendly signal)
- Look for recent funding announcements (budget availability)

Edge cases:
- Personal email domains (gmail, yahoo): score capped at 40
- Government agencies: always requires manual review
- Existing customer contacts: route to account management instead
")
```

### Self-Healing

Skills with 3+ consecutive failures are automatically quarantined. The agent can't use them until an admin re-enables them. This prevents cascading failures.

---

## Skill Budget Management

With 100+ skills, the token budget gets tight. The system uses dynamic compression:

```
Token Usage    Tier       Behavior
───────────    ────       ────────
< 50%          full       All skills with full tool_definitions
50–75%         compact    Descriptions truncated to 80 chars
> 75%          drop       Only top-20 recently-used skills remain
```

This is re-evaluated on every iteration of the reasoning loop. As the context fills up, the agent's available tools shrink dynamically.

**The implication:** Popular skills stay available. Unused skills get dropped. This creates a natural selection pressure — skills that the agent finds useful survive, skills it doesn't use get pruned.

---

## Skill Packs

Skills can be bundled into packs for easy installation. Each pack groups related capabilities for a specific business function:

| Pack | Skills Included | Status |
|------|-----------------|--------|
| **E-Commerce Pack** | manage_product, lookup_order, inventory alerts | Available |
| **Content Marketing Pack** | research_content, write_blog_post, generate_content_proposal, send_newsletter | Available |
| **CRM Nurture Pack** | add_lead, qualify_lead, manage_deal, enrich_company | Available |
| **Analytics Pack** | site_stats, conversion_report, engagement_analysis | Planned |

Packs are installed via `skill_pack_install` and create the skills in the database. The agent can discover available packs via `skill_pack_list`.

The 100+ skills in FlowPilot's current library are organized by business function. A new deployment typically starts with the Content Marketing + CRM Nurture packs, then adds E-Commerce and Analytics as the business grows.

---

## Skill Gating — Capability Before Permission

There's a layer that runs *before* trust levels: **skill gating**. Gating is about whether a skill is even available to the agent, not whether it requires approval.

A skill is gated when its prerequisites aren't met. The most common gate: **missing integration credentials**.

```
send_newsletter skill:
  Gate: Email integration has valid API key configured
  → API key present: skill is visible to agent
  → API key missing: skill is invisible (not loaded into prompt)
```

The agent never sees a gated skill. It doesn't try to call it and fail — it simply isn't offered the tool. This prevents a class of errors where the agent attempts to use a capability that has no backend to run it.

### Common Gates

| Gate Type | Condition | Example |
|-----------|-----------|---------|
| **Integration key** | Valid API key configured | `send_newsletter` requires email provider key |
| **Module enabled** | Module is active for this instance | `book_appointment` requires Booking module |
| **Feature flag** | Admin has enabled the feature | `execute_payment` requires Payments enabled |
| **Role scope** | Caller has required permissions | Internal skills invisible in visitor scope |
| **Environment** | Correct deployment environment | Debug skills only in development |

### Implementation

```typescript
// When loading skills for a session
const allSkills = await supabase.from('agent_skills').select('*').eq('enabled', true);

// Filter by gates
const availableSkills = allSkills.filter(skill => {
  if (skill.requires_integration) {
    const hasKey = integrations[skill.requires_integration]?.api_key != null;
    if (!hasKey) return false; // Gated — invisible to agent
  }
  if (skill.requires_module) {
    const moduleEnabled = modules[skill.requires_module]?.enabled;
    if (!moduleEnabled) return false; // Gated — module not active
  }
  return true;
});
```

### Why Gating Matters for UX

Without gating, the agent will attempt to use skills it can't actually execute — then fail, retry, and generate confusing error logs. With gating, the skill simply doesn't exist from the agent's perspective. A cleaner model:

- Agent never attempts `send_newsletter` without a configured email provider
- Agent never tries to create a booking if the booking module is disabled
- Agent instructions don't need to say "check if X is configured before calling Y"

Gating is a compile-time constraint. Trust levels are a runtime constraint. Both are necessary.

---

## The Integration Reach Problem

One of the quiet challenges in agentic business systems is external connectivity. An agent without real integrations can only reason about things it already knows. An agent with broad connectivity can act.

The most mature approach in production is to route external integrations through a proxy layer rather than building direct connections per service. This gives the agent a consistent calling convention regardless of the underlying API, centralizes credential management, and allows new services to be added without touching the agent's core skills.

When done well, a single integration module can reach hundreds of external services — CRMs, project tools, marketing platforms, communication channels — from one skill context. The agent doesn't need to know which specific API it's calling. It knows what it wants to accomplish.

The practical implication: connectivity breadth is increasingly a commodity. What differentiates a capable agent from a narrow one is not how many APIs it can reach, but whether it has the business context to know when and why to use each one.

---

## The OpenClaw Pattern: File vs. Database

OpenClaw uses file-based `SKILL.md` files with automatic discovery. Flowwink uses database-driven skills with admin UI management. Both follow the same concept — a skill is a knowledge container — but the implementation differs significantly:

| Aspect | OpenClaw (File) — verified from source | FlowWink (Database) — implementation |
|--------|-----------------------------------------|--------------------------------------|
| Discovery | File auto-discovery (`skills/*/SKILL.md`) | DB table query |
| Storage | Markdown files on disk | PostgreSQL rows |
| Modification | Edit file, restart/reload | Hot-reloadable (no restart) |
| Admin UI | No (terminal-first) | Yes (Skill Hub page) |
| Multi-instance | No (single user) | Yes (RLS per instance) |
| Versioning | Git | Database history |
| Loading | Lazy: model reads `SKILL.md` on demand | Full tool definitions injected per session |
| Registry | ClawHub marketplace | Curated 73-skill library |

Both patterns work. The file-based approach is simpler for personal use. The database approach is necessary for business operations.

---

## The Skill as Teacher

The most important insight: **a skill is not just a tool definition. It's a teaching instrument.**

The `instructions` field is how you teach the agent your domain. Without it, the agent will use the tool based on the description alone — and it will make mistakes.

```
Without instructions:
  Agent: "I'll qualify this lead." → Checks name, gives random score

With instructions:
  Agent: "I'll qualify this lead." → Checks company domain, enriches
         company data, scores based on job title seniority, generates
         2-sentence summary, suggests creating deal if score > 70
```

The difference is not the tool. The difference is the knowledge.

---

*Skills are the vocabulary of the agent. The richer the vocabulary, the more nuanced the agent's actions. Invest in skill instructions the way you'd invest in employee training.*

*Next: how agents evolve beyond their initial configuration by creating their own skills. [Skill Self-Creation →](06b-skill-self-creation.md)*
