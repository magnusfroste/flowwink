---
title: "Telemetry — the daily ping and the feedback endpoint"
description: What a FlowWink instance sends home, when, how to switch it off, and how to run the board for your own product.
category: operators
---

# Telemetry — the daily ping and the feedback endpoint

FlowWink is MIT-licensed software you run yourself. There is no account, no
licence check and no terms to click through. There is one thing an instance
sends home, and this page is its whole description.

## What is sent

Once a day (03:17 instance time, the "Feedback ping" automation) the instance
POSTs to its **feedback endpoint** — `https://www.flowwink.com` unless you
change it:

| Field | What it is |
|---|---|
| `instance_id` | A random UUID minted on the first ping and stored in `site_settings.instance_identity`. Not derived from anything. |
| `site_url` | The site URL setting (or `PUBLIC_SITE_URL`). Empty when neither is set. |
| `skills_sha` | The first 16 hex characters of the deployed skills artifact's SHA-256 — the version. |
| `modules_enabled` | The ids of the modules that are on (e.g. `pages`, `blog`, `invoicing`). |
| `app` | `flowwink`. |

Nothing else. No customers, no content, no amounts, no users, no keys.

The same endpoint receives what you post under **Admin → Feedback** (a bug
report, a feature request, a template wish, a question), with the fields above
attached as `origin` so the report reads with its version. A post carries the
name and e-mail you type into it and nothing you did not.

## Why

To know how many instances run the platform, which version they are on and
which modules are in use — the question a maintainer of self-hosted software
otherwise cannot answer — and to hear what breaks, from the place it broke.

## Switching it off

Either of these stops the ping; neither affects anything else:

- **Admin → Feedback → "Share usage with the endpoint"** — the dial, stored as
  `site_settings.feedback.share_usage`.
- **`FEEDBACK_SHARE_USAGE=false`** in the edge function environment (Supabase →
  Edge Functions → Secrets) — for an instance nobody opens the admin of. The
  ping answers `skipped` and sends nothing.

Feedback is only ever sent when someone posts it.

## Running the board for your own product

The module is symmetric. Point the endpoint at your own site (**Admin →
Feedback → "Use this instance"**) and your instance *receives* instead of
sends: a public board at `/feedback` (boards, votes, comments, "Create post"),
triage under Admin → Feedback (status, staff replies, the origin and version of
every post) and an Instances tab listing the instances that ping *you* — your
own fleet, if you run several. A functions URL ending in `/content-api` works
as an endpoint too, for a receiver not on Vercel.

## What the receiver holds

A receiving instance stores posts (with the name and e-mail typed into them),
votes (a per-browser key, never shown) and comments, plus the ping rows above.
On `www.flowwink.com` that makes the project the controller of what people
type into the board; the fields are the minimum needed to answer them. A
self-hoster running the board for their own product holds the same for their
own users.
