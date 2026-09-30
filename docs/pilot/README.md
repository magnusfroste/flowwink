---
title: "pilot/ — index"
description: FlowPilot internals: the ReAct loop, prompt compiler, memory, heartbeat, failover, autonomy model.
category: general
---

# `pilot/`

> FlowPilot internals: the ReAct loop, prompt compiler, memory, heartbeat, failover, autonomy model. Audience: builders.

| Page | What it is |
|---|---|
| [`architecture.md`](./architecture.md) | Pilot Architecture — Deep Dive — When more than 25 skill tools are loaded, reason() narrows them to the 25 most relevant using the shared Skill Relevance Engine (scoreSkills… |
| [`autonomy-model.md`](./autonomy-model.md) | FlowPilot Autonomy Model — FlowPilot operates through three distinct execution modes. |
| [`compaction.md`](./compaction.md) | Context Compaction — The LLM context window is finite (80,000 tokens in Pilot). |
| [`context-engine.md`](./context-engine.md) | Context Engine — OpenClaw pattern: 9-layer prompt architecture assembled from workspace files |
| [`dreaming.md`](./dreaming.md) | Dreaming (Reflection & Learning) — 'Dreaming' is the process where the agent steps back from execution and reflects on what happened. |
| [`handlers-reference.md`](./handlers-reference.md) | Pilot Handler Reference — Upserts to agentmemory. Auto-generates vector embedding (OpenAI or Gemini fallback). Categories: preference, context, fact. |
| [`memory.md`](./memory.md) | Memory Architecture — Pilot implements a tiered memory system that mirrors how human memory works — fast short-term recall at the top, deep semantic search at the… |
| [`model-failover.md`](./model-failover.md) | Model Failover & Provider Routing — OpenClaw pattern: Model aliases with provider-agnostic routing |
| [`module-dependencies.md`](./module-dependencies.md) | FlowPilot Module Dependencies — FlowWink is designed as a Human-First platform where every module provides full manual functionality out of the box. |
| [`presence.md`](./presence.md) | Presence (Heartbeat Protocol) — Presence is how the agent stays active without human interaction. |
| [`sensors-vs-reasoning.md`](./sensors-vs-reasoning.md) | Sensors vs. Reasoning — The Shadow Brain Boundary — FlowPilot follows a strict separation between Sensors (data transformation) and Reasoning (strategic intelligence). |
