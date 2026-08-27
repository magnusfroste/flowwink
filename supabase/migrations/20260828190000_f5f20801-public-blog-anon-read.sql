-- Publik blogg för anon — fresh-install-klassen (Restagård 2026-08-27).
-- Besökarfrågan embeddar author:profiles + kategorier/taggar. På en färsk
-- instans saknar anon både grant på profiles och SELECT-policyer på
-- taxonomitabellerna → PostgREST 401:ar HELA frågan och publika bloggen
-- visar "No posts yet" trots publicerade inlägg. Äldre instanser har i
-- stället en BRED profiles-grant (e-post läsbar för anon) — båda felen
-- normaliseras här till samma sluttillstånd:
--   profiles: anon läser ENDAST id/full_name/avatar_url/bio/title/
--   show_as_author, och bara rader med show_as_author = true.
--   Taxonomin (kategorier/taggar/kopplingar): öppen läsning — publik metadata.
-- Frontend är samtidigt ändrad att aldrig BE om e-post på publika vägar
-- (kolumnbegränsad grant 401:ar annars frågor som begär fel kolumner).

REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (id, full_name, avatar_url, bio, title, show_as_author)
  ON public.profiles TO anon;

DROP POLICY IF EXISTS "Public can view author profiles" ON public.profiles;
CREATE POLICY "Public can view author profiles" ON public.profiles
  FOR SELECT TO anon USING (show_as_author = true);

DROP POLICY IF EXISTS "Public can view blog categories" ON public.blog_categories;
CREATE POLICY "Public can view blog categories" ON public.blog_categories
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Public can view blog tags" ON public.blog_tags;
CREATE POLICY "Public can view blog tags" ON public.blog_tags
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Public can view blog post categories" ON public.blog_post_categories;
CREATE POLICY "Public can view blog post categories" ON public.blog_post_categories
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Public can view blog post tags" ON public.blog_post_tags;
CREATE POLICY "Public can view blog post tags" ON public.blog_post_tags
  FOR SELECT TO anon USING (true);
