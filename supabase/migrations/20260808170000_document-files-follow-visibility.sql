-- The row was restricted. The bytes were not.
--
-- `20260808160000_documents-visibility.sql` gave `public.documents` a real
-- SELECT policy, so an HR document stops appearing in a salesperson's list.
-- But the FILE lives in `storage.objects`, and `20260808100000_documents-
-- bucket-in-repo.sql` — landed the same day, from a different thread of work —
-- granted every authenticated user SELECT on the whole bucket:
--
--     USING (bucket_id = 'documents')
--
-- Both migrations are individually correct. Together they produce a visibility
-- control that reads as protection and is bypassable one layer down: the
-- storage API lists objects directly, so a salesperson does not even need to
-- guess a path — they can enumerate the bucket and sign a URL for any file in
-- it. That is worse than no control, because the UI now says "only HR".
--
-- The fix does NOT restate the rules. It defers to them: RLS on a table
-- referenced inside another policy's expression is evaluated as the querying
-- user, so `EXISTS (SELECT 1 FROM public.documents …)` succeeds only when that
-- user could see the row. The file inherits the document's visibility by
-- construction, and any future change to the table policy carries over without
-- anyone remembering this file exists.

-- ── read ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Document files follow their document's visibility" ON storage.objects;

CREATE POLICY "Document files follow their document's visibility"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (
      -- Admin sees everything, including orphans — otherwise a failed upload
      -- leaves a file nobody on earth can read or clean up.
      public.has_role(auth.uid(), 'admin'::public.app_role)
      -- The uploader's own folder. Client uploads are keyed
      -- `<auth.uid()>/<timestamp>-<rand>.<ext>` and the file lands BEFORE the
      -- `documents` row is inserted; without this clause the uploader cannot
      -- read back their own file during that window, and an abandoned upload
      -- becomes unreachable.
      OR (storage.foldername(name))[1] = auth.uid()::text
      -- Everything else: visible iff the document row is visible. Agent
      -- uploads land under `agent-uploads/<peer>/…`, outside any user folder,
      -- and are covered here.
      OR EXISTS (
        SELECT 1 FROM public.documents d WHERE d.file_url = storage.objects.name
      )
    )
  );

-- ── overwrite ──────────────────────────────────────────────────────────────
-- The same hole in the other direction, and it survived the read fix: with
-- `USING (bucket_id = 'documents')` any authenticated user could overwrite any
-- file in the bucket — replace an employment contract with a different PDF
-- while the row, its title and its audit trail stay untouched. Nothing in the
-- codebase upserts into this bucket (both writers pass `upsert: false`), so
-- scoping this costs no working path.
DROP POLICY IF EXISTS "Authenticated users can update documents" ON storage.objects;
DROP POLICY IF EXISTS "Uploaders and admins can overwrite document files" ON storage.objects;

CREATE POLICY "Uploaders and admins can overwrite document files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.documents d
        WHERE d.file_url = storage.objects.name AND d.uploaded_by = auth.uid()
      )
    )
  );

-- INSERT stays open to any authenticated user (uploading is not reading), and
-- DELETE stays admin-only — both unchanged from 20260808100000.
