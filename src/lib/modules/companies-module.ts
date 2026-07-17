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
  {
    name: 'list_company_orders',
    description: "List the orders of the signed-in B2B contact's OWN company (identity ladder rung 3). Use when: an authenticated company contact asks about their organisation's orders. NOT for: an individual's personal order (that is the B2C rung), staff-side order management, or anonymous visitors.",
    category: 'commerce',
    handler: 'internal:list_company_orders',
    scope: 'external',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_company_orders',
        description: "List the signed-in contact's company orders. Scoped server-side to the caller's active company only.",
        parameters: {
          type: 'object',
          properties: { limit: { type: 'integer', description: 'Max orders to return (default 20, max 50).' } },
        },
      },
    },
    instructions: "Company-facing self-service. The company is taken from the contact's verified session — do NOT ask for or pass a company id/name; the platform scopes to the caller's OWN company. Returns orders with status + total. If the contact isn't linked to a company yet, tell them to ask their account manager.",
  },
  {
    name: 'list_company_invoices',
    description: "List the invoices of the signed-in B2B contact's OWN company (identity ladder rung 3), including which are unpaid. Use when: an authenticated company contact asks about their organisation's invoices/what's outstanding. NOT for: personal B2C invoices, staff-side AR management, or anonymous visitors.",
    category: 'commerce',
    handler: 'internal:list_company_invoices',
    scope: 'external',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_company_invoices',
        description: "List the signed-in contact's company invoices (with unpaid flag). Scoped server-side to the caller's active company only.",
        parameters: {
          type: 'object',
          properties: { limit: { type: 'integer', description: 'Max invoices to return (default 20, max 50).' } },
        },
      },
    },
    instructions: "Company-facing self-service, read-only. Scoped to the caller's OWN company from the verified session — never ask for a company id. Returns invoices with total + due date + an unpaid flag. Paying an invoice is a separate, deliberate step (not this skill).",
  },
  {
    name: 'request_company_return',
    description: "Open a return (RMA) for one of the signed-in B2B contact's OWN company's orders (identity ladder rung 3, write). Use when: an authenticated company contact with the buyer role or higher wants to return a company order. NOT for: a personal B2C order (request_return), staff-side return processing, viewers (read-only role), or anonymous visitors.",
    category: 'commerce',
    handler: 'internal:request_company_return',
    scope: 'external',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'request_company_return',
        description: "Open a return for one of the caller's company orders. Scoped server-side to the caller's active company; requires the buyer role or higher.",
        parameters: {
          type: 'object',
          properties: {
            order_reference: { type: 'string', description: "The company order id (or its short prefix) to return." },
            reason_code: { type: 'string', enum: ['defective', 'wrong_item', 'not_as_described', 'changed_mind', 'damaged_in_transit', 'other'] },
            reason: { type: 'string', description: 'Free-text detail (optional).' },
          },
          required: ['order_reference'],
        },
      },
    },
    instructions: "Company-facing write. The company + role come from the verified session — never ask for or pass a company id. Resolve the order among the company's own orders (list_company_orders first if unsure of the id). Opens a 'requested' RMA only; approval + refund stay staff-gated. If the contact's role is below buyer, the platform refuses — tell them to ask a company admin.",
  },
  {
    name: 'approve_company_quote',
    description: "Accept/approve a sales quote addressed to the signed-in B2B contact's OWN company (identity ladder rung 3, commitment). Use when: an authenticated company contact with the approver role or higher wants to accept a quote their company received. NOT for: creating or sending quotes (staff), buyers/viewers (insufficient role), paying (a separate money step), or anonymous visitors.",
    category: 'commerce',
    handler: 'internal:approve_company_quote',
    scope: 'external',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'approve_company_quote',
        description: "Accept a quote belonging to the caller's active company. Scoped server-side; requires the approver role or higher. Acceptance is a commitment, not a payment.",
        parameters: {
          type: 'object',
          properties: {
            quote_reference: { type: 'string', description: 'The quote number (or id) to accept.' },
          },
          required: ['quote_reference'],
        },
      },
    },
    instructions: "Company-facing commitment. The company + role come from the verified session — never ask for a company id. Only quotes awaiting the customer (sent/viewed/pending_approval) can be accepted; already-accepted is idempotent. Accepting commits the company but moves NO money — payment is a separate, deliberate step. Below the approver role → the platform refuses.",
  },
  {
    name: 'manage_company_contacts',
    description: "Manage who else may act for the signed-in B2B contact's OWN company: list contacts, invite a colleague by email with a role, change a role, or revoke access (identity ladder rung 3, admin only). Use when: a company ADMIN wants to add/remove/adjust their organisation's portal users. NOT for: staff-side CRM contact management, non-admin roles, or anonymous visitors.",
    category: 'crm',
    handler: 'internal:manage_company_contacts',
    scope: 'external',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_company_contacts',
        description: "List/invite/set_role/revoke contacts of the caller's active company. Scoped server-side; requires the admin role.",
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'invite', 'set_role', 'revoke'], description: 'Default list.' },
            email: { type: 'string', description: 'The colleague to invite / set_role / revoke.' },
            role: { type: 'string', enum: ['viewer', 'buyer', 'approver', 'admin'], description: 'Role for invite / set_role.' },
          },
          required: ['action'],
        },
      },
    },
    instructions: "Company-facing admin. The company comes from the verified session — never ask for a company id. invite: an already-registered email is added active immediately; otherwise an 'invited' row that activates automatically when they sign up with that email. Roles ascend viewer<buyer<approver<admin. The platform refuses removing/demoting the company's last admin, and refuses the whole skill below the admin role.",
  },
  {
    name: 'reorder_company_order',
    description: "Place a repeat of one of the signed-in B2B contact's OWN company's earlier orders (identity ladder rung 3, write). Use when: an authenticated company contact with the buyer role or higher wants to order the same thing again. NOT for: brand-new orders with different items (staff/checkout), personal B2C orders, viewers (read-only role), or anonymous visitors.",
    category: 'commerce',
    handler: 'internal:reorder_company_order',
    scope: 'external',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'reorder_company_order',
        description: "Repeat one of the caller's company orders as a new pending order (same line items). Scoped server-side to the caller's active company; requires the buyer role or higher. No payment is taken.",
        parameters: {
          type: 'object',
          properties: {
            order_reference: { type: 'string', description: 'The earlier company order id (or its short prefix) to repeat.' },
          },
          required: ['order_reference'],
        },
      },
    },
    instructions: "Company-facing write. The company + role come from the verified session — never ask for a company id. Resolve the source order among the company's own orders (list_company_orders first if unsure). Creates a PENDING copy with the same line items for staff to confirm — no payment is taken in chat. Idempotent: an already-open pending reorder of the same source order is returned, not duplicated.",
  },
  {
    name: 'request_company_quote',
    description: "File a quote request on behalf of the signed-in B2B contact's OWN company (identity ladder rung 3, write). Use when: an authenticated company contact with the buyer role or higher asks for pricing/a quote on products or services. NOT for: accepting a received quote (approve_company_quote), staff-side quote authoring (manage_quote), or anonymous visitors (contact form).",
    category: 'commerce',
    handler: 'internal:request_company_quote',
    scope: 'external',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'request_company_quote',
        description: "File a draft quote request for the caller's company; staff price it up and send the quote back. Scoped server-side; requires the buyer role or higher.",
        parameters: {
          type: 'object',
          properties: {
            request: { type: 'string', description: 'What the company would like a quote for — products/services, quantities, timeline.' },
          },
          required: ['request'],
        },
      },
    },
    instructions: "Company-facing write. The company comes from the verified session — never ask for a company id. Capture the request as given (products, quantities, timeline) in the `request` field; it's filed as a DRAFT quote with the request in the notes and NO amounts — staff price it up (the customer never authors amounts). Idempotent on an identical open draft request. The finished quote comes back to the company for approval (approve_company_quote).",
  },
  {
    name: 'initiate_company_invoice_payment',
    description: "Get the secure payment link for one of the signed-in B2B contact's OWN company's unpaid invoices (identity ladder rung 3). Use when: an authenticated company contact with the buyer role or higher wants to pay a company invoice. NOT for: paying in chat (payment happens on the invoice page), refunds or credit changes (staff), personal B2C invoices, or anonymous visitors.",
    category: 'commerce',
    handler: 'internal:initiate_company_invoice_payment',
    scope: 'external',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'initiate_company_invoice_payment',
        description: "Resolve one of the caller's company's unpaid invoices and return its secure payment page link. Scoped server-side; requires the buyer role or higher. Moves no money — payment completes on the invoice page.",
        parameters: {
          type: 'object',
          properties: {
            invoice_reference: { type: 'string', description: 'The invoice number (or id) to pay.' },
          },
          required: ['invoice_reference'],
        },
      },
    },
    instructions: "Company-facing, read-only in effect: resolves the invoice within the company's OWN invoices and returns the payment-page link (/invoice/<token>) — the customer completes payment THERE, never in chat, and this skill never charges anything. Already-paid is reported as done; cancelled can't be paid. If more than one invoice matches, ask for the exact invoice number (list_company_invoices helps).",
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
    // Identity-ladder rung 3 (B2B) read skills — company-scoped self-service.
    'list_company_orders',
    'list_company_invoices',
    // Rung 3 (B2B) P2 — write + roles (buyer/approver/admin gated server-side).
    'request_company_return',
    'approve_company_quote',
    'manage_company_contacts',
    // Rung 3 (B2B) P2b — reorder, quote request, pay-own-invoice via the rail.
    'reorder_company_order',
    'request_company_quote',
    'initiate_company_invoice_payment',
  ],
  data: {
    tables: ['companies'],
  },
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
