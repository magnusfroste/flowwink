---
title: "Odoo reference card — CRM depth (crm / deals / tickets)"
cluster: "CRM depth (crm 63%, deals 61%, tickets 48% — P1)"
odoo_apps: "CRM (crm.lead, crm.stage, crm.lost.reason), Helpdesk (helpdesk.ticket), mail (mail.activity)"
sources:
  - https://www.odoo.com/documentation/18.0/applications/sales/crm.html
  - https://www.odoo.com/documentation/18.0/applications/essentials/activities.html
  - https://www.odoo.com/documentation/18.0/applications/services/helpdesk.html
  - github.com/odoo/odoo 18.0 — addons/crm/models/crm_lead.py, addons/mail/models/mail_activity.py
date: 2026-07-04
source: docs+community-source (Helpdesk is Enterprise — helpdesk claims docs-only)
---

# Odoo 18 CRM + Helpdesk — pipeline discipline reference

## 1. Process skeleton

```
lead (type='lead') ──convert──▶ opportunity (type='opportunity')
        │  qualifying queue          │ staged kanban (crm.stage, per-team)
        │                            ├─▶ WON  (stage is_won=True, probability=100)
        │                            └─▶ LOST (active=False, probability=0, lost_reason_id)
        └── merge on duplicate       ▲ Restore / toggle_active re-opens
ACTIVITY LOOP (on every record): schedule next activity → do it → mark done
(feedback logged to chatter) → suggest/trigger next activity → repeat until won/lost
```

- **Leads are an optional qualifying step** ("a qualifying step before an opportunity is created") toggled in CRM Settings, per-team disable possible ([convert.html](https://www.odoo.com/documentation/18.0/applications/sales/crm/acquire_leads/convert.html)).
- `crm.lead` is ONE model for both; `type` field flips `'lead'`→`'opportunity'`; `convert_opportunity()` sets `date_conversion` and can trigger salesperson assignment (`_handle_salesmen_assignment()`) ([crm_lead.py](https://github.com/odoo/odoo/blob/18.0/addons/crm/models/crm_lead.py)). FlowWink's shared `pipeline_stages` engine over leads/deals/tickets is the analogous single-engine choice.
- Stages (`crm.stage`) are per-team filterable (`team_id` domain); moving stage updates `date_last_stage_update`; a won stage forces `probability=100` in `write()` (crm_lead.py).

## 2. The activity / next-step model (maps to FlowWink's titthål vision)

Odoo's core sales discipline is **"every open opportunity carries a scheduled next activity"**; the pipeline kanban surfaces it and its urgency at a glance.

Per `mail.activity` record ([mail_activity.py](https://github.com/odoo/odoo/blob/18.0/addons/mail/models/mail_activity.py), [activities.html](https://www.odoo.com/documentation/18.0/applications/essentials/activities.html)):

| Field | Meaning |
|---|---|
| `activity_type_id` | Email / Call / Meeting / To-Do / Upload Document (CRM defaults) |
| `summary`, `note` | short title + detail |
| `date_deadline` (required, indexed) | due date |
| `user_id` | assignee (defaults to current user) |
| `res_model`/`res_id` | polymorphic link to any record |
| `state` (computed) | `overdue` / `today` / `planned` — from deadline vs user-TZ today (`_compute_state_from_date()`) |

Discipline mechanics:
- **Overdue coloring everywhere**: "green have a due date in the future, orange are due today, red are overdue" — same coding in kanban clock-icon, list Activities column, and the dedicated Activity view (activities.html).
- **Done = audit trail, not a checkbox**: `action_feedback()` → `_action_done()` posts the feedback as a chatter message, moves attachments onto that message, then deletes/archives the activity (mail_activity.py). Completed work becomes permanent timeline history.
- **Chaining**: `chaining_type` = "Suggest Next Activity" (recommend, `recommended_activity_type_id`) or "Trigger Next Activity" (`triggered_next_type_id`, auto-created), scheduled relative to previous deadline or completion date (activities.html). **Activity Plans** launch a whole preset sequence at once ([utilize_activities.html](https://www.odoo.com/documentation/18.0/applications/sales/crm/optimize/utilize_activities.html)).

**FlowWink counterpart, honest compare** (`src/components/admin/crm/`):
- `CrmTasksCard.tsx` groups by overdue/today/upcoming with priority badges — the color-discipline core exists per-record. Missing vs Odoo: no activity *types*, no "done posts feedback to timeline" (completion is just `completed_at`), no chaining/plans, and — most important — **no pipeline-level surfacing**: LeadKanban cards don't show next-activity state, and nothing enforces/flags "open deal with no next step".
- `LeadCommunicationsCard.tsx` is actually *ahead* of Odoo chatter on the titthål axis: `deriveActor()` labels every entry Agent/Manual/Inbound/System, which Odoo does not distinguish (everything is "a user" or OdooBot).
- For an agent-does-the-work model the valuable Odoo pattern is the **verification loop**: done-with-feedback + next-step-always-scheduled gives the human a one-glance answer to "what did the agent do, what happens next, is anything stalled".

## 3. Won/lost discipline

- **Lost**: Lost button → popup with `lost_reason_id` (dropdown, create-on-the-fly) + free-text Closing Note; both optional. Record is **archived** (`active=False`), `probability=0` ([lost_opportunities.html](https://www.odoo.com/documentation/18.0/applications/sales/crm/pipeline/lost_opportunities.html), crm_lead.py `action_set_lost()`).
- **Lost reasons taxonomy**: flat list at CRM ‣ Configuration ‣ Lost Reasons; shared by leads and opportunities.
- **Re-open**: Restore button / bulk Unarchive; `toggle_active()` recomputes probabilities (crm_lead.py).
- **Won**: `action_set_won()` moves to an `is_won` stage, probability 100, unarchives.
- **Reporting**: Pipeline Analysis has Won/Lost filters, group-by **Lost Reason**, measures incl. Days to Close, Days to Convert, Expected/Prorated Revenue ([win_loss.html](https://www.odoo.com/documentation/18.0/applications/sales/crm/performance/win_loss.html)).

## 4. Revenue, probability, enrichment, assignment, duplicates (condensed)

- **Forecast** = `prorated_revenue = expected_revenue × probability / 100` per record; `recurring_revenue` variants exist (crm_lead.py). FlowWink computes the same weighted forecast from `pipeline_stages.probability` (crm#forecast done).
- **Predictive lead scoring (PLS)**: naive-Bayes `automated_probability` (`_pls_get_naive_bayes_probabilities()`); variables: state/country, phone/email quality, source, language, tags — Stage and Team always included; manual override freezes auto-sync ([lead_scoring.html](https://www.odoo.com/documentation/18.0/applications/sales/crm/track_leads/lead_scoring.html)).
- **Rule-based assignment**: per-team/per-salesperson domains (e.g. `Probability >= 20`), run manually or repeatedly on a schedule; assignment converts leads to opportunities (lead_scoring.html).
- **Lead mining / enrichment**: IAP credits, filter by country/size/industry/role ([lead_mining.html](https://www.odoo.com/documentation/18.0/applications/sales/crm/acquire_leads/lead_mining.html)); FlowWink's `enrich_company` + `contact_finder` (Hunter) cover the SMB slice without credits.
- **Similar-lead detection**: compares email (domain-exact) + sanitized phone + commercial-entity (`_compute_potential_lead_duplicates()`), surfaced as a "Similar Leads" smart button; merge keeps oldest record, logs the rest to chatter, irreversible ([merge_similar.html](https://www.odoo.com/documentation/18.0/applications/sales/crm/pipeline/merge_similar.html)). FlowWink's `find_duplicate_leads` (trigram + plus-addressing-normalized email) is comparable; proactive smart-button surfacing is not.

### Helpdesk (docs-only; Enterprise app)

- **Stages**: per-team pipelines, customizable stages, folded = closed; **stage-linked email templates** notify customers on stage entry ([helpdesk.html](https://www.odoo.com/documentation/18.0/applications/services/helpdesk.html)).
- **Assignment**: round-robin "equal number of tickets" or load-balancing "equal open tickets"; skips users on time off (helpdesk.html).
- **SLA**: policy = criteria (team required; priority, tags, customer, type) + target ("Reach Stage" within X working hours, with excluded stages); deadline from creation date + working calendar; green tag = met, red = failed; SLA Status Analysis report ([sla.html](https://www.odoo.com/documentation/18.0/applications/services/helpdesk/overview/sla.html)).
- **Ratings**: folded-stage email template `Helpdesk: Ticket Rating Request`; 3-point smiley scale; result lands in ticket chatter ([ratings.html](https://www.odoo.com/documentation/18.0/applications/services/helpdesk/overview/ratings.html)).
- **Canned responses**: shortcut → substitution text, inserted with `::`, group-scoped ([responses.html](https://www.odoo.com/documentation/18.0/applications/websites/livechat/responses.html)). Availability inside Helpdesk ticket chatter: unverified (docs detail live chat only).

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
