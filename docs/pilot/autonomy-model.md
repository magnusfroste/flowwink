# FlowPilot Autonomy Model

> How objectives, workflows, automations, and skills interact to create autonomous behavior.

## The Three Execution Modes

FlowPilot operates through three distinct execution modes. Understanding when each applies is key to configuring autonomous behavior.

```
┌─────────────────────────────────────────────────────────────────┐
│                    FlowPilot Execution Modes                    │
├─────────────────┬─────────────────────┬─────────────────────────┤
│   OBJECTIVES    │    AUTOMATIONS      │      WORKFLOWS          │
│   (Strategic)   │    (Reactive)       │      (Procedural)       │
│                 │                     │                         │
│ "What to        │ "When X happens,    │ "Do A, then B, then C   │
│  achieve"       │  do Y"              │  in exact order"        │
│                 │                     │                         │
│ FlowPilot       │ Signal-dispatcher   │ automation-dispatcher   │
│ plans & reasons │ triggers instantly  │ executes DAG steps      │
│                 │                     │                         │
│ Heartbeat-      │ Event-driven        │ Manual or cron-         │
│ driven (12h)    │ (realtime)          │ triggered               │
└─────────────────┴─────────────────────┴─────────────────────────┘
```

## Mode 1: Objectives (Strategic Autonomy)

**Objectives are goals, not instructions.** FlowPilot receives a goal and autonomously creates a plan, selects skills, and executes step-by-step across multiple heartbeat cycles.

### How It Works

1. **Objective is created** (by template, user, or FlowPilot itself)
2. **Heartbeat fires** (every 12 hours, or on priority signal)
3. FlowPilot **evaluates** all active objectives, scoring by priority
4. For the top objective, it **checks/creates a plan** (sequence of skill calls)
5. It **executes 1-3 steps** per heartbeat (budget-aware)
6. It **reflects** on outcomes and adjusts the plan
7. Repeat until `success_criteria` are met

### Example: Content Marketing Objective

```json
{
  "goal": "Build a consistent content marketing engine with weekly blog posts, monthly newsletters, and cross-channel distribution.",
  "success_criteria": {
    "weekly_blog_posts": 1,
    "monthly_newsletters": 1,
    "social_posts_per_blog": 2
  },
  "status": "active"
}
```

**FlowPilot autonomously:**
- Creates a 6-step plan (calendar → research → write → publish → social → newsletter)
- Selects appropriate skills for each step
- Executes across multiple heartbeats
- Adapts if a step fails (e.g., generates title from topic if title is missing)

### When to Use Objectives

| Use Case | Why Objectives |
|---|---|
| Grow traffic | Open-ended, needs ongoing effort |
| Build content pipeline | Multi-step, evolves over time |
| Improve SEO | Requires analysis → action → measurement |
| Lead nurturing | Ongoing, context-dependent decisions |

### Key Properties

- **`goal`**: Natural language description of what to achieve
- **`success_criteria`**: Measurable conditions for completion (JSON)
- **`constraints`**: Boundaries (budget, frequency, scope)
- **`progress`**: FlowPilot tracks its own progress here
- **`status`**: `pending` → `active` → `completed` / `failed`

## Mode 2: Automations (Reactive)

**Automations are if-then rules.** When a specific signal fires, a specific skill executes with specific arguments. No reasoning involved.

### How It Works

1. **Database trigger fires** (e.g., blog post status → 'published')
2. `dispatch_automation_event()` sends signal to `signal-dispatcher`
3. `signal-dispatcher` queries `agent_automations` for matching `trigger_config.signal`
4. Matched automations execute their `skill_name` with `skill_arguments` via `agent-execute`

### Example: Blog Published → Social Posts

```json
{
  "name": "Blog Published → Social Posts",
  "trigger_type": "signal",
  "trigger_config": { "signal": "blog_published" },
  "skill_name": "generate_social_post",
  "skill_arguments": {
    "blog_slug": "{{data.slug}}",
    "platforms": ["linkedin", "twitter"]
  }
}
```

### Available Signals

| Signal | Source | Fired When |
|---|---|---|
| `blog_published` | `trigger_blog_published()` | Blog post status → published |
| `lead_created` | `trigger_lead_created()` | New lead inserted |
| `lead_score_updated` | `trigger_lead_score_changed()` | Lead score changes |
| `order_created` | `trigger_order_created()` | New order placed |
| `booking_created` | `trigger_booking_created()` | New booking made |
| `form_submitted` | `trigger_form_submitted()` | Form submission |
| `expense_submitted` | `trigger_expense_created()` | New expense |
| `contract_created` | `trigger_contract_created()` | New contract |
| `document_uploaded` | `trigger_document_uploaded()` | Document uploaded |

### When to Use Automations

| Use Case | Why Automations |
|---|---|
| Blog → Social posts | Deterministic, same every time |
| Lead → Welcome email | Immediate response needed |
| Order → Stock decrement | Must happen reliably |
| Form → Lead creation | Simple data transformation |

## Mode 3: Workflows (Procedural)

**Workflows are DAGs (Directed Acyclic Graphs).** A fixed sequence of skill calls with data flowing between steps. Executed by `automation-dispatcher`.

### How It Works

1. **Triggered** manually, by cron, or by signal
2. `automation-dispatcher` iterates through `steps[]` in order
3. Each step calls a skill via `agent-execute` directly (no reasoning)
4. Output from step N is available to step N+1 via `{{step-N.output}}`
5. `on_failure: "stop"` or `"continue"` controls error handling

### Example: Content Pipeline Workflow

```json
{
  "name": "Content Pipeline",
  "trigger_type": "manual",
  "steps": [
    { "id": "step-1", "skill_name": "research_content",
      "skill_args": { "query": "{{topic}}" } },
    { "id": "step-2", "skill_name": "generate_content_proposal",
      "skill_args": { "topic": "{{topic}}", "research_context": "{{step-1.output}}" } },
    { "id": "step-3", "skill_name": "write_blog_post",
      "skill_args": { "title": "{{step-2.output.channel_variants.blog.title}}", "topic": "{{topic}}" },
      "on_failure": "stop" },
    { "id": "step-4", "skill_name": "generate_social_post",
      "skill_args": { "blog_slug": "{{step-3.output.slug}}" },
      "on_failure": "continue" },
    { "id": "step-5", "skill_name": "manage_newsletters",
      "skill_args": { "action": "create", "subject": "{{step-2.output.channel_variants.newsletter.subject}}" },
      "on_failure": "continue" }
  ]
}
```

### When to Use Workflows

| Use Case | Why Workflows |
|---|---|
| Research → Write → Publish → Distribute | Fixed sequence, predictable |
| Quote → Invoice → Booking | Business process, must be exact |
| Onboarding sequence | Multi-step, same every time |

## The Autonomy Spectrum

```
Low Autonomy ◄──────────────────────────────────────► High Autonomy

 Automations        Workflows           Objectives
 ┌────────┐        ┌──────────┐        ┌──────────────┐
 │ Signal  │        │ Fixed    │        │ FlowPilot    │
 │ → Skill │        │ DAG of   │        │ reasons,     │
 │         │        │ skills   │        │ plans, and   │
 │ No      │        │          │        │ adapts       │
 │ reasoning│       │ No       │        │              │
 │         │        │ reasoning│        │ Uses any     │
 │ 1 skill │        │          │        │ skill needed │
 │ call    │        │ N skills │        │              │
 │         │        │ in order │        │ Multi-cycle  │
 └────────┘        └──────────┘        └──────────────┘
```

## How They Work Together

The most powerful configuration combines all three:

```
┌─ OBJECTIVE: "Build content marketing engine"
│
│  FlowPilot's heartbeat evaluates this goal and decides:
│  "We need a new blog post this week"
│
│  ├─ FlowPilot triggers WORKFLOW: "Content Pipeline"
│  │   Step 1: research_content
│  │   Step 2: generate_content_proposal
│  │   Step 3: write_blog_post → creates draft
│  │
│  ├─ Admin reviews and publishes the draft
│  │
│  ├─ AUTOMATION fires: blog.published signal
│  │   ├─ "Blog → Social Posts" → generate_social_post
│  │   └─ "Blog → Newsletter Draft" → manage_newsletters
│  │
│  └─ FlowPilot reflects: "Blog published, social distributed ✓"
│     Updates progress, plans next week's topic
```

## Do I Need Workflows?

**No.** Objectives alone can drive full autonomy. Here's the tradeoff:

| Approach | Pros | Cons |
|---|---|---|
| **Objective only** | Maximum flexibility, FlowPilot adapts | Slower (heartbeat-bound), uses AI tokens per decision |
| **Objective + Automations** | Reactive events handled instantly | Must configure each signal-skill pair |
| **Objective + Workflow** | Repeatable, predictable, token-efficient | Rigid, can't adapt to edge cases |
| **All three** | Best of all worlds | More configuration |

### Rule of Thumb

- **Start with an Objective** for any new business goal
- **Add Automations** for events that need instant response
- **Add Workflows** when you discover a pattern that repeats identically

FlowPilot can even **create workflows autonomously** via the `workflow_create` skill — formalizing patterns it discovers through repeated objective execution.

## Configuring Objectives for Maximum Autonomy

### Good Objective Design

```json
{
  "goal": "Ensure every published blog post is distributed across LinkedIn and X within 2 hours of publishing, and included in the next monthly newsletter.",
  "success_criteria": {
    "social_coverage_pct": 100,
    "newsletter_inclusion_pct": 100
  },
  "constraints": {
    "max_daily_posts": 3,
    "require_human_review": false
  }
}
```

**Why this works:**
- Clear, measurable success criteria
- Explicit constraints prevent runaway behavior
- FlowPilot can use any combination of skills to achieve this

### Bad Objective Design

```json
{
  "goal": "Do marketing stuff",
  "success_criteria": {}
}
```

**Why this fails:**
- Vague goal — FlowPilot can't plan
- No success criteria — never completes
- No constraints — unpredictable behavior

## What Needs to Be "On Plats" (In Place)?

For FlowPilot to operate autonomously on content, these must exist:

### Required Infrastructure
- [x] `agent_skills` table with content skills registered
- [x] `agent_objectives` table with active objectives
- [x] Heartbeat cron job (every 12h)
- [x] `chat-completion` edge function (reasoning engine)
- [x] `agent-execute` edge function (skill execution)
- [x] Database triggers for `blog.published` signal

### Required Skills (all exist ✓)
- [x] `research_content` — deep topic research
- [x] `generate_content_proposal` — multi-channel content generation
- [x] `write_blog_post` — blog draft creation
- [x] `manage_blog_posts` — blog CRUD
- [x] `generate_social_post` — social media content
- [x] `manage_newsletters` — newsletter CRUD
- [x] `execute_newsletter_send` — newsletter dispatch
- [x] `publish_scheduled_content` — scheduled publishing

### Required Automations (now configured ✓)
- [x] `Blog Published → Social Posts`
- [x] `Blog Published → Newsletter Draft`

### Optional but Recommended
- [ ] Content Pipeline workflow (for manual/batch runs)
- [ ] Weekly cron automation for `content_calendar_view`
- [ ] Monthly cron for `execute_newsletter_send`
