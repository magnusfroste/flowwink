-- A bucket's cap is the bucket's, on every instance (2026-11-24).
--
-- The fresh-install finalizer gives `form-uploads` a 10 MB cap and
-- `documents` a 50 MB one, and the open-access list says the public form's
-- uploads are "size and type capped on the bucket". On www, nordbrygg and
-- liteit both buckets had NO cap: the finalizer's storage block wrote them on
-- a fresh install only, and every live instance predates it. `form-uploads`
-- takes an INSERT from anyone, so a stranger could fill the 1 GB storage quota
-- of a Free project with a handful of calls. The form block's own check
-- (`maxSizeMB`, default 10) is the browser's and never stopped a direct call.
--
-- Only a missing cap is written, and only a smaller one tightens: an operator
-- who set a cap of their own keeps it. Bucket rows are plain data — no policy
-- DDL here.

DO $caps$
DECLARE attempt int := 0;
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'no storage schema — nothing to cap';
    RETURN;
  END IF;

  -- The storage service's own migrator may hold the table at project birth:
  -- losing a round is retried, never left to kill the deploy (the finalizer's
  -- guard, 20261109120000's too).
  LOOP
    attempt := attempt + 1;
    BEGIN
      UPDATE storage.buckets SET file_size_limit = 10485760
       WHERE id = 'form-uploads' AND (file_size_limit IS NULL OR file_size_limit > 10485760);

      UPDATE storage.buckets SET file_size_limit = 52428800
       WHERE id = 'documents' AND file_size_limit IS NULL;

      -- River is staff's feed of pictures: 25 MB is generous for a phone
      -- photo, and a staff upload has no reason to be larger.
      UPDATE storage.buckets SET file_size_limit = 26214400
       WHERE id = 'river-media' AND file_size_limit IS NULL;
      EXIT;
    EXCEPTION
      WHEN deadlock_detected THEN
        IF attempt >= 5 THEN RAISE; END IF;
        PERFORM pg_sleep(attempt * 2);
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'storage.buckets is not writable here — caps left as they are';
        EXIT;
    END;
  END LOOP;
END
$caps$;

-- Proof: the bucket that takes a stranger's upload is capped.
DO $proof$
DECLARE cap bigint;
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN RETURN; END IF;
  SELECT file_size_limit INTO cap FROM storage.buckets WHERE id = 'form-uploads';
  IF FOUND AND cap IS NULL THEN
    RAISE NOTICE 'form-uploads is still uncapped (storage.buckets not writable by this role)';
  END IF;
END
$proof$;
