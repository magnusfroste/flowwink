import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { defineModule } from '@/lib/module-def';
import { z } from 'zod';

// --- Consultants Module Schemas ---

export const consultantMatchInputSchema = z.object({
  job_description: z.string().min(10, 'Job description must be at least 10 characters'),
  max_results: z.number().optional().default(3),
});

export const consultantMatchOutputSchema = z.object({
  success: z.boolean(),
  matches: z.array(z.object({
    consultant_id: z.string(),
    name: z.string(),
    title: z.string().optional(),
    score: z.number(),
    reasoning: z.string(),
    tailored_summary: z.string().optional(),
    cover_letter: z.string().optional(),
    matching_skills: z.array(z.string()),
    missing_skills: z.array(z.string()),
  })).optional(),
  error: z.string().optional(),
});

export type ConsultantMatchInput = z.infer<typeof consultantMatchInputSchema>;
export type ConsultantMatchOutput = z.infer<typeof consultantMatchOutputSchema>;

// ── Bundled skill definitions (migrated from setup-flowpilot) ──
const CONSULTANTS_SKILLS: SkillSeed[] = [
  {
    name: 'manage_consultant_profile',
    description: 'Manage consultant profiles: list, create, update, delete, deduplicate. Use when: adding a new consultant; updating skills or availability; cleaning up duplicate entries. NOT for: matching consultants to jobs (match_consultant); managing company profiles (manage_company).',
    category: 'content',
    handler: 'module:consultants',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_consultant_profile',
        description: 'Manage consultant profiles: list, create, update, delete, deduplicate. Use when: adding a new consultant; updating skills or availability; cleaning up duplicate entries. NOT for: matching consultants to jobs (match_consultant); managing company profiles (manage_company).',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: [
                'list',
                'create',
                'update',
                'delete',
                'find_duplicates',
              ],
            },
            profile_id: {
              type: 'string',
            },
            name: {
              type: 'string',
            },
            title: {
              type: 'string',
            },
            skills: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
            bio: {
              type: 'string',
            },
            experience_years: {
              type: 'number',
            },
          },
          required: [
            'action',
          ],
        },
      },
    },
    instructions: `## manage_consultant_profile
### What
Manages consultant/resume profiles: list, create, update, delete, find duplicates.
### When to use
- Admin uploads a resume → extract_pdf_text → parse_resume → manage_consultant_profile(create)
- Editing consultant information
- Finding duplicate profiles
### Parameters
- **action**: Required. list, create, update, delete, find_duplicates.
- **name**, **title**, **skills**, **bio**: For create/update.
### Edge cases
- find_duplicates uses name similarity to detect potential duplicates.
- Chain: extract_pdf_text → parse structured data → create profile.`,
  },
  {
    name: 'match_consultant',
    description: 'Match consultants to a job description using AI. Use when: finding suitable candidates for an open position; a user provides a job description and needs recommendations; identifying best-fit consultants. NOT for: managing consultant profiles (manage_consultant_profile); researching companies (prospect_research).',
    category: 'content',
    handler: 'module:consultants',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'match_consultant',
        description: 'Match consultants to a job description using AI. Use when: finding suitable candidates for an open position; a user provides a job description and needs recommendations; identifying best-fit consultants. NOT for: managing consultant profiles (manage_consultant_profile); researching companies (prospect_research).',
        parameters: {
          type: 'object',
          properties: {
            job_description: {
              type: 'string',
              description: 'Job requirements text',
            },
            max_results: {
              type: 'number',
              description: 'Max matches (default 3)',
            },
          },
          required: [
            'job_description',
          ],
        },
      },
    },
    instructions: `## match_consultant
### What
AI-powered matching of consultants to a job description.
### When to use
- Client has a job opening and needs consultant recommendations
- Admin asks "who is best for this project?"
- Automated matching in recruitment workflows
### Parameters
- **job_description**: Required. Full job requirements text.
- **max_results**: Max matches to return (default 3).
### Edge cases
- Works best with enriched profiles (skills, experience, bio).
- Returns ranked matches with match reasoning.`,
  },
  {
    name: 'consultant_checkin_update',
    description: "Update a consultant's own profile during a check-in interview. Updates bio, summary, skills, availability, and experience. Use when: a consultant has completed a check-in conversation and you have gathered enough information to update their profile. NOT for: admin-driven profile edits (manage_consultant_profile).",
    category: 'content',
    handler: 'module:consultants',
    scope: 'external',
    tool_definition: {
      type: 'function',
      function: {
        name: 'consultant_checkin_update',
        description: 'Save updated consultant profile information gathered during a check-in interview.',
        parameters: {
          type: 'object',
          properties: {
            profile_id: { type: 'string', description: 'The consultant UUID' },
            bio: { type: 'string', description: 'Short personal bio' },
            summary: { type: 'string', description: 'Professional summary including latest project and highlights' },
            skills: { type: 'array', items: { type: 'string' }, description: 'List of skills and technologies' },
            availability: { type: 'string', enum: ['available', 'unavailable', 'soon'], description: 'Current availability status' },
            experience_years: { type: 'number', description: 'Total years of professional experience' },
            experience_json: {
              type: 'array',
              description: 'Work experience entries',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  company: { type: 'string' },
                  start_date: { type: 'string' },
                  end_date: { type: 'string' },
                  description: { type: 'string' },
                },
              },
            },
          },
          required: ['profile_id'],
        },
      },
    },
    instructions: `## consultant_checkin_update\n### What\nSaves updated consultant profile info gathered during a check-in interview.\n### When to use\n- After 3-5 exchanges with the consultant when you have concrete updates.\n- Only include fields you have information about.\n### Parameters\n- **profile_id**: Required UUID.\n- bio, summary, skills, availability, experience_years, experience_json: optional updates.`,
  },
  {
    name: 'reindex_consultants',
    description: 'Re-embed consultant profiles whose semantic-search index is stale. Use when: an automation or admin wants to refresh embeddings after bulk profile changes; keeping vector search up to date. NOT for: matching consultants to a job (match_consultant); editing profiles (manage_consultant_profile).',
    category: 'system',
    handler: 'edge:consultant-match',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'reindex_consultants',
        description: 'Embed consultant_profiles rows currently flagged embedding_status=stale.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['reindex_stale'], default: 'reindex_stale' },
            limit: { type: 'number', description: 'Max profiles to process per run (1-100)', default: 25 },
          },
        },
      },
    },
    instructions: `## reindex_consultants\n### What\nProcesses stale consultant profile embeddings in batches.\n### When to use\n- Scheduled background job (every 10 min by default).\n- After importing many consultants.\n### Parameters\n- action: only \"reindex_stale\" is supported today.\n- limit: defaults to 25, max 100.`,
  },
  {
    name: 'manage_consultant_assignment',
    description: 'Track consultant assignments/engagements: which client a consultant works for, allocation %, rate, period, linked contract/SOW. Use when: staffing a consultant on a client engagement; updating or ending an assignment; listing who works where. NOT for: profile edits (manage_consultant_profile), employee records (hr module).',
    category: 'content',
    handler: 'rpc:manage_consultant_assignment',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_consultant_assignment',
        description: 'create/update/end/get/list consultant assignments. list filters by p_consultant_id and/or p_status.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['create', 'update', 'end', 'get', 'list'] },
            p_assignment_id: { type: 'string', format: 'uuid', description: 'Required for update/end/get' },
            p_consultant_id: { type: 'string', format: 'uuid', description: 'Required for create; list filter' },
            p_client_name: { type: 'string', description: 'Required for create' },
            p_company_id: { type: 'string', format: 'uuid', description: 'Link to a companies row' },
            p_contract_id: { type: 'string', format: 'uuid', description: 'Link to the engagement contract/SOW in the contracts module' },
            p_project_id: { type: 'string', format: 'uuid' },
            p_role_title: { type: 'string', description: 'e.g. "Senior Backend Developer"' },
            p_start_date: { type: 'string', description: 'YYYY-MM-DD (default today)' },
            p_end_date: { type: 'string', description: 'YYYY-MM-DD' },
            p_allocation_pct: { type: 'number', description: '1-100, default 100' },
            p_hourly_rate_cents: { type: 'number', description: 'Defaults to the consultant profile rate' },
            p_currency: { type: 'string' },
            p_status: { type: 'string', enum: ['planned', 'active', 'ended'] },
            p_sow_url: { type: 'string', description: 'Statement-of-work document URL' },
            p_notes: { type: 'string' },
          },
        },
      },
    },
    instructions: 'Contract/SOW tracking: link p_contract_id (create the contract via manage_contract first) and/or attach p_sow_url. end sets status=ended with end_date (default today). Feeds consultant_utilization_report.',
  },
  {
    name: 'consultant_utilization_report',
    description: 'Utilization report for the consultant pool: allocation % per consultant over a date window, with assignment breakdown — spot bench time and overbooking. Use when: "who is free next month?", staffing reviews, utilization KPIs. NOT for: matching skills to a job (match_consultant).',
    category: 'content',
    handler: 'rpc:consultant_utilization_report',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'consultant_utilization_report',
        description: 'Per active consultant: utilization_pct (allocation weighted by assignment overlap with the window; >100 = overbooked, 0 = bench) + assignments. Defaults to the current month.',
        parameters: {
          type: 'object',
          properties: {
            p_from: { type: 'string', description: 'YYYY-MM-DD (default: first of current month)' },
            p_to: { type: 'string', description: 'YYYY-MM-DD (default: last of current month)' },
            p_consultant_id: { type: 'string', format: 'uuid', description: 'Limit to one consultant' },
          },
        },
      },
    },
    instructions: 'planned assignments are excluded; active and ended ones count for the days they overlap the window. Sorted by utilization descending — the tail is the bench.',
  },
  {
    name: 'manage_consultant_rates',
    description: 'Per-skill hourly-rate matrix for consultants (e.g. React 1200 kr/h, DevOps 1400 kr/h) on top of the profile default rate. Use when: quoting engagements per competence, maintaining the rate card, comparing rates across the pool. NOT for: product price lists (pricelists module).',
    category: 'content',
    handler: 'rpc:manage_consultant_rates',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_consultant_rates',
        description: 'set (upsert consultant+skill rate), delete, list, matrix (consultants × skills rate grid incl. profile default rate).',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['set', 'delete', 'list', 'matrix'] },
            p_consultant_id: { type: 'string', format: 'uuid', description: 'Required for set/delete; list filter' },
            p_skill: { type: 'string', description: 'Skill name, e.g. "React" — one rate per consultant+skill' },
            p_level: { type: 'string', enum: ['junior', 'mid', 'senior', 'expert'] },
            p_hourly_rate_cents: { type: 'number', description: 'Required for set (minor units, e.g. öre)' },
            p_currency: { type: 'string', description: 'Default SEK' },
          },
        },
      },
    },
    instructions: 'set upserts on (consultant_id, skill). matrix returns every active consultant with default_hourly_rate_cents (profile) plus a {skill: rate} map — use it for quoting and rate-card exports.',
  },
];


export const consultantsModule = defineModule<ConsultantMatchInput, ConsultantMatchOutput>({
  id: 'consultants',
  name: 'Consultants',
  version: '1.0.0',
  processes: ['hire-to-retire'],
  maturity: 'L3',
  description: 'Match consultant profiles against job descriptions with AI-powered scoring and cover letters',
  capabilities: ['data:read', 'content:produce'],
  tier: 'extended',
  inputSchema: consultantMatchInputSchema,
  outputSchema: consultantMatchOutputSchema,

  skills: [
    'manage_consultant_profile',
    'match_consultant',
    'consultant_checkin_update',
    'reindex_consultants',
    'manage_consultant_assignment',
    'consultant_utilization_report',
    'manage_consultant_rates',
  ],
  data: {
    tables: ['consultant_profiles', 'consultant_assignments', 'consultant_skill_rates'],
  },
  skillSeeds: CONSULTANTS_SKILLS,

  automations: [
    {
      name: 'consultant_reindex_stale',
      description: 'Background job that embeds consultant profiles flagged as stale so semantic search stays fresh.',
      trigger_type: 'cron',
      // Hourly, not every ten minutes: on autoversio this fired 5 841 times for a
      // handful of stale rows, and each fire is a dispatcher pulse (2026-09-04).
      trigger_config: { expression: '7 * * * *' },
      skill_name: 'reindex_consultants',
      skill_arguments: { action: 'reindex_stale', limit: 25 },
      executor: 'platform',
    },
  ],


  async publish(input: ConsultantMatchInput): Promise<ConsultantMatchOutput> {
    try {
      const validated = consultantMatchInputSchema.parse(input);

      const { data, error } = await supabase.functions.invoke('consultant-match', {
        body: validated,
      });

      if (error) {
        logger.error('[ConsultantsModule] Edge function error:', error);
        return { success: false, error: error.message };
      }

      return data as ConsultantMatchOutput;
    } catch (error) {
      logger.error('[ConsultantsModule] Error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
});
