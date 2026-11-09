-- ============================================================================
-- River's media is listed by staff only (2026-11-09).
--
-- River is the team's own feed. Its bucket is public so a post's image opens
-- by its URL (getPublicUrl) — a public bucket serves an object by path without
-- asking RLS. But "river-media public read" also gave `public` (anon included)
-- SELECT on storage.objects for the bucket, and SELECT is what the storage
-- API's LIST answers from: anyone with the site's publishable key could list
-- every file the team ever posted, and open each one. Found by the open-access
-- check on a fresh install (scripts/open-access.ts).
--
-- Images keep opening by URL (the bucket stays public); listing the bucket is
-- staff's. Idempotent, and retried on a deadlock with the storage service the
-- way the fresh-install finalizer is.
-- ============================================================================
DO $river$
DECLARE attempt int := 0;
BEGIN
  LOOP
    attempt := attempt + 1;
    BEGIN
      DROP POLICY IF EXISTS "river-media public read" ON storage.objects;
      DROP POLICY IF EXISTS "river-media staff read" ON storage.objects;
      CREATE POLICY "river-media staff read" ON storage.objects
        FOR SELECT TO authenticated
        USING (bucket_id = 'river-media'::text AND public.is_staff(auth.uid()));
      EXIT;
    EXCEPTION WHEN deadlock_detected THEN
      IF attempt >= 5 THEN RAISE; END IF;
      PERFORM pg_sleep(attempt * 2);
    END;
  END LOOP;
END $river$;
