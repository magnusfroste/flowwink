---
name: AI Receptionist Target Architecture
description: Target/vision for AI-driven voice answering via 46elks WebSocket Media Streams — parked, not implemented
type: feature
---

## Status
**Parked vision** — not implemented. The current working 46elks number is a WebSocket Media Streams number (not WebRTC/SIP softphone). Softphone path remains as the active human-reception fallback.

## Why parked
- OpenAI Realtime API works but is too expensive for routine dentist-receptionist load
- Self-hosted Whisper STT + LLM + TTS on a private server is the GDPR-friendly target (dentist = patient data, must stay on-prem / EU)
- Build it when there's concrete demand; until then, don't pay infra cost

## Target architecture (when revisited)
```
46elks number (WebSocket Media Streams, µ-law 8kHz)
   → wss://<host>/elks46-voice-ws  (Supabase edge OR self-hosted relay)
   → Whisper STT (private server, streaming)
   → chat-completion (FlowPilot context: KB, business identity, bookings)
   → TTS (private server, e.g. Piper / XTTS)
   → audio frames back to 46elks
```

## Decisions already made
- Provider stack: **Whisper STT + LLM + TTS, all self-hosted on private server** (GDPR for healthcare verticals like dentists). NOT OpenAI Realtime in production.
- Keep softphone (WebRTC/SIP) path alive as human-reception fallback — do not remove.
- 46elks number config: `websocket_url` points at the relay endpoint when activated.

## What exists today
- `elks46-ingest` edge function (incoming call webhook, no credentials in payload)
- `get_webrtc_credentials` action in `elks46-ingest` (auto-fills SIP creds for softphone)
- `AgentVoiceConfigCard.tsx` with "Auto-fill from 46elks" button
- Softphone component (`Softphone.tsx`) for human reception via WebRTC/SIP

## To resume
1. Create `elks46-voice-ws` edge function (or self-hosted Node/Deno relay) accepting µ-law 8kHz base64-in-JSON frames per 46elks Media Streams spec
2. Wire STT → chat-completion → TTS pipeline
3. Set `websocket_url` on the 46elks number
4. Add UI in `/admin/voice` to toggle "AI receptionist" vs "human softphone" per number
