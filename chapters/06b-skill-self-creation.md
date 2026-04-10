---
title: "Skill Self-Creation"
description: "When agents evolve beyond their initial configuration — autonomous skill creation, template generation, and the path to compound learning."
order: 13
icon: "sparkles"
---

> **TL;DR:** The agent can create its own skills when it encounters a repeated task with no existing skill. Self-created skills go through validation, testing, and human approval before production use — autonomy with guardrails.


# Skill Self-Creation — When Agents Write Their Own Playbook

> **A static agent is a depreciating asset. It knows exactly what it knew on day one. A self-evolving agent is a compounding asset — every interaction makes it better. The difference is whether the agent can create new skills at runtime.**

---

## The Evolution Gap

Most agent frameworks ship with a fixed set of tools. Need a new capability? A developer writes it, deploys it, restarts the agent. This works for prototypes. It doesn't work for a business agent that encounters new situations daily.

Consider an accounting agent. You ship it with templates for 20 common transactions. On day three, the operator records a transaction type the agent has never seen: a reverse charge VAT entry for EU cross-border services. What happens?

**Static agent:** Fails. Asks for help. Waits for a developer to add a new template. The operator loses trust.

**Self-evolving agent:** Reasons about the transaction using its domain knowledge, creates a new template, saves it to memory, and uses it correctly next time. The operator gains trust.

This is the difference between a tool and a colleague.

---

## The Self-Modification Toolkit

FlowPilot has 7 built-in skills for self-modification:

| Skill | Purpose | Safety |
|-------|---------|--------|
| `skill_create` | Register a new skill at runtime | `requires_approval = true` |
| `skill_update` | Modify an existing skill's metadata | Logged to audit trail |
| `skill_instruct` | Update a skill's instructions | Logged |
| `skill_disable` | Disable a malfunctioning skill | Immediate, logged |
| `soul_update` | Evolve the agent's personality | `requires_approval = true` |
| `reflect` | Analyze performance and save learnings | Auto, saves to memory |
| `propose_objective` | Create a new strategic goal | `requires_approval = true` |

### The Safety Principle

Every self-modification skill follows one rule: **create freely, deploy carefully.**

- New skills default to `requires_approval = true` — the agent can design them, but a human must approve before they execute
- Every modification is logged to `agent_activity` with full before/after state
- The `trust_level` enum (`built_in`, `user_created`, `agent_created`) tracks provenance
- Agent-created skills start at the lowest trust level and can be promoted

```typescript
// When the agent creates a skill
await supabase.from('agent_skills').insert({
  name: 'reverse_charge_vat',
  handler: 'module:accounting',
  origin: 'agent',           // Agent-created
  trust_level: 'agent_created',  // Lowest trust
  requires_approval: true,    // Human must approve first use
  instructions: '...',
  tool_definition: { ... },
});
```

---

## Case Study: Autonomous Accounting Templates

The most concrete example of skill self-creation in FlowPilot is the accounting template system. Here's how it works in practice.

### The Problem

Swedish double-entry bookkeeping (BAS 2024) has hundreds of transaction types. Pre-loading all of them into the agent's context is impossible (token economy, Law 3). Pre-defining templates for all of them is impractical — there are too many edge cases.

### The Solution: Template as Memory

Templates are stored in `agent_memory` with category `accounting_template`:

```json
{
  "key": "template:payroll_tax",
  "category": "accounting_template",
  "value": {
    "template_name": "Payroll Tax Payment",
    "description": "Monthly employer payroll tax payment to Skatteverket",
    "category": "tax",
    "keywords": ["arbetsgivaravgift", "payroll", "skatteverket", "sociala avgifter"],
    "template_lines": [
      { "account_code": "2731", "account_name": "Avräkning arbetsgivaravgifter", "debit": true },
      { "account_code": "1930", "account_name": "Företagskonto", "credit": true }
    ]
  }
}
```

### The Creation Flow

When FlowPilot encounters a transaction it doesn't have a template for:

```
1. RECOGNIZE — "This looks like a reverse charge VAT entry"
2. SEARCH — Check agent_memory for existing templates
3. REASON — If no template found, use BAS 2024 knowledge
           from skill instructions to determine correct accounts
4. CREATE — Build new template with proper debit/credit lines
5. VALIDATE — Cross-check against chart_of_accounts table
6. SAVE — Store as agent_memory entry with embedding
7. USE — Apply template to create journal entries
8. LEARN — Next time this pattern appears, template is found in step 2
```

### The Compound Effect

After 30 days of operation, FlowPilot has:
- Started with 15 pre-defined templates
- Created 8 new templates autonomously
- Each new template was validated against the BAS 2024 chart of accounts
- Each subsequent use of a learned template is faster and more accurate

This is **compound learning** — the agent gets better at its job over time without any developer intervention.

---

## Template Creation as a General Pattern

Accounting templates are one instance of a general pattern: **domain-specific knowledge crystallization.**

The same pattern applies to:

| Domain | What Gets Crystallized | Storage |
|--------|----------------------|---------|
| Accounting | Transaction templates (debit/credit patterns) | `agent_memory` |
| Content | Writing style preferences, proven headlines | `agent_memory` |
| CRM | Lead qualification criteria, objection handlers | `agent_memory` |
| Booking | Service-specific scheduling rules | `agent_memory` |
| Email | Newsletter templates, subject line patterns | `agent_memory` |

The mechanism is identical:
1. Encounter a new pattern
2. Search memory for existing knowledge
3. If not found, reason from domain instructions
4. Create and store for future use
5. Retrieve and refine on subsequent encounters

---

## The Self-Creation Lifecycle

```
         ┌─────────────────────────────┐
         │  ENCOUNTER                  │
         │  Agent faces new situation  │
         └──────────┬──────────────────┘
                    │
         ┌──────────▼──────────────────┐
         │  SEARCH                     │
         │  Check memory for existing  │
         │  knowledge or template      │
         └──────────┬──────────────────┘
                    │
            Found?──┤
           Yes │    │ No
               │    │
    ┌──────────▼┐  ┌▼─────────────────┐
    │  APPLY    │  │  REASON           │
    │  Use it   │  │  Use domain       │
    │           │  │  knowledge to      │
    └───────────┘  │  construct new     │
                   └──────┬────────────┘
                          │
               ┌──────────▼────────────┐
               │  VALIDATE             │
               │  Cross-check against  │
               │  known-good data      │
               └──────────┬────────────┘
                          │
               ┌──────────▼────────────┐
               │  SAVE                 │
               │  Store with embedding │
               │  for future retrieval │
               └──────────┬────────────┘
                          │
               ┌──────────▼────────────┐
               │  APPLY                │
               │  Use the new template │
               │  or skill             │
               └───────────────────────┘
```

---

## Guard Rails for Self-Evolution

Self-creation without guard rails is dangerous. Here's what prevents the agent from going off the rails:

### 1. Approval Gates (Law 7)
New skills and templates require human approval before first execution. The agent can *design* anything — but it can't *deploy* anything without sign-off.

### 2. Provenance Tracking
Every agent-created artifact carries its origin:
```sql
origin = 'agent'           -- vs 'built_in' or 'user'
trust_level = 'agent_created'  -- lowest trust tier
```

### 3. Self-Healing (Law 8)
If an agent-created skill fails 3 consecutive times, it's automatically quarantined. The agent can't create a broken skill and keep using it forever.

### 4. Audit Trail
Every creation, modification, and usage is logged to `agent_activity`. Operators can review the agent's evolution in the Activity Feed.

### 5. Scope Isolation (Law 6)
Agent-created skills inherit the scope of their creator. An external-facing chat agent cannot create internal-scope skills.

---

## The Anti-Patterns

| Anti-Pattern | Risk | Mitigation |
|---|---|---|
| No self-creation | Agent never improves | Implement `skill_create` + template memory |
| Unrestricted creation | Agent creates dangerous tools | `requires_approval = true` for all new skills |
| No provenance tracking | Can't distinguish agent-created from human-defined | `origin` + `trust_level` columns |
| No validation | Agent creates incorrect templates | Cross-check against reference data |
| No compound learning | Agent creates but never reuses | Embedding-based memory search |

---

*Self-creation is what separates an agent from a script. A script does what it was told. An agent learns what to do. The accounting template system is a small example of a large principle: the most valuable agent is the one that makes itself more valuable over time.*

*Next: how the agent routes 100+ skills to the right one in under 1ms. [Intent Scoring →](06c-intent-scoring.md)*
