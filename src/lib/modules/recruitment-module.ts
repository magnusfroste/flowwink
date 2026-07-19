/**
 * Recruitment Module — Unified Definition
 *
 * Production-grade ATS (Applicant Tracking System) inspired by Teamtailor + Odoo Recruitment.
 * Real tables, real state machine, real admin UI. FlowPilot operates it via skills.
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { defineModule } from '@/lib/module-def';
import type { SkillSeed, AutomationSeed } from '@/lib/module-bootstrap';

const recruitmentInputSchema = z.object({
  action: z.enum([
    'list_jobs',
    'list_applications',
    'get_pipeline_summary',
  ]),
  job_id: z.string().uuid().optional(),
  stage: z.string().optional(),
});

const recruitmentOutputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  data: z.unknown().optional(),
});

type RecruitmentInput = z.infer<typeof recruitmentInputSchema>;
type RecruitmentOutput = z.infer<typeof recruitmentOutputSchema>;

const RECRUITMENT_SKILLS: SkillSeed[] = [
  {
    name: 'manage_job_posting',
    description:
      'Create, update, publish or close job postings (open roles). Use when: opening a new role, editing a job description, closing a filled position, listing active openings. NOT for: candidate applications (use manage_application).',
    category: 'crm',
    handler: 'db:job_postings',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_job_posting',
        description: 'CRUD on job postings',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['create', 'update', 'publish', 'close', 'list', 'get'],
            },
            job_id: { type: 'string' },
            title: { type: 'string' },
            slug: { type: 'string' },
            department: { type: 'string' },
            location: { type: 'string' },
            employment_type: {
              type: 'string',
              enum: ['full_time', 'part_time', 'contractor', 'internship'],
            },
            description: { type: 'string', description: 'Markdown job description' },
            requirements: { type: 'array', items: { type: 'string' } },
            salary_range: { type: 'string' },
          },
          required: ['action'],
          'x-action-required': {
            create: ['title'],
          },
        },
      },
    },
    instructions:
      'Job posting lifecycle: draft → published → closed. When publishing, ensure title, description and slug are set. Default employment_type to full_time.',
  },
  {
    name: 'parse_resume',
    description:
      'Parse a candidate CV (PDF/text) and extract structured data: name, email, phone, skills, experience, education. Use when: a new application arrives with a resume that needs structuring. NOT for: scoring (use score_candidate after parsing).',
    category: 'crm',
    handler: 'internal:parse_resume',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'parse_resume',
        description: 'Extract structured data from a CV',
        parameters: {
          type: 'object',
          properties: {
            application_id: { type: 'string' },
            resume_url: { type: 'string', description: 'Public URL to PDF/DOCX' },
            resume_text: { type: 'string', description: 'Raw text fallback' },
          },
          required: ['application_id'],
        },
      },
    },
    instructions:
      'Output structured JSON into applications.parsed_resume with shape: { name, email, phone, skills[], experience[{company,role,years}], education[{school,degree,year}], summary }.',
  },
  {
    name: 'score_candidate',
    description:
      'Evaluate a parsed candidate against a job posting and assign ai_score (0-100), ai_summary and matching/missing skills. Use when: a candidate has been parsed and needs ranking against the role. NOT for: moving stage (use move_application_stage).',
    category: 'crm',
    handler: 'ai-task:score_candidate',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'score_candidate',
        description: 'AI-score a candidate vs a job posting',
        parameters: {
          type: 'object',
          properties: {
            application_id: { type: 'string' },
          },
          required: ['application_id'],
        },
      },
    },
    instructions:
      'Read job_postings.requirements + applications.parsed_resume. Compute matching_skills, missing_skills, ai_score (0-100), ai_reasoning (1-3 sentences), ai_summary (one paragraph). Update the row.',
  },
  {
    name: 'move_application_stage',
    description:
      'Move a candidate application to a new pipeline stage. Use when: advancing a candidate (e.g. screened → interview_scheduled), rejecting, or marking hired. NOT for: editing candidate data.',
    category: 'crm',
    // Dedicated RPC (was db:applications generic CRUD): "move" is a status transition
    // the verb-inference can't infer, so it silently listed; and the generic handler
    // keys on `id` while this passes the natural application_id. The RPC validates the
    // stage enum, casts safely, and has a service-role escape. (process-QA 2026-07-09)
    handler: 'rpc:move_application_stage',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'move_application_stage',
        description: 'Change application stage',
        parameters: {
          type: 'object',
          properties: {
            application_id: { type: 'string' },
            to_stage: {
              type: 'string',
              enum: [
                'applied',
                'screened',
                'interview_scheduled',
                'interviewed',
                'offer_sent',
                'hired',
                'rejected',
                'withdrawn',
              ],
            },
            rejected_reason: { type: 'string' },
            comment: { type: 'string' },
          },
          required: ['application_id', 'to_stage'],
        },
      },
    },
    instructions:
      'Stage flow: applied → screened → interview_scheduled → interviewed → offer_sent → hired (or rejected from any stage). When rejecting, set rejected_reason. Stage history is auto-logged via trigger.',
  },
  {
    name: 'draft_candidate_outreach',
    description:
      'Draft a personalized email to a candidate (interview invite, rejection, offer). Use when: ready to contact candidate after a stage change. Returns draft text (does not send). NOT for: actually sending email (admin reviews first).',
    category: 'communication',
    handler: 'edge:chat-completion',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'draft_candidate_outreach',
        description: 'Draft personalized candidate email',
        parameters: {
          type: 'object',
          properties: {
            application_id: { type: 'string' },
            outreach_type: {
              type: 'string',
              enum: ['interview_invite', 'rejection', 'offer', 'follow_up'],
            },
            tone: { type: 'string', enum: ['warm', 'formal', 'concise'] },
            interview_time: { type: 'string', description: 'ISO datetime if interview_invite' },
          },
          required: ['application_id', 'outreach_type'],
        },
      },
    },
    instructions:
      'Use candidate name + job title + company identity. Default tone: warm. Always include the recruiter signature. Output as plain text.',
  },
  {
    name: 'hire_candidate',
    description:
      'Hire a candidate: convert their application into an HR employee record and seed an onboarding checklist. Use when: candidate has accepted offer and should be moved into HR. NOT for: stage changes alone (use move_application_stage). Closes the hire-to-onboard loop.',
    category: 'crm',
    handler: 'rpc:hire_candidate_from_application',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'hire_candidate',
        description: 'Convert application → employee + onboarding',
        parameters: {
          type: 'object',
          properties: {
            application_id: { type: 'string' },
            start_date: { type: 'string', description: 'YYYY-MM-DD, defaults to today' },
            employment_type: { type: 'string', enum: ['full_time', 'part_time', 'contractor'] },
            department: { type: 'string', description: 'Override job posting department if needed' },
          },
          required: ['application_id'],
        },
      },
    },
    instructions:
      'Calls hire_candidate_from_application RPC. Creates employees row from candidate_name/email/phone + job title, sets application.stage=hired, links employee_id, and creates a default onboarding checklist (IT, access, welcome, contract, policies, buddy). Idempotent — fails if already hired.',
  },
  {
    name: 'hire_application',
    description:
      'Full hire transaction: convert application → employee + create draft employment contract from a template (with token substitution) + seed onboarding checklist, all in one atomic RPC. Use when: candidate has accepted and you also want a draft contract ready for signature. NOT for: hires without a contract template (use hire_candidate). Closes hire-to-paperwork loop.',
    category: 'crm',
    handler: 'rpc:hire_application',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'hire_application',
        description: 'Application → employee + draft contract + onboarding (atomic)',
        parameters: {
          type: 'object',
          properties: {
            application_id: { type: 'string' },
            contract_template_id: { type: 'string', description: 'contract_templates.id used to draft the employment contract' },
            onboarding_template_id: { type: 'string', description: 'onboarding_templates.id seeding the checklist' },
            start_date: { type: 'string', description: 'YYYY-MM-DD' },
            department: { type: 'string', description: 'Override job posting department if needed' },
            manager_id: { type: 'string', description: 'employees.id of reporting manager' },
            monthly_salary_cents: { type: 'number', description: 'Monthly salary in cents (minor units)' },
          },
          required: ['application_id', 'contract_template_id', 'start_date'],
        },
      },
    },
    instructions:
      'Calls hire_application RPC. Single transaction: creates employee, draft employment_contracts row using template + tokens (candidate_name, job_title, start_date, salary, currency, etc.), and onboarding checklist. Application.stage→hired, links employee_id + contract_id. Idempotent — fails if already hired.',
  },
  {
    name: 'summarize_candidate_pipeline',
    description:
      'Summarize current pipeline state: per-job counts by stage, candidates stuck >X days, top-scored unreviewed candidates. Use when: admin asks "how is recruiting going?" or for daily briefing. NOT for: detailed candidate data (use list/get).',
    category: 'analytics',
    handler: 'rpc:summarize_candidate_pipeline',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'summarize_candidate_pipeline',
        description: 'Aggregate pipeline analytics',
        parameters: {
          type: 'object',
          properties: {
            job_id: { type: 'string', description: 'Optional, omit for all jobs' },
            stuck_threshold_days: { type: 'number', description: 'Default 7' },
          },
        },
      },
    },
    instructions:
      'Output: { totals_by_stage, stuck_applications[], top_unreviewed[] }. "Stuck" = no stage change in N days. "Unreviewed" = ai_score IS NULL or stage=applied.',
  },
  {
    name: 'schedule_interview',
    description:
      'Schedule, reschedule and record candidate interviews — creates a linked calendar event and checks the interviewer for double-booking. Use when: moving a candidate to interview, booking a phone screen, recording interview feedback. NOT for: customer bookings (manage_booking) or plain calendar events (manage_calendar_event).',
    category: 'crm',
    handler: 'rpc:schedule_interview',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'schedule_interview',
        description: 'schedule/reschedule/complete/cancel/no_show/list interviews per application. schedule creates a team calendar event; complete with feedback/rating writes a candidate note.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['schedule', 'reschedule', 'complete', 'cancel', 'no_show', 'list'] },
            p_interview_id: { type: 'string', format: 'uuid' },
            p_application_id: { type: 'string', format: 'uuid' },
            p_kind: { type: 'string', enum: ['phone_screen', 'technical', 'onsite', 'culture', 'final', 'interview'] },
            p_start: { type: 'string', description: 'ISO timestamp' },
            p_end: { type: 'string', description: 'ISO timestamp' },
            p_interviewer_id: { type: 'string', format: 'uuid', description: 'User id of the interviewer (conflict-checked)' },
            p_location: { type: 'string' },
            p_meeting_url: { type: 'string' },
            p_feedback: { type: 'string', description: 'On complete' },
            p_rating: { type: 'number', description: '1–5, on complete' },
          },
        },
      },
    },
    instructions:
      'schedule needs p_application_id + p_start + p_end; rejected/hired applications are refused. success:false with reason interviewer_conflict lists the clashing interviews — pick another slot. complete with p_feedback/p_rating also logs a [kind interview] candidate note for the pipeline view.',
  },
  {
    name: 'manage_candidate_assessment',
    description:
      'Assign tests/assessments to a candidate (coding, personality, case study, …) and record results. Use when: sending a take-home test, logging an external assessment score. NOT for: AI resume scoring (score_candidate) or interviews (schedule_interview).',
    category: 'crm',
    handler: 'rpc:manage_candidate_assessment',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_candidate_assessment',
        description: 'assign/record_result/list/delete candidate_assessments. record_result stamps completed_at and writes an [assessment] candidate note.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['assign', 'record_result', 'list', 'delete'] },
            p_assessment_id: { type: 'string', format: 'uuid' },
            p_application_id: { type: 'string', format: 'uuid' },
            p_name: { type: 'string', description: 'e.g. "Backend coding challenge"' },
            p_kind: { type: 'string', enum: ['coding', 'personality', 'language', 'case_study', 'cognitive', 'other'] },
            p_provider: { type: 'string', description: 'e.g. HackerRank, internal' },
            p_url: { type: 'string', description: 'Test link for the candidate' },
            p_due_date: { type: 'string', description: 'YYYY-MM-DD' },
            p_score: { type: 'number' },
            p_max_score: { type: 'number' },
            p_passed: { type: 'boolean' },
            p_notes: { type: 'string' },
          },
        },
      },
    },
    instructions:
      'assign needs p_application_id + p_name. Deliver the test link to the candidate via send_email/draft_candidate_outreach. record_result with p_score/p_max_score/p_passed; the result lands in candidate_notes so scoring and pipeline review see it.',
  },
  {
    name: 'manage_job_offer',
    description:
      'Generate offer letters from employment contract templates (merge fields filled from the application + job posting), track send/response. Use when: extending an offer to a candidate, recording their answer. NOT for: the final employment contract after hire (hire_application handles that).',
    category: 'crm',
    handler: 'rpc:manage_job_offer',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_job_offer',
        description: 'generate/send/record_response/get/list job_offers. generate merges {{candidate_name}}, {{job_title}}, {{salary}}, {{start_date}}, {{expires_at}} etc. into the template body.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['generate', 'send', 'record_response', 'get', 'list'] },
            p_offer_id: { type: 'string', format: 'uuid' },
            p_application_id: { type: 'string', format: 'uuid' },
            p_template_id: { type: 'string', format: 'uuid', description: 'employment_contract_templates id; default = the active default template' },
            p_salary_cents: { type: 'number', description: 'Monthly salary in cents' },
            p_currency: { type: 'string', description: 'Default SEK' },
            p_start_date: { type: 'string', description: 'YYYY-MM-DD' },
            p_expires_at: { type: 'string', description: 'YYYY-MM-DD (default +14 days)' },
            p_body_markdown: { type: 'string', description: 'Override body (merge fields still applied)' },
            p_status: { type: 'string', enum: ['accepted', 'declined', 'withdrawn', 'expired'], description: 'For record_response' },
            p_notes: { type: 'string' },
          },
        },
      },
    },
    instructions:
      'Flow: generate (draft with merged body_markdown) → send (status sent; actually deliver via send_email) → record_response accepted|declined. On accepted, follow with hire_application to convert to employee + contract + onboarding.',
  },
  {
    name: 'manage_reference_check',
    description:
      'Track reference/background checks per candidate: add referees, record outcomes with a rating. Use when: final-stage vetting before an offer. NOT for: assessments (manage_candidate_assessment) or interview feedback (schedule_interview).',
    category: 'crm',
    handler: 'rpc:manage_reference_check',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_reference_check',
        description: 'add/record/list/delete reference_checks. Status: pending → contacted → completed | declined. Completed checks write a [reference] candidate note.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['add', 'record', 'list', 'delete'] },
            p_reference_id: { type: 'string', format: 'uuid' },
            p_application_id: { type: 'string', format: 'uuid' },
            p_referee_name: { type: 'string' },
            p_referee_email: { type: 'string' },
            p_referee_phone: { type: 'string' },
            p_relationship: { type: 'string', description: 'e.g. former manager' },
            p_status: { type: 'string', enum: ['pending', 'contacted', 'completed', 'declined'] },
            p_rating: { type: 'number', description: '1–5' },
            p_notes: { type: 'string', description: 'What the referee said' },
          },
        },
      },
    },
    instructions:
      'add needs p_application_id + p_referee_name. record updates status/rating/notes — completed stamps completed_at and logs the note on the candidate. Candidates typically get 2–3 referees; list them per application.',
  },
  {
    name: 'recruitment_analytics',
    description:
      'Recruitment analytics: time-to-hire (avg/median days), source ROI (applications vs hires per source), stage funnel, interview stats, open positions. Use when: "how effective is our hiring?", channel decisions, quarterly HR review. NOT for: today\'s pipeline snapshot (summarize_candidate_pipeline).',
    category: 'analytics',
    handler: 'rpc:recruitment_analytics',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'recruitment_analytics',
        description: 'Read-only aggregate: {time_to_hire:{hires,avg_days,median_days}, source_roi:[{source,applications,hires,hire_rate_pct,avg_ai_score}], stage_funnel, interviews, open_positions}.',
        parameters: {
          type: 'object',
          properties: {
            p_days: { type: 'number', description: 'Lookback period (default 90)' },
            p_job_posting_id: { type: 'string', format: 'uuid', description: 'Scope to one job' },
          },
        },
      },
    },
    instructions:
      'Time-to-hire counts application created_at → hired_at. Source ROI compares hire rates per source — use it to decide where to post next. Pair with job-level scoping to evaluate a single search.',
  },
  {
    name: 'match_internal_candidates',
    description:
      'Internal mobility: rank existing employees against a job posting\'s required skills (employee_skills × skills_catalog). Use when: considering internal transfers before external hiring, succession planning. NOT for: scoring external applicants (score_candidate).',
    category: 'crm',
    handler: 'rpc:match_internal_candidates',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'match_internal_candidates',
        description: 'Returns active employees with match_score (matched required skills / total), matching_skills and missing_skills, best first.',
        parameters: {
          type: 'object',
          required: ['p_job_posting_id'],
          properties: {
            p_job_posting_id: { type: 'string', format: 'uuid' },
            p_limit: { type: 'number', description: 'Default 10' },
          },
        },
      },
    },
    instructions:
      'Requires required_skills on the job posting (returns job_has_no_required_skills otherwise) and skills registered on employees (manage_employee_skills / HR module). Skill names match case-insensitively against skills_catalog.',
  },
];

const RECRUITMENT_AUTOMATIONS: AutomationSeed[] = [
  {
    name: 'Recruitment Daily Pipeline Review',
    description:
      'Every weekday at 08:30, FlowPilot summarizes the candidate pipeline and flags stuck or top-scored candidates needing attention.',
    trigger_type: 'cron',
    trigger_config: { cron: '30 8 * * 1-5', expression: '30 8 * * 1-5' },
    skill_name: 'summarize_candidate_pipeline',
    skill_arguments: { stuck_threshold_days: 7 },
    executor: 'flowpilot',
  },
];

export const recruitmentModule = defineModule<RecruitmentInput, RecruitmentOutput>({
  id: 'recruitment',
  name: 'Recruitment',
  version: '1.0.0',
  processes: ['hire-to-retire'],
  maturity: 'L4',
  description:
    'Applicant Tracking System — job postings, candidate pipeline, AI scoring and outreach. FlowPilot runs the daily pipeline review.',
  capabilities: ['data:write', 'data:read'],
  tier: 'extended',
  inputSchema: recruitmentInputSchema,
  outputSchema: recruitmentOutputSchema,

  skills: [
    'manage_job_posting',
    'parse_resume',
    'score_candidate',
    'move_application_stage',
    'draft_candidate_outreach',
    'hire_candidate',
    'hire_application',
    'summarize_candidate_pipeline',
    'schedule_interview',
    'manage_candidate_assessment',
    'manage_job_offer',
    'manage_reference_check',
    'recruitment_analytics',
    'match_internal_candidates',
  ],
  data: {
    tables: ['interviews', 'candidate_assessments', 'reference_checks', 'job_offers', 'candidate_notes', 'applications', 'application_stages', 'job_postings', 'skills_catalog'],
  },
  skillSeeds: RECRUITMENT_SKILLS,
  automations: RECRUITMENT_AUTOMATIONS,

  async publish(input: RecruitmentInput): Promise<RecruitmentOutput> {
    const validated = recruitmentInputSchema.parse(input);

    if (validated.action === 'list_jobs') {
      const { data, error } = await supabase
        .from('job_postings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) {
        logger.error('[recruitment] list_jobs failed', error);
        return { success: false, message: error.message };
      }
      return { success: true, message: `Found ${data.length} jobs`, data };
    }

    if (validated.action === 'list_applications') {
      let query = supabase
        .from('applications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (validated.job_id) query = query.eq('job_posting_id', validated.job_id);
      if (validated.stage) query = query.eq('stage', validated.stage as never);
      const { data, error } = await query;
      if (error) return { success: false, message: error.message };
      return { success: true, message: `Found ${data.length} applications`, data };
    }

    if (validated.action === 'get_pipeline_summary') {
      const { data, error } = await supabase
        .from('applications')
        .select('stage, job_posting_id')
        .limit(1000);
      if (error) return { success: false, message: error.message };
      const counts: Record<string, number> = {};
      for (const row of data) counts[row.stage] = (counts[row.stage] ?? 0) + 1;
      return { success: true, message: 'Pipeline summary', data: { totals_by_stage: counts } };
    }

    return { success: false, message: 'Unsupported action' };
  },
});
