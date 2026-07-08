
CREATE TABLE IF NOT EXISTS public.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL DEFAULT 'cms-images',
  storage_path text NOT NULL,
  folder text NOT NULL DEFAULT 'pages',
  filename text NOT NULL,
  mime_type text,
  size_bytes bigint,
  width int,
  height int,
  alt_text text,
  variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT media_assets_bucket_path_key UNIQUE (bucket, storage_path)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_assets TO authenticated;
GRANT ALL ON public.media_assets TO service_role;

ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage media assets" ON public.media_assets;
CREATE POLICY "Admins manage media assets"
  ON public.media_assets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS media_assets_folder_idx ON public.media_assets(folder);
CREATE INDEX IF NOT EXISTS media_assets_created_at_idx ON public.media_assets(created_at DESC);

DROP TRIGGER IF EXISTS media_assets_set_updated_at ON public.media_assets;
CREATE TRIGGER media_assets_set_updated_at
  BEFORE UPDATE ON public.media_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.upsert_media_asset(
  p_storage_path text,
  p_folder text DEFAULT NULL,
  p_filename text DEFAULT NULL,
  p_mime_type text DEFAULT NULL,
  p_size_bytes bigint DEFAULT NULL,
  p_width int DEFAULT NULL,
  p_height int DEFAULT NULL,
  p_alt_text text DEFAULT NULL,
  p_variants jsonb DEFAULT NULL,
  p_bucket text DEFAULT 'cms-images'
)
RETURNS public.media_assets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.media_assets;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can upsert media assets';
  END IF;

  INSERT INTO public.media_assets AS m (
    bucket, storage_path, folder, filename, mime_type, size_bytes,
    width, height, alt_text, variants, created_by
  ) VALUES (
    p_bucket, p_storage_path,
    COALESCE(p_folder, split_part(p_storage_path, '/', 1)),
    COALESCE(p_filename, regexp_replace(p_storage_path, '^.*/', '')),
    p_mime_type, p_size_bytes, p_width, p_height, p_alt_text,
    COALESCE(p_variants, '[]'::jsonb),
    auth.uid()
  )
  ON CONFLICT (bucket, storage_path) DO UPDATE SET
    mime_type = COALESCE(EXCLUDED.mime_type, m.mime_type),
    size_bytes = COALESCE(EXCLUDED.size_bytes, m.size_bytes),
    width = COALESCE(EXCLUDED.width, m.width),
    height = COALESCE(EXCLUDED.height, m.height),
    alt_text = COALESCE(EXCLUDED.alt_text, m.alt_text),
    variants = CASE WHEN p_variants IS NULL THEN m.variants ELSE EXCLUDED.variants END,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_media_asset(text, text, text, text, bigint, int, int, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_media_asset(text, text, text, text, bigint, int, int, text, jsonb, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_media_alt_text(
  p_storage_path text, p_alt_text text, p_bucket text DEFAULT 'cms-images'
)
RETURNS public.media_assets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.media_assets;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can set media alt text';
  END IF;

  INSERT INTO public.media_assets (bucket, storage_path, folder, filename, alt_text)
  VALUES (
    p_bucket, p_storage_path,
    split_part(p_storage_path, '/', 1),
    regexp_replace(p_storage_path, '^.*/', ''),
    p_alt_text
  )
  ON CONFLICT (bucket, storage_path) DO UPDATE SET
    alt_text = EXCLUDED.alt_text,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.set_media_alt_text(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_media_alt_text(text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.find_media_usage(p_needle text)
RETURNS TABLE (source_type text, source_id uuid, title text, slug text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT 'page'::text, p.id, p.title, p.slug
  FROM public.pages p
  WHERE p.content_json::text ILIKE '%' || p_needle || '%'

  UNION ALL

  SELECT 'blog_post'::text, b.id, b.title, b.slug
  FROM public.blog_posts b
  WHERE COALESCE(b.content_json::text, '') ILIKE '%' || p_needle || '%'
     OR COALESCE(b.featured_image, '') ILIKE '%' || p_needle || '%'

  UNION ALL

  SELECT 'kb_article'::text, k.id, k.title, k.slug
  FROM public.kb_articles k
  WHERE COALESCE(k.answer_text, '') ILIKE '%' || p_needle || '%'
     OR COALESCE(k.answer_json::text, '') ILIKE '%' || p_needle || '%'

  UNION ALL

  SELECT 'product'::text, pr.id, pr.name, NULL::text
  FROM public.products pr
  WHERE COALESCE(pr.image_url, '') ILIKE '%' || p_needle || '%';
$$;

REVOKE ALL ON FUNCTION public.find_media_usage(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_media_usage(text) TO authenticated, service_role;
