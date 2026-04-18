/**
 * Approvals Module — Generic Approval Engine
 *
 * Reusable approval workflow used by Purchasing, Expenses, Invoicing, Quotes.
 * Rules are matched on (entity_type, amount_cents, currency) → routes to a required role.
 * All decisions are audit-logged in approval_decisions.
 */

import { supabase } from '@/integrations/supabase/client';
import { z } from 'zod';
import { defineModule } from '@/lib/module-def';
import type { SkillSeed } from '@/lib/module-bootstrap';

const approvalsInputSchema = z.object({
  action: z.enum([
    'request',
    'list_pending',
    'list_for_entity',
    'approve',
    'reject',
    'cancel',
    'evaluate_rule',
    'create_rule',
    'list_rules',
  ]),
  // request
  entity_type: z.string().optional(),
  entity_id: z.string().optional(),
  amount_cents: z.number().int().optional(),
  currency: z.string().optional(),
  reason: z.string().optional(),
  context: z.record(z.unknown()).optional(),
  // approve / reject / cancel
  request_id: z.string().uuid().optional(),
  comment: z.string().optional(),
  // create_rule
  name: z.string().optional(),
  description: z.string().optional(),
  amount_threshold_cents: z.number().int().nullable().optional(),
  required_role: z.enum(['admin', 'approver', 'writer', 'customer']).optional(),
  priority: z.number().int().optional(),
});

const approvalsOutputSchema = z.object({
  success: z.boolean(),
  request_id: z.string().optional(),
  rule_id: z.string().optional(),
  required: z.boolean().optional(),
  required_role: z.string().optional(),
  message: z.string().optional(),
  error: z.string().optional(),
});

type ApprovalsInput = z.infer<typeof approvalsInputSchema>;
type ApprovalsOutput = z.infer<typeof approvalsOutputSchema>;

const APPROVAL_SKILLS: SkillSeed[] = [
  {
    name: 'manage_approvals',
    description:
      'Generic approval workflow engine: request approval for an entity, list pending requests, approve/reject/cancel, and evaluate whether an entity needs approval based on amount thresholds. Use when: a purchase order/expense report/invoice/quote crosses an approval threshold, an admin needs to see what is awaiting their decision, FlowPilot wants to know if an action requires human sign-off before proceeding. NOT for: managing the underlying entity itself (use manage_purchase_order, manage_expenses, manage_invoice, manage_quote).',
    category: 'commerce',
    handler: 'db:approvals',
    scope: 'internal',
    requires_approval: false,
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_approvals',
        description: 'Generic approval engine — request, list, approve, reject, cancel, evaluate',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['request', 'list_pending', 'list_for_entity', 'approve', 'reject', 'cancel', 'evaluate_rule', 'create_rule', 'list_rules'],
            },
            entity_type: { type: 'string', description: "e.g. 'expense_report', 'purchase_order', 'invoice', 'quote'" },
            entity_id: { type: 'string' },
            amount_cents: { type: 'number' },
            currency: { type: 'string', description: 'Defaults to SEK' },
            reason: { type: 'string' },
            context: { type: 'object' },
            request_id: { type: 'string' },
            comment: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            amount_threshold_cents: { type: 'number' },
            required_role: { type: 'string', enum: ['admin', 'approver', 'writer'] },
            priority: { type: 'number' },
          },
          required: ['action'],
        },
      },
    },
    instructions:
      'Workflow: 1) Before publishing/sending a high-value entity, call evaluate_rule with entity_type + amount_cents to check if approval is required. 2) If yes, call request to create an approval_request. 3) The required role (admin or approver) reviews and calls approve or reject. 4) Use list_pending to show what needs attention. 5) Cancel can only be called by the original requester. Audit trail is automatic.',
  },
];

export const approvalsModule = defineModule<ApprovalsInput, ApprovalsOutput>({
  id: 'approvals',
  name: 'Approvals',
  version: '1.0.0',
  description:
    'Generic approval engine — define rules (entity type + amount threshold + required role) and route requests for sign-off. Used by Purchasing, Expenses, Invoicing and Quotes.',
  capabilities: ['data:read', 'data:write'],
  inputSchema: approvalsInputSchema,
  outputSchema: approvalsOutputSchema,
  skills: ['manage_approvals'],
  skillSeeds: APPROVAL_SKILLS,

  async publish(input: ApprovalsInput): Promise<ApprovalsOutput> {
    const v = approvalsInputSchema.parse(input);

    if (v.action === 'evaluate_rule') {
      if (!v.entity_type) return { success: false, error: 'entity_type required' };
      const { data, error } = await supabase.rpc('evaluate_approval_required', {
        p_entity_type: v.entity_type,
        p_amount_cents: v.amount_cents ?? null,
        p_currency: v.currency ?? 'SEK',
      });
      if (error) return { success: false, error: error.message };
      const rule = Array.isArray(data) && data.length > 0 ? data[0] : null;
      return {
        success: true,
        required: !!rule,
        rule_id: rule?.rule_id,
        required_role: rule?.required_role,
        message: rule ? `Approval required: ${rule.rule_name}` : 'No approval required',
      };
    }

    if (v.action === 'request') {
      if (!v.entity_type || !v.entity_id) return { success: false, error: 'entity_type + entity_id required' };
      // Auto-evaluate rule
      const { data: ruleData } = await supabase.rpc('evaluate_approval_required', {
        p_entity_type: v.entity_type,
        p_amount_cents: v.amount_cents ?? null,
        p_currency: v.currency ?? 'SEK',
      });
      const rule = Array.isArray(ruleData) && ruleData.length > 0 ? ruleData[0] : null;
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('approval_requests')
        .insert({
          rule_id: rule?.rule_id ?? null,
          entity_type: v.entity_type,
          entity_id: v.entity_id,
          amount_cents: v.amount_cents ?? null,
          currency: v.currency ?? 'SEK',
          reason: v.reason ?? null,
          required_role: rule?.required_role ?? 'admin',
          requested_by: user?.id ?? null,
          context: (v.context as never) ?? {},
        })
        .select('id')
        .single();
      if (error) return { success: false, error: error.message };
      return { success: true, request_id: data.id, message: 'Approval requested' };
    }

    if (v.action === 'list_pending') {
      const { data, error } = await supabase
        .from('approval_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) return { success: false, error: error.message };
      return { success: true, message: `${data.length} pending` };
    }

    if (v.action === 'list_for_entity') {
      if (!v.entity_type || !v.entity_id) return { success: false, error: 'entity_type + entity_id required' };
      const { data, error } = await supabase
        .from('approval_requests')
        .select('*')
        .eq('entity_type', v.entity_type)
        .eq('entity_id', v.entity_id)
        .order('created_at', { ascending: false });
      if (error) return { success: false, error: error.message };
      return { success: true, message: `${data.length} requests` };
    }

    if (v.action === 'approve' || v.action === 'reject') {
      if (!v.request_id) return { success: false, error: 'request_id required' };
      const { data, error } = await supabase.rpc('resolve_approval', {
        p_request_id: v.request_id,
        p_decision: v.action === 'approve' ? 'approve' : 'reject',
        p_comment: v.comment ?? null,
      });
      if (error) return { success: false, error: error.message };
      return { success: true, request_id: (data as { id?: string })?.id, message: `Request ${v.action}d` };
    }

    if (v.action === 'cancel') {
      if (!v.request_id) return { success: false, error: 'request_id required' };
      const { error } = await supabase
        .from('approval_requests')
        .update({ status: 'cancelled' })
        .eq('id', v.request_id)
        .eq('status', 'pending');
      if (error) return { success: false, error: error.message };
      return { success: true, request_id: v.request_id, message: 'Request cancelled' };
    }

    if (v.action === 'create_rule') {
      if (!v.name || !v.entity_type) return { success: false, error: 'name + entity_type required' };
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('approval_rules')
        .insert({
          name: v.name,
          description: v.description ?? null,
          entity_type: v.entity_type,
          amount_threshold_cents: v.amount_threshold_cents ?? null,
          currency: v.currency ?? 'SEK',
          required_role: (v.required_role ?? 'admin') as 'admin' | 'approver' | 'writer' | 'customer',
          priority: v.priority ?? 100,
          created_by: user?.id ?? null,
        })
        .select('id')
        .single();
      if (error) return { success: false, error: error.message };
      return { success: true, rule_id: data.id, message: 'Rule created' };
    }

    if (v.action === 'list_rules') {
      const { data, error } = await supabase
        .from('approval_rules')
        .select('*')
        .order('priority', { ascending: true });
      if (error) return { success: false, error: error.message };
      return { success: true, message: `${data.length} rules` };
    }

    return { success: false, error: `Unknown action: ${v.action}` };
  },
});
