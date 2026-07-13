---
title: "Recruitment Module"
module_id: "recruitment"
version: "1.0.0"
category: "data"
autonomy: "agent-capable"
generated: true
generated_at: "2026-07-13"
---

# Recruitment

> Applicant Tracking System — job postings, candidate pipeline, AI scoring and outreach. FlowPilot runs the daily pipeline review.

Ships with **14 agent skills**, **4 database tables**, an **admin UI**.

## Quick Facts

| Property | Value |
|----------|-------|
| **Module ID** | `recruitment` |
| **Version** | 1.0.0 |
| **Category** | data |
| **Autonomy** | agent-capable |
| **Core** | No |
| **Capabilities** | `data:write`, `data:read` |
| **MCP-exposed skills** | 14 |
| **Owns tables** | 4 |

## Skills

These skills are seeded into `agent_skills` when the module is enabled and exposed via MCP.
External operators (FlowPilot, OpenClaw, Claude Desktop, custom MCP clients) can call them directly.

| Skill | Scope | Description |
|-------|-------|-------------|
| `manage_job_posting` | internal | Create, update, publish or close job postings (open roles). Use when: opening a new role, editing a job description, closing a filled position, listing active openings. NOT for: candidate applicati… |
| `parse_resume` | internal | Parse a candidate CV (PDF/text) and extract structured data: name, email, phone, skills, experience, education. Use when: a new application arrives with a resume that needs structuring. NOT for: sc… |
| `score_candidate` | internal | Evaluate a parsed candidate against a job posting and assign ai_score (0-100), ai_summary and matching/missing skills. Use when: a candidate has been parsed and needs ranking against the role. NOT … |
| `move_application_stage` | internal | Move a candidate application to a new pipeline stage. Use when: advancing a candidate (e.g. screened → interview_scheduled), rejecting, or marking hired. NOT for: editing candidate data. |
| `draft_candidate_outreach` | internal | Draft a personalized email to a candidate (interview invite, rejection, offer). Use when: ready to contact candidate after a stage change. Returns draft text (does not send). NOT for: actually send… |
| `hire_candidate` | internal | Hire a candidate: convert their application into an HR employee record and seed an onboarding checklist. Use when: candidate has accepted offer and should be moved into HR. NOT for: stage changes a… |
| `hire_application` | internal | Full hire transaction: convert application → employee + create draft employment contract from a template (with token substitution) + seed onboarding checklist, all in one atomic RPC. Use when: cand… |
| `summarize_candidate_pipeline` | internal | Summarize current pipeline state: per-job counts by stage, candidates stuck >X days, top-scored unreviewed candidates. Use when: admin asks "how is recruiting going?" or for daily briefing. NOT for… |
| `schedule_interview` | internal | Schedule, reschedule and record candidate interviews — creates a linked calendar event and checks the interviewer for double-booking. Use when: moving a candidate to interview, booking a phone scre… |
| `manage_candidate_assessment` | internal | Assign tests/assessments to a candidate (coding, personality, case study, …) and record results. Use when: sending a take-home test, logging an external assessment score. NOT for: AI resume scoring… |
| `manage_job_offer` | internal | Generate offer letters from employment contract templates (merge fields filled from the application + job posting), track send/response. Use when: extending an offer to a candidate, recording their… |
| `manage_reference_check` | internal | Track reference/background checks per candidate: add referees, record outcomes with a rating. Use when: final-stage vetting before an offer. NOT for: assessments (manage_candidate_assessment) or in… |
| `recruitment_analytics` | internal | Recruitment analytics: time-to-hire (avg/median days), source ROI (applications vs hires per source), stage funnel, interview stats, open positions. Use when: "how effective is our hiring?", channe… |
| `match_internal_candidates` | internal | Internal mobility: rank existing employees against a job posting\ |

## Data Model

Tables created by this module (from migrations):

- `public.candidate_assessments`
- `public.interviews`
- `public.job_offers`
- `public.reference_checks`

All tables ship with Row-Level Security policies. See migration files for the exact rules.

## Module API Contract

**Actions:** `list_jobs`, `list_applications`, `get_pipeline_summary`

**Input fields:** `action`, `job_id`, `stage`

**Output fields:** `success`, `message`, `data`

## Used in Processes

This module participates in the following end-to-end business processes:

- [hire-to-retire](../processes/hire-to-retire.md)

## File Map

| Purpose | Path |
|---------|------|
| Module definition | `src/lib/modules/recruitment-module.ts` |
| Hook | `src/hooks/useRecruitment.ts` |
| Admin page | `src/pages/admin/RecruitmentPage.tsx` |
| Migration | `supabase/migrations/20260708040000_recruitment-parity-r6.sql` |

## Contributing

To enhance this module, see [Contributing Guide](../contributing/contributing.md).

Key rules:
- Follow `ModuleDefinition<I, O>` contract pattern
- All schema changes require idempotent migrations
- Skills must be self-describing ([Law 2](../concepts/openclaw-law.md))
- Blocks are interfaces, not pipelines ([Law 3](../concepts/openclaw-law.md))
- New skills must pass the [Agent Contract Integrity](../../mem/architecture/agent-contract-integrity.md) checklist (`bun run lint:skills`)

---

*This file is auto-generated by `scripts/generate-module-docs.ts`. Do not edit manually — re-run the script after changing the module definition.*