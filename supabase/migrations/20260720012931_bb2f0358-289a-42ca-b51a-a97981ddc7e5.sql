DROP POLICY IF EXISTS "Anyone can view cms images" ON storage.objects;
CREATE POLICY "Anyone can view cms images"
ON storage.objects FOR SELECT
USING (bucket_id = 'cms-images');

DROP POLICY IF EXISTS "Authenticated users can upload images" ON storage.objects;
CREATE POLICY "Authenticated users can upload images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'cms-images');

DROP POLICY IF EXISTS "Authenticated users can update images" ON storage.objects;
CREATE POLICY "Authenticated users can update images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'cms-images')
WITH CHECK (bucket_id = 'cms-images');

DROP POLICY IF EXISTS "Authenticated users can delete images" ON storage.objects;
CREATE POLICY "Authenticated users can delete images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'cms-images');