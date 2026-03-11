import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import {
  ModuleDefinition,
} from '@/types/module-contracts';
import { z } from 'zod';

// --- Sales Intelligence Schemas ---

export const salesIntelligenceInputSchema = z.object({
  action: z.enum(['research', 'fit-analysis', 'profile-setup']).default('research'),
  company_name: z.string().min(1).optional(),
  company_url: z.string().url().optional(),
  company_id: z.string().uuid().optional(),
  profile_type: z.enum(['company', 'user']).optional(),
  profile_data: z.record(z.unknown()).optional(),
  decision_maker_first_name: z.string().optional(),
  decision_maker_last_name: z.string().optional(),
}).passthrough();

export const salesIntelligenceOutputSchema = z.object({
  success: z.boolean(),
  company: z.record(z.unknown()).optional(),
  contacts: z.array(z.record(z.unknown())).optional(),
  hunter_contacts_found: z.number().optional(),
  questions_and_answers: z.array(z.record(z.unknown())).optional(),
  company_summary: z.record(z.unknown()).optional(),
  fit_score: z.number().optional(),
  fit_advice: z.string().optional(),
  problem_mapping: z.array(z.record(z.unknown())).optional(),
  introduction_letter: z.string().optional(),
  email_subject: z.string().optional(),
  profile: z.record(z.unknown()).optional(),
  error: z.string().optional(),
}).passthrough();

export type SalesIntelligenceInput = z.infer<typeof salesIntelligenceInputSchema>;
export type SalesIntelligenceOutput = z.infer<typeof salesIntelligenceOutputSchema>;

const ACTION_MAP: Record<string, string> = {
  'research': 'prospect-research',
  'fit-analysis': 'prospect-fit-analysis',
  'profile-setup': 'sales-profile-setup',
};

export const salesIntelligenceModule: ModuleDefinition<SalesIntelligenceInput, SalesIntelligenceOutput> = {
  id: 'salesIntelligence',
  name: 'Sales Intelligence',
  version: '2.0.0',
  description: 'Prospect research, fit analysis, profile management, and introduction letter generation',
  capabilities: ['data:read', 'data:write'],
  inputSchema: salesIntelligenceInputSchema,
  outputSchema: salesIntelligenceOutputSchema,

  async publish(input: SalesIntelligenceInput): Promise<SalesIntelligenceOutput> {
    try {
      const validated = salesIntelligenceInputSchema.parse(input);
      const action = validated.action || 'research';
      const edgeFunction = ACTION_MAP[action];

      if (!edgeFunction) {
        return { success: false, error: `Unknown action: ${action}` };
      }

      // Build body based on action
      let body: Record<string, unknown>;
      if (action === 'profile-setup') {
        body = { type: validated.profile_type, data: validated.profile_data };
      } else if (action === 'fit-analysis') {
        body = {
          company_id: validated.company_id,
          company_name: validated.company_name,
          decision_maker_first_name: validated.decision_maker_first_name,
          decision_maker_last_name: validated.decision_maker_last_name,
        };
      } else {
        body = {
          company_name: validated.company_name,
          company_url: validated.company_url,
        };
      }

      const { data, error } = await supabase.functions.invoke(edgeFunction, { body });

      if (error) {
        logger.error(`[SalesIntelligenceModule] ${edgeFunction} error:`, error);
        return { success: false, error: error.message };
      }

      return data as SalesIntelligenceOutput;
    } catch (error) {
      logger.error('[SalesIntelligenceModule] Error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
};
