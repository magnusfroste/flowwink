/**
 * Audit trail for autonomous agent actions on accounting/ERP tables.
 * Writes immutable rows to `agent_audit_trail` with a 7-year default
 * retention (Swedish bookkeeping act / BAS 2024 alignment).
 *
 * Used by agent-execute generic CRUD when the target table is in
 * ACCOUNTING_AUDIT_TABLES. Designed to be reusable from any future
 * surface that mutates accounting data on the agent's behalf.
 */

export interface AuditContext {
  agent_type?: string;
  caller_user_id?: string;
  caller_api_key_id?: string;
  conversation_id?: string;
  trace_id?: string;
  skill_id?: string;
  skill_name?: string;
}

/** Tables whose every CRUD write is recorded in agent_audit_trail (7-year retention). */
export const ACCOUNTING_AUDIT_TABLES = new Set([
  'chart_of_accounts', 'journal_entries', 'journal_entry_lines',
  'accounting_templates', 'opening_balances',
  'accounting_periods', 'analytic_accounts', 'analytic_lines',
  'invoices', 'invoice_lines',
  'vendors', 'purchase_orders', 'purchase_order_lines',
  'goods_receipts', 'goods_receipt_lines', 'vendor_invoices', 'vendor_products',
  'rfqs', 'rfq_lines', 'rfq_bids',
  'expenses',
  'accounting_corrections',
]);

export async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function diffSnapshots(before: any, after: any): Record<string, { before: unknown; after: unknown }> {
  const out: Record<string, { before: unknown; after: unknown }> = {};
  if (!before && after) {
    for (const k of Object.keys(after)) out[k] = { before: null, after: after[k] };
    return out;
  }
  if (before && !after) {
    for (const k of Object.keys(before)) out[k] = { before: before[k], after: null };
    return out;
  }
  if (!before || !after) return out;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    const a = before[k], b = after[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = { before: a, after: b };
  }
  return out;
}

export async function writeAuditTrail(
  supabase: any,
  params: {
    ctx: AuditContext;
    table: string;
    crud_action: string;
    entity_id?: string | null;
    request_payload: Record<string, unknown>;
    before?: any;
    after?: any;
    success: boolean;
    error_message?: string;
  },
) {
  try {
    const payloadJson = JSON.stringify(params.request_payload ?? {});
    const hash = await sha256Hex(payloadJson);
    // Default 7-year retention for accounting per Swedish bookkeeping act
    const retentionDate = new Date();
    retentionDate.setFullYear(retentionDate.getFullYear() + 7);
    const diff = (params.crud_action === 'update' || params.crud_action === 'create' || params.crud_action === 'delete')
      ? diffSnapshots(params.before, params.after)
      : null;
    await supabase.from('agent_audit_trail').insert({
      agent_type: params.ctx.agent_type,
      caller_user_id: params.ctx.caller_user_id,
      caller_api_key_id: params.ctx.caller_api_key_id,
      conversation_id: params.ctx.conversation_id,
      trace_id: params.ctx.trace_id,
      skill_id: params.ctx.skill_id,
      skill_name: params.ctx.skill_name,
      table_name: params.table,
      crud_action: params.crud_action,
      entity_id: params.entity_id ?? null,
      request_payload: params.request_payload ?? {},
      request_payload_sha256: hash,
      before_snapshot: params.before ?? null,
      after_snapshot: params.after ?? null,
      diff,
      success: params.success,
      error_message: params.error_message?.slice(0, 1000) ?? null,
      retention_until: retentionDate.toISOString().slice(0, 10),
    });
  } catch (err) {
    console.error('[audit-trail] failed to write:', (err as Error).message);
  }
}
