---
name: Visitor Intelligence
description: Behavioral signals from anonymous browsing — identity stitching, rule-based scoring, per-lead timeline. Consent-gated on analytics.
type: feature
---

# Visitor Intelligence

## Layered arkitektur

**Kärna (analytics-modulen)** — insamling som alltid finns:
- `page_views` (redan), `usePageViewTracker`, `track-page-view` edge fn
- Nya kolumner: `page_views.lead_id` för koppling till identifierad person

**Kärna (identity stitching)** — brygga anonym → identifierad:
- `visitor_identities` (visitor_id → lead_id, many-to-one)
- `stitch_visitor_to_lead(visitor_id, lead_id, source)` RPC, säker att kalla från anon
- Auto-stitch-trigger på `leads` insert: matchar tidigare chat_conversations på email
- `capture_chat_lead` RPC förbättrad att stitcha via `pez_visitor_id`

**Modul `visitorIntelligence`** — togglebar signal-plugin (mem://architecture/module-signal-plugins):
- Läser regler från `site_settings.visitor_intelligence_rules`
- Regeltyper: `session_count`, `url_visits`, `page_view_count`, `reawakening`
- `score-visitor-intent` edge fn utvärderar → `visitor_signals` + bumpar `leads.score`
- Idempotent per (lead, rule, day)
- Skills: `score_visitor_intent`, `get_visitor_timeline`
- Widget: `VisitorTimelineWidget` mountas i lead-drawer

**Consent v2 (kärna):**
- 3 kategorier: `essential` (låst), `analytics`, `marketing`
- `src/lib/visitor-consent.ts` — `getConsent`/`setConsent`/`hasConsent`/`acceptAll`/`rejectAll`
- localStorage-key `cookie-consent-v2`; bakåtkompatibel med gammal `cookie-consent`
- `usePageViewTracker` skippar helt om `analytics` inte accepterat
- Emits `cookie-consent-changed` CustomEvent

## Cron (att köra manuellt när önskvärt)

```sql
select cron.schedule(
  'score-visitor-intent-15min',
  '*/15 * * * *',
  $$ select net.http_post(
    url:='https://<ref>.supabase.co/functions/v1/score-visitor-intent',
    headers:='{"Content-Type":"application/json","apikey":"<anon>"}'::jsonb,
    body:='{}'::jsonb
  ) $$
);
```

## Regler (default seed)

- `return_visitor`: 3+ sessioner/7d → +10
- `pricing_interest`: 2+ /pricing-besök/14d → +20
- `deep_engagement`: 10+ sidvisningar/30d → +15
- `reawakening`: 14+ dagars tystnad, sen aktivitet → +12

Ändra via `site_settings.visitor_intelligence_rules`.

## Att bygga vidare (backlog)

- Newsletter-open/click som timeline-event (data finns i `newsletter_email_opens`/`newsletter_link_clicks`, bara hooka in i `useVisitorTimeline`)
- Signal-dispatcher-integration så att andra plugins (agentanbud etc.) kan skriva till `visitor_signals` via samma kontrakt
- Admin-UI för regeleditor (idag: rå JSON i site_settings)
- Mount `VisitorTimelineWidget` i `LeadDetailDrawer` när den finns
