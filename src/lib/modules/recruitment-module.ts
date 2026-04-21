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
        },
      },
    },
    instructions:
      'Job posting lifecycle: draft → published → closed. When publishing, ensure title, description and slug are set. Default employment_type to full_time. Swedish: "tjänst", "rekrytering", "ledig position".',
  },
  {
    name: 'parse_resume',
    description:
      'Parse a candidate CV (PDF/text) and extract structured data: name, email, phone, skills, experience, education. Use when: a new application arrives with a resume that needs structuring. NOT for: scoring (use score_candidate after parsing).',
    category: 'crm',
    handler: 'edge:parse-resume',
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
    handler: 'edge:score-candidate',
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
    handler: 'db:applications',
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
    name: 'summarize_candidate_pipeline',
    description:
      'Summarize current pipeline state: per-job counts by stage, candidates stuck >X days, top-scored unreviewed candidates. Use when: admin asks "how is recruiting going?" or for daily briefing. NOT for: detailed candidate data (use list/get).',
    category: 'analytics',
    handler: 'db:applications',
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
  },
];

export const recruitmentModule = defineModule<RecruitmentInput, RecruitmentOutput>({
  id: 'recruitment',
  name: 'Recruitment',
  version: '1.0.0',
  description:
    'Applicant Tracking System — job postings, candidate pipeline, AI scoring and outreach. FlowPilot runs the daily pipeline review.',
  capabilities: ['data:write', 'data:read'],
  inputSchema: recruitmentInputSchema,
  outputSchema: recruitmentOutputSchema,

  skills: [
    'manage_job_posting',
    'parse_resume',
    'score_candidate',
    'move_application_stage',
    'draft_candidate_outreach',
    'summarize_candidate_pipeline',
  ],
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
