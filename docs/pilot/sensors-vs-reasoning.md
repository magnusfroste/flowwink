# Sensors vs. Reasoning — The Shadow Brain Boundary

> When is a standalone AI pipeline acceptable, and when must intelligence flow through FlowPilot?

## The Core Distinction

FlowPilot follows a strict separation between **Sensors** (data transformation) and **Reasoning** (strategic intelligence). This distinction determines whether an edge function may contain its own AI prompt or must defer to FlowPilot's centralized reasoning engine.

```
Sensor (OK as standalone)          Reasoning (MUST go via FlowPilot)
─────────────────────────          ──────────────────────────────────
Image → Structured Data            Strategic advice & recommendations
Raw text → Parsed fields           Tone-aware content generation
Deterministic scoring              Problem-mapping to company services
Web page → JSON extraction         Outreach strategy & timing
```

## The Litmus Test

Ask one question about the output:

> **Does this output require judgement, tone, or strategy?**

- **No** → Sensor. Standalone AI is fine (or even preferred for speed/cost).
- **Yes** → Reasoning. It MUST flow through FlowPilot to access soul, objectives, memory, and business context.

## ✅ Acceptable: Sensor-Level AI ("Hands & Eyes")

These are **pure transformations** — structured input in, structured data out. No personality, no strategy, no goals.

| Function | What it does | Why it's OK |
|----------|-------------|-------------|
| `analyze_receipt` | Image → line items, totals, VAT | Pure OCR + extraction |
| `parse_resume` | PDF → skills, experience, education | Data transformation |
| `web-scrape` | URL → structured page content | Raw data extraction |
| `enrich-company` | Domain → company metadata | Deterministic data fetch |
| `qualify-lead` | Activity data → numeric score | Point-based calculation with fixed rules |
| `contact-finder` | Domain → email addresses | API lookup, no judgement |

**Characteristics:**
- Input and output are both structured data
- No knowledge of "who we are" or "what we're trying to achieve" is needed
- Output is the same regardless of business context
- Could be replaced by a deterministic algorithm if the data format were consistent

## ❌ Unacceptable: Reasoning-Level AI ("Shadow Brains")

These operations require **context that only FlowPilot possesses**: the company's soul, active objectives, CRM history, knowledge base, and strategic positioning.

| Function | What it does | Why it's a shadow brain |
|----------|-------------|------------------------|
| `prospect-fit-analysis` | Scores fit + writes intro letter + gives strategic advice | Needs soul for tone, objectives for strategy, KB for service mapping |
| Any "draft email" function | Generates outreach copy | Must reflect brand voice and current campaign goals |
| Any "recommend action" function | Suggests next steps | Requires knowledge of active objectives and pipeline state |
| Any "summarize for human" function | Creates strategic summaries | Judgement about what's important depends on goals |

**Characteristics:**
- Output quality depends on knowing "who we are"
- Tone, personality, or brand voice matters
- Strategic context (objectives, pipeline state) changes the output
- A human would need business context to produce the same result

## The Architecture Pattern

### Sensor Pattern (Standalone OK)
```
User/Agent → Edge Function (own prompt) → Structured Data → FlowPilot reasons about it
```

The edge function is a **tool** that FlowPilot wields. It returns raw material for the agent to interpret.

### Reasoning Pattern (FlowPilot Required)
```
User/Agent → FlowPilot (chat-completion) → Uses soul + objectives + memory → Strategic Output
```

All interpretation, strategy, and tone-aware generation happens inside FlowPilot's unified context window.

### Anti-Pattern: Shadow Brain
```
User → Edge Function (own prompt with hardcoded personality) → Strategic Output
         ↑ This prompt doesn't know about soul, objectives, or memory
```

The function produces "intelligent" output but is **deaf to the business context**. It's a brain without eyes or ears — it can think, but it doesn't know what's happening.

## Current Violations

| Function | Issue | Resolution |
|----------|-------|------------|
| `prospect-fit-analysis` | Contains AI prompt for intro letters and strategic advice | Refactor: split into data-collection (sensor) + reasoning (FlowPilot) |

## Why This Matters

1. **Consistency**: FlowPilot's soul ensures all customer-facing text has the same personality
2. **Context**: Objectives and memory mean recommendations improve over time
3. **Auditability**: All strategic decisions flow through one reasoning engine with full logging
4. **Modularity**: When FlowPilot is disabled, sensors still work — the system degrades gracefully to "data without interpretation"

## Relationship to Module Dependencies

This boundary directly maps to the [Module Dependencies](./module-dependencies.md) tier system:

| Tier | Sensor/Reasoning | Effect |
|------|-----------------|--------|
| 🟢 Independent | Pure sensors or no AI | Full function without FlowPilot |
| 🟡 Enhanced | Sensors work, reasoning is optional | CRUD works, proactive intelligence lost |
| 🔴 Requires | Entire flow is reasoning-driven | Module disabled without FlowPilot |

---

*Last updated: 2026-04-14*
