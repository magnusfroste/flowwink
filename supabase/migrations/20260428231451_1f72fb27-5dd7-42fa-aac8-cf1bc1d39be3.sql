CREATE OR REPLACE FUNCTION public._ensure_manual_journal()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Prefer existing MISC journal, otherwise any misc-type, otherwise create one
  SELECT id INTO v_id FROM journals
   WHERE code = 'MISC' OR journal_type = 'misc'
   ORDER BY (code = 'MISC') DESC, created_at ASC
   LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO journals (code, name, journal_type, currency, sequence_prefix, is_active, description)
    VALUES ('MISC', 'Miscellaneous', 'misc', 'SEK', 'V', true, 'Auto-created for expense bookings')
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;