---
title: "Recruitment Module"
module_id: "recruitment"
version: "1.0.0"
category: "data"
autonomy: "agent-capable"
---

# Recruitment

> Teamtailor-inspired ATS: public job board, application intake, AI candidate scoring with weighted skill match, and Kanban pipeline. FlowPilot/ClawWink can run the full hire loop autonomously via MCP.

## Quick Facts

| Property | Value |
|----------|-------|
| **Module ID** | `recruitment` |
| **Version** | 1.0.0 |
| **Category** | data |
| **Autonomy** | agent-capable |
| **Core** | No |
| **Capabilities** | `data:write`, `data:read` |
| **MCP Group** | `crm` |

## Public surface

| Route | Purpose |
|-------|---------|
| `/jobs` | Public job board (shareable on LinkedIn) — lists active postings |
| `/jobs/:slug` | Job detail + inline application form (name, email, CV as text) |

Submitting an application creates an `applications` row in stage `applied` and triggers `score_candidate` if FlowPilot is enabled.

## Admin surface

| Route | Purpose |
|-------|---------|
| `/admin/recruitment` | Job postings list + create/edit |
| `/admin/recruitment/jobs/:id` | Job detail with applicant pipeline + match overlay |
| `/admin/recruitment/candidates/:id` | Candidate profile, score breakdown, stage controls |

### Candidate Match Overlay

Click any score badge (kanban card, applicant list, candidate page) to open a structured AI breakdown:

- **Weighted score** — `skills*0.40 + experience*0.30 + education*0.10 + location*0.10 + culture_fit*0.10`
- **Per-dimension bars** with animated 0–100 progress
- **Has vs. Missing skills** extracted from CV vs. job requirements
- **Recommendation** — `advance` / `hold` / `reject` with confidence level

Powered by `match_breakdown` (JSONB), `recommendation` and `confidence_level` columns on `applications`.

## Skills (MCP exposed)

All 6 skills are seeded with `enabled: true` and `mcp_exposed: true` and grouped under the `crm` toolset, so external orchestrators (ClawWink, OpenClaw) discover them via `/rest/groups?groups=recruitment`.

| Skill | Purpose |
|-------|---------|
| `manage_job_posting` | Create / update / publish / archive job postings |
| `parse_resume` | Extract structured fields from raw CV text |
| `score_candidate` | Run weighted AI match (returns full breakdown) |
| `move_application_stage` | Advance / reject candidate in pipeline |
| `draft_candidate_outreach` | Draft personalized email to candidate |
| `summarize_candidate_pipeline` | Aggregate pipeline status per job |

## Edge functions

- `score-candidate` — weighted scoring model, persists `match_breakdown` + `recommendation`
- `parse-resume` — text-only parser (PDF parsing planned)

## Database

- `job_postings` — title, slug, description, requirements, status
- `applications` — candidate_id, job_id, stage, ai_score, `match_breakdown` (jsonb), `recommendation`, `confidence_level`
- `candidates` — name, email, cv_text, parsed_profile

RLS: public can `INSERT` applications; only authenticated admins can `SELECT/UPDATE`.

## Guardrails

End-to-end vitest at `src/lib/__tests__/recruitment-module.e2e.test.ts` enforces:

1. Manifest exposes exactly the 6 skills above
2. `bootstrapModule('recruitment')` upserts them with `enabled=true, mcp_exposed=true`
3. `teardownModule` bulk-disables (never deletes)
4. Module is registered in the `crm` group inside `mcp-server/index.ts`

Plus the standard `module-registry.guardrails.test.ts` (manifest + settings key + registry import alignment).

## Autonomous flow (ClawWink)

```
list jobs → summarize_candidate_pipeline → score_candidate (re-score stale)
         → move_application_stage (advance top matches)
         → draft_candidate_outreach (send personalized email)
```

## Roadmap

- PDF CV upload + parsing (currently text-only)
- Interview scheduling via `calendar` module
- Offer letter generation via `contracts` module
- LinkedIn auto-syndication of new postings
