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
    handler: 'internal:company_profile',
    scope: 'both',
    tool_definition: {
      type: 'function',
      function: {
        name: 'get_company_profile',
        description: 'Returns the full Business Identity (company_profile) used across Sales Intelligence, Chat AI, SEO, FlowPilot, and external agents (MCP gateway). Read-only.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    instructions: 'Read-only access to company profile. Returns null if not set.',
  },
  {
    name: 'update_company_profile',
    description: 'Update the FlowWink site\'s Business Identity. Performs a shallow merge by default. Use when: enriching the profile with newly discovered facts. NOT for: changing agent identity/soul.',
    category: 'crm',
    handler: 'internal:company_profile',
    scope: 'both',
    tool_definition: {
      type: 'function',
      function: {
        name: 'update_company_profile',
        description: 'Update Business Identity fields. By default merges with existing profile (set merge=false to replace). Returns the updated profile.',
        parameters: {
          type: 'object',
          properties: {
            data: {
              type: 'object',
              description: 'Object of fields to set/merge. Common keys: company_name, tagline, legal_name, about_us, business_purpose, value_proposition, icp, industry, target_industries (string[]), differentiators (array of {name, description}), services (array of {name, description}), proof_points (array of {value, label, context}), primary_cta ({label, destination, intent}), client_testimonials (array of {quote, author, role, company}), delivered_value, clients, competitors, pricing_notes, contact_email, contact_phone, address, domain, org_number, founded_year, employees, revenue.',
              properties: {
                services: {
                  type: 'array',
                  description: 'Services & offerings. Each item MUST be an object with name (required, non-empty) and description (optional). Plain strings will be coerced to {name: str, description: ""}; entries without a name are dropped.',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string', description: 'Service name (required, e.g. "Local AI Deployment")' },
                      description: { type: 'string', description: 'Short description of the service' },
                    },
                    required: ['name'],
                  },
                },
                target_industries: { type: 'array', items: { type: 'string' } },
                differentiators: {
                  type: 'array',
                  description: 'What sets the company apart. Each item is {name, description} — the SAME shape as services, because a features block needs both halves. A bare string becomes {name, description: ""} and the page generator then has to write the description itself; send both.',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string', description: 'The differentiator as a label (required, e.g. "Self-hosted")' },
                      description: { type: 'string', description: 'What it means for the customer, in one sentence' },
                    },
                    required: ['name'],
                  },
                },
                proof_points: {
                  type: 'array',
                  description: 'Numbers held AS numbers, so a stats block never has to parse them out of prose. Put the figures here; keep the story in delivered_value. Only write a figure you have a source for — this is the field generated pages quote verbatim.',
                  items: {
                    type: 'object',
                    properties: {
                      value: { type: 'string', description: 'The figure exactly as it should be printed, unit included: "412 km", "99,98 %", "1 200"' },
                      label: { type: 'string', description: 'What the figure counts: "kanalisation byggd", "uptime"' },
                      context: { type: 'string', description: 'Optional qualifier — period, scope or source' },
                    },
                    required: ['value', 'label'],
                  },
                },
                primary_cta: {
                  type: 'object',
                  description: 'What a visitor should DO. Generated landing pages end on this; without it a page has no ask.',
                  properties: {
                    label: { type: 'string', description: 'Button text (required, e.g. "Boka ett möte")' },
                    destination: { type: 'string', description: 'Path, URL, mailto: or tel: the button leads to' },
                    intent: { type: 'string', description: 'What the action is for, in the company\'s words' },
                  },
                  required: ['label'],
                },
                client_testimonials: {
                  type: 'array',
                  description: 'One entry per quote. A single blob renders as a paragraph, not a testimonial block. Leave author/role/company EMPTY when unknown — an unattributed quote is published as such; a guessed name is a fabricated reference.',
                  items: {
                    type: 'object',
                    properties: {
                      quote: { type: 'string', description: 'The quote, verbatim (required)' },
                      author: { type: 'string', description: 'Who said it — empty if unknown' },
                      role: { type: 'string', description: 'Their role — empty if unknown' },
                      company: { type: 'string', description: 'Their company — empty if unknown' },
                    },
                    required: ['quote'],
                  },
                },
                board_members: { type: 'array', items: { type: 'string' } },
              },
              additionalProperties: true,
            },
            merge: { type: 'boolean', description: 'If true (default), merge with existing profile. If false, replace entire profile.' },
          },
          required: ['data'],
          additionalProperties: false,
        },
      },
    },
    instructions: [
      'Update business identity. Shallow merge by default — send only the keys you are changing.',
      '',
      'The structured fields exist so a page-authoring agent never has to invent the half that is missing. Send them in shape:',
      '- services AND differentiators: array of {name, description}. Never raw strings, never {description} without a name (nameless entries are dropped; strings are coerced to an EMPTY description, which is what a features block then has to make up).',
      '- proof_points: array of {value, label, context}. The figure goes in `value` exactly as it should be printed ("412 km", "99,98 %"), what it counts in `label`. Never leave a metric only inside delivered_value prose — that is where numbers get re-parsed and mis-stated.',
      '- primary_cta: {label, destination, intent}. Without a label there is no CTA and a generated page ends with no ask.',
      '- client_testimonials: array of {quote, author, role, company}, one entry per quote.',
      '',
      'Never fill an attribution or a figure you cannot source. Empty is correctable downstream; invented is not — leave author, description or context blank and the surfaces render without them.',
    ].join('\n'),
  },
  {
    name: 'enrich_company_profile',
    description: 'Enrich a company insights profile from a public identifier (org number / domain) — writes company facts for the customer-insights views. Use when: filling out a prospect company card. NOT for: CRM company CRUD (manage_company); website scraping enrichment (enrich_company).',
    category: 'crm',
    handler: 'internal:enrich_company_profile',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'enrich_company_profile',
        parameters: {
          type: 'object',
          required: ["identifier"],
          properties: {
            identifier: { type: 'string', description: 'Org number or company domain' },
          },
        },
      },
    },
  },
];

export const companyInsightsModule = defineModule<Input, Output>({
  id: 'companyInsights',
  name: 'Business Identity',
  version: '1.0.0',
  processes: ['lead-to-customer'],
  maturity: 'L3',
  description: 'Unified business identity, financials, and market positioning. Feeds Sales Intelligence, Chat AI, SEO, FlowPilot, and external agents (MCP gateway) with company context.',
  capabilities: ['data:read', 'data:write'],
  tier: 'standard',
  inputSchema,
  outputSchema,

  skills: [
    'get_company_profile',
    'update_company_profile',
    'enrich_company',
    'manage_company',
    'weekly_business_digest',
  ],

  skillSeeds: COMPANY_INSIGHTS_SKILLS,

  async publish(input: Input): Promise<Output> {
    return { success: true, message: `Company insights ${input.action} completed` };
  },
});
