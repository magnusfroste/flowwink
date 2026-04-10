---
title: "Human-in-the-Loop"
description: "The decision framework for when agents should act autonomously vs. when humans should approve."
order: 13
icon: "user-group"
---

# Human-in-the-Loop — The Autonomy Decision Framework

> **The question isn't "should the agent be autonomous?" The question is "for which actions, and under what conditions?"**

---

## The Autonomy Spectrum

Autonomy isn't binary. It's a spectrum, and different actions sit at different points:

```
Full Human Control ◄────────────────────────────────────────────────► Full Autonomy
       │                        │                                              │
   APPROVE                   NOTIFY                                          AUTO
       │                        │                                              │
  Newsletter send          Blog draft               Web search                │
  Site settings            Memory write             Analytics query           │
  Financial actions        Content proposal         Lead scoring              │
  User management          A2A message sent         Reporting                 │
       │                        │                                              │
  Block until human        Execute, then            Execute silently,
  confirms                 report to admin          log to activity
```

---

## The Decision Tree

When designing an agentic system, every skill needs to be placed on the autonomy spectrum. Here's the decision framework:

```
Is the action reversible?
  │
  ├── NO → requires_approval = true
  │        (newsletter send, delete content, financial actions)
  │
  └── YES → Is the cost significant?
              │
              ├── YES → requires_approval = true
              │        (paid ad campaigns, large data exports)
              │
              └── NO → Could it damage reputation?
                        │
                        ├── YES → requires_approval = true
                        │        (public-facing content, social posts)
                        │
                        └── NO → Does it affect other people?
                                  │
                                  ├── YES → requires_approval = true
                                  │        (user management, team changes)
                                  │
                                  └── NO → AUTONOMOUS
                                           (research, drafting, analysis,
                                            scoring, reporting)
```

---

## The Three Trust Tiers

FlowPilot implements three execution modes, not two. The binary `requires_approval` flag is the simplified view. The full implementation has:

| Tier | Value | Behavior | Example |
|------|-------|----------|---------|
| **Auto** | `auto` | Execute silently, log to activity | Web search, analytics lookup, lead scoring |
| **Notify** | `notify` | Execute, then send report to admin | Blog draft created, memory written, A2A message sent |
| **Approve** | `approve` | Block execution until admin confirms | Newsletter send, financial transaction, site settings |

### Why Three Tiers?

The binary model creates a false choice: either the agent waits for human approval on everything useful, or it acts silently on everything. **Notify** breaks the deadlock.

A blog draft is not dangerous — but the admin probably wants to know it happened. With `notify`, the agent creates the draft immediately (no blocking) and sends a summary to the Activity Feed. The admin reviews at their convenience. If they don't like it, they delete it. No harm done.

A newsletter send is irreversible — 10,000 people will receive it. That requires `approve`: the agent queues it, the admin must explicitly confirm.

```
auto:    Act → Log
notify:  Act → Log → Notify admin
approve: Queue → Wait → Admin confirms → Act → Log
```

---

## The Approval Workflow

When `requires_approval = true`:

```
Agent decides to act
       │
       ▼
agent-execute checks requires_approval
       │
       ├── true → Log as pending_approval
       │          Return 202 to agent
       │          Admin sees in Activity Feed
       │          Admin approves → re-execute
       │          Admin rejects → log rejection
       │
       └── false → Execute immediately
                   Log result to agent_activity
```

**Key detail:** The agent receives a 202 (accepted, pending approval) response. It knows the action was queued, not executed. It can tell the user "I've drafted the newsletter and it's waiting for your approval."

---

## The tool_policy Override

Beyond per-skill trust tiers, FlowPilot implements a **global policy override** stored in `agent_memory`:

```json
{
  "key": "tool_policy",
  "category": "system",
  "value": {
    "blocked_skills": ["send_newsletter", "execute_payment"],
    "forced_approve": ["write_blog_post"],
    "forced_auto": ["qualify_lead"]
  }
}
```

This lets operators temporarily adjust agent behavior without editing skill definitions:

| Use Case | tool_policy action |
|----------|--------------------|
| "Pause all outbound communications this week" | Add email/newsletter skills to `blocked_skills` |
| "I'm monitoring everything right now" | Move all content skills to `forced_approve` |
| "I trust the agent completely on CRM" | Move CRM skills to `forced_auto` |
| "Something went wrong — freeze the agent" | Block all skills except read-only |

The policy is checked before skill execution and takes precedence over the skill's default tier. It's temporary by design — the admin removes it when the situation resolves.

---

## Real-World Autonomy Decisions

| Skill | Trust Tier | Rationale |
|-------|------------|-----------|
| `search_web` | `auto` | No cost, no risk, read-only |
| `qualify_lead` | `auto` | Analysis, no external impact |
| `analytics_report` | `auto` | Read-only, informational |
| `write_blog_post` | `notify` | Creates content, admin wants to know |
| `memory_write` | `notify` | Modifies agent state |
| `a2a_message` | `notify` | External agent communication |
| `generate_content_proposal` | `notify` | Multi-channel content plan |
| `execute_newsletter_send` | `approve` | Irreversible, reaches real people |
| `update_settings` | `approve` | Affects entire site |
| `manage_product` | `auto` | Internal data management |
| `book_appointment` | `auto` | Low risk, customer-initiated |

---

## The Three Layers of Operation

Different layers have different autonomy levels:

| Layer | Trigger | Autonomy Level |
|-------|---------|----------------|
| **Visitor Layer** | User message in public chat | Low — read-only + booking |
| **Admin Operate Layer** | Admin command | Medium — drafts + suggestions |
| **Automation Layer** | System event or schedule | High — with approval gates |

The visitor layer is the most restricted. Visitors can browse content, book appointments, and search the knowledge base. They can't modify anything.

The admin layer is more capable. The admin agent can draft content, analyze data, and suggest actions. But destructive actions require approval.

The automation layer is the most autonomous. The heartbeat can execute plan steps, run automations, and analyze performance. But even here, destructive actions are gated.

---

## Building Trust Through Graduated Autonomy

The recommended approach for new deployments:

```
Phase 1 (Week 1-2): Observer
  Agent analyzes, reports, suggests. No autonomous actions.
  All skills: requires_approval = true

Phase 2 (Week 3-4): Assistant
  Agent drafts, proposes. Admin approves.
  Low-risk skills: requires_approval = false
  High-risk skills: requires_approval = true

Phase 3 (Month 2+): Operator
  Agent operates autonomously within guardrails.
  Most skills: requires_approval = false
  Destructive skills: requires_approval = true

Phase 4 (Month 3+): Director
  Agent proposes strategy, executes plans.
  Only financial/reputation actions: requires_approval = true
```

This graduated approach builds trust. The admin sees the agent making good decisions before granting more autonomy.

---

## The Human's Role

The human doesn't disappear in an agentic system. Their role shifts:

| Traditional | Agentic |
|-------------|---------|
| Execute tasks | Set objectives |
| Monitor metrics | Review agent reports |
| Make decisions | Approve/reject agent proposals |
| Write content | Edit agent-drafted content |
| Manage pipeline | Review agent-qualified leads |

**The human becomes a director, not an operator.** They set the strategy. The agent executes the tactics.

---

## The Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Full autonomy on everything | One bad hallucination = disaster | Approval gates on destructive actions |
| Approval on everything | Agent can't operate autonomously | Graduated autonomy based on risk |
| No approval workflow | Admin can't review pending actions | Activity Feed with approve/reject |
| Binary autonomy | All-or-nothing approach | Three-tier trust model (auto/notify/approve) |
| No tool_policy | Can't temporarily adjust behavior | Global policy override in agent_memory |

---

*The goal is not maximum autonomy. The goal is appropriate autonomy — enough to be useful, not so much that it's dangerous. The decision tree helps you find that balance.*

*Next: who is responsible when the agent makes a decision — and how organizations are restructuring around agents. [Agent Governance →](13b-agent-governance.md)*
