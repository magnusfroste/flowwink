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
    description: 'Manage companies: list, get, create, update, delete — incl. B2B fields (org/VAT number, parent company hierarchy, employee count, revenue, credit limit, account owner, tags). Use when: adding a company to CRM; updating company info or B2B master data. NOT for: enriching company data (enrich_company); finding duplicates (find_duplicate_companies).',
    category: 'crm',
    handler: 'module:companies',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_company',
        description: 'Manage companies: list, get, create, update, delete — incl. B2B fields (org/VAT number, parent company hierarchy, employee count, revenue, credit limit, account owner, tags). Use when: adding a company to CRM; updating company info or B2B master data. NOT for: enriching company data (enrich_company); finding duplicates (find_duplicate_companies).',
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
            org_number: {
              type: 'string', description: 'Company registration number (org-nr)',
            },
            vat_number: {
              type: 'string', description: 'VAT number (e.g. SE556677889901)',
            },
            parent_company_id: {
              type: 'string', format: 'uuid', description: 'Parent company (subsidiary hierarchy)',
            },
            employee_count: {
              type: 'number',
            },
            annual_revenue_cents: {
              type: 'number',
            },
            credit_limit_cents: {
              type: 'number', description: 'Max outstanding AR before holds',
            },
            account_owner: {
              type: 'string', format: 'uuid', description: 'Responsible sales rep (user id)',
            },
            tags: {
              type: 'array', items: { type: 'string' },
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
  {
    name: 'find_duplicate_companies',
    description: 'Find likely duplicate companies by name similarity or identical domain (read-only). Use when: cleaning the CRM, before creating a company that might already exist. NOT for: merging (manual for now) or creating companies (manage_company).',
    category: 'crm',
    handler: 'rpc:find_duplicate_companies',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'find_duplicate_companies',
        description: 'List candidate duplicate company pairs scored by trigram name similarity; identical domains score 1.0.',
        parameters: {
          type: 'object',
          properties: {
            p_threshold: { type: 'number', description: 'Similarity 0-1 (default 0.45)' },
            p_limit: { type: 'number', description: 'Max pairs (default 25)' },
          },
        },
      },
    },
    instructions: 'Read-only. Returns pairs {company_a, name_a, company_b, name_b, score, same_domain} ordered by score. Merge is a manual decision — present pairs to the admin.',
  },
];

export const companiesModule = defineModule<CompanyModuleInput, CompanyModuleOutput>({
  id: 'companies',
  name: 'Companies',
  version: '1.0.0',
  processes: ['lead-to-customer'],
  maturity: 'L4',
  description: 'Create and manage company records with optional AI enrichment',
  capabilities: ['content:receive', 'data:write'],
  tier: 'standard',
  inputSchema: companyModuleInputSchema,
  outputSchema: companyModuleOutputSchema,

  skills: [
    'manage_company',
    'find_duplicate_companies',
    // Seeded via migration; declared here for ownership in /admin/approvals → Gated Skills.
    'update_company_profile',
    // Polymorphic multi-address skill — primary owner is companies.
    'manage_addresses',
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
