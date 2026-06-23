---
name: Web Voice Channel Strategy
description: Push-to-talk / web-voice as channel adapter in UC-gateway, with swappable STT→LLM→TTS providers (ElevenLabs, OpenAI Realtime, self-hosted Whisper)
type: feature
---

## Position in architecture
Web voice is **not** a separate module — it's a **channel adapter** in the UC-gateway model (see `mem://architecture/uc-gateway-model`). Same `conversation_id`, same `executor` routing (`flowpilot` for AI, `teammate` for live human pickup), same inbox UI in `/admin/inbox`.

Packaging follows the standard page+module+integration model:
- **Module:** `src/lib/modules/channels/voice-web-module.ts` — `aiRealtime` (or `voiceWeb`) feature flag
- **Integration:** provider creds (ElevenLabs API key, OpenAI API key, or self-hosted endpoint URL)
- **Page/Embed:** push-to-talk button block + floating widget, embeddable on any public page

## Provider abstraction (swappable)
Three tiers, all behind the same `VoiceProvider` interface (extend `src/lib/voice-providers/types.ts`):

| Tier | STT | LLM | TTS | Use case |
|---|---|---|---|---|
| **Cloud (low-latency)** | OpenAI Realtime (one socket) | OpenAI Realtime | OpenAI Realtime | Quick prototypes, English-heavy |
| **Cloud (best voice)** | ElevenLabs Scribe Realtime | FlowPilot `chat-completion` | ElevenLabs TTS streaming | Best voice quality, multilingual |
| **Self-hosted (GDPR)** | Whisper (private server, streaming) | Lokal LLM via `chat-completion` provider=local | Piper / XTTS (private) | Healthcare, EU patient data, dentist vertical |

The module config UI (JSON-schema-driven, OpenClaw pattern) picks provider per-inbox. Switching providers = config change, not code change.

## UX patterns to support
1. **Push-to-talk button** on any page block — visitor holds, speaks, releases → transcript + voice reply
2. **Floating voice widget** — always-available "talk to us" affordance (mic-permission only requested on press)
3. **Live escalation** — if `executor=teammate`, the call ringer hands off to softphone (see existing 46elks softphone path); otherwise FlowPilot answers
4. **Hybrid fallback** — if voice fails, drop to text chat in same `conversation_id`

## Why a module, not hardcoded
- Voice ≠ universal need. Many sites want only text chat. Opt-in via module toggle.
- Per-inbox provider choice (Cloud for marketing site, self-hosted for healthcare portal in same org)
- FlowPilot integration is automatic: voice is just another inbox feeding the same reasoning engine

## Credentials
- `ELEVENLABS_API_KEY` — already a standard connector; sync via `standard_connectors`
- `OPENAI_API_KEY` — existing AI provider key
- Self-hosted: `VOICE_LOCAL_STT_URL` + `VOICE_LOCAL_TTS_URL` (configured per-instance, not via Lovable secrets — this is a self-hosted project)

Never hardcode provider choice. The module reads `ai_config` + per-inbox override.

## Relation to existing voice work
- Replaces nothing in `mem://voice/ai-receptionist-target-architecture` (that's the **phone/46elks** channel — different adapter, same model)
- Both phone-voice and web-voice are sibling channel adapters under the UC-gateway umbrella
- Shared provider abstraction in `src/lib/voice-providers/` — both adapters consume the same `VoiceProvider` interface

## Docs
- `docs/modules/voice.md` exists — extend with a "Web voice" section when implementing
- New module entry: `docs/modules/voice-web.md` (or merge into `voice.md` as "Phone vs Web" subsections)
