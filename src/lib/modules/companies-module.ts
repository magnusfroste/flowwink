import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import {
  ModuleDefinition,
  CompanyModuleInput,
  CompanyModuleOutput,
  companyModuleInputSchema,
  companyModuleOutputSchema,
} from '@/types/module-contracts';

export const companiesModule: ModuleDefinition<CompanyModuleInput, CompanyModuleOutput> = {
  id: 'companies',
  name: 'Companies',
  version: '1.0.0',
  description: 'Create and manage company records with optional AI enrichment',
  capabilities: ['content:receive', 'data:write'],
  inputSchema: companyModuleInputSchema,
  outputSchema: companyModuleOutputSchema,

  async publish(input: CompanyModuleInput): Promise<CompanyModuleOutput> {
    try {
      const validated = companyModuleInputSchema.parse(input);

      let domain = validated.domain;
      if (!domain && validated.website) {
        try {
          const url = new URL(validated.website);
          domain = url.hostname.replace('www.', '');
        } catch { /* skip */ }
      }

      const { data, error } = await supabase
        .from('companies')
        .insert({
          name: validated.name,
          domain: domain || null,
          website: validated.website || null,
          industry: validated.industry || null,
          size: validated.size || null,
          phone: validated.phone || null,
          address: validated.address || null,
          notes: validated.notes || null,
        })
        .select('id, name, domain')
        .single();

      if (error) {
        logger.error('[CompaniesModule] Insert error:', error);
        return { success: false, error: error.message };
      }

      let enriched = false;
      if (validated.options?.auto_enrich && (domain || validated.website)) {
        try {
          await supabase.functions.invoke('enrich-company', { body: { companyId: data.id } });
          enriched = true;
        } catch (enrichError) {
          logger.warn('[CompaniesModule] Enrichment failed:', enrichError);
        }
      }

      return { success: true, id: data.id, name: data.name, domain: data.domain || undefined, enriched };
    } catch (error) {
      logger.error('[CompaniesModule] Error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
};
