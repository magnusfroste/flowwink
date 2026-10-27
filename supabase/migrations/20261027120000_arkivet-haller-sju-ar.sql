-- ─────────────────────────────────────────────────────────────────────────────
-- Arkivet håller sju år — document integrity and retention (BFL 7 kap)
-- ─────────────────────────────────────────────────────────────────────────────
-- The archive stored a voucher's documentation but nothing proved a file was
-- still the file that was booked, and nothing stopped a delete: the storage
-- bucket's delete policy asked "is this an admin", never "is this a voucher's
-- receipt from last year". Accounted enforces both with triggers (SHA-256 on
-- the document, retention on delete). So do we now:
--
--   1. Integrity: `content_sha256` on documents and on a voucher's attachment
--      rows, stamped at upload (admin dialog, drag-and-drop, upload_document)
--      and verified/sealed later by verify_document_integrity, which
--      re-downloads and recomputes. A mismatch is a finding, never silently
--      overwritten.
--   2. Retention: a document attached to a POSTED voucher is kept until
--      31 December seven years after the calendar year the fiscal year ended
--      in (BFL 7 kap 2 §; the number of years is a declared preference,
--      `documentRetentionYears`, default 7). Deleting it before then is
--      refused — the row AND the storage object. Detaching documentation from
--      a posted voucher is refused too: it is part of the voucher.
--   3. An archive manifest per fiscal year (voucher_archive_manifest): every
--      voucher with its documents and hashes, retention dates, the instance —
--      the arkivförteckning an auditor asks for. A ZIP of the files is NOT
--      built here (the edge wall-clock); the manifest names every path.
--
-- Deliberate escape: a full reset (reset_site_data, reset_module_data) sets
-- app.archive_override for its transaction, so a sandbox rebuild or a wipe an
-- admin asked for still works. Nothing else sets it.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS content_sha256 text,
  ADD COLUMN IF NOT EXISTS hashed_at timestamptz,
  ADD COLUMN IF NOT EXISTS retention_until date,
  ADD COLUMN IF NOT EXISTS retention_reason text;
ALTER TABLE public.journal_entry_documents
  ADD COLUMN IF NOT EXISTS content_sha256 text,
  ADD COLUMN IF NOT EXISTS hashed_at timestamptz;

COMMENT ON COLUMN public.documents.content_sha256 IS 'SHA-256 of the stored bytes (hex), stamped at upload and re-verified by verify_document_integrity. NULL = never sealed.';
COMMENT ON COLUMN public.documents.retention_until IS 'The document may not be deleted before this date (BFL 7 kap 2 §: seven years after the calendar year the fiscal year ended in). Stamped when the document is attached to a posted voucher.';

CREATE INDEX IF NOT EXISTS idx_documents_retention_until ON public.documents (retention_until) WHERE retention_until IS NOT NULL;

-- ── The retention rule as data ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.document_retention_years()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT GREATEST(COALESCE(NULLIF(value ->> 'documentRetentionYears', '')::int, 7), 1)
    FROM public.site_settings WHERE key = 'accounting_preferences'
  UNION ALL SELECT 7 LIMIT 1;
$fn$;
GRANT EXECUTE ON FUNCTION public.document_retention_years() TO authenticated, service_role;

-- 31 December, N years after the calendar year the voucher's fiscal year ended in.
CREATE OR REPLACE FUNCTION public.voucher_retention_until(p_entry_date date)
RETURNS date
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT make_date(EXTRACT(YEAR FROM r.date_to)::int + public.document_retention_years(), 12, 31)
    FROM public.fiscal_year_range(public.fiscal_year_of(p_entry_date)) r;
$fn$;
GRANT EXECUTE ON FUNCTION public.voucher_retention_until(date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.archive_override_on()
RETURNS boolean
LANGUAGE sql STABLE
AS $fn$ SELECT COALESCE(current_setting('app.archive_override', true), '') = 'on'; $fn$;

-- ── Attaching to a voucher stamps the document's retention ─────────────────
CREATE OR REPLACE FUNCTION public.stamp_voucher_document_retention()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_date date; v_status text; v_until date;
BEGIN
  SELECT entry_date, status INTO v_date, v_status FROM public.journal_entries WHERE id = NEW.journal_entry_id;
  IF v_date IS NULL THEN RETURN NEW; END IF;
  v_until := public.voucher_retention_until(v_date);
  IF NEW.document_id IS NOT NULL THEN
    UPDATE public.documents
       SET retention_until = GREATEST(COALESCE(retention_until, v_until), v_until),
           retention_reason = COALESCE(retention_reason, 'Documentation of a voucher (BFL 7 kap 2 §)')
     WHERE id = NEW.document_id;
    -- The attachment row carries the archive document's seal, so a bare file_url and a document look alike to the verifier.
    IF NEW.content_sha256 IS NULL THEN
      SELECT content_sha256, hashed_at INTO NEW.content_sha256, NEW.hashed_at FROM public.documents WHERE id = NEW.document_id;
    END IF;
  END IF;
  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS trg_stamp_voucher_document_retention ON public.journal_entry_documents;
CREATE TRIGGER trg_stamp_voucher_document_retention
  BEFORE INSERT ON public.journal_entry_documents
  FOR EACH ROW EXECUTE FUNCTION public.stamp_voucher_document_retention();

-- Posting an entry later (draft → posted) stamps what was attached while it was a draft.
CREATE OR REPLACE FUNCTION public.stamp_retention_on_post()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_until date;
BEGIN
  IF NEW.status = 'posted' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'posted') THEN
    v_until := public.voucher_retention_until(NEW.entry_date);
    UPDATE public.documents d
       SET retention_until = GREATEST(COALESCE(d.retention_until, v_until), v_until),
           retention_reason = COALESCE(d.retention_reason, 'Documentation of a voucher (BFL 7 kap 2 §)')
      FROM public.journal_entry_documents jd
     WHERE jd.journal_entry_id = NEW.id AND jd.document_id = d.id;
  END IF;
  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS trg_stamp_retention_on_post ON public.journal_entries;
CREATE TRIGGER trg_stamp_retention_on_post
  AFTER INSERT OR UPDATE OF status ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.stamp_retention_on_post();

-- ── Deleting inside the retention window is refused ────────────────────────
CREATE OR REPLACE FUNCTION public.guard_document_retention()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF public.archive_override_on() THEN RETURN OLD; END IF;
  IF OLD.retention_until IS NOT NULL AND OLD.retention_until >= public.platform_today() THEN
    RAISE EXCEPTION 'Document "%" is kept until % (retention: %). It documents a posted voucher and cannot be deleted before then.',
      COALESCE(OLD.title, OLD.file_name, OLD.id::text), OLD.retention_until, COALESCE(OLD.retention_reason, 'BFL 7 kap')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END; $fn$;

DROP TRIGGER IF EXISTS trg_guard_document_retention ON public.documents;
CREATE TRIGGER trg_guard_document_retention
  BEFORE DELETE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.guard_document_retention();

-- Detaching documentation from a posted voucher is refused; a cascade from the
-- voucher's own deletion (pg_trigger_depth > 0) and the reset override pass.
CREATE OR REPLACE FUNCTION public.guard_voucher_document_detach()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_status text; v_ref text;
BEGIN
  IF public.archive_override_on() OR pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
  SELECT status, COALESCE(voucher_series || '-' || voucher_number::text, id::text) INTO v_status, v_ref
    FROM public.journal_entries WHERE id = OLD.journal_entry_id;
  IF v_status = 'posted' THEN
    RAISE EXCEPTION 'Voucher % is posted: its documentation stays with it (BFL 7 kap). To correct the voucher, void it with a mirror entry; the attachment is never detached.', v_ref
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END; $fn$;

DROP TRIGGER IF EXISTS trg_guard_voucher_document_detach ON public.journal_entry_documents;
CREATE TRIGGER trg_guard_voucher_document_detach
  BEFORE DELETE ON public.journal_entry_documents
  FOR EACH ROW EXECUTE FUNCTION public.guard_voucher_document_detach();

-- The storage object follows the row: the bucket's delete policy refuses a
-- retained file. ALL storage.* DDL lives in the fresh-install finalizer
-- (20260812130000, "Admins can delete documents") — a mid-stream storage
-- policy deadlocks the storage service's own migrator on a new project.

-- ── A full reset may still clear the archive: it says so for its transaction ─
DO $$
DECLARE v_fn text; v_def text; v_new text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['reset_site_data', 'reset_module_data'] LOOP
    IF to_regproc('public.' || v_fn) IS NULL THEN CONTINUE; END IF;
    SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p WHERE p.proname = v_fn AND p.pronamespace = 'public'::regnamespace LIMIT 1;
    IF v_def LIKE '%app.archive_override%' THEN CONTINUE; END IF;
    v_new := regexp_replace(v_def, E'\nBEGIN\n', E'\nBEGIN\n  PERFORM set_config(''app.archive_override'', ''on'', true);\n', '');
    IF v_new = v_def THEN RAISE EXCEPTION '%: no BEGIN line to patch — set app.archive_override by hand', v_fn; END IF;
    EXECUTE v_new;
  END LOOP;
END $$;

-- ── Status for the integrity card and the health check ─────────────────────
CREATE OR REPLACE FUNCTION public.archive_integrity_status()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_docs int; v_sealed int; v_unsealed int; v_retained int; v_attachments int; v_att_unsealed int; v_last timestamptz;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'accounting') OR public.can_access_module(auth.uid(), 'documents')) THEN
    RAISE EXCEPTION 'Only accounting or documents staff can read the archive status' USING ERRCODE = '42501';
  END IF;
  SELECT COUNT(*), COUNT(*) FILTER (WHERE content_sha256 IS NOT NULL), COUNT(*) FILTER (WHERE content_sha256 IS NULL AND file_url NOT LIKE 'demo://%'),
         COUNT(*) FILTER (WHERE retention_until IS NOT NULL AND retention_until >= public.platform_today()), MAX(hashed_at)
    INTO v_docs, v_sealed, v_unsealed, v_retained, v_last
    FROM public.documents;
  SELECT COUNT(*), COUNT(*) FILTER (WHERE jd.content_sha256 IS NULL)
    INTO v_attachments, v_att_unsealed
    FROM public.journal_entry_documents jd JOIN public.journal_entries je ON je.id = jd.journal_entry_id
   WHERE je.status = 'posted';
  RETURN jsonb_build_object(
    'documents', v_docs, 'sealed', v_sealed, 'unsealed', v_unsealed, 'retained', v_retained,
    'voucher_attachments', v_attachments, 'voucher_attachments_unsealed', v_att_unsealed,
    'retention_years', public.document_retention_years(), 'last_verified_at', v_last);
END; $fn$;
GRANT EXECUTE ON FUNCTION public.archive_integrity_status() TO authenticated, service_role;

-- ── The archive manifest for a fiscal year ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.voucher_archive_manifest(p_year integer DEFAULT public.fiscal_year_of(public.platform_today()))
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_from date; v_to date; v_vouchers jsonb; v_count int; v_docs int; v_unsealed int;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'accounting')) THEN
    RAISE EXCEPTION 'Only accounting staff can export the archive manifest' USING ERRCODE = '42501';
  END IF;
  SELECT r.date_from, r.date_to INTO v_from, v_to FROM public.fiscal_year_range(p_year) r;
  SELECT COALESCE(jsonb_agg(v ORDER BY v ->> 'voucher_series', (v ->> 'voucher_number')::bigint), '[]'::jsonb), COUNT(*)
    INTO v_vouchers, v_count
    FROM (
      SELECT jsonb_build_object(
        'id', je.id, 'voucher_series', je.voucher_series, 'voucher_number', je.voucher_number,
        'entry_date', je.entry_date, 'description', je.description, 'status', je.status, 'source', je.source,
        'total_debit_cents', (SELECT COALESCE(SUM(debit_cents), 0) FROM public.journal_entry_lines l WHERE l.journal_entry_id = je.id),
        'retention_until', public.voucher_retention_until(je.entry_date),
        'documents', COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'attachment_id', jd.id, 'kind', jd.kind, 'label', jd.label, 'file_name', COALESCE(jd.file_name, d.file_name),
            'path', COALESCE(jd.file_url, d.file_url), 'document_id', jd.document_id,
            'sha256', COALESCE(jd.content_sha256, d.content_sha256), 'hashed_at', COALESCE(jd.hashed_at, d.hashed_at),
            'size_bytes', d.file_size_bytes, 'source', jd.source) ORDER BY jd.sort_order)
          FROM public.journal_entry_documents jd LEFT JOIN public.documents d ON d.id = jd.document_id
          WHERE jd.journal_entry_id = je.id), '[]'::jsonb)
      ) AS v
      FROM public.journal_entries je
      WHERE je.entry_date BETWEEN v_from AND v_to AND je.status = 'posted'
    ) s;
  SELECT COUNT(*), COUNT(*) FILTER (WHERE COALESCE(jd.content_sha256, d.content_sha256) IS NULL)
    INTO v_docs, v_unsealed
    FROM public.journal_entry_documents jd
    JOIN public.journal_entries je ON je.id = jd.journal_entry_id
    LEFT JOIN public.documents d ON d.id = jd.document_id
   WHERE je.entry_date BETWEEN v_from AND v_to AND je.status = 'posted';
  RETURN jsonb_build_object(
    'fiscal_year', p_year, 'label', public.fiscal_year_label(p_year), 'date_from', v_from, 'date_to', v_to,
    'currency', public.business_currency(), 'country', public.business_country(),
    'retention_years', public.document_retention_years(),
    'generated_at', now(),
    'vouchers', v_count, 'documents', v_docs, 'documents_unsealed', v_unsealed,
    'note', CASE WHEN v_unsealed > 0 THEN v_unsealed || ' document(s) carry no hash yet — run verify_document_integrity, then export again.' ELSE NULL END,
    'entries', v_vouchers);
END; $fn$;
GRANT EXECUTE ON FUNCTION public.voucher_archive_manifest(integer) TO authenticated, service_role;

-- ── Bevisas där den körs ───────────────────────────────────────────────────
-- A receipt attached to a posted March voucher is kept until 31 Dec 2033 (SE,
-- 7 years): deleting it is refused, detaching it is refused, a draft's
-- attachment detaches freely, and the reset override lets a wipe through.
DO $$
DECLARE v_doc uuid; v_je uuid; v_draft uuid; v_att uuid; v_until date; v_failed boolean;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    INSERT INTO public.documents (title, file_name, file_url, file_type, content_sha256, hashed_at)
      VALUES ('proof: receipt', 'receipt.pdf', 'proof/receipt.pdf', 'application/pdf', repeat('a', 64), now()) RETURNING id INTO v_doc;
    INSERT INTO public.journal_entries (entry_date, description, status) VALUES (DATE '2026-03-10', 'proof: posted', 'posted') RETURNING id INTO v_je;
    INSERT INTO public.journal_entry_documents (journal_entry_id, kind, label, document_id, source)
      VALUES (v_je, 'document', 'Kvitto', v_doc, 'upload') RETURNING id INTO v_att;
    SELECT retention_until INTO v_until FROM public.documents WHERE id = v_doc;
    IF v_until IS DISTINCT FROM public.voucher_retention_until(DATE '2026-03-10') OR v_until < DATE '2033-12-31' THEN
      RAISE EXCEPTION 'proof: retention should be 31 Dec seven years on, got %', v_until;
    END IF;
    IF (SELECT content_sha256 FROM public.journal_entry_documents WHERE id = v_att) IS DISTINCT FROM repeat('a', 64) THEN
      RAISE EXCEPTION 'proof: the attachment should carry the document seal';
    END IF;
    -- Delete refused.
    v_failed := false;
    BEGIN DELETE FROM public.documents WHERE id = v_doc;
    EXCEPTION WHEN check_violation THEN v_failed := true; END;
    IF NOT v_failed THEN RAISE EXCEPTION 'proof: a retained document was deleted'; END IF;
    -- Detach refused.
    v_failed := false;
    BEGIN DELETE FROM public.journal_entry_documents WHERE id = v_att;
    EXCEPTION WHEN check_violation THEN v_failed := true; END;
    IF NOT v_failed THEN RAISE EXCEPTION 'proof: documentation was detached from a posted voucher'; END IF;
    -- A draft's attachment detaches freely.
    INSERT INTO public.journal_entries (entry_date, description, status) VALUES (DATE '2026-03-11', 'proof: draft', 'draft') RETURNING id INTO v_draft;
    INSERT INTO public.journal_entry_documents (journal_entry_id, kind, label, file_url, source) VALUES (v_draft, 'file', 'Utkast', 'proof/draft.pdf', 'upload');
    DELETE FROM public.journal_entry_documents WHERE journal_entry_id = v_draft;
    -- The manifest lists the voucher with its hash; the status counts it.
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(public.voucher_archive_manifest(public.fiscal_year_of(DATE '2026-03-10')) -> 'entries') e
                    WHERE (e ->> 'id')::uuid = v_je AND e -> 'documents' -> 0 ->> 'sha256' = repeat('a', 64)) THEN
      RAISE EXCEPTION 'proof: manifest lacks the voucher or its hash';
    END IF;
    IF (public.archive_integrity_status() ->> 'retained')::int < 1 THEN RAISE EXCEPTION 'proof: status does not count the retained document'; END IF;
    -- The reset override lets a wipe through.
    PERFORM set_config('app.archive_override', 'on', true);
    DELETE FROM public.journal_entry_documents WHERE id = v_att;
    DELETE FROM public.documents WHERE id = v_doc;
    RAISE NOTICE 'archive retention proof ok';
    RAISE EXCEPTION '__archive_proof_ok__';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> '__archive_proof_ok__' THEN RAISE; END IF;
  END;
END $$;
