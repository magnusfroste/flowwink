// manage_service_order — internal skill handler.
//
// CRUD + lifecycle for field-service orders over three tables:
//   service_orders (header) · service_order_lines (labor/material) · service_visits (dispatch)
//
// Lifecycle: draft → scheduled → in_progress → completed → invoiced/cancelled.
//
// Moved from the standalone `field-service-skill` edge function (edge-surface
// refactor B1a, wave 0). The function's own door guard (requireServiceOrRole)
// is intentionally dropped: agent-execute has already authenticated the caller
// before dispatching an internal: handler, and the skill is scope:'internal' —
// the skill layer's trust check replaces the function-level gate. Response
// objects are unchanged: agent-execute's edge: dispatch parsed the JSON body
// regardless of HTTP status, so callers see identical shapes.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ORDER_FIELDS = [
  'title', 'description', 'customer_name', 'customer_email', 'customer_phone',
  'service_address', 'priority', 'status', 'scheduled_start', 'scheduled_end',
  'assigned_to', 'notes',
] as const;

export async function executeManageServiceOrder(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const body = args as Record<string, any>;
  const action = String(body.action || '').trim();

  try {
    switch (action) {
      case 'create': {
        if (!body.title || !body.customer_name) throw new Error('title and customer_name are required');
        const row: Record<string, unknown> = {};
        for (const f of ORDER_FIELDS) if (body[f] !== undefined) row[f] = body[f];
        const { data, error } = await supabase.from('service_orders').insert(row).select('*').single();
        if (error) throw new Error(`create failed: ${error.message}`);
        return { status: 'success', service_order: data };
      }

      case 'update': {
        if (!body.id) throw new Error('id is required');
        const patch: Record<string, unknown> = {};
        for (const f of ORDER_FIELDS) if (body[f] !== undefined) patch[f] = body[f];
        if (Object.keys(patch).length === 0) throw new Error('nothing to update');
        const { data, error } = await supabase.from('service_orders').update(patch).eq('id', body.id).select('*').single();
        if (error) throw new Error(`update failed: ${error.message}`);
        return { status: 'success', service_order: data };
      }

      case 'list': {
        let q = supabase.from('service_orders')
          .select('id, order_number, title, customer_name, status, priority, scheduled_start, total_amount, currency, created_at')
          .order('created_at', { ascending: false })
          .limit(Math.min(Number(body.limit) || 50, 200));
        if (body.status) q = q.eq('status', body.status);
        const { data, error } = await q;
        if (error) throw new Error(`list failed: ${error.message}`);
        return { status: 'success', service_orders: data || [] };
      }

      case 'get': {
        if (!body.id) throw new Error('id is required');
        const { data: order, error } = await supabase.from('service_orders').select('*').eq('id', body.id).maybeSingle();
        if (error) throw new Error(`get failed: ${error.message}`);
        if (!order) return { status: 'success', found: false, id: body.id };
        const { data: lines } = await supabase.from('service_order_lines').select('*').eq('service_order_id', body.id).order('position');
        const { data: visits } = await supabase.from('service_visits').select('*').eq('service_order_id', body.id).order('scheduled_start');
        return { status: 'success', found: true, service_order: order, lines: lines || [], visits: visits || [] };
      }

      case 'schedule': {
        if (!body.id || !body.scheduled_start || !body.scheduled_end) throw new Error('id, scheduled_start and scheduled_end are required');
        const { data: order, error: uErr } = await supabase.from('service_orders')
          .update({ scheduled_start: body.scheduled_start, scheduled_end: body.scheduled_end, status: 'scheduled' })
          .eq('id', body.id).select('*').single();
        if (uErr) throw new Error(`schedule failed: ${uErr.message}`);
        const { data: visit, error: vErr } = await supabase.from('service_visits').insert({
          service_order_id: body.id,
          technician_id: body.technician_id ?? body.assigned_to ?? null,
          scheduled_start: body.scheduled_start,
          scheduled_end: body.scheduled_end,
          status: 'scheduled',
        }).select('*').single();
        if (vErr) throw new Error(`visit creation failed: ${vErr.message}`);
        return { status: 'success', service_order: order, visit };
      }

      case 'complete': {
        if (!body.id) throw new Error('id is required');
        const { data, error } = await supabase.from('service_orders')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', body.id).select('*').single();
        if (error) throw new Error(`complete failed: ${error.message}`);
        await supabase.rpc('emit_platform_event', {
          _event_name: 'service_order.completed',
          _payload: { service_order_id: body.id, total_amount: data?.total_amount ?? 0, currency: data?.currency ?? 'SEK' },
          _source: 'manage_service_order',
        }).then(() => {}, () => {}); // best-effort — invoicing automation listens for this
        return { status: 'success', service_order: data };
      }

      case 'cancel': {
        if (!body.id) throw new Error('id is required');
        const { data, error } = await supabase.from('service_orders')
          .update({ status: 'cancelled' }).eq('id', body.id).select('*').single();
        if (error) throw new Error(`cancel failed: ${error.message}`);
        return { status: 'success', service_order: data };
      }

      case 'add_line': {
        if (!body.id || !body.description || body.quantity === undefined || body.unit_price === undefined) {
          throw new Error('id, description, quantity and unit_price are required');
        }
        const { data: line, error } = await supabase.from('service_order_lines').insert({
          service_order_id: body.id,
          kind: body.kind ?? 'labor',
          description: body.description,
          quantity: body.quantity,
          unit_price: body.unit_price,
          product_id: body.product_id ?? null,
        }).select('*').single();
        if (error) throw new Error(`add_line failed: ${error.message}`);
        // Recompute order total from all lines.
        const { data: lines } = await supabase.from('service_order_lines').select('quantity, unit_price').eq('service_order_id', body.id);
        const total = (lines || []).reduce((s: number, l: any) => s + Number(l.quantity) * Number(l.unit_price), 0);
        await supabase.from('service_orders').update({ total_amount: total }).eq('id', body.id);
        return { status: 'success', line, order_total: total };
      }

      case 'list_visits': {
        if (!body.id) throw new Error('id is required');
        const { data, error } = await supabase.from('service_visits').select('*').eq('service_order_id', body.id).order('scheduled_start');
        if (error) throw new Error(`list_visits failed: ${error.message}`);
        return { status: 'success', visits: data || [] };
      }

      default:
        return { status: 'failed', error: `Unknown action: '${action}'. Expected one of: create, update, list, get, schedule, complete, cancel, add_line, list_visits.` };
    }
  } catch (err) {
    return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
  }
}
