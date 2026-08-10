-- ============================================================================
-- A verification must be able to hold what it rests on.
--
-- Bokföringslagen 5:7 requires a verification to identify the documents that
-- underlie it. FlowWink could not express that at all: journal_entries has
-- nineteen columns and none of them is an attachment. New Entry had nowhere to
-- put a receipt, the verification view showed none, and manage_journal_entry
-- could not take one from an agent.
--
-- Receipts DO get uploaded — expenses.receipt_url, with AI extraction on top —
-- but the ledger link runs expense → expense_report → journal_entry, so the
-- receipt reaches the REPORT and stops there. From a verification there was no
-- path to the document at all.
--
-- Same shape as contract appendices (contract_documents, 2026-08-08), and for
-- the same reason: what a record REFERENCES must be something the record HOLDS.
-- One register, two kinds, and a label that is the join between prose and
-- object.
--
--   kind='file'      an uploaded receipt, invoice PDF, bank statement, SIE file
--   kind='document'  a row already in public.documents (an annual report, a
--                    board minute) — referenced, never copied, so one document
--                    can underlie several verifications without duplicating
--
-- Deliberately NOT a third kind for prose. A note explaining a derivation is
-- not an underlying document, and the entry description already holds it. The
-- law asks for handlingar; this register holds handlingar.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.journal_entry_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'file',
  -- What the reader calls it: "Kvitto", "Kontoutdrag SEB", "Årsredovisning 2023".
  label text,
  file_name text,
  file_url text,
  file_type text DEFAULT 'pdf',
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  -- Where it came from, so an audit can tell a scanned receipt from an
  -- agent-attached statement without reading the label.
  source text NOT NULL DEFAULT 'upload',
  sort_order integer NOT NULL DEFAULT 0,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.journal_entry_documents IS
  'The documents a verification rests on (verifikationsunderlag, BFL 5:7). kind=file is an uploaded artifact; kind=document references public.documents so one document can underlie several verifications without being copied.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_entry_documents_kind_chk') THEN
    ALTER TABLE public.journal_entry_documents ADD CONSTRAINT journal_entry_documents_kind_chk
      CHECK (kind IN ('file', 'document'));
  END IF;
  -- An attachment must actually point at something. A row that claims to be
  -- underlying documentation and holds neither a file nor a document is worse
  -- than no row: it reads as evidence in every listing.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_entry_documents_content_chk') THEN
    ALTER TABLE public.journal_entry_documents ADD CONSTRAINT journal_entry_documents_content_chk
      CHECK (
        (kind = 'file' AND coalesce(trim(file_url), '') <> '')
        OR (kind = 'document' AND document_id IS NOT NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS journal_entry_documents_entry_idx
  ON public.journal_entry_documents(journal_entry_id, sort_order);

ALTER TABLE public.journal_entry_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read journal_entry_documents" ON public.journal_entry_documents;
CREATE POLICY "staff read journal_entry_documents" ON public.journal_entry_documents
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "admins write journal_entry_documents" ON public.journal_entry_documents;
CREATE POLICY "admins write journal_entry_documents" ON public.journal_entry_documents
  FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'approver'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'approver'));

-- ── The agent-facing surface ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.manage_journal_entry_document(
  p_action text DEFAULT 'list',
  p_entry_id uuid DEFAULT NULL,
  p_kind text DEFAULT 'file',
  p_label text DEFAULT NULL,
  p_file_url text DEFAULT NULL,
  p_file_name text DEFAULT NULL,
  p_document_id uuid DEFAULT NULL,
  p_attachment_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_rows jsonb;
  v_desc text;
BEGIN
  IF NOT (auth.role() = 'service_role'
          OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'approver')) THEN
    RAISE EXCEPTION 'Only admins and approvers can manage verification documents';
  END IF;

  IF p_action = 'list' THEN
    IF p_entry_id IS NULL THEN
      RETURN jsonb_build_object('error', 'entry_id is required for list');
    END IF;
    SELECT jsonb_agg(jsonb_build_object(
             'id', d.id, 'kind', d.kind, 'label', d.label,
             'file_name', d.file_name, 'file_url', d.file_url,
             'document_id', d.document_id, 'document_title', doc.title,
             'source', d.source) ORDER BY d.sort_order, d.created_at)
      INTO v_rows
      FROM public.journal_entry_documents d
      LEFT JOIN public.documents doc ON doc.id = d.document_id
     WHERE d.journal_entry_id = p_entry_id;
    RETURN jsonb_build_object(
      'entry_id', p_entry_id,
      'documents', COALESCE(v_rows, '[]'::jsonb),
      'note', CASE WHEN v_rows IS NULL
        THEN 'This verification carries no underlying documentation. BFL 5:7 wants a verification to identify what it rests on — attach the receipt, invoice or statement it was booked from.'
        ELSE 'The documents this verification rests on.' END);
  END IF;

  IF p_action = 'remove' THEN
    IF p_attachment_id IS NULL THEN
      RETURN jsonb_build_object('error', 'attachment_id is required for remove');
    END IF;
    DELETE FROM public.journal_entry_documents WHERE id = p_attachment_id;
    RETURN jsonb_build_object('removed', FOUND, 'attachment_id', p_attachment_id,
      'note', 'The attachment link is gone. A kind=document attachment only removed the LINK — the document itself is still in the archive.');
  END IF;

  IF p_action <> 'attach' THEN
    RETURN jsonb_build_object('error', format('Unknown action "%s". Use list|attach|remove', p_action));
  END IF;

  IF p_entry_id IS NULL THEN
    RETURN jsonb_build_object('error', 'entry_id is required for attach');
  END IF;
  SELECT description INTO v_desc FROM public.journal_entries WHERE id = p_entry_id;
  IF v_desc IS NULL THEN
    RETURN jsonb_build_object('error', format('No journal entry %s. Attach to a verification that exists.', p_entry_id));
  END IF;

  IF p_kind = 'document' AND p_document_id IS NULL THEN
    RETURN jsonb_build_object('error', 'kind=document needs document_id (a row in the documents archive). Use kind=file with file_url for an uploaded artifact.');
  END IF;
  IF p_kind = 'file' AND coalesce(trim(p_file_url), '') = '' THEN
    RETURN jsonb_build_object('error', 'kind=file needs file_url. Upload the artifact first (upload_document) or pass a URL the instance can reach.');
  END IF;

  INSERT INTO public.journal_entry_documents
    (journal_entry_id, kind, label, file_url, file_name, document_id, source, uploaded_by,
     sort_order)
  VALUES (p_entry_id, p_kind, NULLIF(btrim(coalesce(p_label, '')), ''), p_file_url, p_file_name,
          p_document_id, CASE WHEN auth.role() = 'service_role' THEN 'agent' ELSE 'upload' END,
          auth.uid(),
          COALESCE((SELECT max(sort_order) + 1 FROM public.journal_entry_documents
                     WHERE journal_entry_id = p_entry_id), 0))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('attached', true, 'attachment_id', v_id, 'entry_id', p_entry_id,
    'entry_description', v_desc,
    'note', 'The verification now identifies what it rests on. Attaching does not change any amount — the entry is untouched.');
END; $function$;

GRANT EXECUTE ON FUNCTION public.manage_journal_entry_document(text, uuid, text, text, text, text, uuid, uuid)
  TO authenticated, service_role;

-- ── The receipt reaches the verification, not just the report ───────────────
-- book_expense_report links the REPORT to the entry. Each expense's receipt was
-- therefore one join further away than anything in the ledger could see. Copy
-- the links across at booking time so the verification carries its own evidence.
CREATE OR REPLACE FUNCTION public.attach_expense_receipts_to_entry(
  p_report_id uuid,
  p_entry_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_n int;
BEGIN
  INSERT INTO public.journal_entry_documents
    (journal_entry_id, kind, label, file_url, file_name, source, sort_order)
  SELECT p_entry_id, 'file',
         COALESCE(NULLIF(btrim(e.vendor), ''), 'Kvitto') || ' ' || to_char(e.expense_date, 'YYYY-MM-DD'),
         e.receipt_url,
         COALESCE(NULLIF(btrim(e.description), ''), 'Kvitto'),
         'expense',
         row_number() OVER (ORDER BY e.expense_date, e.id) - 1
    FROM public.expenses e
   WHERE e.report_id = p_report_id
     AND COALESCE(trim(e.receipt_url), '') <> ''
     AND NOT EXISTS (
       SELECT 1 FROM public.journal_entry_documents d
        WHERE d.journal_entry_id = p_entry_id AND d.file_url = e.receipt_url);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END; $function$;

GRANT EXECUTE ON FUNCTION public.attach_expense_receipts_to_entry(uuid, uuid) TO authenticated, service_role;
