# Support-to-Resolution

> Från kundfråga till löst ärende. Self-service + human handoff.

**Mognadsnivå:** L3 — Operational
**Status:** ✅ AI Chat + KB + ticketing fungerar; SLA-monitor varnar vid eskalering

---

## Moduler som ingår

| Modul | Roll i processen |
|-------|------------------|
| **AI Chat** | Frontline — agenten svarar visitors direkt |
| **Knowledge Base** | Källa för agent-svar, self-service-portal |
| **Tickets** | Strukturerade ärenden för komplexa fall |
| **Live Support** | Handoff till mänsklig agent |
| **SLA** | Övervakar svarstider, eskalerar vid fördröjning |

---

## Steg-för-steg flöde

```
Visitor frågar (chat-widget)
       ↓
FlowPilot svarar med KB-grounding
       ↓
   ├── Löst → conversation closes
   ├── Komplext → ticket_triage skapar ärende
   └── Akut → escalate till support_assign_conversation
       ↓
Mänsklig agent övertar (Live Support)
       ↓
Lösning → svar tillbaka till kund
       ↓
SLA-monitor mäter response time + resolution time
       ↓
analyze_chat_feedback → KB gap-analys
```

---

## Agent-täckning

| Steg | 👤 Manuell | 🤖 FlowPilot | 🔗 Extern agent |
|------|-----------|-------------|-----------------|
| Frontline-svar | — | ✅ (chat-completion) | — |
| KB-sökning | ✅ | ✅ (KB embedded i context) | — |
| Ticket-triage | ✅ | ✅ (`ticket_triage`) | — |
| Konversationstilldelning | ✅ | ✅ (`support_assign_conversation`) | — |
| Mänsklig respons | ✅ | — | — |
| SLA-eskalering | — | ✅ (SLA-monitor automation) | — |
| Feedback-analys | — | ✅ (`analyze_chat_feedback`, `support_get_feedback`) | — |
| KB gap → ny artikel | ✅ | ✅ (`kb_gap_analysis` + `manage_kb_article`) | — |

---

## Kända luckor (saknas för L5)

- ❌ Multi-channel inbox (email, WhatsApp, Slack i samma vy)
- ❌ Customer satisfaction (CSAT) surveys efter ärende
- ❌ Macros / canned responses för human agents
- ❌ Skill-based routing till specifika agenter
- ❌ Internal knowledge base (separat från publik KB)

---

## Webhook-events

(Inga dedicerade än — kan utökas med `ticket.created`, `ticket.resolved`)

---

## Bäst för

SMB med inbound support-frågor där 60-80% kan lösas via self-service / AI. Konsultbyråer, SaaS i tidig fas.

## Inte för

High-volume call centers, eller B2B-enterprise med dedikerade Customer Success Managers per konto.
