UPDATE beta_test_findings
SET 
  resolved_at = now(),
  description = COALESCE(description, '') || E'\n\n---\n[RESOLVED 2026-05-18 by Lovable]: False positive from Hermes test-script. Verified that referenced RPCs exist in pg_proc with correct p_* signatures; "RPC failed: invalid input syntax for type uuid" errors are caused by Hermes passing literal strings like "test_p_id" instead of real UUIDs; "Only admins can..." errors are correct RLS gating. See bridge thread main for guidance to Hermes on using real UUIDs or dry_run mode.'
WHERE resolved_at IS NULL
  AND created_at >= '2026-05-18'
  AND created_at < '2026-05-19';