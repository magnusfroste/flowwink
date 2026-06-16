---
title: "Marketing Department — External Claw Playbook"
audience: "external operators (OpenClaw, ClawThree, Claude Desktop, custom MCP claws)"
last_updated: "2026-05-01"
---

# Marketing Department Playbook

This playbook lets an **external claw** act as FlowWink's marketing department —
running paid growth, content, audience research, and reporting end-to-end
**without FlowPilot involvement**.

> FlowWink is a SaaS platform first. Any MCP-speaking agent can claim a
> department and operate it. This playbook is the contract for "marketing".

## Connect

```http
POST https://<your-flowwink>.lovable.app/functions/v1/mcp-server
Authorization: Bearer <MCP_API_KEY>
```

Get a key from `/admin/developer → MCP Keys`.

## Pull only the marketing toolkit

The MCP server exposes ~300 skills. A focused claw should request only the
marketing toolset to keep its context budget tight:

```http
GET /rest/tools?groups=marketing
```

`marketing` is a **composite group** that expands to:

| Category | What you get | Example skills |
|----------|--------------|----------------|
| `growth` | Paid ads lifecycle | `ad_campaign_create`, `ad_creative_generate`, `ad_performance_check`, `ad_optimize` |
| `content` | Pages, blog, KB, media | `manage_page`, `manage_blog_post`, `migrate_url`, `manage_media` |
| `search` | Web research | `search_web`, `scrape_url`, `competitor_monitor` |
| `analytics` | Performance & SLA | `analytics_query`, `sla_check` |
| `automation` | Platform utilities | `extract_pdf_text`, `process_signal` |

Discover live state: `GET /rest/groups` returns `composite_groups[]` with
`tool_count` per department.

## End-to-end campaign loop

A complete campaign — research → audience → landing → ads → optimize → report —
uses only MCP-exposed skills. **No FlowPilot calls.**

### 1. Research the market

```jsonc
// Find competitors and their messaging
{"tool":"search_web","arguments":{"query":"competitor X positioning 2026","limit":5}}
{"tool":"competitor_monitor","arguments":{"domain":"competitor.com"}}
{"tool":"scrape_url","arguments":{"url":"https://competitor.com/pricing"}}
```

### 2. Build a landing page (optional but recommended)

```jsonc
// Clone a reference page or build from scratch
{"tool":"migrate_url","arguments":{"url":"https://reference.com/landing"}}
// → returns blocks[] + branding
{"tool":"manage_page","arguments":{
  "action":"create",
  "title":"Spring 2026 Campaign",
  "slug":"spring-2026",
  "content_json":[/* blocks from migrate_url, edited */],
  "status":"published"
}}
```

### 3. Create the campaign

```jsonc
{"tool":"ad_campaign_create","arguments":{
  "name":"Spring 2026 — EU Leads",
  "platform":"meta",          // meta | google | linkedin
  "objective":"leads",         // awareness | traffic | leads | conversions
  "budget_cents":50000,        // 500 SEK/day
  "currency":"SEK",
  "target_audience":{
    "geo":["SE","NO","DK"],
    "interests":["B2B SaaS","Productivity"],
    "age":[28,55]
  }
}}
// → { campaign_id, status: "draft" }
```

> Campaigns are created in `draft` status — `ad_campaign_create` itself is **not**
> approval-gated (`trust_level='notify'`), so the claw can iterate freely on
> drafts. Going from `draft` to `active` requires a separate activation flow
> (not yet exposed — currently a manual DB transition or future `activate_campaign`
> skill). No paid spend can occur until that step.

### 4. Generate creatives (A/B variants)

```jsonc
{"tool":"ad_creative_generate","arguments":{
  "campaign_id":"<id>",
  "type":"text",                          // image | video | text | carousel
  "tone":"professional",                  // professional | casual | urgent | storytelling
  "key_message":"Cut admin time by 40%",
  "cta":"Book a demo"
}}
// Repeat 2–3× with different tones for A/B testing
```

### 5. Wait, then check performance

After 24–72h of impressions:

```jsonc
{"tool":"ad_performance_check","arguments":{"campaign_id":"<id>","period":"week"}}
// → { spend, impressions, clicks, ctr, cpc, conversions }
```

### 6. Optimize

`ad_optimize` is the **only** approval-gated skill in the marketing toolkit
(`trust_level='approve'`). Calls return HTTP 202 `pending_approval` and wait
for an admin to approve in `/admin/developer → Activity` (or for FlowPilot to
auto-approve via its own trust rules, when running). The claw can re-call with
`_approved: true` only if it has been granted bypass authority.

```jsonc
// Analyze first (read-only, no approval needed)
{"tool":"ad_optimize","arguments":{"campaign_id":"<id>","action":"analyze"}}

// Budget-affecting actions: returns 202 { status: "pending_approval", activity_id }
{"tool":"ad_optimize","arguments":{
  "campaign_id":"<id>",
  "action":"pause_underperformers",  // or scale_winners, rebalance_budget
  "threshold_ctr":0.5
}}
```

### 7. Report back

The claw is responsible for synthesizing a weekly digest from
`ad_performance_check` across all campaigns. Post results back to FlowWink via
the `agent_events` bus or as a blog post / KB article using `manage_blog_post` /
`manage_kb_article`.

## What's NOT exposed (and why)

| Skill | Why hidden |
|-------|------------|
| `a2a_*`, `dispatch_claw_mission`, `openclaw_*` | FlowPilot's own peer-comms primitives — you ARE the peer, you don't need to dispatch to yourself. |
| `setup_flowpilot`, agent objectives | Cognition layer — managed by FlowPilot when it's on. External claws bring their own brain. |

## Where approval actually happens

Enforcement lives in `agent-execute/index.ts` (~line 136–159):

1. Claw calls a skill via MCP → `mcp-server` proxies to `agent-execute`
2. `agent-execute` reads `skill.trust_level` from `agent_skills`
3. If `trust_level='approve'` AND payload lacks `_approved: true` →
   returns HTTP 202 with `{ status: "pending_approval", activity_id }`,
   logs to `agent_activities` for human review
4. Otherwise executes the handler

| Skill | trust_level | Why |
|-------|-------------|-----|
| `ad_performance_check` | `notify` | Read-only metrics. |
| `ad_creative_generate` | `notify` | Writes to `ad_creatives` — no spend. |
| `ad_campaign_create` | `notify` | Always creates `status='draft'`. No live spend until activation. |
| `ad_optimize` | **`approve`** | Pause/scale/rebalance touches budget — gated. |

- **Rate limits**: Standard MCP rate limits apply (~60 req/min per key).
- **Multi-tenancy**: Each FlowWink site is single-tenant. One claw per
  department per site is the recommended pattern.
- **Audit**: Every MCP call is logged in `agent_executions` with
  `agent='mcp'`, queryable from `/admin/developer → MCP Activity`.
  Pending approvals show up under `/admin/developer → Activity` with
  status `pending_approval`.

## Integration status

The current Paid Growth module operates against **internal tables**
(`ad_campaigns`, `ad_creatives`) — perfect for autonomous planning, A/B logic,
and bookkeeping. **Live ad-platform sync (Meta Ads API / Google Ads API) is
not yet wired in.** When that integration lands, the same MCP skills will
transparently push to the upstream platform — no contract change for the claw.

## Related

- `mem://architecture/mcp-as-platform-not-flowpilot-feature` — why MCP is platform-level
- `mem://architecture/mcp-toolset-groups-and-tool-bloat-strategy` — `?groups=` strategy
- `docs/architecture/mcp-as-platform.md` — architecture overview
- `docs/modules/paid-growth.md` — module reference
