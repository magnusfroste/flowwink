---
title: "Growth Module"
module_id: "paidGrowth"
version: "2.0.0"
category: "insights"
autonomy: "agent-capable"
manual: true
description: Campaigns author the message once; the channel rails deliver it — social queue with real LinkedIn publishing, blog and newsletter drafts behind their own gates.
---

# Growth — Campaigns & Social Publishing

> **Status:** manually maintained — describes the process as verified live
> (first campaign-born LinkedIn post, 2026-08-14). The auto-generator skips
> this file. **Source of truth:** `src/lib/modules/growth-module.ts` + this file.

Growth is two surfaces with one principle: **the campaign owns the message and
the decision; each channel rail owns delivery with the gate that matches its
blast radius.**

## The campaign flow (create once, publish everywhere)

```
Campaigns (Content Hub)
  ├─ research the topic → content angles + hooks (saved, reusable)
  ├─ pick an angle → AI generates per-channel variants in ONE voice
  │    grounded in: Business Identity (always) + published knowledge on the
  │    topic (Knowledge Recycling — retrieved with a VISITOR's eyes, so
  │    internal material can never leak into outward copy) + the last 15
  │    published pieces (anti-repetition). Your brief overrides defaults.
  ├─ review, edit, pick a featured image (per-channel overrides supported)
  ↓
APPROVE  ← the decision. Fan-out materializes:
  ├─ linkedin/x/instagram/facebook → Social Posts queue
  │     campaign-linked, image inherited, scheduled if the campaign has a time
  ├─ blog       → blog post DRAFT   (a human publishes from the blog surface)
  ├─ newsletter → newsletter DRAFT  (sending stays behind the send gate:
  │                                  recipients, test send, send)
  └─ re-approving returns existing artifacts — nothing duplicates
```

## The social queue (delivery)

Social Posts is the **scheduler and executor**. Every 15 minutes a sweep
publishes due posts:

- **LinkedIn** publishes for real via Composio (`LINKEDIN_CREATE_LINKED_IN_POST`,
  signed with the connected account's author URN) → status `posted` + the
  external post URL. Connect the account via **Modules → Composio → Quick
  Connect → LinkedIn** — the connection must be made through FlowWink (it
  lands under the entity the publisher looks up), not in Composio's dashboard.
- Channels without a connected publisher are marked **failed with the reason**
  — the queue never lies and never grows unbounded.
- **Scheduling IS the approval**: only `scheduled` posts with a passed time
  are touched; drafts are never published.

Ad-hoc posts (no campaign) use the same queue — two doors, one rail.

## Why the channels behave differently after Approve

That asymmetry is the design, not a seam: a social post's blast radius is one
feed (schedule = consent), a blog post is your permanent public record (a human
presses Publish), a newsletter hits every subscriber's inbox (its own send
flow). One decision, three rails, three proportionate gates — the same shape as
propose → approve → voucher in accounting.

## Ads (the ledger, and its feed)

`ad_campaigns` / `ad_creatives` are a **ledger**: `ad_campaign_create` records a
campaign (approval-gated, it commits budget), `ad_creative_generate` drafts copy
through the ai-task hub, `ad_performance_check` reads what the ledger holds,
`ad_optimize` recommends pause / scale / maintain from `metrics`, and
`get_attribution_report` answers which UTM campaigns actually produced leads and
orders (independent of any ad platform — `track-page-view` writes
`utm_attributions`).

**The feed is `sync_ad_metrics`.** Until 2026-10-03 nothing wrote
`metrics`, `spent_cents` or `external_id`, so the dashboard showed zeros and
`ad_optimize` recommended on nothing (#623). The skill reads campaign-level
insights from the connected **Meta ad account through Composio's `metaads`
toolkit** — the same rail LinkedIn publishing uses — and writes them; campaigns
that exist on Meta but not in the ledger are created as `platform: meta`. The
**Ad Metrics Sync** automation runs it nightly (05:10). `dry_run: true` shows
what would change.

Connecting Meta Ads: a business managing its **own** ad account needs no Meta
App Review. Register one Meta app (Meta for Developers), add its client id and
secret as a Composio auth config for `metaads`, then **Modules → Composio →
Quick Connect → metaads**. The Meta Ads integration card carries this text and
an optional ad-account id for users with several accounts. There is no
`META_ADS_ACCESS_TOKEN` any more; the integration is "configured" when the
Composio account is connected.

Not wired (yet): pushing campaigns TO Meta (`ad_campaign_create` with
`platform: meta` stays local), Meta Lead Ads → `ingest_form_lead`, Google Ads
(Composio has a `googleads` toolkit; same pattern when a customer asks).

Note: `social_posts.campaign_id` refers to **content campaigns**
(content_proposals), not ad campaigns.

<!-- generated:skills:start — written by scripts/generate-module-docs.ts, edits here are overwritten -->
## Skills

These skills are seeded into `agent_skills` when the module is enabled and exposed via MCP.
External operators (FlowPilot, OpenClaw, Claude Desktop, custom MCP clients) can call them directly.

| Skill | Scope | Description |
|-------|-------|-------------|
| `ad_campaign_create` | internal | Create a new ad campaign with objective, budget, target audience, and platform. Requires approval due to budget commitment. Use when: launching a marketing initiative; defining advertising paramete… |
| `ad_creative_generate` | internal | Generate ad creative (headline, body, CTA) using AI based on campaign objective and target audience. Use when: creating ad copy for a campaign; generating variations for A/B testing; needing creati… |
| `ad_performance_check` | internal | Check ad campaign performance metrics: spend, impressions, clicks, CTR, CPC, conversions. Use when: monitoring campaign metrics; building performance reports; evaluating ROI. NOT for: optimizing ca… |
| `ad_optimize` | internal | Analyze campaign performance and recommend optimizations: pause underperformers, scale winners, adjust budgets. Requires approval. Use when: reviewing campaign results; optimizing ad spend; identif… |
| `get_attribution_report` | internal | Return campaign/source/medium attribution over a window: visits, unique visitors, leads, orders, and revenue by UTM. Use when: reviewing which campaigns actually drive conversions; comparing paid v… |
| `schedule_social_post` | internal | Create or schedule an organic social post (linkedin/x/instagram/facebook). Use when: queueing, drafting or scheduling organic social content for a channel. If scheduled_at is set, status becomes "s… |
| `list_social_posts` | internal | List organic social posts filtered by status/channel. Use when: inspecting the social calendar or moderation queue, or finding the post id before mark_social_post_posted. NOT for: creating or sched… |
| `mark_social_post_posted` | internal | Mark an organic social post as posted with the external ref/url returned by the channel. Use when: a scheduled post has actually been published and needs its status + external reference recorded. N… |
| `process_due_social_posts` | internal | Publish scheduled social posts whose publish time has passed. Use when: running the periodic social-post sweep (the Social Post Scheduler automation calls this). Takes no arguments. NOT for: schedu… |
| `sync_ad_metrics` | internal | Pull live performance from the connected Meta ad account into the ad ledger: per-campaign spend, impressions, clicks, conversions, CTR and CPC for a date window, written to ad_campaigns (metrics, s… |
| `approve_content_campaign` | internal | Approve a content campaign (content_proposals) and FAN OUT its channel variants to the delivery rails: linkedin/twitter/instagram/facebook variants become social_posts rows (campaign_id set, image … |

<!-- generated:skills:end -->
