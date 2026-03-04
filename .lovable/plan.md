

## Gmail Signal Integration — Inbound Email as Automation Trigger

### Context

In **mycms.chat**, Gmail integration works as a **signal source**: OAuth connects a Google account (readonly), a scan function (`agent-inbox-scan`) fetches recent emails via the Gmail API, AI analyzes them for actionable signals (topics, opportunities, contacts), and results feed into the agent task pipeline. A separate `gmail-oauth-callback` function handles the OAuth flow (authorize → token exchange → refresh → disconnect).

This project already has:
- Signal dispatcher infrastructure (signal-type automations)
- Webhook event system
- Integration settings framework (`useIntegrations`, `useIntegrationStatus`, `check-secrets`)
- Agent skill engine with activity logging

Gmail/email integration is **not yet present** in this project.

### What to Build

Port the Gmail signal integration pattern from mycms.chat, adapted to this project's architecture (agent_skills, agent_automations, signal-dispatcher).

### Plan

#### 1. Edge Function: `gmail-oauth-callback`
- OAuth flow: authorize → token exchange → store tokens
- Actions: `authorize`, `status`, `disconnect`, `update_settings`
- Store config in `site_settings` under key `gmail_integration` (reuse existing settings pattern instead of mycms.chat's `modules` table)
- Requires secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

#### 2. Edge Function: `gmail-inbox-scan`
- Reads Gmail API (readonly scope) using stored OAuth tokens
- Auto-refreshes expired tokens
- Configurable: filter senders, max messages, scan window (days)
- AI analysis via OpenAI/Gemini (using existing provider resolution)
- Emits signal to `signal-dispatcher` so automations can fire (e.g., "lead score from email sender", "create blog draft from topic")
- Logs activity to `agent_activity`

#### 3. Admin UI: Gmail Integration Card
- Add to existing Integrations page (`/admin/integrations`)
- Connect/disconnect button (opens OAuth popup)
- Status display: connected email, last scan time, signal count
- Settings: filter senders, scan frequency, max messages
- Manual "Scan Now" button
- Follows existing integration card pattern

#### 4. Integration Status Updates
- Add `gmail` to `check-secrets` edge function
- Add `gmail` to `useIntegrationStatus` and `useIntegrations` types
- Add `IntegrationWarning` support for gmail

#### 5. Automation Wiring
- Register a `gmail_inbox_scan` agent skill (category: `research`, scope: `internal`)
- Optionally create a default cron automation (e.g., daily scan)
- Signal output feeds existing `signal-dispatcher` for cross-module triggers

### Technical Details

```text
┌─────────────┐     OAuth      ┌──────────────────────┐
│  Admin UI   │ ──────────────▶│ gmail-oauth-callback  │
│  /admin/    │                │  (authorize/status/   │
│ integrations│◀───────────────│   disconnect)         │
└─────────────┘   redirect     └──────────────────────┘
                                        │
                                        ▼ tokens in site_settings
┌─────────────┐    invoke      ┌──────────────────────┐
│ Cron / UI   │ ──────────────▶│  gmail-inbox-scan    │
│ "Scan Now"  │                │  fetch → AI analyze  │
└─────────────┘                └──────────┬───────────┘
                                          │ signal
                                          ▼
                               ┌──────────────────────┐
                               │  signal-dispatcher   │
                               │  → matching automations
                               └──────────────────────┘
```

### Files to Create/Edit
- `supabase/functions/gmail-oauth-callback/index.ts` — new
- `supabase/functions/gmail-inbox-scan/index.ts` — new
- `src/components/admin/integrations/GmailIntegrationCard.tsx` — new
- `src/pages/admin/IntegrationsPage.tsx` — add Gmail card
- `supabase/functions/check-secrets/index.ts` — add GOOGLE_CLIENT_ID check
- `src/hooks/useIntegrationStatus.ts` — add `gmail` key
- `src/hooks/useIntegrations.tsx` — add `gmail` settings type
- `supabase/config.toml` — add function config (verify_jwt = false for OAuth callback)

### Prerequisites
- User must provide `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (from Google Cloud Console)
- Google Cloud project with Gmail API enabled and OAuth consent screen configured

