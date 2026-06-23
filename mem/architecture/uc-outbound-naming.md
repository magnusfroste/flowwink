---
name: UC + Outbound naming convention
description: Future consolidation naming — UC (Unified Communications) for inbound multi-channel inbox; Outbound for outbound mail/comms (today's "Communications")
type: preference
---

# Naming för framtida konsolidering

När live-support / chat / voice / sms slås ihop:

- **UC (Unified Communications)** — modul-titel för **inbound** multi-channel inbox (web widget, voice, SMS, email-thread). Route-förslag: `/admin/inbox` (vänligt) med UC som teknisk modul-titel i settings.
- **Outbound** — ersätter dagens **"Communications"** namn, som idag bara är utgående mail (newsletters, transactional, agent emails). "Communications" är missvisande eftersom det låter som all kommunikation — det är bara utgående. Byt till **Outbound** när vi konsoliderar.

**Why:** UC = etablerad industri-term (UCaaS — RingCentral, 8x8, Teams Phone). Outbound = ärligare än Communications för det som faktiskt är ensidig utgående trafik. Tillsammans blir uppdelningen tydlig: Inbound (UC) vs Outbound.

**Status:** noterat, inte implementerat. Tas när widget-flödet är stabilt.
