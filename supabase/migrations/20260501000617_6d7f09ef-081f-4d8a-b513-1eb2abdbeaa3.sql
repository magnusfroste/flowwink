-- 1. Extend apply_stock_movement_event to write audit_logs
CREATE OR REPLACE FUNCTION public.apply_stock_movement_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_lines jsonb;
  v_line jsonb;
  v_product_id uuid;
  v_qty numeric;
  v_reason text;
  v_source text;
  v_location text := 'WH/MAIN';
BEGIN
  IF NEW.event_name <> 'stock.movement' THEN
    RETURN NEW;
  END IF;

  v_payload := COALESCE(NEW.payload, '{}'::jsonb);
  v_source := COALESCE(NEW.source, 'unknown');
  v_reason := COALESCE(v_payload->>'reason', v_source);

  -- Support both single and batch payloads
  IF v_payload ? 'lines' THEN
    v_lines := v_payload->'lines';
  ELSE
    v_lines := jsonb_build_array(v_payload);
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
  LOOP
    v_product_id := NULLIF(v_line->>'product_id', '')::uuid;
    v_qty := COALESCE((v_line->>'quantity_delta')::numeric, (v_line->>'qty')::numeric, 0);

    IF v_product_id IS NULL OR v_qty = 0 THEN
      CONTINUE;
    END IF;

    -- Upsert stock_quants
    INSERT INTO public.stock_quants (product_id, location_code, quantity)
    VALUES (v_product_id, v_location, v_qty)
    ON CONFLICT (product_id, location_code)
    DO UPDATE SET quantity = stock_quants.quantity + EXCLUDED.quantity, updated_at = now();

    -- Mirror to products.stock_quantity
    UPDATE public.products
    SET stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) + v_qty::int),
        updated_at = now()
    WHERE id = v_product_id;

    -- Audit trail (NEW)
    INSERT INTO public.audit_logs (action, entity_type, entity_id, metadata)
    VALUES (
      CASE WHEN v_qty < 0 THEN 'pos.stock.decrement' ELSE 'pos.stock.increment' END,
      'product',
      v_product_id,
      jsonb_build_object(
        'event_id', NEW.id,
        'event_name', NEW.event_name,
        'source', v_source,
        'reason', v_reason,
        'quantity_delta', v_qty,
        'location_code', v_location,
        'sale_id', v_payload->>'sale_id',
        'session_id', v_payload->>'session_id'
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- 2. Retention helper: returns status without performing delete
CREATE OR REPLACE FUNCTION public.audit_logs_retention_status()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'retention_days', 730,
    'total_rows', (SELECT COUNT(*) FROM public.audit_logs),
    'pos_stock_rows', (SELECT COUNT(*) FROM public.audit_logs WHERE action IN ('pos.stock.decrement', 'pos.stock.increment')),
    'oldest_row_at', (SELECT MIN(created_at) FROM public.audit_logs),
    'newest_row_at', (SELECT MAX(created_at) FROM public.audit_logs),
    'rows_past_retention', (SELECT COUNT(*) FROM public.audit_logs WHERE created_at < now() - interval '730 days'),
    'cutoff_at', (now() - interval '730 days')
  );
$$;

GRANT EXECUTE ON FUNCTION public.audit_logs_retention_status() TO authenticated;

-- 3. Retention purge function (called by cron)
CREATE OR REPLACE FUNCTION public.purge_audit_logs_past_retention()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted int;
BEGIN
  WITH del AS (
    DELETE FROM public.audit_logs
    WHERE created_at < now() - interval '730 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted FROM del;

  INSERT INTO public.audit_logs (action, entity_type, metadata)
  VALUES (
    'audit_logs.retention.purge',
    'system',
    jsonb_build_object('deleted_rows', v_deleted, 'retention_days', 730, 'ran_at', now())
  );

  RETURN jsonb_build_object('deleted_rows', v_deleted, 'ran_at', now());
END;
$$;

-- 4. Schedule daily retention purge at 03:15
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('audit-logs-retention-purge')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'audit-logs-retention-purge');
    PERFORM cron.schedule(
      'audit-logs-retention-purge',
      '15 3 * * *',
      $cron$ SELECT public.purge_audit_logs_past_retention(); $cron$
    );
  END IF;
END $$;

-- 5. Index to make POS-stock queries snappy on the verification page
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created
  ON public.audit_logs (action, created_at DESC);