-- invoice_number column on invoices (quotes.quote_number already exists)
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS invoice_number text;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_invoice_number_key ON public.invoices(invoice_number) WHERE invoice_number IS NOT NULL;

-- Counter table for gapless per-kind numbering
CREATE TABLE IF NOT EXISTS public.document_number_counters (
  kind text PRIMARY KEY,
  prefix text NOT NULL,
  last_value bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.document_number_counters TO authenticated;
GRANT ALL ON public.document_number_counters TO service_role;
ALTER TABLE public.document_number_counters ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='document_number_counters' AND policyname='read counters') THEN
    CREATE POLICY "read counters" ON public.document_number_counters FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.next_document_number(p_kind text, p_prefix text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next bigint;
  v_year text := to_char(now(), 'YYYY');
BEGIN
  INSERT INTO public.document_number_counters(kind, prefix, last_value)
  VALUES (p_kind, p_prefix, 1)
  ON CONFLICT (kind) DO UPDATE
    SET last_value = public.document_number_counters.last_value + 1,
        prefix = EXCLUDED.prefix,
        updated_at = now()
  RETURNING last_value INTO v_next;

  RETURN p_prefix || '-' || v_year || '-' || lpad(v_next::text, 5, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_document_number(text, text) TO authenticated, service_role;