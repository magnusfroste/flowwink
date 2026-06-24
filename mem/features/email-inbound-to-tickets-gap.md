---
name: Email Inbound to Tickets Gap
description: gmail-inbox-scan dispatchar bara meta-signal (count), inte per-email. Ingen automation lyssnar. Email → ticket-flödet existerar inte autonomt trots att skill-beskrivningen lovar det.
type: feature
---
# Email Inbound → Ticket — GAP (parkerat)

## Vad som finns
- `gmail-inbox-scan` läser Gmail, loggar i `agent_activity`
- Dispatchar EN signal: `gmail_inbox_scanned` med `{count, email}`
- Ingen per-email-signal
- Ingen automation seedad mot `gmail_inbox_scanned`
- FlowPilot kan via reasoning välja att skapa ticket från scan-output, men inte autonomt

## Vad som saknas
1. **Per-email signal** — varje ny email (inte tidigare seen) → `email_received` signal med `{from, subject, snippet, message_id, thread_id}`
2. **Dedup** — `gmail_seen_message_ids`-tabell eller markera i Gmail med label
3. **Routing-policy** — site_settings.email_routing: `support_keywords → ticket`, `lead_keywords → lead`, `noreply → ignore`
4. **Auto-create ticket-skill** — `email_to_ticket` skill (eller automation som anropar `manage_ticket` create)
5. **Email-threading** — när admin replyar i ticket: `email-send` måste sätta `In-Reply-To` + `References` så Gmail visar det som tråd

## När det byggs
- Lägg `email_to_ticket`-handler i agent-execute (inte ny edge function)
- Automation seedad i emailModule: trigger=`email_received` + condition=`subject matches support_keywords` → action=`call_skill: email_to_ticket`
- Reply från ticket-comments → `email-send` med threading-headers + sätt `reply_to_message_id` på ticket_comment

## INTE göra
- Skapa email-channel i live-support (separat beslut, se mem://architecture/email-architecture-status)
- Auto-skapa ticket för ALLA emails (newsletters, spam, internal → noise). Routing-policy är obligatorisk.
