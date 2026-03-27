

## FlowWink vs Odoo — Modulanalys & Nästa Steg

### Befintliga FlowWink-moduler (20 st)

```text
CONTENT          DATA              COMMUNICATION     INSIGHTS         SYSTEM
─────────────    ──────────────    ───────────────   ──────────────   ──────────────
Pages ●          Forms ●           AI Chat           Analytics ●      FlowPilot ●
Blog ●           Leads ●           Live Support      Paid Growth      Global Elements ●
Knowledge Base   Deals ●           Newsletter        Biz Identity ●   Content Hub
                 Companies ●       Webinars                           Media Library ●
                 E-commerce                                           Browser Control
                 Sales Intel                                          Federation
                 Resume                                               OpenClaw
```

### Relevanta Odoo-moduler som FlowWink SAKNAR

| Odoo-modul | FlowWink-kandidat | Prioritet | Motivering |
|---|---|---|---|
| **Helpdesk / Tickets** | **Tickets** | ★★★★★ | Naturlig förlängning av Forms + Live Support + CRM. Kunder som har leads behöver ärendehantering. FlowPilot kan auto-kategorisera och svara. |
| **Project / Tasks** | **Projects** | ★★★☆☆ | Intern projekthantering. Relevant för konsultbolag men överlapp med externa verktyg (Linear, Asana). Lägre prio. |
| **Surveys** | **Surveys** | ★★★☆☆ | Utökar Forms med logik, scoring, branching. Bra för lead qualification men kan lösas via Forms-modulen. |
| **Inventory** | — | ★☆☆☆☆ | Fysisk lagerhantering — helt utanför FlowWink:s scope. |
| **Accounting** | — | ★☆☆☆☆ | Bokföring — definitiv inte. |
| **HR / Payroll** | — | ★☆☆☆☆ | Helt utanför scope. |
| **Events** | Redan täckt av **Webinars** | — | Webinars + Bookings täcker detta. |

### Rekommendation: **Tickets-modulen** som nästa steg

**Varför Tickets passar perfekt:**

1. **Dataflöde redan finns** — Forms → Leads → Deals. Tickets blir den saknade loopen tillbaka: Deal → Onboarding → Support → Tickets
2. **FlowPilot-native** — Auto-kategorisering, auto-svar från KB, eskalering till Live Support
3. **Autonomy: agent-capable** — FlowPilot kan hantera L1-ärenden helt autonomt
4. **Beroenden redan på plats** — Leads, Companies, Knowledge Base, AI Chat, Forms
5. **Odoo-inspirerat men enklare** — Kanban-pipeline (Open → In Progress → Resolved → Closed), SLA-timers, prioritet

### Tickets-modul — Skiss

```text
Dataflöde:
  Form submission ──→ Ticket (auto)
  Chat escalation ──→ Ticket (auto)
  Email inbound   ──→ Ticket (via webhook)
  Manual creation ──→ Ticket

Pipeline:  New → Open → In Progress → Waiting → Resolved → Closed

FlowPilot-autonomi:
  1. Auto-kategorisera (bug/feature/question/billing)
  2. Matcha mot KB-artiklar → auto-svar
  3. Eskalera till människa om confidence < threshold
  4. Stäng automatiskt efter X dagar utan svar
```

**Tekniskt scope:**
- Ny `tickets`-tabell (id, subject, description, status, priority, category, assigned_to, lead_id, company_id, created_at, resolved_at, sla_deadline)
- Ny modul-definition i `src/lib/modules/tickets-module.ts`
- Admin-vy med Kanban-board + listvy
- Koppling till Companies + Leads
- FlowPilot-skill: `ticket_triage`
- Webhook-events: `ticket.created`, `ticket.updated`, `ticket.resolved`

### Sekundära kandidater (framtida)

1. **Surveys** — branching forms med scoring, bra för lead qualification
2. **Projects** — intern task management, relevant om målgruppen är konsultbolag
3. **Contracts / Quotes** — förlängning av Deals-modulen med dokumentgenerering

