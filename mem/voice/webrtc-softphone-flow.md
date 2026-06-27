---
name: WebRTC Softphone Flow (46elks)
description: Working inbound call routing from 46elks DID → agent Softphone in /admin/live-support, with voice_calls log surfacing in /admin/voice
type: feature
---

# WebRTC Softphone — verified working flow

## Setup (46elks)
- **Publikt nummer** (t.ex. `+46766869527`): vanligt Mobile/DID-abonnemang. Detta är det enda numret externa ringer.
- **WebRTC-konto** (t.ex. `4600120312`): inget riktigt nummer — en SIP/WebRTC-användare (30 kr/mån). En per agent.
- Båda kontona kräver att `voice_start`-webhook pekar på `https://<project>.supabase.co/functions/v1/elks46-ingest` för att checkbox ska bli grön i 46elks UI.
- Inga separata webhooks behövs för WebRTC-kontot funktionellt; bara för att aktivera det.

## Routing-kontrakt (elks46-ingest)
- När `voice_start` kommer in på publikt nummer letar `elks46-ingest` upp online-agent med `voice_enabled=true` i `support_agents`.
- 46elks **kräver telefon-format för intern WebRTC-routing**, inte SIP-URI:
  - `support_agents.voice_sip_uri` kan lagras som `sip:4600120312@voip.46elks.com` (för UI-tydlighet)
  - `connectTargetForAgent()` i `elks46-ingest` konverterar till `+4600120312` innan callout
  - Att skicka `connect: sip:...` ger felet `"This SIP server (voip.46elks.com) is not one of your allowed servers"` och samtalet fall-throughar till voicemail.
- Fallback: om ingen agent svarar/online → voicemail-flöde med inspelning och transkription.

## Agent-flöde (UX)
1. Agent öppnar `/admin/live-support`, väntar på Softphone badge `registered`.
2. Inkommande samtal → toast + ringsignal i Softphone-kortet (`ActiveCallsPanel` visar också ringing-card).
3. Agent svarar i webbläsaren (jssip via 46elks WSS `wss://voip.46elks.com/w1/websocket`).
4. När samtalet avslutas → raden i `voice_calls` flyttas från status `ringing`/`answered` → `completed` och visas i `/admin/voice` (call log + recording om voicemail).
5. Recording-uppspelning går via `voice-recording` edge-proxyn (server-side Basic Auth mot 46elks), inte direkt mot 46elks URL.

## Moduluppdelning
- `voice` modulen äger: voice_calls, recordings, IVR, voicemail, Softphone-komponenten, /admin/voice.
- `liveSupport` modulen äger: agent presence, claim-lifecycle, ActiveCallsPanel surface i /admin/live-support.
- Live Support är **aggregator-vy** — visar voice_calls ringing/voicemail/callbacks men äger inte datat.

## Gotchas
- Ändra inte `voice_sip_uri` till bara `sip:<username>` — 46elks tolkar det som extern SIP-trunk och nekar.
- Webhook-URL i 46elks portal måste vara `elks46-ingest` (ingen `elks46-voice-start` finns).
- WebRTC-kontot är en *kapacitet*, inte ett nummer — externa kan inte ringa det direkt.
