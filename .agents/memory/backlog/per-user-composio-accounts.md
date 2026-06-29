---
name: Per-user Composio Gmail accounts
description: Backlog — let each sales rep connect their own Gmail via Composio so lead replies thread to the individual sender instead of one shared company inbox
type: feature
---

# Per-user Composio Gmail accounts (backlog)

## Today
Composio is connected as a **single company-wide Gmail account**. Every
`send_email_to_lead` (and other reply-expected mail) goes from that one
address — fine for a small team or a shared `sales@` inbox.

## Why we'll need per-user
When multiple sales reps work the same lead list, replies should land in
**that rep's** personal inbox so:
- the thread reads naturally (lead replies to the person they talked to)
- inbox ownership / follow-up responsibility is clear
- vacation hand-offs are explicit (re-assign lead → re-assign From)

## Pieces already in place
- `email-send` accepts `sender_user_id` and resolves `profiles.email_from_address`
  for Resend/SMTP branches.
- `composio-proxy` already takes an `entity_id` per call — Composio supports
  multiple "entities" per account, one per user.

## What's missing
1. **Profile field**: `profiles.composio_entity_id` (per-user OAuth handle).
2. **Onboarding flow**: a "Connect my Gmail" button in user profile that
   triggers Composio's OAuth for that entity_id.
3. **Router wiring**: `email-send` Composio branch should prefer
   `body.sender_user_id → profile.composio_entity_id` over the shared default.
4. **Fallback policy**: if the rep hasn't connected their own Gmail, fall back
   to the shared company entity (current behaviour) and surface a nudge.
5. **Live Support / inbound**: inbound Gmail webhooks need to route to the right
   ticket owner based on which entity received the mail.

## Order of operations
Ship the shared-account model first (done). Add per-user when there's >1 active
seller, or when the user explicitly asks.
