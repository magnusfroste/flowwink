---
title: "EPIC-07 — Support-to-resolution completion"
status: planned
sprint: R1
owner: unassigned
---

# EPIC-07 — Support-to-resolution completion

## Why
Support is the process where FlowWink's "the agent does the work, the human
verifies" story is furthest along — and where the scorecards are most
misleadingly low. `contact-center` (41%) is **the same module** as
`live-support` (71%) under a stricter omnichannel/Helpdesk/VoIP lens: six of
its seven capabilities are `partial` = *built, awaiting live verification*
(2026-07-02 analysis — "verifiera, bygg inte"). Add the chat handoff threads
and the one real wiring gap — `sla-check` still counts wall-clock hours even
though `business_minutes_between()` shipped — and the whole
support-to-resolution chain closes: inbound (chat/Telegram/voicemail) →
routed → answered within *business-hours* SLA → resolved with a ticket trail.

One deliberate exclusion: two-way live voice stays deferred (2026-06-16
product decision; the voice module track covers the receptionist case).

## Outcome (Definition of Done for the whole epic)
- [ ] contact-center ≥ 75%, chat ≥ 75%, live-support ≥ 85%
- [ ] `sla-check` computes breach times via `business_minutes_between` when a
      business-hours calendar exists (falls back to 24/7 otherwise)
- [ ] A canned-responses primitive shared by live-support and tickets
- [ ] All flips carry dated live evidence
- [ ] `npx vitest run` + parity check green

## Capabilities delivered
| File | Capability id | From → To |
|---|---|---|
| `capabilities/contact-center.json` | `agent_routing`, `omnichannel_schema`, `voicemail_store`, `voicemail_transcription`, `telegram_channel`, `callback_offer` | partial → done |
| `capabilities/chat.json` | `handoff`, `transcripts`, `feedback` | partial → done |
| `capabilities/live-support.json` | `transfer`, `availability` | partial → done |
| `capabilities/live-support.json` | `canned_responses` | missing → partial |
| `capabilities/tickets.json` | `templates_canned` | missing → partial |
| `capabilities/sla.json` | `business_hours` | partial → done |

## Issues

- [ ] **07.1 — Contact-center live verification** *(contact-center — verify, don't rebuild)*
  - Route a conversation via `route_conversation` to an agent; store + play a
    voicemail; confirm transcription lands; send/receive on the Telegram
    channel with a live bot token; request a callback and mark it done.
    Each thread flips on evidence; file defects where reality disagrees.

- [ ] **07.2 — Chat → human handoff** *(chat)*
  - Escalate a bot conversation to a human agent; transcript persists and is
    readable from the admin; post-chat feedback recorded. Verify the visitor
    side anonymously (publishable-key path).

- [ ] **07.3 — Canned responses (shared primitive)** *(live-support + tickets)*
  - One `canned_responses` table + picker component, consumed by the
    live-support reply box AND the ticket reply box (platform primitive — not
    a per-module fork). Skill for CRUD so the agent can maintain the library.
    Verify transfer between agents + availability toggle while in there.

- [ ] **07.4 — Business-hours SLA wiring** *(sla)*
  - `sla-check` sweep uses `business_minutes_between()` for elapsed time when
    a calendar exists; verify a ticket created Friday 16:00 with a 4h SLA
    breaches Monday morning, not Friday night. Surface the calendar in the SLA
    admin page (read-only list is enough).
