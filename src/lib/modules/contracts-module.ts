/**
 * Contracts Module — Unified Definition
 *
 * SCOPE NOTE (2026-04-20): Currently a "legal contract archive" — agreements with
 * counterparties, status flow, renewal alerts, linked documents (via documents
 * module + related_entity_type='contract').
 *
 * FUTURE SCOPE (planned, not implemented):
 *   - Recurring/subscription contracts that auto-generate invoices (Odoo-style sale.subscription)
 *   - MRR/ARR tracking + churn signals
 *   - "Convert quote → contract" flow when a deal closes
 *   - E-signature integration (DocuSign / Scrive)
 *
 * Documents are linked via the documents table:
 *   related_entity_type='contract', related_entity_id=<contract.id>
 * Use the `list_contract_documents` skill from MCP to enumerate them.
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { defineModule } from '@/lib/module-def';
import type { SkillSeed, AutomationSeed } from '@/lib/module-bootstrap';

const contractsInputSchema = z.object({
  action: z.enum(['create', 'update', 'list', 'get']),
  id: z.string().uuid().optional(),
  title: z.string().optional(),
  counterparty_name: z.string().optional(),
  counterparty_email: z.string().email().optional(),
  contract_type: z.enum(['service', 'nda', 'employment', 'lease', 'other']).optional(),
  status: z.enum(['draft', 'pending_signature', 'active', 'expired', 'terminated']).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  value_cents: z.number().int().optional(),
  notes: z.string().optional(),
});

const contractsOutputSchema = z.object({
  success: z.boolean(),
  contract_id: z.string().optional(),
  message: z.string().optional(),
});

type ContractsInput = z.infer<typeof contractsInputSchema>;
type ContractsOutput = z.infer<typeof contractsOutputSchema>;

const CONTRACT_SKILLS: SkillSeed[] = [
  {
    name: 'manage_contract_obligation',
    description: 'Track contract milestones/obligations (description, due date, status pending/met/overdue, responsible). Use when: adding or updating what a contract commits either party to. NOT for: the contract document itself (manage_contract).',
    category: 'commerce',
    handler: 'rpc:manage_contract_obligation',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_contract_obligation',
        description: 'List/create/update/delete contract obligations (contract_obligations). Setting status=met stamps met_at.',
        parameters: {
          type: 'object',
          required: ['action'],
          properties: {
            action: { type: 'string', enum: ['list', 'create', 'update', 'delete'] },
            obligation_id: { type: 'string', description: 'Required for update/delete' },
            contract_id: { type: 'string', description: 'Required for create; filters list' },
            description: { type: 'string', description: 'Required for create' },
            due_date: { type: 'string', format: 'date' },
            status: { type: 'string', enum: ['pending', 'met', 'overdue'] },
            responsible: { type: 'string' },
            notes: { type: 'string' },
          },
        },
      },
    },
  },
  {
    name: 'manage_contract',
    description: 'Create, list, update, or search contracts. Use when: admin wants to create an agreement, find a contract by counterparty, change status, or update terms. NOT for: invoicing (use manage_invoice), project management (use manage_project).',
    category: 'commerce',
    handler: 'db:contracts',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_contract',
        description: 'CRUD for contracts and agreements. NOTE: action=create REQUIRES counterparty_name (NOT NULL in DB).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'list', 'update', 'search'] },
            contract_id: { type: 'string', description: 'Required for action=update' },
            template_id: { type: 'string', description: 'PREFERRED for action=create — UUID of a contract_templates row. Run list_contract_templates first to discover available templates. Renders tokens ({{counterparty.name}}, {{start_date}}, {{value}} etc) into a full agreement body automatically.' },
            title: { type: 'string', description: 'Optional override — defaults to "<template name> — <counterparty_name>" or "Contract — <counterparty_name>"' },
            contract_type: { type: 'string', enum: ['service', 'nda', 'employment', 'lease', 'other'], description: 'Ignored when template_id is set (template defines type).' },
            status: { type: 'string', enum: ['draft', 'pending_signature', 'active', 'expired', 'terminated'] },
            counterparty_name: { type: 'string', description: 'REQUIRED for action=create — name of the other party (person or company). NOT NULL in DB.' },
            counterparty_email: { type: 'string' },
            start_date: { type: 'string', description: 'YYYY-MM-DD. Defaults to today when using template_id.' },
            end_date: { type: 'string', description: 'YYYY-MM-DD' },
            renewal_type: { type: 'string', enum: ['none', 'auto', 'manual'] },
            renewal_notice_days: { type: 'number' },
            value_cents: { type: 'number' },
            currency: { type: 'string', description: 'ISO 4217, defaults to SEK' },
            notes: { type: 'string', description: 'Short internal note / metadata. NOT the agreement text.' },
            body_markdown: { type: 'string', description: 'Only used when template_id is NOT provided AND no file_url. Must be >=200 chars of real agreement text — DB trigger rejects empty contracts.' },
            file_url: { type: 'string', description: 'Optional URL to an attached PDF/DOCX. Alternative to template_id and body_markdown.' },
            billing_enabled: { type: 'boolean', description: 'Enable recurring billing so generate_contract_invoice can bill this contract.' },
            billing_amount_cents: { type: 'number', description: 'Amount to invoice each billing period (integer cents).' },
            billing_interval: { type: 'string', enum: ['day', 'week', 'month', 'year'], description: 'Billing period unit (with billing_interval_count).' },
            billing_interval_count: { type: 'number', description: 'Number of intervals per period, e.g. 3 with month = quarterly.' },
            billing_next_date: { type: 'string', description: 'YYYY-MM-DD of the next invoice; generate_contract_invoice bills when this is due.' },
            billing_due_in_days: { type: 'number', description: 'Payment terms in days for generated invoices (default 30).' },
            billing_tax_rate: { type: 'number', description: 'Tax rate as a fraction, e.g. 0.25.' },
            search_query: { type: 'string', description: 'Free-text search in title/counterparty' },
          },
          required: ['action'],
          'x-action-required': {
            create: ['counterparty_name'],
          },
        },
      },
    },
    instructions: 'Contracts track agreements with external parties. Status flow: draft → pending_signature → active → expired/terminated.\n\nFOR action=create: ALWAYS prefer template_id — run list_contract_templates first to find a matching template (NDA, Service, MSA, SOW). The template renders the full agreement body via tokens automatically. Only fall back to body_markdown (>=200 chars) or file_url when no template fits — never create contracts with empty or fabricated bodies. The DB rejects empty contracts.\n\nRECURRING SERVICE from a quote (the recurring-value model): the dimension travels, never re-invent it. Seed billing_amount_cents = the quote\'s recurring per-period sum and billing_interval = its cadence (a 10 000/month line stays month, NOT the annual figure). Set start_date + end_date from the binding term (end = start + term months) — create_subscription_from_contract reads these dates to compute the born service\'s commitment_months. value_cents = the TOTAL contract value (per-period × term + one-time items), not one period\'s total. Leave billing_enabled to the operator unless asked: seed WHAT to bill, the operator decides WHEN billing starts. One-time items belong on the first invoice, never in billing_amount_cents.\n\nDefault currency: SEK.',
  },
  {
    name: 'list_contract_templates',
    description: 'List available contract templates (NDA, Service, MSA, SOW, etc) before creating a contract. Use when: agent or admin needs to create a contract and wants to discover existing templates instead of writing from scratch. Returns template id, name, contract_type, language, and defaults. NOT for: viewing contract content (use get_contract_content) or listing actual contracts (use manage_contract action=list).',
    category: 'commerce',
    handler: 'db:contracts',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_contract_templates',
        description: 'Discover available contract templates. Filter by contract_type and/or language.',
        parameters: {
          type: 'object',
          properties: {
            contract_type: { type: 'string', enum: ['service', 'nda', 'employment', 'lease', 'other'] },
            language: { type: 'string', description: 'ISO 639-1, e.g. "sv" or "en"' },
          },
        },
      },
    },
    instructions: 'Returns active templates from contract_templates ordered by is_default DESC, contract_type, name. Pass the returned id as template_id to manage_contract action=create.',
  },
  {
    name: 'manage_contract_template',
    description: 'Author the organisation\'s own contract templates: get, create, update or archive the reusable agreement bodies that manage_contract renders into real contracts. IMPORTANT: load this skill\'s full instructions (read_skill / skill_read) BEFORE authoring — they carry the token list ({{counterparty.*}}, {{supplier.*}}, {{contract.number}}, dates/value, {{terms_url}}, {{quote.lines}}, …), the party-block pattern, the per-type checklists, and the process couplings a FlowWink template must honour. Any {{...}} outside the rendered set survives into the signed agreement as a defect; what a human must decide is written as [BRACKETS]. Use when: the business changes its terms, adds a product that needs its own agreement, or asks you to draft a new contract type. NOT for: creating a contract for a specific customer (manage_contract action=create with template_id), or reading the templates that exist (list_contract_templates).',
    category: 'commerce',
    handler: 'rpc:manage_contract_template',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_contract_template',
        description: 'Get, create, update or archive a reusable contract template.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['get', 'create', 'update', 'archive'], description: 'archive deactivates the template; templates are never deleted because they are the provenance of every contract signed from them.' },
            template: { type: 'string', description: 'REQUIRED for get/update/archive — the template\'s exact name or its UUID. A unique name prefix also resolves; an ambiguous one errors with the candidates listed.' },
            name: { type: 'string', description: 'REQUIRED for create. On update, renames the template.' },
            description: { type: 'string', description: 'One line on when to use this template — this is what a salesperson reads in the picker.' },
            contract_type: { type: 'string', enum: ['service', 'nda', 'employment', 'lease', 'other'], description: 'Defaults to service on create.' },
            language: { type: 'string', description: 'ISO 639-1. Defaults to sv.' },
            body_markdown: { type: 'string', description: 'REQUIRED for create — the full agreement text in Markdown. On update, omit to leave unchanged; an empty string is rejected rather than blanking the template.' },
            currency: { type: 'string', description: 'ISO 4217, defaults to SEK.' },
            renewal_type: { type: 'string', enum: ['none', 'auto', 'manual'] },
            renewal_notice_days: { type: 'number', description: 'Default notice period in days (90 if omitted on create).' },
            value_cents: { type: 'number', description: 'Default contract value in integer cents.' },
            is_default: { type: 'boolean' },
            is_active: { type: 'boolean' },
          },
          required: ['action'],
        },
      },
    },
    instructions: 'THE CONTRACT AUTHORING GUIDE — FlowWink owns this framework; the INSTANCE owns the legal content.\n\nSTEP 0, GATHER INSTANCE CONTEXT FIRST (never author from a blank page):\n1. list_contract_templates — the existing templates ARE the house style; mirror their structure, numbering and voice.\n2. search_kb / search_wiki for the instance\'s contract policy, standard terms and legal notes.\n3. The supplier\'s own identity (name, org.nr, address, signatory) renders from company master data via {{supplier.*}} — NEVER hardcode it into a body.\nThe platform supplies structure and process; the instance\'s own documents supply clause content and jurisdiction specifics. Do not fabricate jurisdiction-specific legal text the instance\'s materials do not support — generic professional clauses plus [BRACKETS] beat invented law.\n\nRENDERED TOKENS (substituted at contract creation): {{counterparty.name}} {{counterparty.email}} {{counterparty.org_number}} {{counterparty.address}} {{supplier.name}} {{supplier.org_number}} {{supplier.address}} {{supplier.phone}} {{supplier.email}} {{supplier.signatory}} {{contract.number}} {{today}} {{start_date}} {{end_date}} {{value}} {{currency}} {{title}} {{terms_url}} {{site_url}} {{quote.lines}}. Anything else in {{...}} ships literally — create returns unrendered_tokens; a non-empty list means fix the body and update before shipping. Use [BRACKETS] for what a human must decide (leasing counterparties, per-deal line specifics, choice of court). An appendix references its parent as [HUVUDAVTALETS NUMMER] — the PARENT\'s number, intentionally manual.\n\nPARTY BLOCK (open every template with it):\n**Avtalsnummer:** {{contract.number}} · **Upprättat:** {{today}}\n**Leverantör:** {{supplier.name}}, org.nr {{supplier.org_number}}, {{supplier.address}}\n**Kund:** {{counterparty.name}}, org.nr {{counterparty.org_number}} · {{counterparty.email}}\n\nPROCESS COUPLINGS (what makes it a FlowWink template rather than prose):\n- Price: when agreements are born from quotes, the price clause references {{quote.lines}} — the accepted quote\'s lines render as the agreed table. A recurring service states price PER PERIOD plus a binding term; the term becomes the contract\'s start/end dates and the born subscription\'s commitment (the agreement IS the order; delivery is a status).\n- Billing: the recurring fee is executed by contract billing (billing_amount/interval on the contract, CTR- invoice series) — write payment terms in the clause, not invoice mechanics.\n- Standard terms: shared terms live on the public terms page — link {{terms_url}}, never duplicate them per template.\n- Obligations: commitments with deadlines (delivery day, SLA reviews, notice windows) are numbered discrete clauses so manage_contract_obligation can track each one.\n- Signing: close with the e-signature block — issued by {{supplier.signatory}}; the customer signs electronically via the public link (name, e-mail, time and IP are recorded).\n- Renewal: set renewal_type/renewal_notice_days METADATA to match the renewal clause — contract_renewal_check reads the metadata, not the prose.\n\nPER-TYPE CHECKLIST:\n- service: parties · background/scope · service description (own § or Bilaga 1) · price WITH cadence ({{quote.lines}} or explicit) · term + binding + renewal · delivery/acceptance · SLA/support reference · liability cap · termination · {{terms_url}} · signature block.\n- nda: parties · definition of confidential information · permitted use · exclusions · confidentiality duration (survives termination) · return/destruction · no licence granted · signature block. No billing metadata.\n- employment: parties · role and duties · start {{start_date}} · salary · working hours · vacation · notice periods · confidentiality/IP · collective-agreement reference as [BRACKETS] if any.\n- lease: parties · leased object (Bilaga) · term · fee with cadence · care/insurance/risk · return condition · ownership marking and retention rights.\n- appendix (bilaga): references [HUVUDAVTALETS NUMMER] · states its precedence vs the main agreement · covers exactly ONE concern (data processing, third-party acknowledgement, power of attorney).\n\nWHEN A BODY REFERENCES A BILAGA, ATTACH IT. A main agreement that says "enligt Bilaga 1" and defines a precedence order is incomplete until that appendix exists on the contract — the customer would sign a reference to nothing. Author the appendix as a template here, then attach it to the actual agreement with manage_contract_appendix (action=create, template=<this template>, label matching the body\'s wording). The counterparty sees appendices in full on the signing page and the signature covers their content.\n\nMECHANICS: create is idempotent on name — an existing name returns already_existed = true; use action=update to change a body. description = the one line a salesperson reads in the picker (when to use this template). Write the body as the finished agreement, not a form: numbered clauses, a signature block.',
  },
  {
    name: 'contract_renewal_check',
    description: 'Check for contracts expiring soon and alert. Use when: autonomous heartbeat checks for renewal deadlines, or admin asks "which contracts are expiring soon?". NOT for: creating contracts (use manage_contract).',
    category: 'commerce',
    handler: 'db:contracts',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'contract_renewal_check',
        description: 'Find contracts expiring within a given number of days',
        parameters: {
          type: 'object',
          properties: {
            days_ahead: { type: 'number', description: 'Days to look ahead (default 30)' },
            include_auto_renew: { type: 'boolean', description: 'Include auto-renewing contracts' },
          },
        },
      },
    },
    instructions: 'Query active contracts where end_date is within the specified window. Group by urgency: critical (<7 days), warning (<30 days), notice (<90 days). For auto-renew contracts, check if renewal_notice_days has passed.',
  },
  {
    name: 'generate_contract_invoice',
    description: 'Generate a customer invoice for a contract (the CTR-YYYYMMDD-… series). Use when: a service/retainer agreement is due for billing (its recurring fee), after the contract is active. NOT for: subscriptions (generate_subscription_invoice), quotes (manage_quote convert_to_invoice), or ad-hoc invoices (manage_invoice).',
    category: 'commerce',
    handler: 'rpc:generate_contract_invoice',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'generate_contract_invoice',
        description: 'Bill a contract — creates an invoice from the contract value/schedule',
        parameters: {
          type: 'object',
          properties: {
            contract_id: { type: 'string', description: 'UUID of the active contract to bill' },
          },
          required: ['contract_id'],
        },
      },
    },
    instructions: 'The contract must be active. Emits the invoice on the CTR- document series (distinct from the customer INV- series and the SUB- subscription series). Run after the contract is signed/active; for renewal billing, invoke each period.',
  },
  {
    name: 'get_contract_content',
    description: 'Fetch the full markdown body of a contract for LLM consumption. Use when: external operator (ClawWink) or agent needs to read, summarize, or analyze the actual agreement text — not just metadata. Returns title, counterparty, status, value and the entire body_markdown. NOT for: listing contracts (use manage_contract action=list) or attached PDFs (use list_contract_documents).',
    category: 'commerce',
    handler: 'db:contracts',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'get_contract_content',
        description: 'Return contract metadata + full markdown body — LLM-friendly, no parsing required.',
        parameters: {
          type: 'object',
          properties: {
            contract_id: { type: 'string', description: 'UUID of the contract' },
          },
          required: ['contract_id'],
        },
      },
    },
    instructions: 'Query public.contracts by id. Return id, title, counterparty_name, counterparty_email, status, contract_type, value_cents, currency, start_date, end_date, signed_at, version and body_markdown. The body_markdown field is the source of truth for the agreement text — pass it directly to the LLM context, do not summarize unless asked.',
  },
  {
    name: 'search_contracts',
    description: 'Free-text search across contracts (title, counterparty, body content). Use when: admin or operator asks "find the contract with X", "which contracts mention the Y clause?", "search NDA with ACME". Uses pg_trgm for fuzzy matching. NOT for: filtering by status only (use manage_contract action=list with status).',
    category: 'commerce',
    handler: 'db:contracts',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'search_contracts',
        description: 'Trigram + ILIKE search across title, counterparty_name and body_markdown. Returns matching contracts with score.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search terms — fuzzy matching on title, counterparty and body content' },
            limit: { type: 'number', description: 'Max results (default 10)' },
            status: { type: 'string', enum: ['draft', 'pending_signature', 'active', 'expired', 'terminated'], description: 'Optional status filter' },
          },
          required: ['query'],
        },
      },
    },
    instructions: 'Use pg_trgm similarity + ILIKE on title, counterparty_name and body_markdown. Sort by similarity DESC. Return id, title, counterparty_name, status, snippet (first 200 chars of matching body section). For exact clause lookup, fall back to ILIKE on body_markdown.',
  },
  {
    name: 'send_contract_for_signature',
    description: 'Generate a public signing link for a contract and mark it as pending_signature. Use when: admin or operator wants to send a finished contract to the counterparty for signing. Snapshots the current version, returns a /contract/:token URL the counterparty can visit to accept/reject without logging in. NOT for: creating contracts (use manage_contract) or signing on behalf of someone (signing must be done by the actual signer).',
    category: 'commerce',
    handler: 'db:contracts',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'send_contract_for_signature',
        description: 'Issue a public signing token + URL for a contract that has body_markdown filled in.',
        parameters: {
          type: 'object',
          properties: {
            contract_id: { type: 'string', description: 'UUID of the contract' },
          },
          required: ['contract_id'],
        },
      },
    },
    instructions: 'Verify contract.body_markdown is non-empty (refuse if blank — "write the agreement first"). Snapshot to contract_versions, generate accept_token if missing, set status=pending_signature, sent_at=now(). Return { url, token, version }. The URL pattern is {site_origin}/contract/{token}. SIGNING EVIDENCE: when the counterparty accepts or declines on the public page (typed name or drawn signature), contract-sign records signer, timestamp, IP, user-agent, optional signature_image, and a SHA-256 content_hash of the agreement body in contract_signatures; a printable signature certificate is available at {site_origin}/contract/{token}/certificate once the contract is active or terminated.',
  },
  {
    name: 'manage_contract_appendix',
    description: 'Manage the APPENDICES of one agreement — the numbered parts its own text references ("enligt Bilaga 1") and that the counterparty sees, and signs, on the public signing page. Two kinds in one numbered list: pass `template` to render an appendix contract_template into the agreement, or `file_url` to attach a spec/drawing/price list. The `label` must match what the agreement text says. Use when: an agreement body mentions a Bilaga, or you are asked to attach a data-processing agreement, service description or similar to a specific contract. NOT for: correspondence and the countersigned PDF filed against the contract (list_contract_documents / manage_document), and NOT for writing the reusable template itself (manage_contract_template).',
    category: 'commerce',
    handler: 'rpc:manage_contract_appendix',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_contract_appendix',
        description: 'List, add, update or remove the appendices attached to one contract.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'create', 'update', 'delete'] },
            contract_id: { type: 'string', description: 'REQUIRED for list and create — UUID of the contract.' },
            appendix_id: { type: 'string', description: 'REQUIRED for update and delete.' },
            template: { type: 'string', description: 'Appendix template name or UUID — renders it into the agreement as a document appendix. Run list_contract_templates first.' },
            body_markdown: { type: 'string', description: 'Alternative to template: the appendix text written inline.' },
            file_url: { type: 'string', description: 'Alternative to template/body_markdown: attach a file (spec, drawing, price list).' },
            file_name: { type: 'string' },
            file_type: { type: 'string', description: 'MIME type of the attached file.' },
            label: { type: 'string', description: 'What the agreement text calls it, e.g. "Bilaga 1". Auto-numbered when omitted.' },
            title: { type: 'string', description: 'What the appendix is, e.g. "Tjänstebeskrivning".' },
            sort_order: { type: 'number', description: 'Position in the numbered list. Defaults to next.' },
          },
          required: ['action'],
          'x-action-required': {
            list: ['contract_id'],
            create: ['contract_id'],
            update: ['appendix_id'],
            delete: ['appendix_id'],
          },
        },
      },
    },
    instructions: 'An appendix is PART of the agreement, not a file beside it: the body references it, it carries a precedence order, the customer reads it on the signing page, and the signature covers it (its content is folded into the signature\'s content hash and the frozen version snapshot).\n\nWORKFLOW for action=create: pass exactly ONE content source — `template` (preferred: run list_contract_templates first and pick the appendix template, e.g. a data-processing agreement or third-party acknowledgement), `body_markdown`, or `file_url`. Passing none is rejected.\n\nTHE LABEL IS THE JOIN. The agreement body says "enligt Bilaga 1"; the appendix must carry that exact wording or the customer cannot match the reference to the attachment. When the body mentions a Bilaga that does not exist yet, creating it is the fix — never edit the reference away.\n\nORDER MATTERS: appendices are numbered in creation order unless sort_order says otherwise, and the customer sees them in that order.\n\nAFTER SIGNING: do not edit or delete an appendix on a signed agreement. The signature hash covers the appendix content as it was; changing it makes the certificate fail verification. Add an amendment as a new appendix instead.',
  },

  {
    name: 'list_contract_documents',
    description: 'List archive documents FILED AGAINST a contract — correspondence, the countersigned PDF, supporting material. Use when: admin or agent asks "which documents are attached to contract X?", or wants to verify that a signed PDF is on file. NOT for: the agreement\'s own appendices, which are part of what the customer signs (manage_contract_appendix); NOT for uploading new documents (use manage_document with related_entity_type=contract).',
    category: 'commerce',
    handler: 'db:contracts',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_contract_documents',
        description: 'Return documents from the central archive that are linked to a contract via related_entity_type=contract.',
        parameters: {
          type: 'object',
          properties: {
            contract_id: { type: 'string', description: 'UUID of the contract' },
          },
          required: ['contract_id'],
        },
      },
    },
    instructions: 'Query public.documents WHERE related_entity_type=\'contract\' AND related_entity_id=<contract_id>. Return id, title, file_name, category, created_at. Files themselves live in the private "documents" storage bucket — generate a signed URL only on explicit request.',
  },

  {
    name: 'run_contract_billing',
    description: 'Invoice every active billing-enabled contract whose billing date has arrived. Use when: running the daily contract billing sweep — the Contract Billing automation calls this. Takes no arguments. NOT for: invoicing one contract (generate_contract_invoice); payment reminder emails, which the contract-billing-cron function still sends.',
    category: 'commerce',
    handler: 'rpc:run_contract_billing',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: { name: 'run_contract_billing', parameters: { type: 'object', properties: {} } },
    },
    instructions: 'Sweep RPC, capped at 500 contracts per run. Invoicing only — reminder emails keep running from the edge function because they render HTML templates. Idempotent: generate_contract_invoice rolls billing_next_date forward, so a second run the same day invoices nobody twice. A failing contract is reported in results[] without stopping the sweep.',
  },
];

const CONTRACT_AUTOMATIONS: AutomationSeed[] = [
  {
    name: 'Contract Renewal Alert',
    description: 'Every weekday at 08:00, FlowPilot checks for contracts expiring within 30 days and alerts the admin.',
    trigger_type: 'cron',
    trigger_config: { cron: '0 8 * * 1-5', expression: '0 8 * * 1-5' },
    skill_name: 'contract_renewal_check',
    skill_arguments: { days_ahead: 30 },
  },

  {
    name: 'Contract Billing',
    description: 'Every day at 06:30, invoice active contracts whose billing date has arrived.',
    trigger_type: 'cron',
    trigger_config: { cron: '30 6 * * *', expression: '30 6 * * *' },
    skill_name: 'run_contract_billing',
    skill_arguments: {},
  },
];

export const contractsModule = defineModule<ContractsInput, ContractsOutput>({
  id: 'contracts',
  name: 'Contracts',
  version: '1.0.0',
  processes: ['quote-to-cash', 'hire-to-retire'],
  maturity: 'L3',
  description: 'Contract lifecycle management with renewal tracking and document storage',
  capabilities: ['data:write', 'data:read'],
  tier: 'standard',
  inputSchema: contractsInputSchema,
  outputSchema: contractsOutputSchema,

  skills: ['manage_contract', 'list_contract_templates', 'contract_renewal_check', 'generate_contract_invoice', 'get_contract_content', 'search_contracts', 'send_contract_for_signature', 'list_contract_documents', 'run_contract_billing'],
  data: {
    tables: [
      'contract_signatures',
      'contract_versions',
      'contract_documents',
      'contracts',
      'contract_templates',
      'employment_contracts',
      'employment_contract_templates',
    ],
  },
  skillSeeds: CONTRACT_SKILLS,
  automations: CONTRACT_AUTOMATIONS,

  async publish(input: ContractsInput): Promise<ContractsOutput> {
    const validated = contractsInputSchema.parse(input);

    if (validated.action === 'create') {
      if (!validated.counterparty_name) return { success: false, message: 'counterparty_name is required' };
      const { data, error } = await supabase
        .from('contracts')
        .insert({
          title: validated.title || `Contract — ${validated.counterparty_name}`,
          counterparty_name: validated.counterparty_name!,
          counterparty_email: validated.counterparty_email,
          contract_type: validated.contract_type || 'other',
          status: validated.status || 'draft',
          start_date: validated.start_date, end_date: validated.end_date,
          value_cents: validated.value_cents, notes: validated.notes,
        })
        .select('id')
        .single();
      if (error) { logger.error('[contracts] create failed', error); return { success: false, message: error.message }; }
      return { success: true, contract_id: data.id, message: 'Contract created' };
    }

    if (validated.action === 'list') {
      const { data, error } = await supabase.from('contracts').select('*').order('created_at', { ascending: false }).limit(50);
      if (error) return { success: false, message: error.message };
      return { success: true, message: `Found ${data.length} contracts` };
    }

    return { success: false, message: 'Unsupported action' };
  },
});
