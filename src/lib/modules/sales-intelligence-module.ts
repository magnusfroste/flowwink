import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { defineModule } from '@/lib/module-def';
import { z } from 'zod';

// --- Sales Intelligence Schemas ---

export const salesIntelligenceInputSchema = z.object({
  action: z.enum(['research', 'fit-analysis', 'profile-setup', 'web-search', 'web-scrape', 'contact-finder']).default('research'),
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
  'web-search': 'web-search',
  'web-scrape': 'web-scrape',
  'contact-finder': 'contact-finder',
};

// ── Bundled skill definitions (migrated from setup-flowpilot) ──
const SALESINTELLIGENCE_SKILLS: SkillSeed[] = [
  {
    name: 'prospect_research',
    description: 'Research a company — search web, scrape website, find contacts via Hunter.io. Returns raw data for FlowPilot to analyze. Use when: preparing for outreach; gathering intelligence on a prospect; building a company profile from scratch. NOT for: enriching existing company records (enrich_company); managing companies (manage_company).',
    category: 'crm',
    handler: 'internal:prospect_research',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'prospect_research',
        description: 'Research a company — scrape website, find contacts via Hunter.io, analyze with AI. Use when: preparing for outreach; gathering intelligence on a prospect; building a company profile from scratch. NOT for: enriching existing company records (enrich_company); managing companies (manage_company).',
        parameters: {
          type: 'object',
          properties: {
            company_name: {
              type: 'string',
              description: 'Company name',
            },
            company_url: {
              type: 'string',
              description: 'Company website URL',
            },
          },
          required: [
            'company_name',
          ],
        },
      },
    },
    instructions: `## prospect_research
### What
Researches a company — scrapes website, finds contacts via Hunter.io, analyzes with AI.
### When to use
- Admin asks to research a prospect or potential client
- Sales pipeline: identify decision makers at a company
- Before creating a deal or outreach campaign
### Parameters
- **company_name**: Required. The company to research.
- **company_url**: Optional but strongly recommended for better results.
### Edge cases
- Hunter.io API key required for contact discovery. Without it, only website analysis is returned.
- Chain: prospect_research → qualify_lead → manage_deal (create).`,
  },
  {
    name: 'prospect_fit_analysis',
    description: 'Collect company data, related leads, and deals to evaluate prospect fit. Returns raw data for FlowPilot to analyze. Use when: evaluating a new prospect; scoring company fit before outreach; comparing prospects against ICP criteria. NOT for: researching a company (prospect_research); enriching company data (enrich_company).',
    category: 'crm',
    handler: 'internal:prospect_fit_analysis',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'prospect_fit_analysis',
        description: 'Analyze how well a prospect company fits your ideal customer profile. Use when: evaluating a new prospect; scoring company fit before outreach; comparing prospects against ICP criteria. NOT for: researching a company (prospect_research); enriching company data (enrich_company).',
        parameters: {
          type: 'object',
          properties: {
            company_id: {
              type: 'string',
              description: 'Company UUID from database',
            },
            company_name: {
              type: 'string',
              description: 'Company name (if no ID)',
            },
            user_id: {
              type: 'string',
              description: 'Optional user UUID — loads that sender profile (pitch, tone, signature) for outreach drafting',
            },
          },
        },

      },
    },
    instructions: `## prospect_fit_analysis
### What
Collects BOTH sides of the fit equation and returns them for you to reason over:
the prospect (company record, related leads, related deals) and \`our_context\`
(ICP, value proposition, differentiators, target industries, services — read from
Business Identity / site_settings.company_profile — plus the sender profile from
sales_intelligence_profiles).
### When to use
- After prospect_research, to score the fit
- Admin asks "is this a good prospect?"
- Lead prioritization workflows
### Parameters
- **company_id**: UUID from companies table. Preferred.
- **company_name**: Fallback if no UUID.
- **user_id**: Optional. Loads that user's sender profile for outreach tone/signature.
### How to score
Score against \`our_context.icp\` — NOT against data completeness. If
\`our_context.icp_defined\` is false, say so and score conservatively; the fix is
to define the ICP in Business Identity (manage_business_identity /
update_company_profile), not to guess.
### Edge cases
- Works best when the company has been enriched first (enrich_company).
- Contact discovery (Hunter.io) belongs to prospect_research, not here.`,

  },
  {
    name: 'process_signal',
    description: 'Process an incoming signal from Chrome extension or external webhook. Analyzes content and determines next actions. Use when: a website event is detected; an external system sends an update; responding to real-time data. NOT for: managing automations (manage_automations); scanning Gmail (scan_gmail_inbox).',
    category: 'automation',
    handler: 'edge:signal-ingest',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'process_signal',
        description: 'Process an incoming signal from Chrome extension or external webhook. Analyzes content and determines next actions. Use when: a website event is detected; an external system sends an update; responding to real-time data. NOT for: managing automations (manage_automations); scanning Gmail (scan_gmail_inbox).',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'Source URL',
            },
            title: {
              type: 'string',
              description: 'Page title',
            },
            content: {
              type: 'string',
              description: 'Captured content',
            },
            note: {
              type: 'string',
              description: 'User note',
            },
            source_type: {
              type: 'string',
              enum: [
                'web',
                'linkedin',
                'x',
                'github',
                'reddit',
                'youtube',
              ],
              description: 'Source platform',
            },
          },
        },
      },
    },
    instructions: `## Context
Signals arrive from external operators (Chrome extension, webhooks).
They are automatically stored in agent_activity.
This skill is primarily triggered by automations, not directly by users.

## Signal types
- signal: Raw capture for AI processing
- draft: Creates a blog post draft from captured content
- bookmark: Saves to agent memory for future reference`,
  },
  {
    name: 'sales_profile_setup',
    description: 'Set up or update the personal sender profile used for outreach drafts (name, title, pitch, tone, signature). Use when: configuring who the outreach comes from. NOT for: company positioning or the Ideal Customer Profile — those live in Business Identity (update_company_profile / manage_business_identity).',

    category: 'crm',
    handler: 'internal:sales_profile_setup',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'sales_profile_setup',
        parameters: {
          type: 'object',
          required: [
            'type',
            'data',
          ],
          properties: {
            data: {
              type: 'object',
              description: 'Profile data. For user (recommended): full_name, title, email, personal_pitch, tone, signature. For company (legacy): icp, value_proposition, differentiators, competitors, pricing_notes, industry — prefer update_company_profile in Business Identity instead, which is the source read by fit scoring.',
            },
            type: {
              enum: [
                'company',
                'user',
              ],
              type: 'string',
              description: 'Profile type: user (personal sender profile — preferred) or company (legacy; use Business Identity instead)',
            },
          },
        },
        description: 'Set up or update the personal sender profile used for outreach drafts (name, title, pitch, tone, signature). Use when: configuring who the outreach comes from. NOT for: company positioning or the Ideal Customer Profile — those live in Business Identity (update_company_profile / manage_business_identity).',
      },
    },
    instructions: 'Use this skill for the PERSONAL sender profile (type=user): name, title, personal pitch, preferred tone, email signature. The Ideal Customer Profile and company positioning are NOT stored here — they live in Business Identity (site_settings.company_profile) and are read by prospect_fit_analysis; route those requests to update_company_profile. type=company is legacy and is not read by fit scoring. Always confirm the data before saving.',

  },
];

export const salesIntelligenceModule = defineModule<SalesIntelligenceInput, SalesIntelligenceOutput>({
  id: 'salesIntelligence',
  name: 'Sales Intelligence',
  version: '2.0.0',
  processes: ['lead-to-customer'],
  maturity: 'L4',
  description: 'Prospect research (web + Hunter contacts), ICP fit scoring against Business Identity, and personal outreach drafts',
  capabilities: ['data:read', 'data:write'],
  tier: 'standard',
  inputSchema: salesIntelligenceInputSchema,
  outputSchema: salesIntelligenceOutputSchema,

  skills: [
    'prospect_research',
    'prospect_fit_analysis',
    'qualify_lead',
    'enrich_company',
    'contact_finder',
    'sales_profile_setup',
    'competitor_monitor',
    'competitor_watch',
  ],
  data: {
    tables: ['sales_intelligence_profiles'],
  },
  skillSeeds: SALESINTELLIGENCE_SKILLS,

  async publish(input: SalesIntelligenceInput): Promise<SalesIntelligenceOutput> {
    try {
      const validated = salesIntelligenceInputSchema.parse(input);
      const action = validated.action || 'research';
      const edgeFunction = ACTION_MAP[action];

      if (!edgeFunction) {
        return { success: false, error: `Unknown action: ${action}` };
      }

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
});
