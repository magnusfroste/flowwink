---
title: Context Compaction
summary: How Pilot manages conversation history length through summarization and memory extraction
read_when: Debugging context overflow, working on conversation history, or tuning token budgets
---

# Context Compaction

> **OpenClaw pattern:** Context window management with summarization
> **Pilot implementation:** Two-phase compaction pipeline in `reason.ts` — extract facts, then summarize

---

## Why Compaction?

The LLM context window is finite (80,000 tokens in Pilot). Long conversations accumulate messages that eventually exceed this limit. Compaction solves this by:

1. **Extracting** discrete facts from old messages into persistent memory
2. **Summarizing** old messages into a condensed context block
3. **Preserving** recent messages intact for conversational continuity

## Thresholds

```
MAX_CONTEXT_TOKENS    = 80,000   — Hard context ceiling
SUMMARY_THRESHOLD     = 60,000   — Triggers compaction pipeline
MEMORY_FLUSH_THRESHOLD = 0.80    — Pre-budget flush (80% of token budget)
```

Token estimation uses the heuristic: `tokens ≈ characters / 4`.

## The Compaction Pipeline

```
pruneConversationHistory(messages, supabase)
  │
  ├── 1. Estimate total tokens across all messages
  │     └── If < SUMMARY_THRESHOLD (60k) → return unchanged
  │
  ├── 2. Split messages:
  │     ├── systemMessages (role: 'system')
  │     ├── oldMessages (first N conversation messages)
  │     └── recentMessages (last 10, or half — whichever is smaller)
  │
  ├── 3. Phase 1: Pre-Compaction Flush
  │     └── preCompactionFlush(oldMessages, supabase)
  │         ├── Send transcript to LLM (fast tier)
  │         ├── Extract up to 5 discrete facts
  │         └── Persist each as agent_memory entry with embedding
  │
  ├── 4. Phase 2: Summarization
  │     └── summarizeMessages(oldMessages, supabase)
  │         ├── Send transcript to LLM (fast tier)
  │         └── Generate 500-word summary
  │
  └── 5. Reassemble:
        [system messages] + [SUMMARY message] + [recent messages]
```

## Phase 1: Pre-Compaction Flush

Before discarding old messages, the pipeline extracts facts worth remembering:

```typescript
preCompactionFlush(oldMessages, supabase)
```

**LLM prompt:** "Extract discrete facts from this conversation that should be remembered long-term."

**Output format:**
```json
[
  { "key": "user_timezone", "value": "Europe/Stockholm", "category": "preference" },
  { "key": "stripe_live_mode", "value": "Switched to live mode on 2026-04-08", "category": "fact" }
]
```

**Constraints:**
- Max 5 facts per flush
- Keys are prefixed with `conv_` to distinguish from manually created memories
- Each fact is persisted via `handleMemoryWrite()` — which generates vector embeddings
- Categories: `preference`, `context`, `fact`

**What to extract:**
- User preferences and decisions
- Configuration choices
- Business facts (names, IDs, URLs, numbers)
- Explicit corrections
- Important outcomes

**What to skip:**
- Greetings, small talk
- Things obvious from the system prompt
- Temporary/session-specific details

## Phase 2: Summarization

After fact extraction, old messages are condensed:

```typescript
summarizeMessages(oldMessages, supabase)
```

**LLM prompt:** "Summarize this conversation history into a concise context summary (max 500 words). Preserve: key decisions, facts learned, actions taken, user preferences. Drop: greetings, filler, redundant details."

**Result:** Inserted as a system message:
```
[CONVERSATION SUMMARY — Earlier messages condensed for context]
The user configured Stripe integration in live mode. Three blog posts were
generated about sustainable architecture. The newsletter was set up with
weekly cadence targeting the 'architects' segment...
```

## Pre-Budget Flush

Separate from conversation compaction, the reasoning loop itself has a budget-aware flush:

At **80% token budget usage**, the loop:
1. Extracts facts from the current session
2. Saves them to memory
3. Shifts focus to completion rather than exploration

This prevents budget overruns from causing data loss.

## Safety Guards

| Guard | Threshold | Behavior |
|-------|-----------|----------|
| Min messages | ≤ 6 conversation messages | Skip compaction entirely |
| Transcript cap | 8,000 chars (flush) / 12,000 chars (summary) | Hard-cut input to LLM |
| Max tokens for flush LLM | 600 | Limit extraction response |
| Max tokens for summary LLM | 800 | Limit summary response |
| Flush failure | Any error | Non-fatal — compaction continues |
| Summary failure | Any error | Return messages without summary |

## Token Estimation

Pilot uses a simple character-based heuristic throughout:

```typescript
tokens ≈ Math.ceil(content.length / 4)
```

This is intentionally conservative (real tokenization varies by model). Tool calls are also counted:

```typescript
if (msg.tool_calls) {
  totalTokens += Math.ceil(JSON.stringify(msg.tool_calls).length / 4);
}
```

---

*See also: [Context Engine](./context-engine.md) · [Memory](./memory.md) · [Architecture](./architecture.md)*
