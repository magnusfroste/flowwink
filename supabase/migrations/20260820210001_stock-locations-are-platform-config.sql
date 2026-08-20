-- Stock locations are platform config — and the baseline squash ate them.
--
-- A goods receipt of 100 units returned {"success": true, "po_status":
-- "received"} while products.stock_quantity stayed at 0. The chain looked fine
-- at every step; it was standing on an empty table. `stock_locations` was
-- seeded in an April migration (20260430000349_c7c86170…: WH/MAIN, WH/TRANSIT,
-- WH/SCRAP, WH/VENDORS, WH/CUSTOMERS, WH/PRODUCTION) and the 2026-06-08 baseline
-- squash kept the DDL and dropped the INSERT — the same class that emptied
-- role_module_access_defaults. Every fresh install is born with zero locations,
-- so every function that resolves "the internal warehouse" silently resolves
-- NULL and keeps going.
--
-- This is platform config, not business config: an operator defines their own
-- carriers and approval rules, but "there is a warehouse, a vendor side and a
-- customer side" is what the inventory engine is built on. It must be seeded.
--
-- Shape follows 20260804150000_seed-role-module-access-defaults.sql: a
-- re-assertable FUNCTION, not a one-shot INSERT, so provisioning, a repair run
-- and this migration all reach the same end state.
--
-- Customisation survives: on an instance that already has locations the seed
-- only tops up location TYPES that are entirely absent — a renamed WH/MAIN or a
-- multi-warehouse layout is left alone, but the invariant "at least one active
-- internal / vendor / customer location exists" is re-asserted every run.

CREATE OR REPLACE FUNCTION public.seed_stock_locations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_had_any boolean;
  v_inserted int := 0;
  v_this int;
  v_row record;
BEGIN
  IF NOT (auth.role() = 'service_role' OR auth.uid() IS NULL OR has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Only admins can seed stock locations';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.stock_locations) INTO v_had_any;

  FOR v_row IN
    SELECT * FROM (VALUES
      ('WH/MAIN',       'Main Warehouse', 'internal'),
      ('WH/TRANSIT',    'In Transit',     'transit'),
      ('WH/SCRAP',      'Scrap',          'scrap'),
      ('WH/VENDORS',    'Vendors',        'vendor'),
      ('WH/CUSTOMERS',  'Customers',      'customer'),
      ('WH/PRODUCTION', 'Production',     'production')
    ) AS t(code, name, location_type)
  LOOP
    -- Fresh install: seed the whole canonical set.
    -- Operated instance: only re-assert a location TYPE that has gone missing,
    -- so an operator's own codes/names/hierarchy are never stomped.
    CONTINUE WHEN v_had_any AND EXISTS (
      SELECT 1 FROM public.stock_locations
       WHERE location_type = v_row.location_type AND is_active = true
    );

    -- If the canonical row exists but was deactivated and nothing else covers
    -- the type, reactivate it: the invariant is "a live location of this type
    -- exists", and telling an operator to run a seed that then does nothing is
    -- worse than no advice at all.
    INSERT INTO public.stock_locations (code, name, location_type)
    VALUES (v_row.code, v_row.name, v_row.location_type)
    ON CONFLICT (code) DO UPDATE SET is_active = true, updated_at = now()
      WHERE stock_locations.is_active = false;

    GET DIAGNOSTICS v_this = ROW_COUNT;
    v_inserted := v_inserted + v_this;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'was_empty', NOT v_had_any,
    'inserted', v_inserted,
    'total', (SELECT count(*) FROM public.stock_locations)
  );
END;
$function$;

COMMENT ON FUNCTION public.seed_stock_locations() IS
  'Re-assertable seed of the canonical stock locations (platform config). Fills the whole set on a fresh install; on an operated instance it only re-adds a location type that is entirely missing, so operator customisation survives.';

REVOKE ALL ON FUNCTION public.seed_stock_locations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_stock_locations() TO authenticated, service_role;

-- Assert the seed now, for every instance this migration reaches.
SELECT public.seed_stock_locations();
