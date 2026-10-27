---
title: "Odoo reference card — CRM depth (crm / deals / tickets)"
cluster: "CRM depth (crm 63%, deals 61%, tickets 48% — P1)"
odoo_apps: "CRM, Helpdesk, Activities"
sources:
  - https://www.odoo.com/documentation/18.0/applications/sales/crm.html
  - https://www.odoo.com/documentation/18.0/applications/essentials/activities.html
  - https://www.odoo.com/documentation/18.0/applications/services/helpdesk.html
date: 2026-07-04
source: docs-only (public functional documentation)
description: In Odoo's CRM, every open opportunity is expected to carry a scheduled next activity, and the pipeline view shows that activity and its urgency at a glance.
category: parity
---

# Odoo 18 CRM + Helpdesk — pipeline discipline reference

> Functional benchmark notes from Odoo's public documentation. No Odoo code or
> text is reused in FlowWink. See
> [`../../contributing/benchmarking-policy.md`](../../contributing/benchmarking-policy.md).

## 1. Process skeleton

```
lead ──convert──▶ opportunity
  │  qualifying queue   │ staged kanban (stages, optionally per sales team)
  │                     ├─▶ WON  (won stage, probability 100%)
  │                     └─▶ LOST (archived, probability 0%, optional lost reason)
  └── merge on duplicate ▲ Restore re-opens
ACTIVITY LOOP (on every record): schedule next activity → do it → mark done
(feedback logged to the record's history) → suggest/trigger next activity →
repeat until won/lost
```

- **Leads are an optional qualifying step** before an opportunity is created; the step is switched on in CRM settings and can be disabled per team ([convert.html](https://www.odoo.com/documentation/18.0/applications/sales/crm/acquire_leads/convert.html)).
- Leads and opportunities are one kind of record in Odoo; converting a lead turns it into an opportunity and can assign a salesperson. FlowWink's shared `pipeline_stages` engine over leads/deals/tickets is the analogous single-engine choice.
- Stages can be limited to a sales team; moving a record to a won stage sets its probability to 100%.

## 2. The activity / next-step model (maps to FlowWink's titthål vision)

The sales discipline Odoo's documentation describes is **every open opportunity carries a scheduled next activity**; the pipeline kanban shows it and its urgency at a glance.

An activity, as described in [activities.html](https://www.odoo.com/documentation/18.0/applications/essentials/activities.html), has:

| Attribute | Meaning |
|---|---|
| Activity type | e.g. email, call, meeting, to-do, upload document |
| Summary and note | short title + detail |
| Due date (required) | when it should be done |
| Assignee | defaults to the current user |
| Linked record | any business record |
| Status | overdue / due today / planned — derived from the due date |

Discipline mechanics:
- **Urgency colouring everywhere**: activities are coloured by status — future, due today, overdue — consistently in the kanban, the list view and the dedicated activity view (activities.html).
- **Done = audit trail, not a checkbox**: marking an activity done with feedback logs that feedback (and any attachments) in the record's history; completed work becomes permanent timeline history.
- **Chaining**: an activity type can suggest or automatically schedule a follow-up activity, dated relative to the previous deadline or the completion date (activities.html). **Activity plans** launch a whole preset sequence at once ([utilize_activities.html](https://www.odoo.com/documentation/18.0/applications/sales/crm/optimize/utilize_activities.html)).

**FlowWink counterpart, honest compare** (`src/components/admin/crm/`):
- `CrmTasksCard.tsx` groups by overdue/today/upcoming with priority badges — the color-discipline core exists per-record. Missing vs Odoo: no activity *types*, no "done posts feedback to timeline" (completion is just `completed_at`), no chaining/plans, and — most important — **no pipeline-level surfacing**: LeadKanban cards don't show next-activity state, and nothing enforces/flags "open deal with no next step".
- `LeadCommunicationsCard.tsx` is actually *ahead* on the titthål axis: `deriveActor()` labels every entry Agent/Manual/Inbound/System, a distinction Odoo's record history does not make.
- For an agent-does-the-work model the valuable pattern is the **verification loop**: done-with-feedback + next-step-always-scheduled gives the human a one-glance answer to "what did the agent do, what happens next, is anything stalled".

## 3. Won/lost discipline

- **Lost**: marking an opportunity lost asks for an optional lost reason (pick from a list or create one) and an optional closing note. The record is **archived** and its probability set to 0% ([lost_opportunities.html](https://www.odoo.com/documentation/18.0/applications/sales/crm/pipeline/lost_opportunities.html)).
- **Lost reasons taxonomy**: one configurable flat list, shared by leads and opportunities.
- **Re-open**: a lost record can be restored (individually or in bulk), which recomputes its probability.
- **Won**: marking won moves the record to a won stage at 100% probability.
- **Reporting**: pipeline analysis can filter won/lost, group by lost reason, and measure days to close, days to convert and expected/prorated revenue ([win_loss.html](https://www.odoo.com/documentation/18.0/applications/sales/crm/performance/win_loss.html)).

## 4. Revenue, probability, enrichment, assignment, duplicates (condensed)

- **Forecast** = expected revenue × probability per record, with recurring-revenue variants. FlowWink computes the same weighted forecast from `pipeline_stages.probability` (crm#forecast done).
- **Predictive lead scoring**: a statistical model learns a success probability from variables such as state/country, phone/email quality, source, language and tags, with stage and team always included; a manual override stops automatic updates ([lead_scoring.html](https://www.odoo.com/documentation/18.0/applications/sales/crm/track_leads/lead_scoring.html)).
- **Rule-based assignment**: per-team/per-salesperson rules (e.g. probability ≥ 20%), run manually or on a schedule; assignment converts leads to opportunities (lead_scoring.html).
- **Lead mining / enrichment**: paid credits, filter by country/size/industry/role ([lead_mining.html](https://www.odoo.com/documentation/18.0/applications/sales/crm/acquire_leads/lead_mining.html)); FlowWink's `enrich_company` + `contact_finder` (Hunter) cover the SMB slice without credits.
- **Similar-lead detection**: records sharing an email domain, phone number or company are flagged as similar leads; merging keeps the oldest record and logs the rest in its history, and cannot be undone ([merge_similar.html](https://www.odoo.com/documentation/18.0/applications/sales/crm/pipeline/merge_similar.html)). FlowWink's `find_duplicate_leads` (trigram + plus-addressing-normalized email) is comparable; proactive surfacing on the record is not.

### Helpdesk (Enterprise app; public docs only)

- **Stages**: per-team pipelines, customizable stages, folded = closed; **stage-linked email templates** notify customers on stage entry ([helpdesk.html](https://www.odoo.com/documentation/18.0/applications/services/helpdesk.html)).
- **Assignment**: round-robin (equal number of tickets) or load-balancing (equal open tickets); skips users on time off (helpdesk.html).
- **SLA**: policy = criteria (team required; priority, tags, customer, type) + target (reach a stage within X working hours, with excluded stages); deadline from creation date + working calendar; met/failed shown in green/red; SLA status report ([sla.html](https://www.odoo.com/documentation/18.0/applications/services/helpdesk/overview/sla.html)).
- **Ratings**: a rating request is sent when a ticket reaches a closing stage; three-level scale; the result is logged on the ticket ([ratings.html](https://www.odoo.com/documentation/18.0/applications/services/helpdesk/overview/ratings.html)).
- **Canned responses**: a shortcut expands to stored text, scoped per group ([responses.html](https://www.odoo.com/documentation/18.0/applications/websites/livechat/responses.html)). Availability inside Helpdesk tickets: unverified (docs describe live chat only).

## 5. Gap table

| Odoo capability | FlowWink status (capability id) | Recommendation |
|---|---|---|
| Activity fields: type/deadline/assignee/done | `crm_tasks` has title/due/priority/completed (crm#activities "done") | **verify** — done, but see next two rows for what "done" hides |
| Done-with-feedback → posted to timeline | Missing; `crm_task_update.completed_at` only | **build** — feed task completion (+ note) into UnifiedTimeline; core titthål audit trail |
| Pipeline surfaces next activity + overdue color; "no next step" visible | Missing on LeadKanban/DealKanban; CrmTasksCard only per-record | **build** — highest-leverage CRM item this cluster; add next-task chip (green/orange/red) + "no next step" flag on kanban cards |
| Activity chaining / activity plans | Missing | **non-goal (as config)** — the *agent* is the chaining engine (FlowPilot schedules the follow-up when it completes one); a config UI for chains duplicates FlowPilot. Bake "always leave a next task" into skill instructions instead |
| Lost reasons + closing note, group-by-reason report | Missing (crm#lost_reasons, deals#lost_reasons) | **build** — small: `lost_reason` + `lost_note` on lead/deal, taxonomy table or enum, win-rate rollup in `lead_pipeline_review` |
| Lost = archive, Restore re-opens | Delete-or-status only | **build** (with lost_reasons) — soft-close keeps history for win-rate honesty |
| Won/lost stage flags, stage probability, weighted forecast | Done (crm#custom_stages, crm#forecast, deals#probability_weighting; `pipeline_stages.is_won/is_lost/probability`) | **verify** — already Stage-3 verified 2026-06-11 |
| Predictive (naive-Bayes) scoring | Partial (crm#scoring_basic: activity+recency) | **non-goal for Bayes clone** — sales-intelligence module (100%) + `qualify_lead` is the FlowWink-native mapping; note mapping in scorecard instead of building PLS |
| Lead→opportunity convert step (two-queue model) | Status/stage transition on one `leads` table | **verify** — single-pipeline is the right SMB shape; confirm `manage_leads` status normalization covers the qualify step (it does — "qualified"→"opportunity") |
| Similar-leads smart button (proactive dedup at create/convert) | Partial (crm#lead_dedup: on-demand RPCs) | **build (small)** — call `find_duplicate_leads` from lead detail; badge if hit. Merge RPC exists |
| Rule-based assignment engine (domains, scheduled runs) | Missing (deals#deal_teams) | **non-goal** — multi-team assignment engines are for orgs with lead volume > one team; a 5-person shop assigns by hand or lets the agent do it. Decided 2026-07-04 framing per program-80 SMB rule |
| Lead mining (IAP) | FlowWink-native: `contact_finder`, `enrich_company` (crm#ai_enrich, crm#ai_prospect done) | **non-goal** — bulk mining is credits-at-scale prospecting; Hunter-based finder covers SMB |
| Helpdesk configurable stages | Done (tickets#stage_pipeline) | **verify** |
| SLA policies (criteria→reach-stage-by-deadline, working hours) | Partial: tickets#sla_deadline_field only; no policy engine | **build (SMB-sized)** — one policy table (priority→hours), computed deadline + red/green badge; skip working-calendar math initially. Feeds tickets#escalation_rules |
| Canned responses | Missing (tickets#templates_canned, EPIC-07) | **build** — trivially SMB-daily; shortcut+substitution table usable by both admin UI and agent |
| Ticket ratings (CSAT on close) | Done (tickets#csat) | **verify** — confirm trigger is on close-stage like Odoo's folded-stage pattern |
| Ticket merge (Data Cleaning app) | Missing (tickets#split_merge) | **non-goal for now** — low frequency at SMB ticket volume; revisit if support volume grows |
| Multi-team helpdesk + load-balanced auto-assignment | Missing (tickets#multilevel_assignment) | **non-goal** — one team, agent-first triage (tickets#ai_triage done) replaces round-robin |

## 6. SMB lens (5-person sales team, daily)

**Daily-use core** (chase to parity): the kanban with next-activity color, scheduling the next step in two clicks, mark-done-with-note, Lost button with reason, weighted pipeline number, similar-lead warning, canned responses, SLA red/green on tickets. This is ~all of Odoo a 5-person team touches after week one.

**Enterprise extras** (non-goals above): lead mining at scale, rule-based assignment domains with scheduled runs, multi-team stage domains, gamification, resellers/partner assignment, marketing attribution reports.

**FlowWink's twist**: Odoo's discipline features exist to make *humans* keep the pipeline honest. In FlowWink the agent does the follow-ups, so the same primitives serve the *human verifier* instead — the next-activity chip and done-feedback trail are how the titthål stays trustworthy. Predictive scoring maps to the existing sales-intelligence module (100%) rather than a Bayes port.
