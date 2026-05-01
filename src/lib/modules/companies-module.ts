import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { defineModule } from '@/lib/module-def';
import {
  CompanyModuleInput,
  CompanyModuleOutput,
  companyModuleInputSchema,
  companyModuleOutputSchema,
} from '@/types/module-contracts';

// ── Bundled skill definitions (migrated from setup-flowpilot) ──
const COMPANIES_SKILLS: SkillSeed[] = [
  {
    name: 'manage_company',
    description: 'Manage companies: list, get, create, update, delete. Use when: adding a new company to CRM; updating company contact info; removing an inactive company. NOT for: enriching company data (enrich_company); prospect research (prospect_research).',
    category: 'crm',
    handler: 'module:companies',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_company',
        description: 'Manage companies: list, get, create, update, delete. Use when: adding a new company to CRM; updating company contact info; removing an inactive company. NOT for: enriching company data (enrich_company); prospect research (prospect_research).',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: [
                'list',
                'get',
                'create',
                'update',
                'delete',
              ],
            },
            company_id: {
              type: 'string',
            },
            name: {
              type: 'string',
            },
            domain: {
              type: 'string',
            },
            industry: {
              type: 'string',
            },
            size: {
              type: 'string',
            },
            address: {
              type: 'string',
            },
            phone: {
              type: 'string',
            },
            website: {
              type: 'string',
            },
            notes: {
              type: 'string',
            },
          },
          required: [
            'action',
          ],
        },
      },
    },
    instructions: `## manage_company
### What
Manages CRM companies: list, get, create, update, delete.
### When to use
- Admin asks to manage company records
- Part of prospect research workflow
- Organizing leads by company
### Parameters
- **action**: Required. list, get, create, update, delete.
- **name**: For create. Company name.
- **domain**: Company domain for enrichment.
### Edge cases
- Use enrich_company after creating to auto-fill industry, size, etc.
- Domain should not include http/https prefix.`,
  },
];

export const companiesModule = defineModule<CompanyModuleInput, CompanyModuleOutput>({
  id: 'companies',
  name: 'Companies',
  version: '1.0.0',
  description: 'Create and manage company records with optional AI enrichment',
  capabilities: ['content:receive', 'data:write'],
  inputSchema: companyModuleInputSchema,
  outputSchema: companyModuleOutputSchema,

  skills: [
    'manage_company',
    // Seeded via migration; declared here for ownership in /admin/approvals → Gated Skills.
    'update_company_profile',
  ],
  skillSeeds: COMPANIES_SKILLS,

  webhookEvents: [
    { event: 'company.created', description: 'A company was created' },
    { event: 'company.updated', description: 'A company was updated' },
  ],

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
});
