-- cms-images storage policies (public read, authenticated write/update/delete).
--
-- HISTORY: this migration used to DROP/CREATE the four cms-images policies on
-- storage.objects inline. All storage DDL now lives ONLY in the always-last
-- fresh-install finalizer (99999999999999_fresh-install-finalizer.sql) — a
-- mid-stream migration touching storage.* deadlocks against the storage
-- service's own migrator on fresh projects (SQLSTATE 40P01, observed live).
--
-- Intentionally a no-op.
SELECT 1;
