import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { ModuleDefinition } from '@/types/module-contracts';
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

export const resumeModule: ModuleDefinition<ResumeMatchInput, ResumeMatchOutput> = {
  id: 'resume',
  name: 'Resume',
  version: '1.0.0',
  description: 'Match consultant profiles against job descriptions with AI-powered scoring and cover letters',
  capabilities: ['data:read', 'content:produce'],
  inputSchema: resumeMatchInputSchema,
  outputSchema: resumeMatchOutputSchema,

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
};
