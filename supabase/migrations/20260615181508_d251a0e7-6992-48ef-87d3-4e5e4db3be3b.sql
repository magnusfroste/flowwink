-- Forms file uploads — private storage bucket + RLS for the `file` form field type.
--
-- Public visitors (anon) submit forms, so they must be able to UPLOAD into the bucket,
-- but only admins may READ/DELETE the files (downloads use admin-generated signed URLs).
-- Bucket is private with a 10 MB cap and a doc/image mime allowlist (CV-friendly).
--
-- Idempotent: ON CONFLICT / DROP POLICY IF EXISTS.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'form-uploads', 'form-uploads', false, 10485760,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png', 'image/jpeg', 'image/webp', 'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types,
      public = EXCLUDED.public;

-- anon + authenticated may upload into this bucket (public form submissions).
DROP POLICY IF EXISTS "form-uploads insert" ON storage.objects;
CREATE POLICY "form-uploads insert" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'form-uploads');

-- only admins may read the files (signed URLs are generated admin-side).
DROP POLICY IF EXISTS "form-uploads admin read" ON storage.objects;
CREATE POLICY "form-uploads admin read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'form-uploads' AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- only admins may delete uploaded files.
DROP POLICY IF EXISTS "form-uploads admin delete" ON storage.objects;
CREATE POLICY "form-uploads admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'form-uploads' AND public.has_role(auth.uid(), 'admin'::public.app_role));
