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
    name: 'import_bank_image',
    description:
      'OCR a bank statement image or PDF (screenshot, scan, exported PDF) and turn it into bank_transactions rows. Use when: user uploads a picture/PDF of a bank account printout instead of a structured CSV/CAMT/SIE file. NOT for: structured files (use import_bank_file), or for booking journal entries (use manage_journal_entry). MANDATORY: default to commit=false (preview) so a human can verify rows before they hit the books; only set commit=true when the caller has already shown the parsed rows to the user and got approval.',
    category: 'commerce',
    handler: 'edge:reconciliation-import-image',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'import_bank_image',
        description:
          'Extract bank transactions from an image/PDF of a bank statement using vision AI. Returns a preview list by default; pass commit=true with the approved transactions to write them.',
        parameters: {
          type: 'object',
          properties: {
            fileName: { type: 'string' },
            contentBase64: {
              type: 'string',
              description: 'Base64-encoded image or PDF bytes (no data: prefix). Required for preview mode.',
            },
            mimeType: {
              type: 'string',
              description: 'MIME type of the upload, e.g. image/png, image/jpeg, application/pdf.',
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
          allOf: [
            {
              if: { properties: { commit: { const: true } } },
              then: { required: ['fileName', 'transactions'] },
              else: { required: ['contentBase64', 'mimeType'] },
            },
          ],
        },
      },
    },
    instructions:
      'Two-step flow. (1) Preview: send contentBase64+mimeType, commit=false → get parsed transactions back. (2) Show them to the human, let them edit/remove rows, then re-call with commit=true and the approved transactions array. Never auto-commit OCR output unattended — vision models hallucinate amounts.',
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
  description:
    'Bank reconciliation: Stripe payout sync + bank file import (CAMT.053/MT940/OFX/CSV/SIE) + OCR import of statement images/PDFs. Auto-matches against invoices/expenses/orders.',
  capabilities: ['data:read', 'data:write'],
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
  ],

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
        sync_stripe: 'reconciliation-sync-stripe',
        import_file: 'reconciliation-import-file',
        import_image: 'reconciliation-import-image',
        auto_match: 'reconciliation-auto-match',
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
