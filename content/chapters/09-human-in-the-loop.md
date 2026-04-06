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
Full Human Control ◄──────────────────────► Full Autonomy
     │                                              │
     │  Newsletter send    Lead qualification       │
     │  Site settings      Blog drafting            │
     │  Financial actions  Content research          │
     │  User management    Analytics reporting       │
     │                     Web search                │
     │                                              │
     └── requires_approval=true ──── requires_approval=false ──┘
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

## Real-World Autonomy Decisions

| Skill | Autonomy | Rationale |
|-------|----------|-----------|
| `search_web` | Full | No cost, no risk, read-only |
| `write_blog_post` | Full | Drafts only, publishing is separate |
| `qualify_lead` | Full | Analysis, no external impact |
| `generate_content_proposal` | Approval | Multi-channel content creation |
| `execute_newsletter_send` | Approval | Irreversible, reaches real people |
| `send_newsletter` | Approval | External communication |
| `update_settings` | Approval | Affects entire site |
| `manage_product` | Full | Internal data management |
| `book_appointment` | Full | Low risk, customer-initiated |

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
| Binary autonomy | All-or-nothing approach | Spectrum-based decision tree |

---

*The goal is not maximum autonomy. The goal is appropriate autonomy — enough to be useful, not so much that it's dangerous. The decision tree helps you find that balance.*

*Next: who is responsible when the agent makes a decision — and how organizations are restructuring around agents. [Agent Governance →](13b-agent-governance.md)*
