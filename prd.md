# FlowWink — PRD

Levande produktkravsdokument. Nya moduler, block och features dokumenteras här när de tillkommer. Konsolidera mot `docs/modules/` när omfattningen växer.

---

## Voice (ny modul, v0.1.0)

### Problem

Live Support hanterar idag text (web chat, Telegram, SMS via 46elks). Visitors som vill prata — supportärenden, säljförfrågningar — har ingen väg in. Telefonnummer är fortfarande den vanligaste "ring oss"-CTA:n på företagswebbar i Norden.

### Mål

Lägga till röst som en första-klassens kanal i Live Support, utan att låsa plattformen till en specifik telecom-provider. Open-source-projektet ska fungera på vilken marknad som helst — `elks46` för Norden, `twilio` för globalt, fler kommer.

### Scope (fas 1 — MVP)

Se [docs/modules/voice.md](docs/modules/voice.md) för fullständiga use cases (UC1–UC4) och fas-plan.

**Levereras nu:**
- Pluggable provider-arkitektur (`VoiceProvider`-kontrakt + adapter-registry)
- 46elks-adapter (komplett), Twilio-adapter (stub som bevisar kontraktet)
- Provider-agnostisk edge function `voice-ingest`
- Tabell `voice_calls` + utökning av `support_agents` med SIP/mobil-fält
- 3 MCP-exponerade skills: `list_voice_calls`, `schedule_voice_callback`, `mark_voice_callback_done`
- Modul-registrering med opt-in via `voice` flag i `ModulesSettings`

**Kommer i fas 2/3:**
- Browser WebRTC-klient i admin (jssip mot 46elks SIP-WSS)
- Voicemail-transkription via STT
- UC4: booking-IVR med slot-förslag
- Realtime AI voice agent (WebSocket-stream)
- Full Twilio + fler providers

### Designprinciper

- **Decoupling:** voice-modulen och live-support importerar inte varandra. Kommunikation via platform event bus (`voice.call.*`).
- **Provider-neutralitet:** All UI, routing, voicemail-kö, callback-flöde är gemensam kod. Bara transport-lagret (parse + serialize) skiljer sig per provider.
- **Capability-gated UI:** WebRTC-knapp visas bara om vald providers `capabilities.webrtc === true`. Fallback: forward-to-mobile fungerar för alla providers.
- **+1 edge function totalt.** Provider-val sker i kod, inte via separata functions.

### Senare-att-dokumentera

Detta dokument kompletteras när fas 2 levereras (WebRTC-klient, transkription, IVR).
