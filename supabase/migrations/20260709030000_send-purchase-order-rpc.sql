-- send_purchase_order: transition a draft PO to 'sent'.
--
-- Process-QA finding 2026-07-09: send_purchase_order was wired to the generic
-- db:purchase_orders CRUD handler, whose verb-inference does not recognise "send"
-- as an action → it silently fell through to 'list' and returned rows instead of
-- transitioning the PO. That broke the whole procure-to-pay chain (receive_purchase_order
-- correctly refuses a draft PO). "send" is a status transition the generic handler
-- cannot infer a target state for, so it gets a dedicated RPC (repoint the skill
-- handler to rpc:send_purchase_order).
--
-- Idempotent: CREATE OR REPLACE. Service-role escape so the MCP gateway (auth.uid()
-- NULL under the service key) is not blocked by the admin check.
create or replace function public.send_purchase_order(p_purchase_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po public.purchase_orders%rowtype;
begin
  if not (auth.role() = 'service_role' or public.has_role(auth.uid(), 'admin')) then
    raise exception 'Only admins can send purchase orders';
  end if;

  select * into v_po from public.purchase_orders where id = p_purchase_order_id;
  if not found then
    raise exception 'Purchase order % not found', p_purchase_order_id;
  end if;

  -- Already sent/received/closed: idempotent no-op success (do not error — an agent
  -- retrying a send should not fail; verify-don't-trust, fail-forward).
  if v_po.status <> 'draft' then
    return jsonb_build_object(
      'purchase_order_id', v_po.id,
      'po_number', v_po.po_number,
      'status', v_po.status,
      'already_sent', true
    );
  end if;

  update public.purchase_orders
     set status = 'sent', updated_at = now()
   where id = p_purchase_order_id
  returning * into v_po;

  return jsonb_build_object(
    'purchase_order_id', v_po.id,
    'po_number', v_po.po_number,
    'status', v_po.status,
    'total_cents', v_po.total_cents,
    'sent', true
  );
end;
$$;
