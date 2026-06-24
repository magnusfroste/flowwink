---
name: Comms Gateway Consolidation Plan
description: Deferred plan to merge Live Support (+7) and Voice (+1) edge functions into a single comms-gateway (+2)
type: feature
---
# Comms Gateway Consolidation (DEFERRED)

Status: planned, not yet implemented. User parkerade — tar lättare saker först.

## Mål
Slå ihop Live Support-ingress (twilio-ingest, elks46-ingest, gatewayapi-ingest, telegram-ingest, voice-ingest, support-router, csat-dispatch) + voice till **`comms-gateway`** + **`contact-center`** = 2 edge functions (sparar ~6 slots).

## Arkitektur
- `supabase/functions/comms-gateway/index.ts` — Hono-router
- `_shared/comms/types.ts` — `NormalizedMessage`, `NormalizedCall`
- `_shared/comms/persist.ts` — skriver till `chat_conversations` / `chat_messages` / `voice_calls` (samma RPCs som idag)
- `_shared/comms/dialplan.ts` — bygger provider-specifik voice-response
- `_shared/comms/adapters/{twilio,elks46,gatewayapi,telegram}.ts` — verify/parse/send/test per provider

## URLs
- `POST /comms-gateway/inbound/{provider}[/sms|/voice]` — provider via path (för signaturverifiering)
- `POST /comms-gateway/send` — `{provider, channel, to, body}` (admin JWT)
- `POST /comms-gateway/test` — `{provider}` (admin JWT)

## Migration (3 commits)
1. Deploy gateway + adapters (gamla funktioner kvar)
2. Admin-UI "Update webhook URLs" i Integrations (side-by-side gammal/ny + copy)
3. CSAT → `pg_cron`, ta bort `support-router`
4. Efter 30 dagar utan trafik på gamla URLs → ta bort gamla ingest-funktioner

## Estimat
~600 LOC gateway (vs ~1900 idag, -70%), ~80 LOC migrations, ~30 SQL-rader för CSAT-cron. Inga schemaändringar.

## Vad vi INTE gör
- Lovable Connector Gateway (46elks saknas)
- Schemaändringar på voice_calls/chat_conversations
- Flytta `contact-center` (agent skill handler, inte webhook)
