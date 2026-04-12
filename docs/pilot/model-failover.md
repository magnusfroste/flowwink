---
title: Model Failover & Provider Routing
summary: How Pilot resolves AI providers with automatic fallback chains
read_when: Configuring AI providers, debugging model resolution, or adding new providers
---

# Model Failover & Provider Routing

> **OpenClaw pattern:** Model aliases with provider-agnostic routing
> **Pilot implementation:** `ai-config.ts` — single source of truth for all AI provider resolution

---

## Resolution Chain

`resolveAiConfig(supabase, tier)` returns `{ apiKey, apiUrl, model }` by checking sources in order:

```
1. site_settings.system_ai (admin-configured provider preference)
   │
   ├── provider: 'local'     → Local LLM endpoint from integrations config
   ├── provider: 'anthropic' → Anthropic API (if ANTHROPIC_API_KEY set)
   ├── provider: 'gemini'    → Gemini API (if GEMINI_API_KEY set)
   └── provider: 'openai'    → OpenAI API (if OPENAI_API_KEY set)
   │
   │  If configured provider's key is missing, fall through ↓
   │
2. Auto-detect from environment variables
   │
   ├── OPENAI_API_KEY exists?    → OpenAI
   ├── ANTHROPIC_API_KEY exists? → Anthropic
   └── GEMINI_API_KEY exists?    → Gemini
   │
   │  If no keys found ↓
   │
3. throw Error('No AI provider configured')
```

## Tier System

Two tiers control model selection:

| Tier | Purpose | Default Models |
|------|---------|---------------|
| `fast` | Everyday operations, chat, quick tasks | `gpt-4.1-mini` / `gemini-2.5-flash` / `claude-sonnet-4` |
| `reasoning` | Complex planning, decomposition, analysis | `gpt-4.1` / `gemini-2.5-pro` / `claude-sonnet-4` |

Surfaces choose their tier:
- **Heartbeat** uses `reasoning` (complex multi-step planning)
- **Operate** uses `fast` by default (interactive speed)
- **Chat** uses `fast` (visitor-facing responsiveness)

## Model Migration Maps

Legacy model names are automatically mapped to current versions. This is transparent to callers — no configuration changes needed when models are updated:

### OpenAI
```
gpt-4o        → gpt-4.1
gpt-4o-mini   → gpt-4.1-mini
gpt-3.5-turbo → gpt-4.1-nano
gpt-4-turbo   → gpt-4.1
gpt-4         → gpt-4.1
```

### Gemini
```
gemini-1.5-pro      → gemini-2.5-pro
gemini-1.5-flash    → gemini-2.5-flash
gemini-2.0-flash-exp → gemini-2.5-flash
gemini-pro          → gemini-2.5-pro
```

## Provider API Endpoints

All providers use the OpenAI-compatible chat completions format, making the reasoning loop model-agnostic:

| Provider | API URL |
|----------|---------|
| OpenAI | `https://api.openai.com/v1/chat/completions` |
| Anthropic | `https://api.anthropic.com/v1/messages` |
| Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` |
| Local LLM | `{configured_endpoint}/v1/chat/completions` |

### Anthropic Special Handling

Anthropic uses a different request/response format. `isAnthropicProvider(apiUrl)` detects this, and the reasoning loop adapts:
- Different header format (`x-api-key` instead of `Authorization: Bearer`)
- Different message structure (`content` array vs string)
- Different tool calling format

## Local LLM Configuration

Local LLMs are configured via the integrations settings:

```json
// site_settings.integrations.local_llm
{
  "config": {
    "endpoint": "http://localhost:11434",
    "model": "llama3",
    "apiKey": ""  // Optional — many local LLMs don't require one
  }
}
```

Local LLMs use a single model for both `fast` and `reasoning` tiers — most local models don't have tier variants.

## Embedding Provider Failover

For memory embeddings (768d vectors), a separate fallback chain applies:

```
1. OpenAI text-embedding-3-small (768d)
2. Gemini text-embedding-004 (768d)
```

Both produce 768-dimensional vectors, ensuring compatibility regardless of which provider generated the embedding.

## Adding a New Provider

To add a new AI provider:

1. Add migration map in `ai-config.ts` (if the provider has legacy model names)
2. Add detection block in `resolveAiConfig()` — both in the configured path and auto-detect path
3. Ensure the provider uses OpenAI-compatible API format, or add special handling like Anthropic
4. Add the environment variable name to the error message
5. Update `site_settings.system_ai` UI to include the new provider option

---

*See also: [Architecture](./architecture.md) · [Context Engine](./context-engine.md)*
