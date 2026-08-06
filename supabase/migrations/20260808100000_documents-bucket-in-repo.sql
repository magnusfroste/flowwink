-- The documents bucket existed on three instances and in zero migrations.
--
-- Quote attachments, the documents module and upload_document all write to
-- storage bucket `documents` — which was created by hand on www/liteit/
-- autoversio at some point and never committed. optic and demo were born
-- without it, so "Upload" on a quote failed with bucket-not-found and read as
-- an RLS error. Same class as the auth-trigger hole from the fresh-install
-- audit: infrastructure that lives only on instances that happened to get it.
--
-- Config and policies below are copied from www, where the feature works —
-- the running fleet is the spec, not a guess. Private bucket, 50 MB cap, no
-- mime allowlist (the documents module accepts arbitrary business files);
-- authenticated staff read/write, only admins delete.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('documents', 'documents', false, 52428800)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
CREATE POLICY "Authenticated users can upload documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents');

DROP POLICY IF EXISTS "Authenticated users can view documents" ON storage.objects;
CREATE POLICY "Authenticated users can view documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'documents');

DROP POLICY IF EXISTS "Authenticated users can update documents" ON storage.objects;
CREATE POLICY "Authenticated users can update documents" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'documents');

DROP POLICY IF EXISTS "Admins can delete documents" ON storage.objects;
CREATE POLICY "Admins can delete documents" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND has_role(auth.uid(), 'admin'::app_role));
