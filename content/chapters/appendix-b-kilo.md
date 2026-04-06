---
title: "Appendix B: Kilo Code"
description: "The agentic coding tool used to write this handbook — how it works under the hood, hidden gems, and why it matters in the broader ecosystem."
order: 98
icon: "cpu-chip"
appendix: true
---

# Appendix B: Kilo Code — The Tool That Built This Handbook

> *Full disclosure: Kilo Code is the agent used to research, write, verify, and maintain every chapter in this handbook. This is written from direct operational experience — not a review.*

---

## What Kilo Is

[Kilo Code](https://kilo.ai) ([Kilo-Org/kilocode](https://github.com/kilo-org/kilocode), 17,467 stars) is an open-source agentic coding platform — VS Code extension, JetBrains extension, and CLI. It is the **#1 coding agent on OpenRouter** with 1.5M+ users and 25T+ tokens processed.

It is built on the same architectural principles discussed throughout this handbook: a ReAct loop, a tool system, a permission model, custom agents, and skills. Understanding how Kilo works is understanding how the agentic control plane works in practice — because you are reading text that was produced by it.

---

## Under the Hood — The Architecture

### The Reasoning Loop

Kilo's core is a ReAct loop identical in structure to what we described for Claude Code and FlowPilot:

```
Your message
      │
      ▼
System prompt assembly:
  - Agent instructions (AGENTS.md + .kilo/agent/*.md)
  - Custom rules (kilo.json instructions field)
  - Tool definitions (all permitted tools)
  - Session context
      │
      ▼
LLM call (your chosen model — 500+ available)
      │
      ▼
Response: text + tool calls
      │
      ├── Text only → display to user
      └── Tool calls → execute with permission check
                            │
                            ▼
                      Tool result → back to LLM
                      (loops until no more tool calls)
```

**The key difference from most coding assistants:** Kilo is model-agnostic. The same loop runs against Claude Opus 4.6, GPT-5, Gemini 2.5 Pro, DeepSeek, Grok, or any local model via Ollama. The control plane is yours — the model is a pluggable component.

### The Tool System

Kilo has ~20 built-in tools, each with a permission model:

| Tool | Purpose | Permission |
|------|---------|------------|
| `Read` | Read files | `read` |
| `Edit` | Targeted string replacement | `edit` |
| `Write` | Write full file | `edit` |
| `Bash` | Execute shell commands | `bash` |
| `Glob` | Find files by pattern | `read` |
| `Grep` | Search file contents | `read` |
| `WebFetch` | Fetch URLs | `webfetch` |
| `WebSearch` | Web search (Exa AI) | `websearch` |
| `CodeSearch` | Search code patterns | `codesearch` |
| `Task` | Spawn subagent | `task` |
| `TodoWrite` | Manage task list | `todowrite` |
| `Question` | Ask user for input | `question` |
| `LSP` | Language server integration | `lsp` |
| `Skill` | Invoke a skill | `skill` |

**The permission model** is the same philosophy as NanoClaw and Flowwink's scope system — hierarchical, glob-pattern-based, evaluated top-to-bottom:

```jsonc
// kilo.json
{
  "permission": {
    "bash": "allow",        // allow all bash
    "edit": {
      "src/**": "allow",    // allow edits in src/
      "*.lock": "deny",     // never touch lockfiles
      "*": "ask"            // ask for everything else
    },
    "read": "ask"
  }
}
```

---

## The Agent System — Kilo's Equivalent of SOUL.md

This is where Kilo diverges most interestingly from OpenClaw and Claude Code.

### Custom Agents via `.kilo/agent/*.md`

Every agent is a markdown file with YAML frontmatter:

```markdown
---
description: When to use this agent
mode: primary        # primary | subagent | all
model: anthropic/claude-opus-4-6
steps: 25            # max iterations
color: "#FF5733"
permission:
  bash: allow
  edit:
    "src/**": allow
---

You are a senior TypeScript engineer specializing in Supabase Edge Functions.
Your job is to write, review, and deploy Deno-based edge functions...
```

This is OpenClaw's `SOUL.md` + `AGENTS.md` combined — but per-agent, version-controlled in the repo, hot-reloadable without restart.

**The `mode` field** is particularly powerful:
- `primary` → user-selectable main agent
- `subagent` → only callable via `Task` tool
- `all` → both

This maps directly to Flowwink's `scope: internal/external/both`. The pattern is universal.

### The Orchestrator Pattern

Kilo's `Task` tool spawns a subagent — a child session with its own context, running the same ReAct loop. The orchestrator assigns work; the subagent executes and returns a summary.

This is how this handbook was written: an orchestrator agent decomposed large chapters into research tasks, spawned `explore` and `general` subagents for parallel work, and assembled results. The same pattern as Claude Code's `Task` tool and FlowPilot's `delegate_task` built-in.

**A production Kilo config for complex documentation work:**

```jsonc
// .kilo/agent/researcher.md
---
description: Deep research agent — use for verifying facts, searching GitHub, fetching sources
mode: subagent
hidden: true
model: anthropic/claude-sonnet-4-5  // cheaper model for research
steps: 15
permission:
  bash: allow
  webfetch: allow
  websearch: allow
---
You research claims and return verified findings with sources.
Never guess. If you can't verify, say so explicitly.
```

```jsonc
// .kilo/agent/writer.md
---
description: Technical writing agent — structured, source-cited prose
mode: subagent
hidden: true
model: anthropic/claude-opus-4-6   // best model for writing
steps: 20
permission:
  read: allow
  edit:
    "src/content/**": allow
    "*": deny
---
You write handbook chapters. Claims must cite source files or verified URLs.
OpenClaw architecture claims require source code verification first.
```

---

## Hidden Gems — What Most Users Don't Know

### 1. AGENTS.md is natively supported

Kilo reads `AGENTS.md` at project root automatically — the same file OpenClaw uses. If you have an OpenClaw workspace and open it in Kilo, your `AGENTS.md` rules are immediately active. This is not accidental. The design is intentionally compatible.

### 2. `/fork` — Branch from any point in history

```
/fork
```

Creates a new session branching from the current message. Everything before the fork point is preserved; the new session starts clean from there. This is git branching for conversations — invaluable when you want to try a different approach without losing what worked.

### 3. `compaction.auto` — Context management done right

When the context window fills, Kilo auto-compacts by summarizing old tool outputs and pruning stale content. The summary preserves what matters; the raw tool output is discarded. This is the same mechanism as Flowwink's `SUMMARY_THRESHOLD` — manages token spend without losing continuity.

```jsonc
{
  "compaction": {
    "auto": true,   // auto-compact when context fills
    "prune": true   // prune old tool results
  }
}
```

### 4. Custom slash commands via `.kilo/command/*.md`

```markdown
// .kilo/command/verify-chapter.md
---
description: Verify all claims in a chapter against source code
agent: researcher
subtask: true
---
Verify every factual claim in @$1 against the OpenClaw source code
at /Users/mafr/Code/github/openclaw. Return a list of:
- VERIFIED claims with source file:line
- UNVERIFIABLE claims that need removal
- INCORRECT claims with corrections
```

Now `/verify-chapter src/content/chapters/03-openclaw-architecture.md` runs a full fact-check as a subtask. This is how the source-code verification in this handbook was done systematically.

### 5. Skills — The `SKILL.md` System

Kilo uses the exact same `SKILL.md` format as OpenClaw and NanoClaw:

```
.kilo/
  skill/
    verify-openclaw/
      SKILL.md       ← loaded lazily, only when needed
    audit-chapter/
      SKILL.md
```

```markdown
// .kilo/skill/verify-openclaw/SKILL.md
---
name: verify-openclaw
description: Verify architectural claims against OpenClaw source code
---
## Instructions
When asked to verify OpenClaw claims:
1. Read the relevant source file directly
2. Confirm or deny the claim with exact line reference
3. If not found, search with grep before concluding false
...
```

This is the same pattern from OpenClaw's ClawHub to NanoClaw's SKILL.md transforms to Flowwink's `agent_skills` table. The format converged because it works.

### 6. `snapshot: true` — Git snapshots before destructive edits

```jsonc
{ "snapshot": true }
```

Before any significant edit, Kilo takes a git snapshot — a lightweight commit that can be restored with `/undo`. This is the reversibility principle from Singapore's AIGL governance framework (chapter 14) applied at the tooling level.

### 7. The `doom_loop` permission

There is a permission called `doom_loop`. It prevents the agent from getting stuck in infinite retry loops. The name is honest. The existence of a dedicated permission for it is more honest.

---

## The Model Strategy — 500+ Models, One Interface

Kilo's model-agnosticism is its most underappreciated feature. The same agent config works with:

```jsonc
// Development (fast, cheap)
{ "model": "anthropic/claude-sonnet-4-5" }

// Production (best quality)
{ "model": "anthropic/claude-opus-4-6" }

// Private / on-premise (Autoversio-style)
{
  "provider": {
    "local": {
      "options": {
        "baseURL": "http://localhost:11434/v1",
        "apiKey": "ollama"
      }
    }
  },
  "model": "local/llama3.3:70b"
}
```

The Kilo Gateway (`kilo.ai/gateway`) provides a unified API across all providers — the same LiteLLM proxy pattern described in Appendix A, but managed and with usage tracking built in.

For this handbook: Claude Opus 4.6 for writing and reasoning, Claude Sonnet 4.5 for research subagents, and the WebSearch tool (powered by Exa AI) for real-time verification.

---

## How Kilo Compares to the Landscape

Returning to the control plane comparison from chapter 6:

| Aspect | Kilo Code | Claude Code | Cline | OpenClaw |
|--------|-----------|-------------|-------|----------|
| Model-agnostic | ✅ 500+ models | ❌ Claude only | ✅ | ✅ |
| Custom agents | ✅ `.kilo/agent/*.md` | ❌ | ❌ | ✅ `SOUL.md` |
| AGENTS.md support | ✅ native | ✅ `CLAUDE.md` | ❌ | ✅ native |
| Subagent spawning | ✅ `Task` tool | ✅ `Task` tool | ❌ | ✅ `sessions_spawn` |
| Skills system | ✅ `SKILL.md` | ✅ MCP | ❌ | ✅ `SKILL.md` |
| Permission model | ✅ glob patterns | ✅ 5-layer | ✅ basic | ✅ allowlists |
| VS Code extension | ✅ | ❌ terminal | ✅ | ❌ |
| CLI | ✅ | ✅ | ❌ | ✅ gateway daemon |
| Open source | ✅ MIT | ✅ | ✅ MIT | ✅ MIT |
| Multi-agent teams | ✅ orchestrator | ✅ Teams/tmux | ❌ | ✅ sessions |
| Stars | 17,467 | — | 59k | 346k |

**The honest assessment:** Kilo is the most versatile of the VS Code-based agents. The model-agnosticism, the custom agent system, and the SKILL.md compatibility make it more configurable than Claude Code and more production-ready than Cline for complex, long-running tasks.

---

## The Meta-Point

The fact that an AI coding agent wrote, researched, and verified a handbook about AI coding agents is not a curiosity. It is a worked example of the core thesis.

Every chapter in this handbook was produced by the same loop: 
1. Objective set by a human
2. Agent reasons, plans, searches, verifies, writes
3. Human reviews and calibrates
4. Agent iterates

The agent read source code in `/Users/mafr/Code/github/openclaw`. It fetched URLs. It searched GitHub. It ran builds. It fixed errors. It tracked todos. It spawned subagents for parallel research.

The human made decisions about structure, voice, emphasis, and accuracy. The agent handled execution.

That is the collaboration model described in chapter 12 (Human-in-the-Loop) and chapter 14 (Agent Governance) — not as theory, but as the exact workflow that produced this text.

---

*Kilo Code is available at [kilo.ai](https://kilo.ai) and [github.com/Kilo-Org/kilocode](https://github.com/Kilo-Org/kilocode). Open source, MIT licensed. The `.kilo/` configuration files from this project are available in the repository.*

*Built with Kilo. Verified against source. Honest about what we don't know.*
