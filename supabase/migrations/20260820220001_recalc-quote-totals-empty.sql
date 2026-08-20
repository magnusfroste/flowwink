-- recalc_quote_totals must be able to say ZERO.
--
-- The trigger refused to write whenever the quote had no lines:
--
--     IF v_item_count > 0 THEN UPDATE quotes SET … END IF;
--
-- The intent was defensive — "don't zero a quote just because a DELETE fired
-- mid-edit". The effect was a lie that survives the edit: manage_quote's update
-- action deletes every line before inserting the new ones, so a rejected new
-- line leaves the quote with 0 rows AND the old total still on the row. QA saw
-- a quote showing 1 868 750 kr with nothing to show for it.
--
-- The empty case is a real, representable state: no lines means no money. The
-- protection against a transient zero belongs where the transient window is —
-- the writer, which now validates every line BEFORE it deletes anything
-- (agent-execute quotes.update) — not in a trigger that cannot tell a
-- mid-transaction delete from a finished one.

CREATE OR REPLACE FUNCTION public.recalc_quote_totals()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_quote_id UUID;
  v_sub BIGINT;
  v_tax BIGINT;
  v_total BIGINT;
BEGIN
  v_quote_id := COALESCE(NEW.quote_id, OLD.quote_id);
  SELECT COALESCE(SUM(line_subtotal_cents), 0),
         COALESCE(SUM(line_tax_cents), 0),
         COALESCE(SUM(line_total_cents), 0)
    INTO v_sub, v_tax, v_total
    FROM public.quote_items WHERE quote_id = v_quote_id;

  -- No IF-guard: zero lines is zero money, and a quote that says otherwise is
  -- a document that cannot be trusted.
  UPDATE public.quotes
     SET subtotal_cents = v_sub,
         tax_cents      = v_tax,
         total_cents    = v_total,
         updated_at     = now()
   WHERE id = v_quote_id;

  RETURN NULL;
END;
$function$;

-- The trigger itself is unchanged, but re-assert it so an instance that lost it
-- (or never had it) gets the recalculation back.
DROP TRIGGER IF EXISTS trg_quote_items_totals ON public.quote_items;
CREATE TRIGGER trg_quote_items_totals
AFTER INSERT OR DELETE OR UPDATE ON public.quote_items
FOR EACH ROW EXECUTE FUNCTION public.recalc_quote_totals();

-- Repair rows the old guard left stranded: a quote with no lines anywhere but a
-- non-zero total is exactly the artifact this fixes.
--
-- Narrow on purpose. Only unsent documents (draft / pending_approval) are
-- touched — a sent or accepted quote is a document the customer has seen, and
-- rewriting its total after the fact would be worse than the inconsistency.
-- Quotes that still carry their lines in the legacy quotes.line_items JSONB are
-- excluded: those totals are backed by data this trigger simply doesn't see.
UPDATE public.quotes q
   SET subtotal_cents = 0, tax_cents = 0, total_cents = 0, updated_at = now()
 WHERE NOT EXISTS (SELECT 1 FROM public.quote_items qi WHERE qi.quote_id = q.id)
   AND COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(q.line_items) = 'array'
                                        THEN q.line_items ELSE '[]'::jsonb END), 0) = 0
   AND (COALESCE(q.subtotal_cents,0) <> 0 OR COALESCE(q.tax_cents,0) <> 0 OR COALESCE(q.total_cents,0) <> 0)
   AND q.status IN ('draft'::quote_status, 'pending_approval'::quote_status);
