# Surveys & NPS Module

One-click email surveys (NPS, CSAT, custom) triggered by lifecycle events. Auto-categorizes responses and emits platform events that FlowPilot can act on (e.g. follow up with detractors, ask promoters for reviews).

## Tables

- `survey_templates` — JSON-based question structures (kind: `nps` | `csat` | `custom`).
- `survey_campaigns` — Links a template to a trigger event (`order.delivered`, `ticket.closed`, `subscription.renewed`, `manual`, …).
- `survey_sends` — One row per recipient invitation, with a unique `token` for the public response URL and an `expires_at`.
- `survey_responses` — Captured score + optional comment. Trigger `categorize_nps_response` sets `category` (detractor 0–6, passive 7–8, promoter 9–10) and emits `survey.responded` via `emit_platform_event`.

All tables RLS-protected (admin/marketing read+write; public has token-scoped insert via SECURITY DEFINER RPC).

## Edge functions

- `survey-send` — Renders branded HTML email with one-click rating buttons. Each button links to `/s/:token?score=N`. Goes through the standard `enqueue_email` queue.

## Public route

- `/s/:token` (`PublicSurveyPage.tsx`) — Anonymous-friendly response form. Reads the score from query string, lets the user add a comment, posts via `submit_survey_response` RPC.

## Admin route

- `/admin/surveys` (`SurveysPage.tsx`) — KPI dashboard (NPS score, response rate, promoter/passive/detractor split), campaign list, response stream.

## Skills (MCP-exposed)

| Skill | Purpose |
|-------|---------|
| `create_survey_campaign` | Link a template to a trigger event |
| `send_survey` | Manually dispatch to a contact / list |
| `list_survey_responses` | Read responses with filters (campaign, category, date range) |

## FlowPilot loop

1. Platform emits a lifecycle event (`order.delivered`, `ticket.closed`, …).
2. `survey_campaigns` row with matching trigger fires → `survey-send` invoked → email queued.
3. Recipient clicks rating → response stored → `survey.responded` event emitted.
4. FlowPilot automation reacts: detractors → create ticket + assign owner; promoters → ask for review / referral.

## Module flag

`surveys` in `ModulesSettings`. Disabled by default — enable in `/admin/modules`. `enhancedByFlowPilot: true` (works standalone, fully autonomous when FlowPilot is on).
