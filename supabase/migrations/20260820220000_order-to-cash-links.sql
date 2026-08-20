-- Order-to-cash: the links that were prose.
--
-- Two joins in the order→invoice chain were carried in free text instead of in
-- columns, and both cost real money in QA:
--
--   1. invoices had NO order_id. send_invoice_for_order wrote `order:<uuid>`
--      into invoices.notes and used an ilike scan over that note as its
--      idempotency key. Notes are an editable field: any operator (or agent)
--      who rewrote the note severed the link, and the next call happily issued
--      a SECOND live invoice for the same order. Proven on a fully paid
--      customer — a phantom receivable of 18 687,50 kr.
--
--   2. orders had NO quote_id. There was no quote→order conversion at all, so
--      an agent asked to "turn the accepted quote into an order" rebuilt the
--      order by hand and dropped the tax: quote 1 868 750 → order 1 495 000
--      (ex VAT) → invoice 1 868 750. Three documents, two different amounts.
--
-- A link that matters is a column with a foreign key, not a substring.
--
-- Deliberately NOT unique on invoices.order_id: an order may legitimately be
-- billed by more than one document (a credit note against an order invoice,
-- future partial/installment billing). Uniqueness would turn a legal second
-- document into a hard failure. The guarantee this migration gives is that the
-- link cannot be edited away; the "one invoice per order" idempotency lives in
-- send_invoice_for_order, which now looks up THIS column.

-- ── invoices.order_id ────────────────────────────────────────────────────────
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS order_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.invoices'::regclass
       AND conname  = 'invoices_order_id_fkey'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoices_order_id
  ON public.invoices (order_id) WHERE order_id IS NOT NULL;

COMMENT ON COLUMN public.invoices.order_id IS
  'The order this invoice bills. Set by send_invoice_for_order and used as its idempotency key — replaces the old notes LIKE ''order:<uuid>'' scan, which an edited note silently defeated (double-invoicing incident 2026-08-20).';

-- Backfill from the notes pattern the old code wrote. Only rows whose embedded
-- uuid actually resolves to an order are linked; a stale/garbled note is left
-- alone rather than pointed at nothing.
UPDATE public.invoices i
   SET order_id = o.id
  FROM public.orders o
 WHERE i.order_id IS NULL
   AND i.notes IS NOT NULL
   AND o.id::text = substring(i.notes from 'order:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})');

-- ── orders.quote_id ──────────────────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS quote_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.orders'::regclass
       AND conname  = 'orders_quote_id_fkey'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_quote_id_fkey
      FOREIGN KEY (quote_id) REFERENCES public.quotes(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_quote_id
  ON public.orders (quote_id) WHERE quote_id IS NOT NULL;

COMMENT ON COLUMN public.orders.quote_id IS
  'The quote this order was converted from (manage_quote action=convert_to_order). Carries the accepted document forward so the order bills what the customer accepted, tax included.';
