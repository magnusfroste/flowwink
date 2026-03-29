

# Refactor: Unified AI Provider + Full Separation of Concerns

## Problem

Two edge functions bypass the shared `resolveAiConfig` system:

1. **`migrate-page`** — hardcoded `openaiKey`/`geminiKey` checks, uses deprecated Gemini native API (not OpenAI-compatible), no Lovable AI fallback, deprecated model `gemini-2.0-flash-exp`
2. **`copilot-action`** — has its own `getAIConfiguration()` (lines 66-141) reading from `integrations` settings key instead of `system_ai`, deprecated model `gpt-4o-mini`

Both violate the Layer 1 architecture where `resolveAiConfig` is the single source of truth.

## Plan

### Step 1: Refactor `migrate-page` to use `resolveAiConfig`

- Import `resolveAiConfig` from `../_shared/ai-config.ts`
- Create a Supabase service client (same pattern as `analyze-brand`)
- Replace lines 792-799 (manual key check + `useGemini` flag) with:
  ```ts
  const { apiKey, apiUrl, model } = await resolveAiConfig(supabase, 'reasoning');
  ```
- Replace the dual AI call (lines 1140-1181) with a single OpenAI-compatible fetch to `apiUrl`
- Remove the dual response parsing (lines 1210-1214) — unified format: `choices[0].message.content`
- Delete the `openaiKey`/`geminiKey` variables (line 752-753) — only `firecrawlKey` stays
- Return `aiProvider` info in response for traceability

### Step 2: Refactor `copilot-action` to use `resolveAiConfig`

- Import `resolveAiConfig` from `../_shared/ai-config.ts`
- Delete the entire `getAIConfiguration()` function (lines 66-141)
- Replace `aiConfig = await getAIConfiguration()` with `resolveAiConfig(supabase, 'fast')`
- The existing fetch to `aiConfig.apiUrl` already works since copilot uses OpenAI-compatible format
- Create Supabase service client for the config resolution

### Step 3: Deploy both functions

- Deploy `migrate-page` and `copilot-action`
- Verify with function logs

## Impact

- **Fallback chain works everywhere**: OpenAI → Gemini → Lovable AI → Local
- **Model migration automatic**: deprecated names resolved by `ai-config.ts` maps
- **Single code path**: no more `useGemini` branching or dual response parsing
- **Zero UI changes**: all consumers (FlowPilot skills, MigratePageDialog, CompanyProfileCard, Brand Guide) benefit transparently

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/migrate-page/index.ts` | Replace manual AI logic with `resolveAiConfig`, unify to single fetch path |
| `supabase/functions/copilot-action/index.ts` | Delete `getAIConfiguration()`, use shared `resolveAiConfig` |

