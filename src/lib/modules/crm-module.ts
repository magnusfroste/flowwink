import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { triggerWebhook } from '@/lib/webhook-utils';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { defineModule } from '@/lib/module-def';
import {
  CRMLeadInput,
  CRMLeadOutput,
  crmLeadInputSchema,
  crmLeadOutputSchema,
} from '@/types/module-contracts';

// ── Bundled skill definitions (migrated from setup-flowpilot) ──
const CRM_SKILLS: SkillSeed[] = [
  {
    name: 'add_lead',
    description: 'Add a new lead to the CRM. Use when: capturing a new prospect; a visitor submits contact info; importing leads from external sources. NOT for: updating existing leads (manage_leads); qualifying leads (qualify_lead).',
    category: 'crm',
    handler: 'module:crm',
    scope: 'both',
    tool_definition: {
      type: 'function',
      function: {
        name: 'add_lead',
        description: 'Add a new lead to the CRM. Use when: capturing a new prospect; a visitor submits contact info; importing leads from external sources. NOT for: updating existing leads (manage_leads); qualifying leads (qualify_lead).',
        parameters: {
          type: 'object',
          properties: {
            email: {
              type: 'string',
              description: 'Lead email',
            },
            name: {
              type: 'string',
              description: 'Lead name',
            },
            phone: {
              type: 'string',
              description: 'Phone number',
            },
            source: {
              type: 'string',
              description: 'Lead source (chat, form, manual)',
            },
          },
          required: [
            'email',
          ],
        },
      },
    },
    instructions: `## add_lead
### What
Adds a new lead to the CRM system.
### When to use
- Visitor provides contact info in chat
- Form submission contains a new email
- Manual lead entry requested by admin
- NOT for updating existing leads (use manage_leads)
### Parameters
- **email**: Required. Must be a valid email address.
- **name**: Optional but recommended for personalization.
- **phone**: Optional.
- **source**: Where the lead came from: 'chat', 'form', 'manual', 'import'.
### Edge cases
- Duplicate emails: handler may reject or merge — check response.
- Always set source accurately for attribution tracking.`,
  },
  {
    name: 'qualify_lead',
    description: 'Score and qualify a lead based on activities and engagement data. Use when: evaluating lead quality; automating lead scoring; prioritizing sales pipeline. NOT for: adding new leads (add_lead); managing lead records (manage_leads).',
    category: 'crm',
    handler: 'edge:qualify-lead',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'qualify_lead',
        description: 'Score and qualify a lead based on activities and engagement data. Use when: evaluating lead quality; automating lead scoring; prioritizing sales pipeline. NOT for: adding new leads (add_lead); managing lead records (manage_leads).',
        parameters: {
          type: 'object',
          properties: {
            leadId: {
              type: 'string',
              description: 'The lead UUID to qualify',
            },
          },
          required: [
            'leadId',
          ],
        },
      },
    },
    instructions: `## qualify_lead
### What
Deterministic lead scoring based on activity points with recency bonus. No AI — just data.
FlowPilot can read the score result and add its own analysis via memory or lead notes.
### When to use
- New lead enters the CRM (automation on lead.created signal)
- Admin asks to evaluate/score a lead
- Before creating a deal from a lead
### Parameters
- **leadId**: Required. The lead UUID to qualify.
### What it returns
- score (number), engagement_level (hot/warm/cold), activity_count, recent_activity_count
### Chain suggestion
- After scoring, FlowPilot can reason about the result and update lead status via manage_leads.`,
  },
  {
    name: 'enrich_company',
    description: 'Scrape a company website to enrich its record with website, phone, and description. Use when: needing more details about a prospect; automatically populating company data. NOT for: researching individual prospects (prospect_research); basic company CRUD (manage_company).',
    category: 'crm',
    handler: 'edge:enrich-company',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'enrich_company',
        description: 'Enrich a company record with industry, size, website info via domain scraping and AI analysis. Use when: needing more details about a prospect; automatically populating company data; improving lead scoring. NOT for: researching individual prospects (prospect_research); basic company CRUD (manage_company).',
        parameters: {
          type: 'object',
          properties: {
            companyId: {
              type: 'string',
              description: 'Company UUID',
            },
            domain: {
              type: 'string',
              description: 'Company domain (e.g. acme.com)',
            },
          },
        },
      },
    },
    instructions: `## enrich_company
### What
Enriches a company record with industry, size, website info via domain scraping and AI analysis.
### When to use
- New company created in CRM with only a name/domain
- Admin asks to research a company
- Part of prospect_research pipeline
### Parameters
- **companyId**: Company UUID from the database.
- **domain**: Company domain (e.g., acme.com). Used for scraping.
### Edge cases
- Requires either companyId or domain. Both is ideal.
- Domain scraping may fail for very small companies or blocked sites.
- Results are saved directly to the company record.`,
  },
  {
    name: 'manage_leads',
    description: 'Full lead management: list, get, update status/score, delete leads. Use when: changing lead status; adding follow-up notes; cleaning up unqualified leads. NOT for: adding a new lead (add_lead); qualifying leads with AI (qualify_lead).',
    category: 'crm',
    handler: 'module:crm',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_leads',
        description: 'Full lead management: list, get, update status/score, delete leads. Use when: changing lead status; adding follow-up notes; cleaning up unqualified leads. NOT for: adding a new lead (add_lead); qualifying leads with AI (qualify_lead).',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: [
                'list',
                'get',
                'update',
                'delete',
              ],
            },
            lead_id: {
              type: 'string',
            },
            status: {
              type: 'string',
              description: 'Filter or set status',
            },
            score: {
              type: 'number',
            },
            search: {
              type: 'string',
            },
            limit: {
              type: 'number',
              description: 'Max results (default 50)',
            },
          },
          required: [
            'action',
          ],
        },
      },
    },
    instructions: `## manage_leads
### What
Full lead management: list, get, update status/score, delete.
### When to use
- Admin asks to view or manage CRM leads
- Updating lead status in a sales pipeline
- Bulk operations on leads
### Parameters
- **action**: Required. list, get, update, delete.
- **lead_id**: For get/update/delete.
- **status**: Filter (list) or set (update).
- **score**: Set lead score (update).
- **search**: Text search across name/email.
### Edge cases
- Use add_lead to CREATE new leads. This skill manages EXISTING leads.
- Delete is permanent. Consider archiving instead.`,
  },
  {
    name: 'crm_task_list',
    description: 'List CRM tasks with optional filters for lead, deal, priority, and completion status. Use when: reviewing upcoming tasks; checking tasks for a specific lead; auditing task completion. NOT for: creating a new task (crm_task_create); updating a task (crm_task_update).',
    category: 'crm',
    handler: 'db:crm_tasks',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'crm_task_list',
        description: 'List CRM tasks with optional filters for lead, deal, priority, and completion status. Use when: reviewing upcoming tasks; checking tasks for a specific lead; auditing task completion. NOT for: creating a new task (crm_task_create); updating a task (crm_task_update).',
        parameters: {
          type: 'object',
          properties: {
            lead_id: {
              type: 'string',
              description: 'Filter by lead UUID',
            },
            deal_id: {
              type: 'string',
              description: 'Filter by deal UUID',
            },
            priority: {
              type: 'string',
              enum: [
                'low',
                'medium',
                'high',
                'urgent',
              ],
              description: 'Filter by priority',
            },
            show_completed: {
              type: 'boolean',
              description: 'Include completed tasks (default false)',
            },
            limit: {
              type: 'number',
              description: 'Max results (default 20)',
            },
          },
          required: [],
        },
      },
    },
    instructions: `## crm_task_list
### What
Lists CRM tasks with optional filters.
### When to use
- Admin asks about pending tasks
- Pipeline management: what needs attention
- Filtering tasks by lead, deal, or priority
### Parameters
- **lead_id**: Filter by lead UUID.
- **deal_id**: Filter by deal UUID.
- **priority**: Filter: low, medium, high, urgent.
- **show_completed**: Include completed tasks (default false).
### Edge cases
- Defaults to showing only incomplete tasks.
- Tasks link to leads and/or deals for context.`,
  },
  {
    name: 'crm_task_create',
    description: 'Create a new CRM task with title, description, due date, priority, and optional lead/deal link. Use when: needing to follow up on a lead; assigning a task related to a deal; reminding agents about upcoming actions. NOT for: listing tasks (crm_task_list); adding a new lead (add_lead).',
    category: 'crm',
    handler: 'db:crm_tasks',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'crm_task_create',
        description: 'Create a new CRM task with title, description, due date, priority, and optional lead/deal link. Use when: needing to follow up on a lead; assigning a task related to a deal; reminding agents about upcoming actions. NOT for: listing tasks (crm_task_list); adding a new lead (add_lead).',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Task title',
            },
            description: {
              type: 'string',
              description: 'Task details',
            },
            due_date: {
              type: 'string',
              description: 'Due date in ISO format',
            },
            priority: {
              type: 'string',
              enum: [
                'low',
                'medium',
                'high',
                'urgent',
              ],
              description: 'Task priority',
            },
            lead_id: {
              type: 'string',
              description: 'Link to a lead UUID',
            },
            deal_id: {
              type: 'string',
              description: 'Link to a deal UUID',
            },
          },
          required: [
            'title',
          ],
        },
      },
    },
    instructions: `## crm_task_create
### What
Creates a new CRM task with title, description, due date, and priority.
### When to use
- Admin asks to create a follow-up task
- Automated task creation from workflows
- After lead qualification suggests next steps
### Parameters
- **title**: Required. Task title.
- **due_date**: ISO date for the deadline.
- **priority**: low, medium, high, urgent. Default medium.
- **lead_id** or **deal_id**: Link to CRM entity.
### Edge cases
- Tasks without due_date show as undated.
- Link to a lead or deal for context in CRM views.`,
  },
  {
    name: 'crm_task_update',
    description: 'Update an existing CRM task — change title, description, priority, due date, or mark as completed. Use when: modifying a pending task; marking a task as done; rescheduling a deadline. NOT for: creating a new task (crm_task_create); listing tasks (crm_task_list).',
    category: 'crm',
    handler: 'db:crm_tasks',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'crm_task_update',
        description: 'Update an existing CRM task — change title, description, priority, due date, or mark as completed. Use when: modifying a pending task; marking a task as done; rescheduling a deadline. NOT for: creating a new task (crm_task_create); listing tasks (crm_task_list).',
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Task UUID',
            },
            title: {
              type: 'string',
              description: 'Updated title',
            },
            description: {
              type: 'string',
              description: 'Updated description',
            },
            due_date: {
              type: 'string',
              description: 'Updated due date',
            },
            priority: {
              type: 'string',
              enum: [
                'low',
                'medium',
                'high',
                'urgent',
              ],
            },
            completed_at: {
              type: 'string',
              description: 'ISO timestamp to mark complete, or null to reopen',
            },
          },
          required: [
            'id',
          ],
        },
      },
    },
    instructions: `## crm_task_update
### What
Updates an existing CRM task — change title, priority, due date, or mark as completed.
### When to use
- Admin updates task details
- Marking tasks as complete
- Changing task priority
### Parameters
- **id**: Required. Task UUID.
- **completed_at**: ISO timestamp to mark complete. Set to null to reopen.
- **priority**, **title**, **description**, **due_date**: Fields to update.
### Edge cases
- Setting completed_at marks the task as done.
- Setting completed_at to null reopens the task.`,
  },
  {
    name: 'competitor_monitor',
    description: 'Scan a competitor website and analyze their content strategy and positioning. Use when: user wants competitive analysis, studying competitor content. NOT for: migrating competitor sites (use migrate_url), general web search (use search_web).',
    category: 'analytics',
    handler: 'db:agent_memory',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'competitor_monitor',
        parameters: {
          type: 'object',
          required: [
            'domain',
            'company_name',
          ],
          properties: {
            domain: {
              type: 'string',
              description: 'Competitor domain (e.g. competitor.com)',
            },
            focus_areas: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Areas to focus on: content, pricing, features, messaging, seo',
            },
            company_name: {
              type: 'string',
              description: 'Competitor company name',
            },
          },
        },
        description: 'Scan a competitor website and analyze their content strategy and positioning. Use when: user wants competitive analysis, studying competitor content. NOT for: migrating competitor sites (use migrate_url), general web search (use search_web).',
      },
    },
    instructions: `## Competitor Monitor Skill

When asked to monitor a competitor:
1. Use browser_fetch or search_web to gather their latest content
2. Analyze their website structure, blog topics, messaging, and product positioning
3. Compare with our own content strategy and identify gaps/opportunities
4. Store findings in agent_memory under category "context" with key "competitor:[domain]"
5. If patterns emerge across multiple scans, update the weekly digest

### Output format
Return a structured analysis with: company_name, domain, recent_content (titles/topics), positioning_summary, our_gaps, opportunities`,
  },
  {
    name: 'contact_finder',
    description: 'Find business contacts by company domain. Use when: prospecting by company domain, finding email addresses for outreach. NOT for: managing existing leads (use manage_leads).',
    category: 'crm',
    handler: 'edge:contact-finder',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'contact_finder',
        parameters: {
          type: 'object',
          required: [
            'domain',
          ],
          properties: {
            limit: {
              type: 'number',
              description: 'Max contacts for domain_search (default 10)',
            },
            action: {
              enum: [
                'domain_search',
                'email_finder',
              ],
              type: 'string',
              description: 'Search type (default: domain_search)',
            },
            domain: {
              type: 'string',
              description: 'Company domain (e.g. acme.com)',
            },
            last_name: {
              type: 'string',
              description: 'Last name (required for email_finder)',
            },
            first_name: {
              type: 'string',
              description: 'First name (required for email_finder)',
            },
          },
        },
        description: 'Find business contacts by company domain. Use when: prospecting by company domain, finding email addresses for outreach. NOT for: managing existing leads (use manage_leads).',
      },
    },
    instructions: `## Contact Finder Skill

Use this to find email addresses and contact information for people at a company.

### Actions
- **domain_search**: Find all known contacts at a domain. Good for building a contact list.
- **email_finder**: Find a specific person's email by their name + company domain. Good for targeted outreach.

### When to use
- After identifying a prospect company (you need the domain)
- When preparing introduction letters (find the decision maker)
- Lead enrichment: add contacts to existing companies

### Requirements
- Requires HUNTER_API_KEY secret. Will soft-fail without it.
- Extract domain from company URL: "https://www.acme.com/about" → "acme.com"

### Tips
- Always strip "www." from domains
- Check confidence scores: >90 is reliable, <50 is risky
- For domain_search, limit to 10 to conserve API credits`,
  },
  {
    name: 'send_email_to_lead',
    description: 'Send a one-to-one outreach, follow-up, or nurture email to a single lead via Resend. AI-drafts subject + body if not provided. Use when: reaching out to a specific lead, following up after lead activity, sending personalized nurture. NOT for: bulk newsletters (use manage_newsletters), creating drafts only (use lead_nurture_sequence). Always supports dry_run for safe preview.',
    category: 'crm',
    handler: 'module:crm',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'send_email_to_lead',
        description: 'Send a one-to-one outreach, follow-up, or nurture email to a single lead via Resend. AI-drafts subject + body if not provided.',
        parameters: {
          type: 'object',
          required: [
            'lead_id',
          ],
          properties: {
            lead_id: {
              type: 'string',
              description: 'Lead UUID',
            },
            subject: {
              type: 'string',
              description: 'Email subject (auto-generated if omitted)',
            },
            body_html: {
              type: 'string',
              description: 'Email body HTML (auto-generated if omitted)',
            },
            purpose: {
              type: 'string',
              enum: [
                'outreach',
                'follow_up',
                'nurture',
                'reply',
              ],
              description: 'Email purpose — guides AI tone',
            },
            tone: {
              type: 'string',
              description: 'Tone (professional, friendly, casual)',
            },
            language: {
              type: 'string',
              description: 'Language code (en, sv, etc.)',
            },
            custom_instructions: {
              type: 'string',
              description: 'Extra context for the AI draft',
            },
            dry_run: {
              type: 'boolean',
              description: 'If true, returns the draft without sending. Default false.',
            },
          },
        },
      },
    },
    instructions: 'Use dry_run=true first to preview before sending. Provide custom_instructions for context-aware drafts. The skill auto-checks lead_activities for prior unsubscribed/bounced/complained events and refuses to send. Logs every send to lead_activities (type=email_sent or email_failed).',
  },
  {
    name: 'lead_pipeline_review',
    description: 'Reviews leads by status and score, suggests follow-up. Use when: heartbeat pipeline review, prioritizing lead outreach. NOT for: updating lead status (use manage_leads).',
    category: 'crm',
    handler: 'module:crm',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'lead_pipeline_review',
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
            },
            status_filter: {
              enum: [
                'new',
                'contacted',
                'qualified',
                'all',
              ],
              type: 'string',
            },
            days_since_contact: {
              type: 'number',
            },
          },
        },
        description: 'Reviews leads by status and score, suggests follow-up. Use when: heartbeat pipeline review, prioritizing lead outreach. NOT for: updating lead status (use manage_leads).',
      },
    },
    instructions: 'Audit the lead pipeline. Use prospect_research to enrich hot leads. Suggest follow-up actions.',
  },
];

export const crmModule = defineModule<CRMLeadInput, CRMLeadOutput>({
  id: 'leads',
  name: 'CRM',
  version: '1.0.0',
  description: 'Create and manage leads',
  capabilities: ['content:receive', 'data:write', 'webhook:trigger'],
  inputSchema: crmLeadInputSchema,
  outputSchema: crmLeadOutputSchema,

  skills: [
    'add_lead',
    'manage_leads',
    'lead_pipeline_review',
    'lead_nurture_sequence',
    'crm_task_list',
    'crm_task_create',
    'crm_task_update',
  ],
  skillSeeds: CRM_SKILLS,

  async publish(input: CRMLeadInput): Promise<CRMLeadOutput> {
    try {
      const validated = crmLeadInputSchema.parse(input);

      const { data: existingLead } = await supabase
        .from('leads')
        .select('id, score, status')
        .eq('email', validated.email)
        .maybeSingle();

      if (existingLead) {
        const newScore = (existingLead.score || 0) + (validated.initial_score || 5);
        await supabase
          .from('leads')
          .update({ score: newScore, updated_at: new Date().toISOString() })
          .eq('id', existingLead.id);

        return { success: true, lead_id: existingLead.id, is_new: false, score: newScore, status: existingLead.status };
      }

      const leadData: {
        email: string; name: string | null; phone: string | null;
        source: string; source_id: string | null; score: number; status: 'lead';
      } = {
        email: validated.email,
        name: validated.name || null,
        phone: validated.phone || null,
        source: validated.source,
        source_id: validated.source_id || null,
        score: validated.initial_score || 10,
        status: 'lead',
      };

      const { data, error } = await supabase
        .from('leads')
        .insert(leadData)
        .select('id, score, status')
        .single();

      if (error) {
        logger.error('[CRMModule] Insert error:', error);
        return { success: false, error: error.message };
      }

      try {
        await triggerWebhook({
          event: 'form.submitted',
          data: { type: 'lead_created', id: data.id, email: validated.email, source: validated.source, source_module: validated.meta?.source_module },
        });
      } catch (webhookError) {
        logger.warn('[CRMModule] Webhook trigger failed:', webhookError);
      }

      return { success: true, lead_id: data.id, is_new: true, score: data.score, status: data.status };
    } catch (error) {
      logger.error('[CRMModule] Error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
});
