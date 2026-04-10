---
title: "Feedback Loops"
description: "Growth loops, reflection, and self-healing — how agents compound their capabilities over time."
order: 17
icon: "arrow-path"
---

> **TL;DR:** Feedback loops close the gap between action and learning. Outcome evaluation, user ratings, and automated quality checks feed back into skill selection, memory, and objective planning — creating compounding improvement over time.


# Feedback Loops — How Agents Improve Over Time

> **A funnel leaks. A loop compounds. The best agentic systems don't just execute — they learn from every execution and get better.**

---

We've just established that agents have memory (chapter 10). They remember what happened, what worked, who they talked to. But memory alone is passive storage — it only becomes valuable if something uses it to *get better*.

That's what this chapter is about. Feedback loops are the mechanisms that turn memory into improvement. They're the reason a well-designed agent in month six outperforms the same agent in month one — not because the model changed, but because the system learned from six months of real outcomes and fed that learning back into itself.

This is also the chapter that separates "we deployed an agent" from "we built a compounding capability." The second one is what makes agentic AI genuinely different from any automation technology that came before it.

---

## The Growth Loop Model

Traditional software follows a funnel model: input → process → output. Agentic software follows a loop model: input → process → output → learn → improve → repeat.

```
         ┌──────────────────────────────────┐
         │                                  │
    Attract ──→ Capture ──→ Qualify ──→ Convert
         │                                  │
         └──── Learn ◄── Measure ◄──────────┘
```

Every interaction feeds back into the system. Every data point makes the next interaction smarter. Every loop iteration is more effective than the last.

---

## Five Feedback Loops in Production

### Loop 1: Capture & Qualify

When someone interacts with the business, the agent starts working:

1. Contact is created with full source tracking
2. Engagement score calculated based on action type
3. AI analyzes the contact and generates qualification summary
4. Contact appears in pipeline, ranked by score

**Signal strengths:**

| Action | Signal |
|--------|--------|
| Webinar registration | High intent |
| Form submission | High intent |
| Booking | High intent |
| Newsletter subscription | Medium intent |
| Link click | Medium intent |
| Email open | Low intent |
| Page visit | Low intent |

These signals compound. A contact who opened three newsletters, clicked two links, and registered for a webinar has a different profile than someone who filled out a form once.

### Loop 2: Engage & Track

Every interaction is logged and scored. The agent reads the patterns:

- Which content drives the most engagement?
- Which channels convert best?
- What time of day do prospects respond?

This data feeds into the agent's content creation and outreach decisions.

### Loop 3: Sell & Convert

The sales pipeline is connected to marketing:

- New deal → contact status updates automatically
- Won deal → marks as customer, logs revenue
- Lost deal → tracked for pattern analysis

The agent sees the complete journey from first contact to signed contract.

### Loop 4: Enrich & Understand

AI enrichment fills in company profiles from a single domain:

- Industry, company size, phone, website, address
- This benefits every contact linked to that company
- AI qualification uses company context for smarter summaries

### Loop 5: Measure & Improve

Every loop generates metrics:

- **Capture:** Leads per source, channel conversion rates
- **Engage:** Email open rates, content click-through rates
- **Sell:** Pipeline value, win rate
- **Enrich:** Company data completeness

These aren't vanity metrics. They're actionable signals that tell the agent where to focus.

---

## The Agent's Internal Feedback Loops

Beyond business metrics, the agent has its own feedback mechanisms:

### Reflection

```
reflect()
  │
  ├── Query agent_activity for last 7 days
  ├── Successful actions → positive patterns
  ├── Failed actions → negative patterns
  ├── Identify: what to do more, what to stop, what to try
  ├── Auto-persist top learnings
  └── Return reflection summary
```

The agent literally evaluates its own performance and saves lessons.

### Self-Healing

```
runSelfHealing()
  │
  ├── Skills with 3+ consecutive failures → quarantine
  ├── Linked automations → disabled
  └── Healing report → injected into next heartbeat
```

Failing components are automatically removed from the agent's available toolkit. This prevents the agent from repeatedly trying things that don't work.

### Skill Evolution

```
skill_instruct(skill_name, new_instructions)
  │
  ├── Agent updates skill knowledge based on experience
  ├── New edge cases documented
  ├── Better examples added
  └── Instructions versioned
```

The agent literally rewrites its own skill instructions based on what it learns.

---

## The Compound Effect

Feedback loops compound. Here's how:

```
Week 1: Agent qualifies 10 leads
  → Saves learnings about what makes a good lead

Week 2: Agent qualifies 10 more leads
  → Uses Week 1 learnings, gets better scores
  → Saves new patterns

Week 4: Agent qualifies 20 leads
  → 4 weeks of accumulated knowledge
  → Scores are significantly more accurate
  → Conversion rate improves

Week 8: Agent qualifies 40 leads
  → 8 weeks of patterns
  → Can predict which leads will convert
  → Suggests proactive outreach to high-potential leads
```

The agent at Week 8 is fundamentally more capable than the agent at Week 1. Not because the model changed, but because the memory and skills evolved.

---

## Designing Effective Feedback Loops

| Principle | Implementation |
|-----------|---------------|
| **Measure everything** | Log all actions to `agent_activity` with input/output/timing |
| **Score continuously** | Engagement scores update on every interaction |
| **Reflect regularly** | `reflect()` runs every heartbeat cycle |
| **Persist learnings** | Auto-save top learnings to `agent_memory` |
| **Close the loop** | Learnings influence future decisions |
| **Quarantine failures** | Self-healing prevents repeated mistakes |

---

## The Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| No logging | Can't measure, can't improve | `agent_activity` audit trail |
| No reflection | Agent never evaluates itself | `reflect()` in heartbeat |
| No self-healing | Failures cascade | `runSelfHealing()` auto-quarantine |
| No scoring | Can't prioritize | Engagement scoring system |
| No memory persistence | Learnings lost between sessions | `agent_memory` with embeddings |

---

*The feedback loop is the engine of improvement. Without it, the agent is a static system. With it, the agent is a learning system that gets better every day.*

*Next: stagnation and drift — the two failure modes nobody talks about until week four of production. [Stagnation and Drift →](08b-stagnation-and-drift.md)*
