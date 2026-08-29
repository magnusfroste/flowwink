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

// ── Bundled skill definitions (migrated from setup-flowpilot) ──
const SALESINTELLIGENCE_SKILLS: SkillSeed[] = [
  {
    name: 'prospect_research',
    description: 'Research a company — search web, scrape website, find contacts via Hunter.io. Found contacts are saved as PROSPECTS (pre-leads in the Contacts → Prospects triage tab), never directly as leads: a human promotes the ones worth pursuing. Returns raw data for FlowPilot to analyze. Use when: preparing for outreach; gathering intelligence on a prospect; building a company profile from scratch. NOT for: enriching existing company records (enrich_company); managing companies (manage_company).',
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
- Found contacts land as status 'prospect' — a triage state OUTSIDE the pipeline. They become
  leads only when promoted in Contacts → Prospects (or via manage_lead status update). Do not
  treat the whole batch as leads; the human picks who to pursue.
- Chain: prospect_research → (human promotes) → qualify_lead → manage_deal (create).`,
  },
    {
      name: 'verify_email',
      description:
        "Verify an email address's deliverability via Hunter's Email Verifier and stamp the verdict on the lead. COSTS ONE HUNTER CREDIT per call (50/month on the free plan) — verify only addresses you intend to contact, not whole lists. Returns status (valid/invalid/accept_all/webmail/disposable/unknown) + score; with lead_id the lead's email_status is updated so the send gate sees it. Use when: about to send outreach to an unverified address; a bounce suggests a stale address. NOT for: bulk sweeps over all leads (credit burn); finding addresses (contact_finder).",
      category: 'crm',
      handler: 'internal:verify_email',
      scope: 'internal',
      trust_level: 'notify',
      tool_definition: {
        type: 'function',
        function: {
          name: 'verify_email',
          description: 'Verify one email address via Hunter (1 credit). Updates the lead when lead_id is given.',
          parameters: {
            type: 'object',
            properties: {
              email: { type: 'string', description: 'Address to verify.' },
              lead_id: { type: 'string', description: 'Lead to stamp with the verdict (optional).' },
            },
            required: ['email'],
          },
        },
      },
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
          },
        },
      },
    },
    instructions: `## prospect_fit_analysis
### What
Analyzes how well a prospect company fits your ideal customer profile using AI.
### When to use
- After prospect_research, to score the fit
- Admin asks "is this a good prospect?"
- Lead prioritization workflows
### Parameters
- **company_id**: UUID from companies table. Preferred.
- **company_name**: Fallback if no UUID.
### Edge cases
- Works best when the company has been enriched first (enrich_company).
- Returns a fit score and reasoning — use for deal prioritization.`,
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
    description: 'Set up or update the per-seller sales profile (type "user"): name, title, personal pitch, tone, signature — the sender context outreach is written in. Use when: a salesperson configures how their outreach sounds. NOT for: company-level ICP, value proposition, services or positioning — those live in Business Identity (site_settings.company_profile, via manage_site_settings or the Business Identity page) and a type:"company" call here is REFUSED with that pointer, because nothing reads it.',
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
              description: 'Profile data. For company: icp, value_proposition, differentiators, competitors, pricing_notes, industry. For user: full_name, title, email, personal_pitch, tone, signature.',
            },
            type: {
              enum: [
                'company',
                'user',
              ],
              type: 'string',
              description: 'Always "user" (the per-seller sender profile). "company" is refused — company positioning lives in Business Identity.',
            },
          },
        },
        description: 'Set up or update the Sales Intelligence company profile or user profile. Use when: configuring sales profile, updating company positioning for prospecting. NOT for: managing business identity (use update_company_profile).',
      },
    },
    instructions: 'Use this skill when the user wants to set up their Sales Intelligence profile. For company profiles, ask about: ICP (ideal customer profile), value proposition, key differentiators, competitors, pricing strategy. For user profiles, ask about: their name, title, personal pitch, preferred tone, and email signature. Always confirm the data before saving.',
  },
];

export const salesIntelligenceModule = defineModule<SalesIntelligenceInput, SalesIntelligenceOutput>({
  id: 'salesIntelligence',
  name: 'Sales Intelligence',
  version: '2.0.0',
  processes: ['lead-to-customer'],
  maturity: 'L4',
  description: 'Prospect research, fit analysis, profile management, and introduction letter generation',
  capabilities: ['data:read', 'data:write'],
  tier: 'standard',
  inputSchema: salesIntelligenceInputSchema,
  outputSchema: salesIntelligenceOutputSchema,

  skills: [
    'verify_email',
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
});
