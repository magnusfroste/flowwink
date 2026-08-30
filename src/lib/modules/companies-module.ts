import { supabase } from '@/integrations/supabase/client';
import { callSkill } from '@/lib/call-skill';
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
    name: 'search_partners',
    description: 'Search the PARTY REGISTER — the one table that holds customers, suppliers and contact people, seen through one of three lenses. Use when: finding a customer or supplier by name, email, organisation number or VAT number; listing everyone you have sold to or bought from; checking whether a party already exists before creating one. NOT for: pipeline leads that are not yet a real counterparty (manage_leads); company master data fields (manage_company). The lens is a filter over the SAME rows, not three registers: a business that both buys from you and supplies you is ONE party that appears in both "customers" and "vendors".',
    category: 'crm',
    handler: 'rpc:search_partners',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'search_partners',
        description: 'Search the party register through one of three lenses (contacts, customers, vendors).',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Name, email, organisation number or VAT number. Omit to list.' },
            lens: { type: 'string', enum: ['contacts', 'customers', 'vendors'], description: "Which lens over the same rows. Default 'contacts' (everyone)." },
            limit: { type: 'number', description: 'Max rows, default 25, cap 200.' },
            include_archived: { type: 'boolean', description: 'Default false. Archived parties are always COUNTED and reported in archived_matches; pass true to list them.' },
          },
        },
      },
    },
    instructions: `## search_partners
### One table, three lenses
Customers and suppliers are not two registers. They are one party table where
\`customer_rank\` and \`supplier_rank\` record what the party has been part of. A
company that both buys from you and supplies you is ONE row that shows up in
both lenses — merging it into two records is the failure this model exists to
prevent.

### Read the response
\`matches\` is how many exist; \`returned\` is how many you got. When they differ
the note says so — do not report the returned count as the total.
\`belongs_to\` on a row is the legal entity behind a contact person.

### Before creating a party
Search first. A second party for the same email means two receivable balances
for one customer, and the two are hard to merge once documents point at both.`,
  },
  {
    name: 'read_partner',
    description: 'Read the full customer card for one party: who they are, which legal entity they are billed as, their addresses, bank accounts, payment terms, tax treatment, receivable balance and how many documents they carry. Use when: someone asks "who is this customer", "what do they owe us", "where do we invoice them", "what terms do they have"; before invoicing or paying a party. NOT for: searching (search_partners); the pipeline record behind a lead (manage_leads). Accepts a party id, an email address or a name. Reports what is MISSING in a "gaps" list — a card without an organisation number and a card that does not show organisation numbers look identical otherwise.',
    category: 'crm',
    handler: 'rpc:read_partner',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'read_partner',
        description: 'The full customer card for one party: identity, hierarchy, addresses, bank accounts, terms, tax treatment, ledger and documents.',
        parameters: {
          type: 'object',
          required: ['partner'],
          properties: {
            partner: { type: 'string', description: 'Party id, email address, or exact name.' },
          },
        },
      },
    },
    instructions: `## read_partner
### The two identities on one card
\`name\` is who the document is addressed to. \`billed_to\` is the LEGAL ENTITY the
ledger books on — for a contact person that is their company. Money is always
owed by \`billed_to\`, never by the contact. When you report a balance, report
whose it is.

### Read the gaps
\`gaps\` lists what would block real work: no organisation number (an invoice
needs it), no payment terms (every document sets them by hand), no tax
treatment chosen (a proposal exists but nobody accepted it). An empty gaps list
is a party you can invoice today.

### Addresses
\`addresses\` shows the legal entity's addresses, marked with which party each
hangs on. \`default_addresses\` is what a NEW document would use — a party with
no registered address is its own address, so this is never empty.

### Bank accounts
\`payable: false\` means the account is registered but NOT approved for outgoing
payments. That is a fraud control, not an oversight: approval lapses whenever
the account number changes. Never treat an unapproved account as payable.`,
  },
  {
    name: 'manage_partner_address',
    description: 'Register an invoice or delivery address on a party. Addresses are CHILD PARTIES, not fields — that is what lets you invoice a company centrally while delivering to its store, and lets a repeat customer reuse an address instead of retyping it. Use when: a customer gives a separate billing address; a B2B customer wants deliveries to a specific site. NOT for: changing a party\'s own street (that is manage_company or the party itself). Idempotent on street + postal code: the same address twice gives one row. Refuses an address with no street — a row with only a name is not an address, it is a duplicate of the party.',
    category: 'crm',
    handler: 'rpc:ensure_partner_address',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_partner_address',
        description: 'Register (or re-use) an invoice or delivery address as a child party.',
        parameters: {
          type: 'object',
          required: ['parent_id', 'type', 'street'],
          properties: {
            parent_id: { type: 'string', description: 'The party the address belongs to (a company or a rootless person).' },
            type: { type: 'string', enum: ['invoice', 'delivery', 'other'], description: 'What the address is for.' },
            name: { type: 'string', description: 'Label, e.g. "Acme AB – Invoicing". Defaults to the parent name.' },
            street: { type: 'string' },
            street2: { type: 'string' },
            postal_code: { type: 'string' },
            city: { type: 'string' },
            country_code: { type: 'string', description: 'ISO 2-letter, e.g. SE.' },
            phone: { type: 'string' },
          },
        },
      },
    },
    instructions: 'Returns the address party id. An order or invoice for this customer will default to it — invoice documents pick the invoice address, deliveries the delivery one, and a party with neither is its own address. The address is scoped to one legal entity: a document cannot be shipped to another customer\'s address, and the database refuses it.',
  },
  {
    name: 'approve_partner_bank_account',
    description: 'Approve (or revoke) a partner bank account for OUTGOING payments. A newly registered account is never payable until someone approves it, and the approval LAPSES automatically whenever the account number changes. Use when: a supplier bank account has been registered and finance has verified it; revoking an account you no longer trust. NOT for: registering the account number itself. This is a fraud control: whoever edits a supplier\'s bank number must not thereby redirect money.',
    category: 'crm',
    handler: 'rpc:approve_partner_bank_account',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'approve_partner_bank_account',
        description: 'Approve or revoke a partner bank account for outgoing payments.',
        parameters: {
          type: 'object',
          required: ['bank_account_id'],
          properties: {
            bank_account_id: { type: 'string' },
            approve: { type: 'boolean', description: 'true to approve, false to revoke. Default true.' },
          },
        },
      },
    },
    instructions: 'Approving is a separate act from registering the number, and it is deliberately harder: it needs the accounting module or the admin role. Report back that the approval lapses if the number is changed — the person approving should know that.',
  },
  {
    name: 'archive_partner',
    description: 'Retire a party from the register, or bring one back. Use when: a party was created by mistake, is a duplicate that could not be merged, or is a counterparty you no longer deal with; also to RESTORE one you archived. NOT for: deleting a party (nothing deletes a party that any document points at — that is deliberate); merging duplicates (merge_duplicate_partners). Archiving hides the party from the lenses; it does not touch a single document and the ledger balance is unchanged. It does NOT cascade to contacts or addresses underneath — each is its own party — but everything left behind is reported back to you, along with unpaid invoices, live subscriptions and whether the party has a login account. Our own company can never be retired.',
    category: 'crm',
    handler: 'rpc:archive_partner',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'archive_partner',
        description: 'Archive or restore a party. Archives, never deletes; reports what was left active.',
        parameters: {
          type: 'object',
          properties: {
            partner: { type: 'string', description: 'Party id, email or name. Archived parties are found by name too, so a restore always has a way back.' },
            archive: { type: 'boolean', description: 'Default true. Pass false to restore.' },
            reason: { type: 'string', description: 'Why it is being retired. Recorded in the response for the audit trail.' },
          },
          required: ['partner'],
        },
      },
    },
    instructions: `## archive_partner

### Archive is not delete
Nothing removes a party that a document points at — \`partners_no_delete_with_history\`
refuses, on purpose. Archiving is the way out: \`active\` goes false, the party
drops out of \`search_partners\`, and **every invoice, order, ticket and journal
line still points at it**. The receivable does not move. Reversible in one call.

### Read the response, do not just report success
The call returns what it LEFT BEHIND, because none of it cascades:
- \`left_active_underneath\` — contacts and addresses under this party stay active,
  and contacts still book their money on it (that is \`commercial_partner_id\`, and
  it is not recomputed by archiving)
- \`open_items\` — unpaid invoices, live subscriptions, open tickets
- \`has_a_login_account\` — archiving does NOT revoke a portal login
- \`warnings\` — the same facts phrased as what could go wrong

A live subscription keeps billing after its party is archived. Say so rather
than reporting a clean archive.

### Finding one again
\`search_partners\` hides archived parties but always COUNTS them in
\`archived_matches\`; pass \`include_archived\` to list them. \`read_partner\` finds
an archived party by name and marks the card \`archived: true\`.

### What it refuses
Our own company (\`is_self\`). Change the company identity in Business Identity
instead — the party is what every document we ever issued points at.`,
  },
  {
    name: 'merge_duplicate_partners',
    description: 'Find and merge parties that share an email address. One person as two parties means two receivable balances, two credit limits and two DSO figures for one customer. Use when: a duplicate is suspected; after importing contacts; as periodic hygiene. NOT for: merging two genuinely different parties (they must share an email). Run with dry_run first — it reports how many duplicate groups exist without touching anything. The loser is ARCHIVED, never deleted, and every foreign key pointing at it is repointed by reading the catalogue, so a new table is picked up automatically.',
    category: 'crm',
    handler: 'rpc:merge_duplicate_partners',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'merge_duplicate_partners',
        description: 'Merge parties sharing an email. Person before company, then oldest, wins.',
        parameters: {
          type: 'object',
          properties: {
            dry_run: { type: 'boolean', description: 'Default true. Reports duplicate groups without merging.' },
          },
        },
      },
    },
    instructions: 'Always dry-run first and report the group count before merging. The winner is the person before the company, then the oldest — so documents land on the record a human is most likely to recognise. Archived losers stay readable; nothing is destroyed.',
  },
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
          await callSkill('enrich_company', { companyId: data.id });
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
