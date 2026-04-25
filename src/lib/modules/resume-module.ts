import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { defineModule } from '@/lib/module-def';
import { z } from 'zod';

// --- Resume Module Schemas ---

export const resumeMatchInputSchema = z.object({
  job_description: z.string().min(10, 'Job description must be at least 10 characters'),
  max_results: z.number().optional().default(3),
});

export const resumeMatchOutputSchema = z.object({
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

export type ResumeMatchInput = z.infer<typeof resumeMatchInputSchema>;
export type ResumeMatchOutput = z.infer<typeof resumeMatchOutputSchema>;

// ── Bundled skill definitions (migrated from setup-flowpilot) ──
const RESUME_SKILLS: SkillSeed[] = [
  {
    name: 'manage_consultant_profile',
    description: 'Manage consultant/resume profiles: list, create, update, delete, deduplicate. Use when: adding a new consultant; updating skills or availability; cleaning up duplicate entries. NOT for: matching consultants to jobs (match_consultant); managing company profiles (manage_company).',
    category: 'content',
    handler: 'module:resume',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_consultant_profile',
        description: 'Manage consultant/resume profiles: list, create, update, delete, deduplicate. Use when: adding a new consultant; updating skills or availability; cleaning up duplicate entries. NOT for: matching consultants to jobs (match_consultant); managing company profiles (manage_company).',
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
    handler: 'module:resume',
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
];

export const resumeModule = defineModule<ResumeMatchInput, ResumeMatchOutput>({
  id: 'resume',
  name: 'Consultants',
  version: '1.0.0',
  description: 'Match consultant profiles against job descriptions with AI-powered scoring and cover letters',
  capabilities: ['data:read', 'content:produce'],
  inputSchema: resumeMatchInputSchema,
  outputSchema: resumeMatchOutputSchema,

  skills: [
    'manage_consultant_profile',
    'match_consultant',
  ],
  skillSeeds: RESUME_SKILLS,

  async publish(input: ResumeMatchInput): Promise<ResumeMatchOutput> {
    try {
      const validated = resumeMatchInputSchema.parse(input);

      const { data, error } = await supabase.functions.invoke('resume-match', {
        body: validated,
      });

      if (error) {
        logger.error('[ResumeModule] Edge function error:', error);
        return { success: false, error: error.message };
      }

      return data as ResumeMatchOutput;
    } catch (error) {
      logger.error('[ResumeModule] Error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
});
