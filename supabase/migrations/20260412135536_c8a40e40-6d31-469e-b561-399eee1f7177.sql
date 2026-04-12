
-- Drop old unused function
DROP FUNCTION IF EXISTS public.trigger_order_stock_decrement() CASCADE;

-- Create new clean trigger function on order_items
CREATE OR REPLACE FUNCTION public.trigger_order_item_stock_decrement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only decrement if product_id is set
  IF NEW.product_id IS NOT NULL AND NEW.quantity > 0 THEN
    -- Record stock move for audit trail
    INSERT INTO public.stock_moves (product_id, quantity, move_type, reference_type, reference_id, notes)
    VALUES (
      NEW.product_id,
      -(NEW.quantity),
      'out',
      'order',
      NEW.order_id::text,
      'Auto-decrement from order item'
    );

    -- Update product_stock
    UPDATE public.product_stock
    SET quantity_on_hand = quantity_on_hand - NEW.quantity
    WHERE product_id = NEW.product_id;

    -- Also update products.stock_quantity for backwards compat
    UPDATE public.products
    SET stock_quantity = GREATEST(COALESCE(stock_quantity, 0) - NEW.quantity, 0)
    WHERE id = NEW.product_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to order_items
CREATE TRIGGER trg_order_item_stock_decrement
  AFTER INSERT ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_order_item_stock_decrement();
