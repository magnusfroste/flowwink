-- ============================================================================
-- The fresh-install finalizer — last of the migrations that existed at its
-- creation (2026-08-12).
--
-- HISTORY: this file was first shipped as version 99999999999999 so it would
-- sort after every timestamp forever. That sentinel turned out to poison the
-- ledger: with head = all-nines, every FUTURE migration reads as back-dated —
-- to the forward-dating CI guard and to any ledger-head comparison. So the
-- finalizer carries a real timestamp: on a from-scratch replay it still runs
-- after the entire pre-existing stream (which is all it needs — storage and
-- cron activation must not happen mid-stream), and migrations authored later
-- legitimately run after it. Post-finalizer migrations must NOT quiesce cron
-- (they would strand a live instance's jobs dark); the fresh-install-replay
-- guardrail enforces both directions of that rule.
--
-- Two jobs, both of which must not happen mid-stream:
--
-- 1. STORAGE, deadlock-immune. The first-ever full replay (GitHub integration,
--    2026-08-11, project ypkhjjkywgnqhuyiilcz) died with SQLSTATE 40P01: our
--    bucket/policy migrations raced Supabase's own storage service, which
--    takes AccessExclusiveLock on storage.buckets while initialising around
--    project birth. Buckets and policies now live HERE, generated from the
--    running fleet (www, 5 buckets / 17 policies — the fleet is the spec),
--    wrapped in a retry loop that survives a deadlock instead of killing the
--    whole deploy. The old in-stream storage migrations are gutted to comments;
--    every existing instance already ran them, and fresh instances get the
--    complete state from this file.
--
-- 2. CRON ACTIVATION. Every migration that schedules jobs now leaves ALL jobs
--    inactive (fresh-replay quiescence), so nothing fires into a half-built
--    schema. This file flips them on once the schema is complete. Verified
--    2026-08-11: no fleet instance has deliberately-disabled jobs, so the
--    blanket activate is a no-op re-assertion everywhere it has already run.
-- ============================================================================

DO $fin$
DECLARE
  attempt int := 0;
BEGIN
  -- ── Storage: retry on deadlock — the platform's own storage migrator may
  --    hold conflicting locks; losing a round must not kill the install. ──
  LOOP
    attempt := attempt + 1;
    BEGIN
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('cms-images','cms-images',true,NULL,NULL) ON CONFLICT (id) DO UPDATE SET public=EXCLUDED.public, file_size_limit=EXCLUDED.file_size_limit, allowed_mime_types=EXCLUDED.allowed_mime_types;
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('cowork-uploads','cowork-uploads',false,NULL,NULL) ON CONFLICT (id) DO UPDATE SET public=EXCLUDED.public, file_size_limit=EXCLUDED.file_size_limit, allowed_mime_types=EXCLUDED.allowed_mime_types;
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('documents','documents',false,52428800,NULL) ON CONFLICT (id) DO UPDATE SET public=EXCLUDED.public, file_size_limit=EXCLUDED.file_size_limit, allowed_mime_types=EXCLUDED.allowed_mime_types;
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('form-uploads','form-uploads',false,10485760,'{application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg,image/webp,text/plain}'::text[]) ON CONFLICT (id) DO UPDATE SET public=EXCLUDED.public, file_size_limit=EXCLUDED.file_size_limit, allowed_mime_types=EXCLUDED.allowed_mime_types;
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('river-media','river-media',true,NULL,NULL) ON CONFLICT (id) DO UPDATE SET public=EXCLUDED.public, file_size_limit=EXCLUDED.file_size_limit, allowed_mime_types=EXCLUDED.allowed_mime_types;
      
      -- Superseded legacy names: 20260808100000 granted every authenticated
      -- user SELECT/UPDATE on the whole documents bucket; 20260808170000
      -- replaced them with the visibility-following policies below. Both files
      -- are no-ops now, so an instance that applied the first but not the
      -- second would keep the permissive pair forever — and permissive
      -- policies OR together, which reopens the leak. Drop them by name.
      DROP POLICY IF EXISTS "Authenticated users can view documents" ON storage.objects;
      DROP POLICY IF EXISTS "Authenticated users can update documents" ON storage.objects;

      DROP POLICY IF EXISTS "Admins can delete documents" ON storage.objects;
      CREATE POLICY "Admins can delete documents" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'documents'::text) AND has_role(auth.uid(), 'admin'::app_role)));
      DROP POLICY IF EXISTS "Anyone can view cms images" ON storage.objects;
      CREATE POLICY "Anyone can view cms images" ON storage.objects FOR SELECT TO public USING ((bucket_id = 'cms-images'::text));
      DROP POLICY IF EXISTS "Authenticated users can delete images" ON storage.objects;
      CREATE POLICY "Authenticated users can delete images" ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'cms-images'::text));
      DROP POLICY IF EXISTS "Authenticated users can update images" ON storage.objects;
      CREATE POLICY "Authenticated users can update images" ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'cms-images'::text));
      DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
      CREATE POLICY "Authenticated users can upload documents" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'documents'::text));
      DROP POLICY IF EXISTS "Authenticated users can upload images" ON storage.objects;
      CREATE POLICY "Authenticated users can upload images" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'cms-images'::text));
      DROP POLICY IF EXISTS "Document files follow their document's visibility" ON storage.objects;
      CREATE POLICY "Document files follow their document's visibility" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'documents'::text) AND (has_role(auth.uid(), 'admin'::app_role) OR ((storage.foldername(name))[1] = (auth.uid())::text) OR (EXISTS ( SELECT 1
         FROM documents d
        WHERE (d.file_url = objects.name))))));
      DROP POLICY IF EXISTS "Uploaders and admins can overwrite document files" ON storage.objects;
      CREATE POLICY "Uploaders and admins can overwrite document files" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'documents'::text) AND (has_role(auth.uid(), 'admin'::app_role) OR ((storage.foldername(name))[1] = (auth.uid())::text) OR (EXISTS ( SELECT 1
         FROM documents d
        WHERE ((d.file_url = objects.name) AND (d.uploaded_by = auth.uid())))))));
      DROP POLICY IF EXISTS "cowork own delete" ON storage.objects;
      CREATE POLICY "cowork own delete" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'cowork-uploads'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
      DROP POLICY IF EXISTS "cowork own read" ON storage.objects;
      CREATE POLICY "cowork own read" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'cowork-uploads'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
      DROP POLICY IF EXISTS "cowork own upload" ON storage.objects;
      CREATE POLICY "cowork own upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'cowork-uploads'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
      DROP POLICY IF EXISTS "form-uploads admin delete" ON storage.objects;
      CREATE POLICY "form-uploads admin delete" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'form-uploads'::text) AND has_role(auth.uid(), 'admin'::app_role)));
      DROP POLICY IF EXISTS "form-uploads admin read" ON storage.objects;
      CREATE POLICY "form-uploads admin read" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'form-uploads'::text) AND has_role(auth.uid(), 'admin'::app_role)));
      DROP POLICY IF EXISTS "form-uploads insert" ON storage.objects;
      CREATE POLICY "form-uploads insert" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK ((bucket_id = 'form-uploads'::text));
      DROP POLICY IF EXISTS "river-media authed upload" ON storage.objects;
      CREATE POLICY "river-media authed upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'river-media'::text));
      DROP POLICY IF EXISTS "river-media owner delete" ON storage.objects;
      CREATE POLICY "river-media owner delete" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'river-media'::text) AND (owner = auth.uid())));
      DROP POLICY IF EXISTS "river-media public read" ON storage.objects;
      CREATE POLICY "river-media public read" ON storage.objects FOR SELECT TO public USING ((bucket_id = 'river-media'::text));
      EXIT;
    EXCEPTION WHEN deadlock_detected THEN
      IF attempt >= 5 THEN RAISE; END IF;
      RAISE NOTICE 'Storage bootstrap hit a deadlock (attempt %); retrying…', attempt;
      PERFORM pg_sleep(attempt * 2);
    END;
  END LOOP;

  -- ── Crons: the schema is complete — let the instance start breathing. ──
  IF to_regclass('cron.job') IS NOT NULL THEN
    -- cron.alter_job, not UPDATE — fresh (PG17) projects give postgres no
    -- table UPDATE on cron.job; the pg_cron API is the portable path.
    DECLARE r record; BEGIN
      FOR r IN SELECT jobid FROM cron.job LOOP
        PERFORM cron.alter_job(r.jobid, active => true);
      END LOOP;
    END;
    RAISE NOTICE 'Fresh-install finalizer: % cron job(s) activated.', (SELECT count(*) FROM cron.job);
  END IF;
  RAISE NOTICE 'Fresh-install finalizer complete: % bucket(s), % storage policies.',
    (SELECT count(*) FROM storage.buckets),
    (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects');
END $fin$;
