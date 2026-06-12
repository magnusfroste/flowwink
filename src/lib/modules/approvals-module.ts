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
import type { SkillSeed, AutomationSeed } from '@/lib/module-bootstrap';

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
    name: 'reject_pending_operation',
    description: 'Reject a staged operation with a reason. Use when: preview from a staged skill call is wrong or unsafe. NOT for: approving it (approve_pending_operation) or listing the queue (list_pending_operations).',
    category: 'system',
    handler: 'rpc:reject_pending_operation',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {"type":"function","function":{"name":"reject_pending_operation","parameters":{"type":"object","required":["p_id"],"properties":{"p_id":{"type":"string","format":"uuid"},"p_reason":{"type":"string"}}},"description":"Reject a staged operation with a reason."}} as SkillSeed['tool_definition'],
  },
  {
    name: 'approve_pending_operation',
    description: 'Approve a staged operation so it can be executed. Use when: a previous skill call returned staged=true and the preview is acceptable. NOT for: rejecting it (reject_pending_operation) or listing the queue (list_pending_operations).',
    category: 'system',
    handler: 'rpc:approve_pending_operation',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {"type":"function","function":{"name":"approve_pending_operation","parameters":{"type":"object","required":["p_id"],"properties":{"p_id":{"type":"string","format":"uuid"}}},"description":"Approve a staged operation so it can be executed."}} as SkillSeed['tool_definition'],
  },
  {
    name: 'list_pending_operations',
    description: 'List pending staged operations awaiting approval/rejection. Use when: agent or admin needs to see the queue. NOT for: approving (approve_pending_operation) or rejecting (reject_pending_operation) an operation.',
    category: 'system',
    handler: 'db:pending_operations',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {"type":"function","function":{"name":"list_pending_operations","parameters":{"type":"object","properties":{"limit":{"type":"integer","default":50},"action":{"enum":["list"],"type":"string","default":"list"},"status":{"type":"string"}}},"description":"List pending staged operations awaiting approval/rejection."}} as SkillSeed['tool_definition'],
  },
  {
    name: 'manage_approvals',
    description:
      'Generic approval workflow engine: request approval for an entity, list pending requests, approve/reject/cancel, and evaluate whether an entity needs approval based on amount thresholds. Use when: a purchase order/expense report/invoice/quote crosses an approval threshold, an admin needs to see what is awaiting their decision, FlowPilot wants to know if an action requires human sign-off before proceeding. NOT for: managing the underlying entity itself (use manage_purchase_order, manage_expenses, manage_invoice, manage_quote).',
    category: 'commerce',
    handler: 'module:approvals',
    scope: 'internal',
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
  {
    name: 'manage_approval_chain',
    description: 'Configure multi-step approval chains and approver groups (e.g. manager → CFO, or any-2-of-finance). Use when: setting up sequential sign-off for an entity type, defining approver groups. NOT for: acting on a request (use advance_approval_step) or single-role rules (manage_approvals evaluate_rule).',
    category: 'system',
    handler: 'rpc:manage_approval_chain',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_approval_chain',
        description: 'List/create/delete approval chains (ordered steps, each a role or a group with min_approvals) and create/populate approver groups.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['list', 'create_chain', 'delete_chain', 'create_group', 'set_group_members'] },
            p_chain_id: { type: 'string', format: 'uuid' },
            p_name: { type: 'string' },
            p_entity_type: { type: 'string', description: 'e.g. purchase_order, expense_report' },
            p_steps: { type: 'array', description: '[{sort_order, required_role|group_id, min_approvals}] in order', items: { type: 'object' } },
            p_group_id: { type: 'string', format: 'uuid' },
            p_user_ids: { type: 'array', items: { type: 'string', format: 'uuid' }, description: 'Group members' },
          },
        },
      },
    },
    instructions: 'Build sequential approval chains. A step is EITHER a required_role OR a group_id with min_approvals (any-N-of-group). create_chain accepts inline p_steps. create_group / set_group_members manage approver groups. Admin/service-role only.',
  },
  {
    name: 'advance_approval_step',
    description: 'Record an approve/reject decision on a chain-based approval request. Use when: an approver signs off on the current step of a multi-step chain. The request is approved only when the final step clears; any rejection stops the chain. NOT for: single-role requests (use manage_approvals approve/reject).',
    category: 'system',
    handler: 'rpc:advance_approval_step',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'advance_approval_step',
        description: 'Approve or reject the current step of a chain-based approval_request. Advances when the step reaches its min_approvals distinct approvers.',
        parameters: {
          type: 'object',
          required: ['p_request_id', 'p_decision'],
          properties: {
            p_request_id: { type: 'string', format: 'uuid' },
            p_decision: { type: 'string', enum: ['approve', 'reject'] },
            p_decided_by: { type: 'string', format: 'uuid', description: 'Approver user id (defaults to caller)' },
            p_decided_role: { type: 'string', description: 'Role the decision is made under' },
            p_comment: { type: 'string' },
          },
        },
      },
    },
    instructions: 'Acts on approval_requests that have a chain_id. The actor must hold the step\'s required_role or be a member of the step\'s group — or hold an active delegation from someone who is (manage_approval_delegation). Service-role bypasses. Duplicate approvals from the same user on a step count once. Returns the new status (pending/approved/rejected) and which step.',
  },
  {
    name: 'request_entity_approval',
    description: 'Start the chain approval for a business entity (purchase order, expense report). Use when: sending a PO or approving an expense fails with "requires chain approval"; proactively before sending high-value POs. NOT for: deciding on a request (advance_approval_step) or configuring chains (manage_approval_chain).',
    category: 'system',
    handler: 'rpc:request_entity_approval',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'request_entity_approval',
        description: 'Create (or return the existing) chain-based approval request for an entity. Returns chain_required=false when no active chain covers the entity_type.',
        parameters: {
          type: 'object',
          required: ['p_entity_type', 'p_entity_id'],
          properties: {
            p_entity_type: { type: 'string', description: 'e.g. purchase_order, expense_report' },
            p_entity_id: { type: 'string', description: 'The entity UUID as text' },
            p_amount_cents: { type: 'number' },
            p_reason: { type: 'string' },
          },
        },
      },
    },
    instructions: 'DB gates block PO draft→sent and expense submitted→approved while an active chain lacks an approved request. Call this first, get the request approved via advance_approval_step, then retry the original action. Idempotent: returns the existing pending/approved request if one exists.',
  },
  {
    name: 'manage_approval_delegation',
    description: 'Delegate approval authority while someone is away: list, create, or revoke delegations. The delegate may act on any step the delegator is authorized for. Use when: an approver is on vacation; covering for a colleague. NOT for: chain/step config (manage_approval_chain).',
    category: 'system',
    handler: 'rpc:manage_approval_delegation',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_approval_delegation',
        description: 'List active delegations, create one (from_user → to_user, optional end time), or revoke by id.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['list', 'create', 'revoke'] },
            p_from_user: { type: 'string', format: 'uuid', description: 'Delegating user (create)' },
            p_to_user: { type: 'string', format: 'uuid', description: 'Delegate (create)' },
            p_ends_at: { type: 'string', description: 'ISO timestamp when the delegation expires (optional)' },
            p_delegation_id: { type: 'string', format: 'uuid', description: 'Delegation to revoke' },
          },
        },
      },
    },
    instructions: 'Users may create delegations from themselves; admins/service-role may manage any. Revoke sets ends_at=now(). advance_approval_step automatically honors active delegations for both role-steps and group-steps.',
  },
  {
    name: 'check_approval_escalations',
    description: 'Sweep pending chain approvals whose current step exceeded its escalate_after_hours and advance them to the next step (final-step breaches are logged, never auto-approved). Use when: heartbeat/cron hygiene run; an approval seems stuck. NOT for: deciding requests (advance_approval_step).',
    category: 'system',
    handler: 'rpc:check_approval_escalations',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'check_approval_escalations',
        description: 'Escalate overdue approval steps to the next step. Returns counts. Idempotent and cheap — safe to run frequently.',
        parameters: { type: 'object', properties: {} },
      },
    },
    instructions: 'Only steps with escalate_after_hours set are considered, measured from step_entered_at. Escalation moves current_step forward and records audit_logs (approval_escalated / approval_escalation_overdue) plus context.escalated_from_step on the request.',
  },
  {
    name: 'bulk_advance_approvals',
    description: 'Approve or reject MANY chain approval requests in one call. Use when: clearing an approval backlog, batch sign-off after review. NOT for: a single request (advance_approval_step) or staged operations (approve_pending_operation).',
    category: 'system',
    handler: 'rpc:bulk_advance_approvals',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'bulk_advance_approvals',
        description: 'Apply one decision to a list of chain approval requests; per-request failures are reported, not fatal.',
        parameters: {
          type: 'object',
          required: ['p_request_ids', 'p_decision'],
          properties: {
            p_request_ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
            p_decision: { type: 'string', enum: ['approve', 'reject'] },
            p_comment: { type: 'string' },
          },
        },
      },
    },
    instructions: 'Loops advance_approval_step per id under the caller authorization rules (delegations honored). Returns processed/failed counts plus per-failure errors so partial batches are transparent.',
  },
];

const APPROVAL_AUTOMATIONS: AutomationSeed[] = [
  {
    name: 'Notify approvers in cowork chat',
    description: 'When a chain approval is created or advances to a new step, post a notice in Cowork Chat (approval.assigned event).',
    trigger_type: 'event',
    trigger_config: { event: 'approval.assigned' },
    skill_name: 'post_to_cowork_chat',
    skill_arguments: {
      p_content: '🔔 Attest väntar: {{event.payload.entity_type}} {{event.payload.entity_id}} — steg {{event.payload.step}}. Godkänn via advance_approval_step eller Approval Inbox.',
      p_author_name: 'Approvals',
      p_metadata: { source: 'approvals', request_id: '{{event.payload.request_id}}' },
    },
  },
];

export const approvalsModule = defineModule<ApprovalsInput, ApprovalsOutput>({
  id: 'approvals',
  name: 'Approvals',
  version: '1.0.0',
  processes: ['procure-to-pay'],
  maturity: 'L3',
  description:
    'Generic approval engine — define rules (entity type + amount threshold + required role) and route requests for sign-off. Used by Purchasing, Expenses, Invoicing and Quotes.',
  capabilities: ['data:read', 'data:write'],
  tier: 'standard',
  inputSchema: approvalsInputSchema,
  outputSchema: approvalsOutputSchema,
  skills: ['manage_approvals', 'approve_pending_operation', 'list_pending_operations', 'reject_pending_operation', 'manage_approval_chain', 'advance_approval_step', 'request_entity_approval', 'manage_approval_delegation', 'check_approval_escalations', 'bulk_advance_approvals'],
  skillSeeds: APPROVAL_SKILLS,
  automations: APPROVAL_AUTOMATIONS,

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
