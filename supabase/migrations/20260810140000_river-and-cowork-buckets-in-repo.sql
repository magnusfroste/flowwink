-- The rest of the buckets that existed on some instances and in zero migrations.
--
-- Two days ago the `documents` bucket turned out to live only on the instances
-- that happened to get it by hand, so uploads failed with bucket-not-found on
-- optic and demo. That migration fixed `documents` and its header named the
-- class — infrastructure that exists only where someone once created it — and
-- then stopped at the one bucket in front of us.
--
-- `river-media` and `cowork-uploads` were the remaining instances of it, and
-- river's image attach failed on optic today for exactly the same reason. When
-- a class is named, the sweep belongs in the same breath as the fix.
--
-- Config and policies below are read from www, where both features work: the
-- running fleet is the spec, not a guess. Same method as the documents
-- migration, and the same reason — a bucket recreated from memory gets its
-- public flag or its owner check subtly wrong, and a storage policy that is
-- subtly wrong is either a leak or a support ticket.

-- ── river-media: public read, because river renders images on public pages ──
INSERT INTO storage.buckets (id, name, public)
VALUES ('river-media', 'river-media', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "river-media public read" ON storage.objects;
CREATE POLICY "river-media public read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'river-media');

DROP POLICY IF EXISTS "river-media authed upload" ON storage.objects;
CREATE POLICY "river-media authed upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'river-media');

-- Only what you put there. Deleting someone else's attachment out of a shared
-- feed is not a thing any river user should be able to do by accident.
DROP POLICY IF EXISTS "river-media owner delete" ON storage.objects;
CREATE POLICY "river-media owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'river-media' AND owner = auth.uid());

-- ── cowork-uploads: private, and scoped to the uploader's own folder ────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('cowork-uploads', 'cowork-uploads', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "cowork own upload" ON storage.objects;
CREATE POLICY "cowork own upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'cowork-uploads'
              AND (storage.foldername(name))[1] = (auth.uid())::text);

DROP POLICY IF EXISTS "cowork own read" ON storage.objects;
CREATE POLICY "cowork own read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'cowork-uploads'
         AND (storage.foldername(name))[1] = (auth.uid())::text);

DROP POLICY IF EXISTS "cowork own delete" ON storage.objects;
CREATE POLICY "cowork own delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'cowork-uploads'
         AND (storage.foldername(name))[1] = (auth.uid())::text);

DO $$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(b, ', ') INTO v_missing
    FROM unnest(ARRAY['cms-images', 'documents', 'form-uploads', 'river-media', 'cowork-uploads']) b
   WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = b);
  IF v_missing IS NULL THEN
    RAISE NOTICE 'Storage: every bucket the code writes to exists on this instance.';
  ELSE
    RAISE WARNING 'Storage: still missing %. Every one of these is an upload that fails with bucket-not-found.', v_missing;
  END IF;
END $$;
