-- Retrieval Engine rung-boundary leak smoke (docs/architecture/retrieval-engine.md §6).
-- Proves "retrieval runs with the caller's eyes" LIVE: an anon caller must
-- never retrieve an 'internal' chunk via search_knowledge_chunks or the
-- table; a staff-role caller must. Run against any instance:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/smoke/retrieval-leak.sql
-- Self-cleaning: everything happens inside a rolled-back transaction.
-- Prefix: SMOKE-RET. Expect: every result line starts with PASS.

\set QUIET on
\pset pager off

BEGIN;

-- Fixture: one public and one internal chunk with a distinctive token.
INSERT INTO public.knowledge_chunks
  (source_table, entity_id, chunk_index, title, content, visibility, content_hash)
VALUES
  ('kb_articles', '00000000-0000-0000-0000-00000000aaaa', 0,
   'SMOKE-RET public article', 'The zebraquantum refund policy is public knowledge.', 'public', 'smoke-a'),
  ('wiki_pages', 'smoke-ret-secret', 0,
   'SMOKE-RET secret runbook', 'The zebraquantum vault code is internal only.', 'internal', 'smoke-b');

-- Staff fixture: a user with the employee role (auth.uid() reads jwt sub).
INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-0000-0000-00000000beef', 'smoke-ret@test.local')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
VALUES ('00000000-0000-0000-0000-00000000beef', 'employee')
ON CONFLICT DO NOTHING;

-- ── 1. ANON: RPC must return ONLY the public chunk ───────────────────────────
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);

SELECT CASE
  WHEN count(*) FILTER (WHERE visibility_check.source_table = 'wiki_pages') = 0
   AND count(*) FILTER (WHERE visibility_check.source_table = 'kb_articles') = 1
  THEN 'PASS anon RPC sees only the public chunk'
  ELSE 'FAIL ANON LEAK: ' || count(*) FILTER (WHERE visibility_check.source_table = 'wiki_pages')
       || ' internal chunk(s) visible to anon'
END
FROM public.search_knowledge_chunks('zebraquantum') AS visibility_check
WHERE visibility_check.title LIKE 'SMOKE-RET%';

-- ── 2. ANON: direct table read must also exclude internal ────────────────────
SELECT CASE
  WHEN count(*) = 0 THEN 'PASS anon table read excludes internal chunks'
  ELSE 'FAIL ANON TABLE LEAK: ' || count(*) || ' internal row(s)'
END
FROM public.knowledge_chunks
WHERE visibility = 'internal' AND title LIKE 'SMOKE-RET%';

RESET ROLE;

-- ── 3. STAFF (employee): RPC must include the internal chunk ─────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000beef","role":"authenticated"}', true);

SELECT CASE
  WHEN count(*) FILTER (WHERE staff_check.source_table = 'wiki_pages') = 1
  THEN 'PASS staff RPC sees the internal chunk'
  ELSE 'FAIL STAFF BLIND: internal chunk not retrievable by employee role'
END
FROM public.search_knowledge_chunks('zebraquantum') AS staff_check
WHERE staff_check.title LIKE 'SMOKE-RET%';

RESET ROLE;

ROLLBACK;
