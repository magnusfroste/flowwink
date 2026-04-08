
-- Add fulfillment tracking columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'unfulfilled',
  ADD COLUMN IF NOT EXISTS picked_at timestamptz,
  ADD COLUMN IF NOT EXISTS packed_at timestamptz,
  ADD COLUMN IF NOT EXISTS shipped_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS tracking_url text,
  ADD COLUMN IF NOT EXISTS fulfillment_notes text;

-- Create validation trigger for fulfillment_status
CREATE OR REPLACE FUNCTION public.validate_fulfillment_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.fulfillment_status NOT IN ('unfulfilled', 'picked', 'packed', 'shipped', 'delivered') THEN
    RAISE EXCEPTION 'Invalid fulfillment_status: %', NEW.fulfillment_status;
  END IF;
  
  -- Auto-set timestamps based on status transitions
  IF NEW.fulfillment_status = 'picked' AND OLD.fulfillment_status = 'unfulfilled' AND NEW.picked_at IS NULL THEN
    NEW.picked_at := now();
  END IF;
  IF NEW.fulfillment_status = 'packed' AND OLD.fulfillment_status IN ('unfulfilled', 'picked') AND NEW.packed_at IS NULL THEN
    IF NEW.picked_at IS NULL THEN NEW.picked_at := now(); END IF;
    NEW.packed_at := now();
  END IF;
  IF NEW.fulfillment_status = 'shipped' AND OLD.fulfillment_status IN ('unfulfilled', 'picked', 'packed') AND NEW.shipped_at IS NULL THEN
    IF NEW.picked_at IS NULL THEN NEW.picked_at := now(); END IF;
    IF NEW.packed_at IS NULL THEN NEW.packed_at := now(); END IF;
    NEW.shipped_at := now();
  END IF;
  IF NEW.fulfillment_status = 'delivered' AND OLD.fulfillment_status IN ('unfulfilled', 'picked', 'packed', 'shipped') AND NEW.delivered_at IS NULL THEN
    IF NEW.picked_at IS NULL THEN NEW.picked_at := now(); END IF;
    IF NEW.packed_at IS NULL THEN NEW.packed_at := now(); END IF;
    IF NEW.shipped_at IS NULL THEN NEW.shipped_at := now(); END IF;
    NEW.delivered_at := now();
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_fulfillment_status_trigger ON public.orders;
CREATE TRIGGER validate_fulfillment_status_trigger
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_fulfillment_status();
