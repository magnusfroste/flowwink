---
name: Edge supabase-client factory
description: Single source of truth for createClient() in edge functions — getServiceClient/getUserClient/resolveCaller helpers
type: preference
---

All edge functions ska använda `_shared/supabase-clients.ts` istället för att inline-anropa `createClient(SUPABASE_URL, SERVICE_ROLE_KEY, ...)`.

**Helpers:**
- `getServiceClient()` — admin/server-side writes (bypassar RLS)
- `getUserClient(authHeader)` — RLS som calling user (returnerar null om auth saknas)
- `getAnonClient()` — public reads under RLS
- `resolveCaller(authHeader)` — returnerar `{ user, client }` eller `{ error }`

**Why:** ~48 edge functions duplicerade samma createClient-mönster med små variationer (persistSession-flaggor, hard-codade SDK-versioner). En central factory ger konsekvent beteende, lättare att audita service_role-användning, och en enda plats att uppdatera SDK-versionen.

**How to apply:**
- Nya edge functions: använd helpers från första raden.
- Migration av existerande: opt-in, en function i taget. Beteendet är identiskt så swap är säker.
- agent-execute behåller inline `createClient` tills handlers/* extraheras (handler-plugins capturer `supabase` från outer scope).

**Rules:**
- Logga aldrig service_role-nyckeln.
- Konstruera aldrig service-client i kodväg som tar untrusted input utan efterföljande role/permission-check.
- Public-facing endpoints: föredra `getUserClient()` så RLS gäller.
