---
name: cors-x-chat-session
description: x-chat-session header is for PostgREST/RLS only — never inject into /functions/v1/ calls
type: constraint
---

# CORS: x-chat-session is PostgREST-only

**Rule:** The `x-chat-session` header must ONLY be sent on PostgREST requests
(`supabase.from(...)`), never on edge-function invocations
(`supabase.functions.invoke(...)` or any `/functions/v1/*` fetch).

**Why:** RLS policies on `chat_conversations` / `chat_messages` read the
header to match anonymous visitor sessions. No edge function reads it. If
the global fetch wrapper leaks it onto edge calls, CORS preflight fails on
every function that doesn't list it in `Access-Control-Allow-Headers` —
which is ~all of them. The bug detonates one function at a time as users
exercise them (composio-proxy 2026-06-25, newsletter 2026-06-26 — same root).

**How it's enforced:**
- `src/integrations/supabase/client.ts` checks `url.includes('/functions/v1/')`
  and skips the header for edge calls.
- Guardrail test `src/integrations/supabase/__tests__/client-cors.guardrails.test.ts`
  fails CI if the wrapper ever drops that check.

**If you regenerate `client.ts`:** re-apply the `isFunctionCall` exclusion
or the guardrail will fail and edge-function preflights will start breaking
one by one again.

**Do NOT "fix" this by adding `x-chat-session` to every function's CORS
allow-list.** That's whack-a-mole for a header no function actually reads.
Keep it scoped to PostgREST where it belongs.
