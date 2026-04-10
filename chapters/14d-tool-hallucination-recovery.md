---
title: "Tool Hallucination Recovery"
description: "What happens when the LLM generates malformed tool calls — and the production patterns that keep autonomous agents running despite imperfect reasoning."
order: 29
icon: "wrench"
---

> **TL;DR:** LLMs hallucinate tool calls — inventing parameters, calling nonexistent functions, or misrouting intents. Recovery requires validation layers, graceful error handling, and re-prompting strategies that turn failures into learning.


# Tool Hallucination Recovery — When the Model Gets Creative With Your Tools

> **Nobody talks about this. Every production agent experiences it. The LLM generates a tool call that doesn't exist, passes invalid arguments, or invents a function name that sounds plausible but isn't real. If your agent crashes on the first hallucinated tool call, it's not production-ready.**

---

## The Problem Nobody Writes About

LLMs don't call tools the way a programmer calls functions. They *predict* tool calls based on the names and schemas in the prompt. This prediction can fail in several distinct ways:

```
Category 1: PHANTOM TOOLS
  Agent calls "update_customer_profile" — a tool that doesn't exist.
  The name sounds reasonable. The LLM interpolated from skills it has seen.

Category 2: ARGUMENT HALLUCINATION
  Agent calls "manage_blog" with { "mode": "super_publish" }
  The tool exists, but "super_publish" is not a valid mode.

Category 3: SCHEMA DRIFT
  Agent calls "memory_write" with { "content": "..." }
  The actual parameter is "value", not "content".

Category 4: TYPE COERCION
  Agent passes "42" (string) where a number is expected,
  or wraps an argument in an extra object layer.
```

In testing, these happen rarely — maybe 1-3% of tool calls. In production, with hundreds of heartbeats and thousands of interactive sessions, 1% means *multiple hallucinated calls per day*.

---

## The Recovery Stack

FlowPilot handles tool hallucinations through a three-layer recovery approach:

### Layer 1: Graceful Catch

The streaming loop wraps every tool call in a try-catch that doesn't abort the entire reasoning chain:

```typescript
// In the tool execution loop
for (const toolCall of assistantMessage.tool_calls) {
  try {
    const result = await executeBuiltInTool(
      supabase, supabaseUrl, serviceKey,
      toolCall.function.name,
      JSON.parse(toolCall.function.arguments)
    );
    toolResults.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify(result),
    });
  } catch (err) {
    // Don't crash — feed the error back to the model
    toolResults.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify({
        error: err.message,
        hint: 'This tool call failed. Check the function name and arguments.',
      }),
    });
  }
}
```

The key insight: **the error becomes a tool result**. The LLM sees its own mistake and can self-correct on the next reasoning iteration.

### Layer 2: Malformed Result Tolerance

When parsing tool results from auto-chaining (one tool's output feeding the next), the system tolerates parse failures silently:

```typescript
for (const tr of toolResults) {
  try {
    const parsed = JSON.parse(tr.content);
    const result = parsed?.result || parsed;
    if (result?._next_action?.instruction) {
      chainingDirective = result._next_action.instruction;
      break;
    }
  } catch {
    // Ignore malformed tool results and continue
    // The chain doesn't break — it just doesn't auto-advance
  }
}
```

This is defensive by design. A malformed result from one tool doesn't prevent the agent from processing results from other tools in the same batch.

### Layer 3: Continuation Nudge

After processing tool results, the system injects a nudge that prevents the LLM from "narrating" instead of acting:

```typescript
conversationMessages.push({
  role: 'system',
  content: chainingDirective
    ? `MANDATORY NEXT STEP: ${chainingDirective}`
    : 'IMPORTANT: If your task requires more steps, call the next tool NOW. '
    + 'Do NOT describe what you will do — just do it by calling the tool. '
    + 'Only respond with text when ALL tool calls are complete.',
});
```

Without this nudge, the LLM often responds to a tool error by *describing* what it would do differently — without actually doing it. The continuation nudge forces the model back into tool-calling mode.

---

## The Forced Summary Fallback

When the agent exhausts its tool iteration limit without producing a final response (common after hallucination recovery loops), the system forces a clean exit:

```typescript
if (!producedFinalResponse) {
  // Report any skill results collected so far
  if (allSkillResults.length > 0) {
    await sseEvent(writer, encoder, 'skill_results', allSkillResults);
  }

  // Force a concise summary instead of leaving the user hanging
  const forcedConversation = [
    ...conversationMessages,
    {
      role: 'system',
      content: 'Stop calling tools now. Summarize what was completed, '
             + 'what failed, and the next best step in max 6 lines.',
    },
  ];

  await streamFinalResponse(
    apiUrl, apiKey, model, forcedConversation,
    writer, encoder,
    'I completed several steps but reached the iteration limit. '
    + 'Please ask me to continue from this point if needed.',
  );
}
```

This ensures the user always gets a response, even after a messy recovery loop. The fallback message is honest about what happened — "I reached the limit, here's where I got to."

---

## SSE Keepalives: The Silent Hero

Tool hallucination recovery takes time — the model calls a bad tool, gets an error, reasons about it, tries again. During this, the HTTP connection might time out if the client sees no data.

FlowPilot sends SSE keepalive comments every 10 seconds:

```typescript
const keepalive = setInterval(async () => {
  try {
    await writer.write(encoder.encode(': keepalive\n\n'));
  } catch {
    clearInterval(keepalive);
  }
}, 10_000);
```

SSE comments (lines starting with `:`) are ignored by the EventSource client but keep the TCP connection alive. This is invisible to the user but critical for long reasoning chains where recovery might take 30-40 seconds.

---

## Patterns That Reduce Hallucination Rate

Prevention is better than recovery. These patterns reduce the frequency of hallucinated tool calls:

### 1. Descriptive Function Names

```
BAD:   manage_x        → LLM might guess manage_x_advanced, manage_x_v2
GOOD:  manage_blog_post → unambiguous, matches natural language
```

### 2. Use When / NOT For Markers

```
description: "Create or update blog posts. Use when: user asks to write, 
draft, or publish blog content. NOT for: pages, newsletters, KB articles."
```

The `NOT for:` marker is often more important than `Use when:` — it explicitly prevents the most common mis-selections.

### 3. Bounded Schemas

```json
{
  "mode": { "type": "string", "enum": ["create", "update", "delete"] }
}
```

Enums prevent argument hallucination. Without them, the LLM might invent modes like `"super_publish"` or `"auto_draft"`.

### 4. Intent-Based Filtering

If only 25-30 relevant skills are in the prompt instead of 109, the LLM has fewer names to confuse. The intent scorer (see [Chapter 06c](06c-intent-scoring.md)) reduces hallucination by reducing the surface area for confusion.

---

## Measuring Hallucination Rate

Every tool call can be classified:

| Category | What happened | How to count |
|---|---|---|
| **Valid call** | Tool exists, arguments valid, execution succeeded | `agent_activity.status = 'success'` |
| **Valid call, execution failed** | Tool exists, arguments valid, handler errored | `agent_activity.status = 'error'` |
| **Argument hallucination** | Tool exists, arguments invalid | Caught in handler validation |
| **Phantom tool** | Tool doesn't exist | `isBuiltInTool()` returns false + not in skill registry |

Track the ratio over time. A healthy system has < 2% phantom tool calls. If the rate climbs, check:
- Are too many skills loaded? (Intent scorer may need tuning)
- Did a skill name change? (Old name still in model's "memory")
- Is the model tier appropriate? (Faster/cheaper models hallucinate more)

---

## The Anti-Patterns

| Anti-Pattern | What happens | Fix |
|---|---|---|
| Crash on unknown tool | One bad call kills the entire session | Try-catch with error-as-result |
| No continuation nudge | LLM narrates recovery instead of retrying | Inject "call the tool NOW" system message |
| No forced summary | Session hangs after max iterations | Force a clean exit with summary |
| No keepalive | Gateway timeout during recovery | SSE comments every 10s |
| Ambiguous tool names | LLM confuses similar tools | Descriptive names + NOT for markers |
| Open-ended schemas | LLM invents argument values | Use enums for bounded fields |

---

*Tool hallucination is not a bug — it's a property of probabilistic reasoning. The measure of a production agent is not whether it hallucinates, but whether it recovers gracefully when it does. Build for the 1%, because in production, 1% happens every day.*

*Next: running a swarm of autonomous agents on your own infrastructure. [ClawStack →](17-clawstack.md)*

---

> **Part V begins here.** The engineering is done. The final chapters look forward — swarm architectures, browser automation, and the trajectory of agentic AI. From here, it's vision.
