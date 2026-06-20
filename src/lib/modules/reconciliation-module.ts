import { z } from 'zod';
import { defineModule } from '@/lib/module-def';
import { supabase } from '@/integrations/supabase/client';
import type { SkillSeed } from '@/lib/module-bootstrap';

const inputSchema = z.object({
  action: z.enum([
    'sync_stripe',
    'import_file',
    'import_image',
    'auto_match',
    'list_unmatched',
  ]),
  fileName: z.string().optional(),
  content: z.string().optional(),
  contentBase64: z.string().optional(),
  mimeType: z.string().optional(),
  provider: z.enum(['openai', 'gemini']).optional(),
  format: z.enum(['csv', 'camt053', 'mt940', 'ofx', 'sie']).optional(),
  commit: z.boolean().optional(),
  transactions: z.array(z.any()).optional(),
});
const outputSchema = z.object({
  success: z.boolean(),
  result: z.any().optional(),
  error: z.string().optional(),
});
type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

const RECONCILIATION_SKILLS: SkillSeed[] = [
  {
    name: 'sync_stripe_payouts',
    description:
      'Pull recent Stripe payouts and balance transactions into bank_transactions for matching. Use when: admin asks to refresh Stripe activity, daily payout reconciliation, before running auto_match_transactions. NOT for: bank file imports (use import_bank_file) or OCR of statement images (use import_bank_image).',
    category: 'commerce',
    handler: 'edge:reconciliation/sync-stripe',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'sync_stripe_payouts',
        description: 'Sync recent Stripe payouts/balance transactions into bank_transactions.',
        parameters: {
          type: 'object',
          properties: {
            since: { type: 'string', description: 'ISO date — only sync transactions after this date. Defaults to last 30 days.' },
          },
        },
      },
    },
    instructions: 'Idempotent — safe to call repeatedly. Existing rows (matched on Stripe id) are skipped.',
  },
  {
    name: 'import_bank_file',
    description:
      'Import a structured bank statement file (CAMT.053 XML, MT940, OFX, CSV, or SIE 4) into bank_transactions. Auto-detects format and links to the correct bank account via IBAN/BBAN/GL match. Use when: user uploads a file from their bank/accounting system. NOT for: images/PDFs of statements (use import_bank_image), Stripe payouts (use sync_stripe_payouts).',
    category: 'commerce',
    handler: 'edge:reconciliation/import-file',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'import_bank_file',
        description: 'Parse a bank statement file and insert bank_transactions.',
        parameters: {
          type: 'object',
          properties: {
            fileName: { type: 'string' },
            content: { type: 'string', description: 'File contents as text (XML/CSV/SIE).' },
            format: { type: 'string', enum: ['csv', 'camt053', 'mt940', 'ofx', 'sie'], description: 'Optional — auto-detected from filename/content if omitted.' },
          },
          required: ['fileName', 'content'],
        },
      },
    },
    instructions: 'Format auto-detection works in most cases — pass format explicitly only when filename is ambiguous. Account linking priority: IBAN/BBAN match → GL account match (SIE) → default bank_account. Duplicate transactions (same external_id) are skipped.',
  },
  {
    name: 'auto_match_transactions',
    description:
      'Run the auto-matcher across all unmatched bank_transactions, scoring against open invoices, expenses, and orders. Creates reconciliation_match rows for confident hits and leaves ambiguous ones for human review. Use when: after import_bank_file/sync_stripe_payouts, daily reconciliation cron, before showing the unmatched queue. NOT for: booking unmatched rows (use manage_journal_entry instead).',
    category: 'commerce',
    handler: 'edge:reconciliation/auto-match',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'auto_match_transactions',
        description: 'Auto-match unmatched bank_transactions against invoices/expenses/orders.',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'integer', description: 'Max transactions to process this run. Default 200.' },
            min_confidence: { type: 'number', description: '0-1 threshold. Default 0.85. Lower = more matches, more false positives.' },
          },
        },
      },
    },
    instructions: 'Only matches above min_confidence are auto-applied. Lower-confidence candidates are stored as suggestions for the manual review queue. Always idempotent — re-running on the same data does nothing.',
  },
  {
    name: 'import_bank_image',
    description:
      'OCR a bank statement image or PDF (screenshot, scan, exported PDF) and turn it into bank_transactions rows. Use when: user uploads a picture/PDF of a bank account printout instead of a structured CSV/CAMT/SIE file. NOT for: structured files (use import_bank_file), or for booking journal entries (use manage_journal_entry). MANDATORY: default to commit=false (preview) so a human can verify rows before they hit the books; only set commit=true when the caller has already shown the parsed rows to the user and got approval.',
    category: 'commerce',
    handler: 'edge:reconciliation/import-image',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'import_bank_image',
        description:
          'Extract bank transactions from an image/PDF of a bank statement using vision AI. Two modes: PREVIEW (default, commit=false) REQUIRES contentBase64+mimeType — returns parsed transactions. COMMIT (commit=true) REQUIRES fileName+transactions — writes the user-approved rows. Never auto-commit unattended.',
        parameters: {
          type: 'object',
          properties: {
            fileName: { type: 'string', description: 'Required for commit=true.' },
            contentBase64: {
              type: 'string',
              description: 'Base64-encoded image or PDF bytes (no data: prefix). Required for preview (commit=false).',
            },
            mimeType: {
              type: 'string',
              description: 'MIME type, e.g. image/png, image/jpeg, application/pdf. Required for preview (commit=false).',
            },
            provider: { type: 'string', enum: ['openai', 'gemini'], description: 'Vision provider. Default openai.' },
            commit: { type: 'boolean', description: 'false = preview only (default), true = write rows.' },
            transactions: {
              type: 'array',
              description: 'When commit=true, the user-approved transactions to insert.',
              items: {
                type: 'object',
                properties: {
                  transaction_date: { type: 'string' },
                  amount_cents: { type: 'integer' },
                  currency: { type: 'string' },
                  counterparty: { type: 'string' },
                  reference: { type: 'string' },
                  description: { type: 'string' },
                },
                required: ['transaction_date', 'amount_cents'],
              },
            },
          },
          required: [],
          // OpenAI-safe per-mode required fields. Handler enforces at runtime.
          'x-mode-required': {
            'commit:false': ['contentBase64', 'mimeType'],
            'commit:true': ['fileName', 'transactions'],
          },
        },
      },
    },
    instructions:
      'Two-step flow. (1) Preview: send contentBase64+mimeType, commit=false → get parsed transactions back. (2) Show them to the human, let them edit/remove rows, then re-call with commit=true and the approved transactions array. Never auto-commit OCR output unattended — vision models hallucinate amounts.',
  },
  {
    name: 'list_unmatched_transactions',
    description: 'List bank_transactions still in status=unmatched, optionally filtered by bank account or date range. Use when: admin asks "what is left to reconcile?", before invoking auto_match_transactions, building the reconciliation review queue. NOT for: matched/booked transactions (use accounting_reports).',
    category: 'commerce',
    handler: 'db:bank_transactions',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_unmatched_transactions',
        description: 'List unmatched bank transactions.',
        parameters: {
          type: 'object',
          properties: {
            bank_account_id: { type: 'string' },
            from_date: { type: 'string' },
            to_date: { type: 'string' },
            limit: { type: 'integer', description: 'Default 100, max 500.' },
          },
        },
      },
    },
    instructions: 'Returned rows are candidates for manage_journal_entry (book) or human matching. Order by transaction_date DESC by default.',
  },
  {
    name: 'manage_reconciliation_rule',
    description: 'Manage auto-categorisation rules for bank transactions (match counterparty/reference/description → suggested account + category). Use when: setting up recurring-payment rules, automating bank coding. NOT for: running the rules (apply_reconciliation_rules) or matching to invoices (auto_match_transactions).',
    category: 'commerce',
    handler: 'rpc:manage_reconciliation_rule',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_reconciliation_rule',
        description: 'List/create/update/delete reconciliation rules. Each rule matches a field (counterparty|reference|description) by contains|equals|regex and suggests an account_code + category, ordered by priority.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['list', 'create', 'update', 'delete'] },
            p_rule_id: { type: 'string', format: 'uuid' },
            p_name: { type: 'string' },
            p_match_field: { type: 'string', enum: ['counterparty', 'reference', 'description'] },
            p_match_type: { type: 'string', enum: ['contains', 'equals', 'regex'] },
            p_pattern: { type: 'string' },
            p_suggested_account_code: { type: 'string' },
            p_suggested_category: { type: 'string' },
            p_priority: { type: 'number' },
          },
        },
      },
    },
    instructions: 'Lower priority wins first. After editing rules, run apply_reconciliation_rules to tag unmatched transactions.',
  },
  {
    name: 'apply_reconciliation_rules',
    description: 'Tag unmatched bank transactions with a suggested account/category from the highest-priority matching reconciliation rule. Use when: after importing a bank file, before manual review. NOT for: invoice/payment matching (auto_match_transactions).',
    category: 'commerce',
    handler: 'rpc:apply_reconciliation_rules',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'apply_reconciliation_rules',
        description: 'Runs active reconciliation rules over unmatched, un-tagged transactions; sets suggested_account_code + matched_rule_id. Returns how many were tagged.',
        parameters: { type: 'object', properties: {} },
      },
    },
    instructions: 'Idempotent per transaction (skips already-tagged). First matching rule by priority wins.',
  },
  {
    name: 'reconciliation_report',
    description: 'Bank reconciliation summary for a period: matched vs unmatched counts and amounts, plus rule-suggested count. Use when: month-end reconciliation review, reporting bank-feed health.',
    category: 'commerce',
    handler: 'rpc:reconciliation_report',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'reconciliation_report',
        description: 'Totals over bank_transactions in [p_from, p_to]: matched/unmatched count + cents, rule_suggested_count.',
        parameters: {
          type: 'object',
          properties: {
            p_from: { type: 'string', description: 'YYYY-MM-DD (optional)' },
            p_to: { type: 'string', description: 'YYYY-MM-DD (optional)' },
          },
        },
      },
    },
    instructions: 'Omit dates for an all-time summary. unmatched + rule_suggested helps prioritise review.',
  },
];

/**
 * Reconciliation — bank-to-books matching.
 *
 * Imports Stripe payouts and bank statement files (formats per active locale
 * pack — e.g. CAMT.053/MT940/OFX/CSV everywhere, SIE for Sweden), then matches
 * transactions against invoices, expenses and orders. Manual review for
 * partial / ambiguous matches via /admin/reconciliation.
 *
 * Also supports OCR-based import: upload a picture/PDF of a bank statement and
 * a vision model (OpenAI GPT-5 or Gemini 2.5 Pro) extracts the transactions.
 *
 * Live bank connectivity (GoCardless/Tink/Plaid) is planned for v0.5.
 */
export const reconciliationModule = defineModule<Input, Output>({
  id: 'reconciliation' as any,
  name: 'Reconciliation',
  version: '1.1.0',
  processes: ['record-to-report', 'procure-to-pay'],
  maturity: 'L3',
  description:
    'Bank reconciliation: Stripe payout sync + bank file import (CAMT.053/MT940/OFX/CSV/SIE) + OCR import of statement images/PDFs. Auto-matches against invoices/expenses/orders.',
  requires: ['accounting'],
  capabilities: ['data:read', 'data:write'],
  tier: 'standard',
  inputSchema,
  outputSchema,

  // All listed skills are seeded elsewhere (sync_stripe_payouts, import_bank_file,
  // auto_match_transactions seeded via legacy bootstrap; import_bank_image via skillSeeds).
  // list_unmatched is exposed only as a publish() action, not as a standalone skill.
  skills: [
    'sync_stripe_payouts',
    'import_bank_file',
    'import_bank_image',
    'auto_match_transactions',
    'list_unmatched_transactions',
    'manage_reconciliation_rule',
    'apply_reconciliation_rules',
    'reconciliation_report',
  ],

  data: {
    tables: [
      'reconciliation_matches',
      'payment_reconciliations',
      'bank_transactions',
      'bank_import_batches',
      'bank_accounts',
    ],
  },
  skillSeeds: RECONCILIATION_SKILLS,

  async publish(input: Input): Promise<Output> {
    try {
      const v = inputSchema.parse(input);
      if (v.action === 'list_unmatched') {
        const { data, error } = await supabase
          .from('bank_transactions')
          .select('id, transaction_date, amount_cents, currency, counterparty, reference, status')
          .eq('status', 'unmatched')
          .order('transaction_date', { ascending: false })
          .limit(100);
        if (error) throw error;
        return { success: true, result: data };
      }
      const fnMap: Record<string, string> = {
        sync_stripe: 'reconciliation/sync-stripe',
        import_file: 'reconciliation/import-file',
        import_image: 'reconciliation/import-image',
        auto_match: 'reconciliation/auto-match',
      };
      const body =
        v.action === 'import_file'
          ? { fileName: v.fileName, content: v.content, format: v.format }
          : v.action === 'import_image'
          ? {
              fileName: v.fileName,
              contentBase64: v.contentBase64,
              mimeType: v.mimeType,
              provider: v.provider,
              commit: v.commit ?? false,
              transactions: v.transactions,
            }
          : {};
      const { data, error } = await supabase.functions.invoke(fnMap[v.action], { body });
      if (error) throw error;
      return { success: true, result: data };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Unknown' };
    }
  },
});
