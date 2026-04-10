---
title: "Production Patterns — Battle-Tested at 130+ Skills"
description: "Six architectural patterns that emerged from running an autonomous agent with 100+ skills, 25+ modules, and real business traffic. Not theory — production code."
order: 22
icon: "wrench"
---

# Production Patterns — What We Learned Running 130+ Skills

> **This chapter documents six patterns that don't exist in any framework documentation. They emerged from running FlowPilot in production — fixing real failures, managing real token budgets, and scaling from 10 skills to 100+. Each pattern includes the problem it solves, the implementation, and the failure mode it prevents.**

---

## Pattern 1: The Opt-In Agent — AI as a Module, Not a Requirement

### The Problem

Most agentic platforms are all-or-nothing: the agent is the system. If you don't trust the agent yet — or if your business isn't ready for autonomy — you can't use the platform at all.

This creates a chicken-and-egg problem: teams want to evaluate the platform before enabling autonomy, but the platform only works *with* autonomy.

### The Pattern

Make the agent a **module** — an opt-in capability layer on top of a fully functional manual platform.

```
┌─────────────────────────────────────────┐
│  FlowWink Shell (always active)         │
│  ┌───────────────────────────────────┐  │
│  │ CMS · CRM · Blog · Orders · ...  │  │
│  │ 25+ modules, all work manually    │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ FlowPilot Module (opt-in)        │  │
│  │ Heartbeat · Skills · Memory      │  │
│  │ Reasoning · Automations           │  │
│  │ → Operates the shell above       │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

When FlowPilot is disabled:
- All 25+ modules work as traditional admin tools
- Navigation hides agent-related UI (Engine Room, Activity Feed)
- No heartbeat runs, no skills execute, no automations fire
- The platform is a standard CMS/CRM

When FlowPilot is enabled:
- The agent becomes the primary operator
- Skills, automations, and heartbeat activate
- The admin UI shifts from "control panel" to "exception cockpit"
- The human role changes from operator to supervisor

### Implementation

```typescript
// Every agent-related UI component checks this:
const isFlowPilotActive = useIsModuleEnabled('flowpilot');

// Navigation items conditionally render:
if (!isFlowPilotActive) return null;

// Bootstrap on first enable (idempotent):
async function onModuleEnable() {
  await supabase.functions.invoke('setup-flowpilot', {
    body: { templateId, siteUrl }
  });
}
```

### Why This Matters

The opt-in pattern solves three problems simultaneously:

1. **Adoption friction** — Teams can install FlowWink as a manual CMS, learn it, then flip the switch to autonomy when ready.
2. **Trust building** — You see what the agent *would* do before letting it do it.
3. **Graceful degradation** — If the agent breaks, disable the module. Everything still works manually.

**The anti-pattern:** Building a platform that only works with the agent. You're forcing users to trust AI before they've seen it work.

---

## Pattern 2: Five-Layer Resilience Stack

### The Problem

An autonomous agent that runs 48 heartbeats per day will encounter failures. API rate limits, model hallucinations, malformed tool calls, network timeouts, credential expiry. Without structured resilience, failures cascade: the agent retries the same broken skill, burns tokens, and produces garbage.

### The Pattern

Five concentric protection layers, each catching what the previous one missed:

```
┌──────────────────────────────────────────────┐
│  Layer 1: PREVENTION                          │
│  Circuit breaker: skip skills with 3+         │
│  consecutive failures. Same-action detection: │
│  break if same tool called 3x in a row.       │
├──────────────────────────────────────────────┤
│  Layer 2: RECOVERY                            │
│  Self-repair Phase 1: retry failed skills     │
│  with parameter variations (max 2 retries).   │
│  Pass _retry count and _prev_error to handler.│
├──────────────────────────────────────────────┤
│  Layer 3: ESCALATION                          │
│  Consecutive failure escalation: auto-pause   │
│  skills (enabled=false) after 3 consecutive   │
│  hard-gate negative outcomes. Admin notified. │
├──────────────────────────────────────────────┤
│  Layer 4: EVALUATION                          │
│  24h outcome window. Hard gates: auto-score   │
│  as negative on auth_failed, quota_hit,       │
│  rate_limited, timeout, 401/403/429.          │
│  Flag skills with >60% negative rate.         │
├──────────────────────────────────────────────┤
│  Layer 5: BACKOFF                             │
│  Heartbeat exponential backoff: probabilistic │
│  skip after 3+ failures. Checkpoint saves on  │
│  timeout (resume where you left off).         │
└──────────────────────────────────────────────┘
```

### Implementation Details

**Layer 1 — Circuit Breaker:**
```typescript
// In the reasoning loop, before executing any skill:
const recentFailures = await getConsecutiveFailures(supabase, skillName);
if (recentFailures >= 3) {
  return { error: 'circuit_broken', message: `${skillName} paused after 3 failures` };
}

// Same-action detection:
if (lastThreeActions.every(a => a === currentAction)) {
  return { error: 'loop_detected', message: 'Breaking infinite loop' };
}
```

**Layer 2 — Self-Repair:**
```typescript
// On skill failure, retry with variation:
if (retryCount < 2) {
  const variedArgs = {
    ...originalArgs,
    _retry: retryCount + 1,
    _prev_error: error.message,
  };
  return await executeSkill(skillName, variedArgs);
}
```

**Layer 5 — Heartbeat Backoff:**
```typescript
// Check failure streak before running heartbeat:
const streak = await getHeartbeatFailureStreak(supabase);
if (streak >= 3) {
  const skipProbability = Math.min(0.9, 0.3 * (streak - 2));
  if (Math.random() < skipProbability) {
    console.log(`[heartbeat] backing off (streak: ${streak})`);
    return; // Skip this cycle
  }
}
```

### What This Prevents

Without these layers, we observed:
- **Token hemorrhage** — The agent retried a broken email skill 47 times in one heartbeat, consuming $3.20 in API calls with zero results.
- **Cascading failures** — A rate-limited API caused 12 dependent automations to fire error notifications, which triggered *more* automations.
- **Silent degradation** — A skill with wrong credentials ran "successfully" (no error thrown) but produced empty results for weeks before anyone noticed.

---

## Pattern 3: Three-Tier Skill Budget Degradation

### The Problem

At 10 skills, you can send everything to the LLM. At 100+, you can't — you'll consume 60% of your context window before the agent starts reasoning. But static truncation is too blunt: it doesn't know which skills matter for the current task.

### The Pattern

Dynamic, runtime degradation based on actual token consumption:

```
Token budget used:     <50%          50-75%          >75%
                        │              │               │
                   ┌────┴────┐   ┌────┴────┐    ┌────┴────┐
                   │  FULL   │   │ COMPACT  │    │  DROP   │
                   │All 100+ │   │ All 100+ │    │ Top 20  │
                   │ skills  │   │ truncated│    │ compact │
                   │ w/full  │   │ desc (80 │    │ format  │
                   │ desc    │   │ chars)   │    │ only    │
                   └─────────┘   └──────────┘    └─────────┘
```

The key insight: **tier re-evaluation happens every iteration of the reasoning loop**, not just at startup. As the conversation grows and context fills up, skills automatically degrade. The agent doesn't notice — it just has fewer, more focused options.

### Implementation

```typescript
function resolveSkillBudgetTier(
  budget: number, 
  used: number
): 'full' | 'compact' | 'drop' {
  const ratio = used / budget;
  if (ratio > 0.75) return 'drop';
  if (ratio > 0.50) return 'compact';
  return 'full';
}

// In the reasoning loop:
const newTier = resolveSkillBudgetTier(tokenBudget, currentUsage);
if (newTier !== currentTier) {
  skillTools = await loadSkillTools(supabase, scope, categories, newTier);
  currentTier = newTier;
}
```

**Compact mode:** Truncates descriptions to 80 characters, strips parameter descriptions.  
**Drop mode:** Keeps only the top 20 skills ranked by recent usage frequency (14-day window), in compact format.

### Real Numbers

| Tier | Skills loaded | Tokens consumed | % of 128K budget |
|------|--------------|-----------------|-------------------|
| Full | 100+ | ~10,000+ | ~8% |
| Compact | 100+ | ~4,000+ | ~3% |
| Drop | 20 | ~800 | 0.6% |

The difference between Full and Drop is significant — enough for ~15 additional conversation turns or a full plan decomposition.

---

## Pattern 4: Instance Health & Drift Detection

### The Problem

When you develop new skills, update soul context, or change configurations in dev, there's no mechanism to verify that deployed instances actually received those changes. An admin *can* run tests manually, but there's no proactive alerting. Issues stay silent until someone notices.

### The Pattern

A lightweight health endpoint that any instance exposes, combined with a scheduled self-check:

```json
{
  "status": "healthy | degraded | unhealthy",
  "version": {
    "skills_hash": "sha256...",
    "skill_count": 132,
    "soul_exists": true,
    "agents_exists": true
  },
  "heartbeat": {
    "last_run": "2026-04-10T08:30:00Z",
    "age_minutes": 42
  },
  "cron": {
    "registered": ["heartbeat", "dispatcher", "publisher", "learn"],
    "missing": []
  },
  "integrity": {
    "score": 0.95,
    "issues": ["1 skill missing instructions"]
  }
}
```

**Skill hashing** is the key technique: compute `SHA256(sorted skill names + truncated instructions)`. If the hash differs from the expected dev baseline stored in `agent_memory`, the instance has drifted.

### The Self-Check Loop

```
Every 6 hours:
  1. Call /instance-health
  2. Compare skill hash vs expected baseline
  3. If degraded → create agent objective to self-heal
  4. If unhealthy → log alert + notify admin
  5. Store result in agent_activity for trending
```

### What This Catches

- **Deployment drift** — Skills added in dev but not seeded in production
- **Silent cron death** — Heartbeat stopped running but no one noticed
- **Soul corruption** — Agent personality overwritten by a bad update
- **Partial deploys** — Edge function updated but skill metadata wasn't

---

## Pattern 5: Module Bootstrap — Plug-and-Play Agent Capabilities

### The Problem

Adding a new business capability (invoicing, booking, inventory) to an agentic system traditionally requires: (1) create the module UI, (2) write the skills, (3) register them in the database, (4) create automations, (5) update the agent's knowledge. That's five manual steps, each a source of drift.

### The Pattern

Each module declares its own agent capabilities. When enabled, it **seeds everything automatically**:

```typescript
// src/lib/modules/invoicing-module.ts
export const invoicingModule: ModuleDefinition = {
  id: 'invoicing',
  name: 'Invoicing',
  description: 'Create, send, and track invoices',
  category: 'finance',
  
  // Skills this module owns
  skills: ['manage_invoices', 'generate_invoice_pdf', 'send_invoice'],
  
  // Automations seeded on enable
  automations: [
    {
      name: 'Invoice overdue reminder',
      trigger_type: 'cron',
      trigger_config: { schedule: '0 9 * * *' },
      skill_name: 'manage_invoices',
      skill_arguments: { action: 'check_overdue' }
    }
  ],
  
  // Lifecycle hooks
  onEnable: async (supabase) => {
    await seedModuleSkills(supabase, invoicingModule);
    await seedModuleAutomations(supabase, invoicingModule);
  },
  
  onDisable: async (supabase) => {
    await disableModuleSkills(supabase, invoicingModule);
    await disableModuleAutomations(supabase, invoicingModule);
  }
};
```

### The Skill Map

A central registry maps modules to their skills:

```typescript
// src/lib/modules/skill-map.ts
export const MODULE_SKILL_MAP: Record<string, string[]> = {
  blog:        ['manage_blog', 'generate_blog_image'],
  crm:         ['qualify_lead', 'manage_deals', 'enrich_company'],
  invoicing:   ['manage_invoices', 'generate_invoice_pdf'],
  booking:     ['manage_bookings', 'check_availability'],
  newsletter:  ['manage_newsletters', 'manage_subscribers'],
  // ... 25+ modules total
};
```

When FlowPilot activates *after* other modules, a retroactive scan ensures all active modules have bootstrapped:

```typescript
// On FlowPilot enable:
for (const mod of activeModules) {
  if (!mod.isBootstrapped) {
    await mod.onEnable(supabase);
  }
}
```

### Why This Matters for the Ecosystem

This pattern enables **community modules**: anyone can write a module with skills and automations, publish it, and any FlowWink instance can install it — gaining autonomous capabilities instantly. The module *is* the skill pack.

---

## Pattern 6: Unified AI Fallback Chain

### The Problem

An autonomous agent that depends on a single AI provider is fragile. API keys expire, rate limits hit, models get deprecated, providers have outages. A heartbeat that fails because OpenAI is down at 3 AM means your agent stops working for hours.

### The Pattern

A centralized `resolveAiConfig` function that every edge function calls. It returns the best available provider based on current configuration, with automatic fallback:

```
Priority chain:
  1. OpenAI (if OPENAI_API_KEY exists)
  2. Google Gemini (if GEMINI_API_KEY exists)
  3. Local/Private AI (if local_endpoint configured)
  
Per-skill override:
  skill.preferred_provider = 'gemini'  → Skip OpenAI, try Gemini first
  
Per-tier selection:
  'fast'      → gpt-4.1-mini / gemini-2.5-flash
  'reasoning' → gpt-4.1 / gemini-2.5-pro
```

### Implementation

```typescript
async function resolveAiConfig(
  supabase: SupabaseClient,
  tier: 'fast' | 'reasoning' = 'fast',
  preferredProvider?: string
): Promise<AiConfig> {
  const settings = await getAiSettings(supabase);
  
  // Build provider chain
  const chain = buildProviderChain(settings, preferredProvider);
  
  // Return first available
  for (const provider of chain) {
    if (provider.isAvailable()) {
      return {
        provider: provider.name,
        model: provider.modelForTier(tier),
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl,
      };
    }
  }
  
  throw new Error('No AI provider available');
}
```

### What This Enables

- **Zero-downtime model migration** — Switch from GPT-4 to Gemini by adding one API key. No code changes.
- **Cost optimization** — Route cheap tasks to fast models, expensive reasoning to pro models. Per-skill.
- **Self-hosted sovereignty** — Add a local Ollama endpoint and everything falls back to it when cloud providers are unavailable.
- **Resilience** — If OpenAI is down, Gemini takes over. If both are down, local AI handles basic operations.

---

## The Meta-Pattern: Compound Reliability

These six patterns aren't independent. They compound:

1. **Opt-in agent** lets you start without risk → builds trust
2. **Module bootstrap** means each new capability arrives fully wired → no drift
3. **Skill budget** ensures 100+ skills don't overwhelm the model → consistent quality
4. **Five-layer resilience** catches failures before they cascade → uptime
5. **Instance health** detects when something breaks → proactive fixes
6. **AI fallback chain** ensures the agent always has a model to reason with → availability

Together, they solve the real problem with autonomous agents: **it's not hard to make an agent that works. It's hard to make an agent that keeps working.**

---

*These patterns emerged from 5 months of production operation. They weren't designed top-down — they were extracted bottom-up, from failures, from token budget overruns, from skills that broke at 3 AM and cascaded into 47 retries. If you're building an autonomous agent, you'll encounter every one of these problems. Now you have the solutions.*

*Next: the browser operator — how an autonomous agent navigates the real web. [The Browser Operator →](15b-browser-operator.md)*
