import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import {
  ModuleDefinition,
} from '@/types/module-contracts';
import { z } from 'zod';

// --- Sales Intelligence Schemas ---

export const salesIntelligenceInputSchema = z.object({
  company_name: z.string().min(1),
  company_url: z.string().url().optional(),
});

export const salesIntelligenceOutputSchema = z.object({
  success: z.boolean(),
  company: z.record(z.unknown()).optional(),
  contacts: z.array(z.record(z.unknown())).optional(),
  hunter_contacts_found: z.number().optional(),
  questions_and_answers: z.array(z.record(z.unknown())).optional(),
  company_summary: z.record(z.unknown()).optional(),
  error: z.string().optional(),
});

export type SalesIntelligenceInput = z.infer<typeof salesIntelligenceInputSchema>;
export type SalesIntelligenceOutput = z.infer<typeof salesIntelligenceOutputSchema>;

export const salesIntelligenceModule: ModuleDefinition<SalesIntelligenceInput, SalesIntelligenceOutput> = {
  id: 'salesIntelligence',
  name: 'Sales Intelligence',
  version: '1.0.0',
  description: 'Prospect research, fit analysis, and introduction letter generation',
  capabilities: ['data:read', 'data:write'],
  inputSchema: salesIntelligenceInputSchema,
  outputSchema: salesIntelligenceOutputSchema,

  async publish(input: SalesIntelligenceInput): Promise<SalesIntelligenceOutput> {
    try {
      const validated = salesIntelligenceInputSchema.parse(input);

      const { data, error } = await supabase.functions.invoke('prospect-research', {
        body: validated,
      });

      if (error) {
        logger.error('[SalesIntelligenceModule] Edge function error:', error);
        return { success: false, error: error.message };
      }

      return data as SalesIntelligenceOutput;
    } catch (error) {
      logger.error('[SalesIntelligenceModule] Error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
};
