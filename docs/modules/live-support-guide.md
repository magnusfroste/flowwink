---
title: "Live Support (retired) — see FlowBox"
description: The Live Support page was retired on 2026-09-02. Its queue, presence toggle, callbacks and voicemail live in FlowBox; this page only points there.
category: modules
---

# Live Support (retired) — see FlowBox

> Retired 2026-09-02. Kept so old links land somewhere true.

The Live Support page (`/admin/live-support`) no longer exists. Everything it did is in **FlowBox** (`/admin/flowbox`):

| Live Support had | FlowBox has |
|---|---|
| Waiting / Inbox / Closed tabs | the **Queue**, grouped by who has it (**Needs a person**, **With FlowPilot**, **Waiting on the customer**, **Done**) |
| Online / offline status | the **Go live** toggle in the header — reading is the default, live means chats and calls can ring you |
| Claim, reply, transfer, close | **Reply here** on the chat row: sending claims, **Transfer to…**, **Close** |
| Callbacks and Voicemail tabs | the **Calls** tab |
| `?conversation=<id>` deep links | redirect to `/admin/flowbox?open=chat:<id>` |

The **Contact Center** module (`liveSupport`) is still enabled underneath: it owns presence, the conversation lifecycle and the support skills. Only the page is gone.

Read [FlowBox — one queue over every channel](./flowbox.md).
