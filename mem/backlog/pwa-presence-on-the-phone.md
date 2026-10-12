---
name: FlowWink on the phone — PWA with push, so "Here now" and ring work away from the desk
description: Backlog — presence and ring (team-presence channel, 2026-10) work only while FlowWink is open. On a phone that means an installed PWA with push notifications; the WhatsApp feel needs it. Not started; for the team to vote on.
type: feature
---

# Problem
"Here now" shows who has FlowWink open, and a tap rings them on video. On a
laptop that is true most of the day. On a phone it is true only while the
browser tab is in front — the moment the screen locks, the person is gone and
a ring never arrives. WhatsApp is smooth because the app is installed and the
phone wakes it.

# What it would take
- Web app manifest + service worker so FlowWink installs to the home screen
  (iOS Safari needs the manifest; Android Chrome prompts).
- Web Push: VAPID keys per instance (a secret), a `push_subscriptions` table,
  and an edge function that sends the ring (and later: River mentions, assigned
  tickets) through the browser push service. iOS requires the PWA to be
  installed before push is allowed.
- The ring on the callee side becomes a push notification with Answer, which
  opens `/meet/<slug>` — same room, same door.
- Presence on the phone: "here" = app in foreground; away otherwise. Do not
  invent "last seen" from push.

# Not in scope
- Status messages, do-not-disturb schedules.
- Group calls from presence.
- A native app.

# Touchpoints
- `src/hooks/useTeamPresence.tsx` (ring → push fallback when the callee has no live tab)
- `public/manifest.webmanifest`, a service worker under `src/`
- new edge function `push-send`, new table `push_subscriptions` (RLS: own rows)
- Integrations card for the VAPID key pair

# Decision needed
Worth the surface (a secret, a table, a function, iOS quirks)? Vote.
