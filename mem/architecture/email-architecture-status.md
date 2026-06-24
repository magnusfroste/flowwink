---
name: Email Architecture Status
description: Email sending är bra abstraherat via email-send router. Email INTE i live-support — bara synkrona kanaler där. Email-inbound = tickets, inte live-chat.
type: feature
---
# Email Architecture (FlowWink)

## Sändning — KLART, rätt nivå av abstraktion

```
6 trigger-functions (alla tunna wrappers, 53-367 LOC)
├── send-booking-confirmation
├── send-contact-email
├── send-invoice-email
├── send-order-confirmation
├── send-quote-email
├── survey-send + newsletter
        ↓ alla anropar
   email-send (302 LOC, provider-agnostic router)
        ↓
   smtp (denomailer) | resend
```

- Provider väljs i **en** fil (`email-send`)
- SMTP-adapter default → self-hosted-vänligt (Postfix/Mailgun/SES/Gmail SMTP)
- INTE Lovable Emails (bryter self-hosted-löftet)
- Loggas centralt i `outbound_communications`
- Per-typ-funktionerna ska INTE slås ihop med email-send — varje har egen datahämtning + template-render. Rätt nivå.

## Mottagning — sensor-only idag

`gmail-inbox-scan` = pure data sensor: läser Gmail → `agent_activity`-rader. FlowPilot bestämmer vad som händer (skapa ticket, lead, ignorera). Ingen direktkoppling till tickets/leads i edge-functionen själv (Law: sensors vs reasoning).

## Email i Live Support? NEJ

Beslut 2026-06: email exkluderas från `/admin/live-support`. Skäl:
- Live support = synkrona kanaler (web/telegram/sms/voice) där kunden förväntar svar nu
- Email är async/formellt (subject, headers, attachments, quoting, signatures)
- En email-tråd i "Active"-kolumnen är fel mental modell
- Email-trådar hör hemma i tickets-modulen (SLA, status, assignment, comments finns redan)

`SupportChannel`-typen i `src/lib/support-channels.tsx` behåller `web | telegram | sms | voice | voicemail` — ingen `email`.

## Roadmap (parkerat tills behov)

1. Bekräfta att FlowPilot faktiskt skapar tickets från Gmail-signals (eller bygg skill om saknas)
2. Reply-i-ticket → går via `email-send` med threading-headers (In-Reply-To/References)
3. Långsiktigt under UC-gateway: email-inbox = adapter på ticket-sidan, SMS/voice/telegram = adapters på live-support-sidan. Båda läser från samma `chat_conversations`/`tickets` med olika `channel`-värden.

## Liten städning (lågprio)

`send-booking-confirmation` + `send-order-confirmation` läser `resendSettings` från integration_settings för fromEmail-fallback. Borde flyttas till `email-send` så fromEmail-källan är ett enda ställe.
