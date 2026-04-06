---
title: "Intent Scoring — Multilingual Skill Selection"
description: "How an agent with 100+ skills picks the right one every time — synonym expansion, trigger matching, historical boosting, and why it works in Swedish."
order: 9.7
icon: "target"
---

# Intent Scoring — How the Agent Picks the Right Skill

> **With 109 skills, the agent faces a routing problem: which skill matches the user's intent? Hardcoded routing is forbidden (Law 1). Sending all skills to the LLM wastes tokens and confuses the model. The solution is intent scoring — a lightweight, pre-LLM filter that ranks skills by relevance before the model ever sees them.**

---

## Why Not Just Let the LLM Choose?

With 10 skills, you can. With 109, you can't — for three reasons:

1. **Token cost** — 109 skills × ~97 tokens metadata each = ~10K tokens. With intent filtering, it's 25 skills × ~97 = ~2.4K tokens. That's 7.6K saved per request.

2. **Selection accuracy** — LLMs struggle with large tool sets. OpenAI documents a 128-tool limit, but accuracy degrades well before that. With fewer, more relevant options, the model picks better.

3. **Hallucination reduction** — More tools in the prompt means more names for the model to confuse. Reducing from 109 to 25 cuts the surface area for phantom tool calls by 75%.

---

## The Scoring Algorithm

The intent scorer runs *before* the LLM sees any tools. It takes the user's message and returns the top 25 most relevant skills:

```
User message: "kan du kolla mitt mejl och sammanfatta?"
     │
     ├── Tokenize: ["kan", "du", "kolla", "mitt", "mejl", "och", "sammanfatta"]
     │
     ├── Synonym expansion:
     │   "mejl" → ["gmail", "email", "mail", "inbox", "composio_gmail"]
     │   Expanded terms: {kan, du, kolla, mitt, mejl, och, sammanfatta,
     │                    gmail, email, mail, inbox, composio_gmail}
     │
     ├── Score each skill:
     │   composio_gmail_scan: 12 (name match) + 8 (fn match) + 7 (trigger) = 27
     │   manage_blog:         0 (no match)
     │   qualify_lead:        0 (no match)
     │   memory_write:        0 (no match)
     │
     └── Return top 25 by score
```

### The Six Scoring Dimensions

```typescript
// 1. Skill name word matching (+12 per match)
//    "gmail_scan" → ["gmail", "scan"]
//    If "gmail" is in expanded terms → +12

// 2. Function name parts (+8 per match)
//    "composio_gmail_scan" split by _ → ["composio", "gmail", "scan"]
//    If "gmail" in expanded terms → +8

// 3. "Use when:" trigger matching (+7 per match, +3 partial)
//    "Use when: user asks to check email, scan inbox"
//    If "email" in expanded terms → +7

// 4. "NOT for:" negative signal (-15 per match)
//    "NOT for: newsletters, blog notifications"
//    If "newsletter" in message → -15 (strong penalty)

// 5. General description matching (+1 per match)
//    Low weight — prevents overfitting to description phrasing

// 6. Historical success rate (+1 per recent success, max +5)
//    Skills that succeeded recently get a small boost
```

The weights are intentional: name matching (12) outweighs description matching (1) by 12×. This prevents a skill with "email" somewhere in a long description from outranking the actual email skill.

---

## Synonym Expansion: The Multilingual Layer

The most unique aspect of the scorer is its synonym map — a flat dictionary that bridges natural language to skill names:

```typescript
const SYNONYM_MAP: Record<string, string[]> = {
  // Swedish → English skill terms
  mejl:        ['gmail', 'email', 'mail', 'inbox', 'composio_gmail'],
  blogg:       ['blog', 'post', 'article', 'content', 'write'],
  nyhetsbrev:  ['newsletter', 'resend', 'subscriber', 'campaign'],
  bokning:     ['booking', 'calendar', 'appointment'],
  kund:        ['lead', 'crm', 'customer', 'contact', 'deal'],
  statistik:   ['analytics', 'metrics', 'stats', 'report'],
  sida:        ['page', 'site', 'block', 'landing'],
  sök:         ['search', 'find', 'lookup', 'web'],
  beställning: ['order', 'product', 'shop'],
  minne:       ['memory', 'remember'],
  inlägg:      ['blog', 'post', 'article'],
  innehåll:    ['blog', 'content', 'proposal', 'research'],
  faktura:     ['invoice', 'accounting', 'billing'],
  produkt:     ['product', 'order', 'shop'],
  // English synonyms too
  mail:        ['gmail', 'email', 'inbox', 'send', 'composio_gmail'],
  booking:     ['booking', 'calendar', 'appointment', 'schedule'],
  lead:        ['lead', 'crm', 'prospect', 'contact', 'deal', 'pipeline'],
  // ...70+ entries total
};
```

This is not translation. It's **term expansion** — mapping the user's vocabulary to the skill registry's vocabulary. The LLM handles the actual language understanding. The scorer just ensures the right skills are *available* for the LLM to choose from.

### Why Not Use the LLM for Routing?

An LLM could classify intent perfectly. But:
- It costs 1-3K tokens per classification call
- It adds 500-1500ms latency before the actual reasoning starts
- It requires a separate API call (or a complex two-stage prompt)

The synonym map runs in <1ms with zero token cost. It doesn't need to be perfect — it just needs to ensure the right skill is *in* the top 25. The LLM makes the final selection.

---

## Historical Success Boosting

Skills that have been used successfully in recent sessions get a small score boost:

```typescript
export async function loadRecentUsageCounts(
  supabase: any,
  days = 14
): Promise<Record<string, number>> {
  const { data } = await supabase
    .from('agent_activity')
    .select('skill_name')
    .gte('created_at', since.toISOString())
    .eq('status', 'success')
    .order('created_at', { ascending: false })
    .limit(300);

  const counts: Record<string, number> = {};
  for (const row of (data || [])) {
    if (row.skill_name) {
      counts[row.skill_name] = (counts[row.skill_name] || 0) + 1;
    }
  }
  return counts;
}
```

The boost is capped at +5 to prevent popular skills from dominating. A skill that succeeds 50 times still only gets +5. This prevents a feedback loop where frequently-used skills crowd out less-used but equally relevant ones.

---

## The "Always Include" Escape Hatch

Some skills must always be available regardless of intent scoring:

```typescript
const alwaysInclude = new Set(['memory_read', 'memory_write', 'reflect']);
// These get score: 1000 — guaranteed inclusion
```

Core utilities like memory operations and reflection are always in the window. Without this, an agent might lose the ability to remember or self-assess when the conversation shifts topics.

---

## Edge Cases and Failure Modes

### Cold Start (No History)

When a new FlowPilot instance has no `agent_activity` data, historical boosting returns empty. The scorer falls back to pure synonym + metadata matching. This works well enough — the historical boost is a refinement, not a requirement.

### Short Messages

A message like "hi" or "help" has no meaningful intent signal. The scorer returns zero matches for most skills, then fills the remaining slots from zero-scored skills (round-robin). This effectively gives the LLM a diverse sample rather than an empty or random set.

### Ambiguous Intent

"Can you handle that thing from yesterday?" — no keywords, no intent. The scorer defaults to a broad mix. The LLM handles disambiguation through conversation context, which the scorer can't see (by design — it's stateless).

---

## Measuring Accuracy

FlowPilot's Service Room includes a **Layer 9: Skill Selection Accuracy Benchmark** that tests whether the scorer + LLM combination picks the right skill for known intents:

```
Test: "skapa ett blogginlägg om SEO" → Expected: manage_blog
Test: "kolla mina mejl"             → Expected: composio_gmail_scan  
Test: "boka ett möte imorgon"       → Expected: manage_bookings
Test: "kvalificera den här leaden"  → Expected: qualify_lead
```

Current accuracy: **>90%** across the benchmark suite. The remaining <10% are genuinely ambiguous cases where multiple skills could be valid.

---

## The Design Philosophy

The intent scorer embodies a specific philosophy about agent architecture:

1. **Pre-filter, don't pre-decide** — The scorer narrows options. The LLM decides. The scorer can be wrong (include an irrelevant skill) without consequence. But if it *excludes* the right skill, the agent fails.

2. **Cheap before expensive** — A <1ms dictionary lookup before a 2000ms LLM call. The cheap filter makes the expensive call faster and more accurate.

3. **Language-aware, not language-dependent** — Swedish synonyms work alongside English ones. Adding German, Spanish, or Japanese is a matter of extending the map — no architectural changes needed.

4. **Observable** — The scorer logs its work: `[intent-scorer] 109 skills → 25 (18 intent-matched, expanded: 12 terms)`. You can always see what happened and why.

---

*The best routing is invisible routing. The user types in their language, about their problem, and the right skill appears — not because someone wrote a routing rule, but because the skill described itself well and the scorer found the match. That's the difference between a brittle chatbot and a resilient agent.*
