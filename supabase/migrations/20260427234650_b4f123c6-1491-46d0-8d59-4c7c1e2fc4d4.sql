INSERT INTO storage.buckets (id, name, public)
VALUES ('cowork-uploads', 'cowork-uploads', false)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users may upload to their own folder (auth.uid()/...)
DROP POLICY IF EXISTS "cowork own upload" ON storage.objects;
CREATE POLICY "cowork own upload" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'cowork-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "cowork own read" ON storage.objects;
CREATE POLICY "cowork own read" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'cowork-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "cowork own delete" ON storage.objects;
CREATE POLICY "cowork own delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'cowork-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);