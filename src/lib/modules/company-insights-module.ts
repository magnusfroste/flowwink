import { defineModule } from '@/lib/module-def';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { z } from 'zod';

const inputSchema = z.object({
  action: z.enum(['enrich', 'get_identity']),
  company_id: z.string().uuid().optional(),
});

const outputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  error: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

const COMPANY_INSIGHTS_SKILLS: SkillSeed[] = [
  {
    name: 'get_company_profile',
    description: 'Read the FlowWink site\'s Business Identity (company name, ICP, value proposition, services, clients, brand tone, contact info). Use when: you need affärs-/företagskontext before writing content, qualifying leads, or generating outreach. NOT for: agent persona/soul.',
    category: 'crm',
    handler: 'function:company-profile',
    scope: 'both',
    tool_definition: {
      type: 'function',
      function: {
        name: 'get_company_profile',
        description: 'Returns the full Business Identity (company_profile) used across Sales Intelligence, Chat AI, SEO, and FlowAgent. Read-only.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    instructions: 'Read-only access to company profile. Returns null if not set.',
  },
  {
    name: 'update_company_profile',
    description: 'Update the FlowWink site\'s Business Identity. Performs a shallow merge by default. Use when: enriching the profile with newly discovered facts. NOT for: changing agent identity/soul.',
    category: 'crm',
    handler: 'function:company-profile',
    scope: 'both',
    tool_definition: {
      type: 'function',
      function: {
        name: 'update_company_profile',
        description: 'Update Business Identity fields. By default merges with existing profile (set merge=false to replace). Returns the updated profile.',
        parameters: {
          type: 'object',
          properties: {
            data: { type: 'object', description: 'Object of fields to set/merge. Common keys: legal_name, display_name, website, headquarters, founded_year, mission, description.' },
            merge: { type: 'boolean', description: 'If true (default), merge with existing profile. If false, replace entire profile.' },
          },
          required: ['data'],
          additionalProperties: false,
        },
      },
    },
    instructions: 'Update business identity fields. Performs shallow merge by default unless merge=false. Returns updated profile.',
  },
];

export const companyInsightsModule = defineModule<Input, Output>({
  id: 'companyInsights',
  name: 'Business Identity',
  version: '1.0.0',
  processes: ['lead-to-customer'],
  maturity: 'L3',
  description: 'Unified business identity, financials, and market positioning. Feeds Sales Intelligence, Chat AI, SEO, and FlowAgent with company context.',
  capabilities: ['data:read', 'data:write'],
  inputSchema,
  outputSchema,

  skills: [
    'get_company_profile',
    'update_company_profile',
    'enrich_company',
    'manage_company',
    'weekly_business_digest',
    'generate_site_from_identity',
  ],

  skillSeeds: COMPANY_INSIGHTS_SKILLS,

  async publish(input: Input): Promise<Output> {
    return { success: true, message: `Company insights ${input.action} completed` };
  },
});
