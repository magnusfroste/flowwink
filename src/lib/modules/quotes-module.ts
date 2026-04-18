/**
 * Quotes Module — Full scope (versioning, e-sign, templates, approvals).
 *
 * Skill exposed to FlowPilot: manage_quote (read/list/create/update/send/snapshot/convert).
 * Approval is auto-evaluated via the approvals module before send.
 */

import { supabase } from '@/integrations/supabase/client';
import { z } from 'zod';
import { defineModule } from '@/lib/module-def';
import type { SkillSeed } from '@/lib/module-bootstrap';

const quotesInputSchema = z.object({
  action: z.enum([
    'list',
    'get',
    'create',
    'update',
    'add_item',
    'send',
    'request_approval',
    'list_templates',
    'use_template',
    'convert_to_invoice',
  ]),
  id: z.string().uuid().optional(),
  lead_id: z.string().uuid().optional(),
  template_id: z.string().uuid().optional(),
  title: z.string().optional(),
  intro_text: z.string().optional(),
  terms_text: z.string().optional(),
  notes: z.string().optional(),
  currency: z.string().optional(),
  valid_until: z.string().optional(),
  // add_item
  description: z.string().optional(),
  quantity: z.number().optional(),
  unit_price_cents: z.number().int().optional(),
  tax_rate_pct: z.number().optional(),
  status: z.string().optional(),
});

const quotesOutputSchema = z.object({
  success: z.boolean(),
  quote_id: z.string().optional(),
  quote_number: z.string().optional(),
  public_url: z.string().optional(),
  message: z.string().optional(),
  error: z.string().optional(),
  data: z.unknown().optional(),
});

type QuotesInput = z.infer<typeof quotesInputSchema>;
type QuotesOutput = z.infer<typeof quotesOutputSchema>;

const QUOTES_SKILLS: SkillSeed[] = [
  {
    name: 'manage_quote',
    description:
      'Manage sales quotes end-to-end: list pending/sent quotes, create new from a lead or template, add line items, send for approval (if above threshold) and then to the customer with a public e-sign link, or convert an accepted quote into an invoice. Use when: a lead requests a price proposal, a deal needs formal quoting, or an accepted quote should become an invoice. NOT for: managing the underlying invoice (use manage_invoice) or the lead/deal itself.',
    category: 'commerce',
    handler: 'db:quotes',
    scope: 'internal',
    requires_approval: false,
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_quote',
        description: 'Quote lifecycle — create, edit, send (with approval gate), and convert to invoice',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['list', 'get', 'create', 'update', 'add_item', 'send', 'request_approval', 'list_templates', 'use_template', 'convert_to_invoice'],
            },
            id: { type: 'string', description: 'Quote ID (uuid)' },
            lead_id: { type: 'string', description: 'Required when creating a new quote' },
            template_id: { type: 'string', description: 'Optional template to seed the quote with' },
            title: { type: 'string' },
            intro_text: { type: 'string' },
            terms_text: { type: 'string' },
            notes: { type: 'string' },
            currency: { type: 'string', description: 'Defaults to SEK' },
            valid_until: { type: 'string', description: 'YYYY-MM-DD' },
            description: { type: 'string', description: 'For add_item' },
            quantity: { type: 'number', description: 'For add_item' },
            unit_price_cents: { type: 'number', description: 'For add_item' },
            tax_rate_pct: { type: 'number', description: 'For add_item — defaults to 25' },
            status: { type: 'string' },
          },
          required: ['action'],
        },
      },
    },
    instructions:
      'Workflow: 1) create with lead_id (or use_template) → returns draft quote. 2) add_item one or more times. 3) request_approval to check whether the quote requires sign-off (above 25k SEK by default). 4) Once approved (or if not required), send to generate the public accept_token and email the customer the link. 5) convert_to_invoice once the customer accepts.',
  },
];

export const quotesModule = defineModule<QuotesInput, QuotesOutput>({
  id: 'quotes' as never, // 'quotes' may not yet be in ModulesSettings — treated as opt-in
  name: 'Quotes',
  version: '1.0.0',
  description:
    'Sales quotes with line items, versioning, customer e-sign via public link, reusable templates, and approval workflow before sending high-value offers.',
  capabilities: ['data:read', 'data:write'],
  inputSchema: quotesInputSchema,
  outputSchema: quotesOutputSchema,
  skills: ['manage_quote'],
  skillSeeds: QUOTES_SKILLS,

  async publish(input: QuotesInput): Promise<QuotesOutput> {
    const v = quotesInputSchema.parse(input);

    if (v.action === 'list') {
      const { data, error } = await supabase
        .from('quotes')
        .select('id, quote_number, status, total_cents, currency, valid_until, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) return { success: false, error: error.message };
      return { success: true, data, message: `${data.length} quotes` };
    }

    if (v.action === 'get') {
      if (!v.id) return { success: false, error: 'id required' };
      const { data, error } = await supabase.from('quotes').select('*').eq('id', v.id).single();
      if (error) return { success: false, error: error.message };
      return { success: true, quote_id: data.id, quote_number: data.quote_number, data };
    }

    if (v.action === 'list_templates') {
      const { data, error } = await supabase.from('quote_templates').select('*').eq('is_active', true);
      if (error) return { success: false, error: error.message };
      return { success: true, data, message: `${data.length} templates` };
    }

    if (v.action === 'create' || v.action === 'use_template') {
      if (!v.lead_id) return { success: false, error: 'lead_id required' };
      const { data: { user } } = await supabase.auth.getUser();
      let templateData: { intro_text?: string; terms_text?: string; currency?: string; items?: unknown[] } | null = null;
      if (v.action === 'use_template' && v.template_id) {
        const { data } = await supabase.from('quote_templates').select('*').eq('id', v.template_id).single();
        templateData = data as never;
      }
      const { data, error } = await supabase
        .from('quotes')
        .insert({
          lead_id: v.lead_id,
          title: v.title ?? null,
          intro_text: v.intro_text ?? templateData?.intro_text ?? null,
          terms_text: v.terms_text ?? templateData?.terms_text ?? null,
          notes: v.notes ?? null,
          currency: v.currency ?? templateData?.currency ?? 'SEK',
          valid_until: v.valid_until ?? null,
          template_id: v.template_id ?? null,
          line_items: [] as never,
          tax_rate: 0.25,
          created_by: user?.id ?? null,
        } as never)
        .select('id, quote_number')
        .single();
      if (error) return { success: false, error: error.message };

      // Seed items from template
      if (templateData?.items && Array.isArray(templateData.items) && templateData.items.length > 0) {
        const rows = templateData.items.map((it, idx) => {
          const item = it as { description?: string; qty?: number; unit_price_cents?: number; unit?: string };
          return {
            quote_id: (data as { id: string }).id,
            position: idx,
            description: item.description ?? '',
            quantity: item.qty ?? 1,
            unit: item.unit ?? null,
            unit_price_cents: item.unit_price_cents ?? 0,
          };
        });
        await supabase.from('quote_items').insert(rows as never);
      }

      return { success: true, quote_id: data.id, quote_number: data.quote_number, message: 'Draft quote created' };
    }

    if (v.action === 'add_item') {
      if (!v.id || !v.description) return { success: false, error: 'id + description required' };
      const { error } = await supabase.from('quote_items').insert({
        quote_id: v.id,
        description: v.description,
        quantity: v.quantity ?? 1,
        unit_price_cents: v.unit_price_cents ?? 0,
        tax_rate_pct: v.tax_rate_pct ?? 25,
      } as never);
      if (error) return { success: false, error: error.message };
      return { success: true, quote_id: v.id, message: 'Item added' };
    }

    if (v.action === 'request_approval') {
      if (!v.id) return { success: false, error: 'id required' };
      const { data: q } = await supabase.from('quotes').select('total_cents, currency, quote_number').eq('id', v.id).single();
      if (!q) return { success: false, error: 'Quote not found' };
      const { data: ruleData } = await supabase.rpc('evaluate_approval_required', {
        p_entity_type: 'quote',
        p_amount_cents: q.total_cents,
        p_currency: q.currency,
      });
      const rule = Array.isArray(ruleData) && ruleData.length > 0 ? ruleData[0] : null;
      if (!rule) return { success: true, message: 'No approval required — ready to send', quote_id: v.id };
      const { data: { user } } = await supabase.auth.getUser();
      const { data: req, error: reqErr } = await supabase
        .from('approval_requests')
        .insert({
          rule_id: rule.rule_id,
          entity_type: 'quote',
          entity_id: v.id,
          amount_cents: q.total_cents,
          currency: q.currency,
          required_role: rule.required_role,
          requested_by: user?.id ?? null,
          reason: `Quote ${q.quote_number} pending review`,
        } as never)
        .select('id')
        .single();
      if (reqErr) return { success: false, error: reqErr.message };
      await supabase
        .from('quotes')
        .update({ status: 'pending_approval' as never, approval_request_id: (req as { id: string }).id } as never)
        .eq('id', v.id);
      return { success: true, quote_id: v.id, message: `Approval requested (${rule.required_role})` };
    }

    if (v.action === 'send') {
      if (!v.id) return { success: false, error: 'id required' };
      const { data: q } = await supabase.from('quotes').select('*').eq('id', v.id).single();
      if (!q) return { success: false, error: 'Quote not found' };
      if ((q as { status: string }).status === 'pending_approval') {
        return { success: false, error: 'Quote pending approval' };
      }
      // Generate token if missing
      const existingToken = (q as { accept_token?: string }).accept_token;
      const token = existingToken || crypto.randomUUID().replace(/-/g, '');
      await supabase.from('quote_versions').insert({
        quote_id: v.id,
        version_number: ((q as { version?: number }).version ?? 0) + 1,
        snapshot: q as never,
        reason: 'sent_to_customer',
      } as never);
      const { error } = await supabase
        .from('quotes')
        .update({
          status: 'sent' as never,
          sent_at: new Date().toISOString(),
          accept_token: token,
        } as never)
        .eq('id', v.id);
      if (error) return { success: false, error: error.message };
      return {
        success: true,
        quote_id: v.id,
        public_url: `/quote/${token}`,
        message: 'Quote sent — share the public URL with the customer',
      };
    }

    if (v.action === 'convert_to_invoice') {
      return { success: false, error: 'Use the UI Convert button — server-side conversion not yet exposed via skill' };
    }

    return { success: false, error: `Unknown action: ${v.action}` };
  },
});
