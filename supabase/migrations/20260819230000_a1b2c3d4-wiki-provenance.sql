-- Wiki provenance: WHO wrote a page — human (uuid) and/or agent surface (text).
-- Agent writes ran as service role and left created_by/updated_by NULL, so the
-- wiki could not answer "vem skapade detta?" (Magnus-fynd 2026-08-19).
ALTER TABLE public.wiki_pages ADD COLUMN IF NOT EXISTS created_by_agent text;
ALTER TABLE public.wiki_pages ADD COLUMN IF NOT EXISTS updated_by_agent text;
