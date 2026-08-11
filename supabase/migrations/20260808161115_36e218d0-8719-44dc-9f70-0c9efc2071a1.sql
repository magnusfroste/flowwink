ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'shared',
  ADD COLUMN IF NOT EXISTS visible_to_role public.app_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_visibility_check') THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_visibility_check
      CHECK (visibility IN ('shared', 'role', 'private'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_role_requires_role') THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_role_requires_role
      CHECK (visibility <> 'role' OR visible_to_role IS NOT NULL);
  END IF;
END $$;

COMMENT ON COLUMN public.documents.visibility IS
  'shared (default, every authenticated user) | role (only visible_to_role, plus the uploader) | private (uploader only). Admin always sees everything.';
COMMENT ON COLUMN public.documents.visible_to_role IS
  'Required when visibility = ''role''.';

CREATE INDEX IF NOT EXISTS documents_visibility_idx
  ON public.documents (visibility)
  WHERE visibility <> 'shared';

DROP POLICY IF EXISTS "Authenticated users can view documents" ON public.documents;
DROP POLICY IF EXISTS "Cowork uploaders can view their own documents" ON public.documents;
DROP POLICY IF EXISTS "Documents are visible per their visibility setting" ON public.documents;
CREATE POLICY "Documents are visible per their visibility setting"
  ON public.documents FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR visibility = 'shared'
    OR (visibility = 'role' AND (
          public.has_role(auth.uid(), visible_to_role)
          OR uploaded_by = auth.uid()
        ))
    OR (visibility = 'private' AND uploaded_by = auth.uid())
  );

DROP POLICY IF EXISTS "Uploaders can reclassify their own documents" ON public.documents;
CREATE POLICY "Uploaders can reclassify their own documents"
  ON public.documents FOR UPDATE
  USING (uploaded_by = auth.uid())
  WITH CHECK (uploaded_by = auth.uid());

-- HISTORY: the two storage.objects policies that mirrored the table's
-- visibility ("Document files follow their document's visibility" SELECT +
-- "Uploaders and admins can overwrite document files" UPDATE) used to be
-- created here inline. All storage DDL now lives ONLY in the always-last
-- fresh-install finalizer (99999999999999_fresh-install-finalizer.sql) —
-- mid-stream storage.* DDL deadlocks against the storage service's own
-- migrator on fresh projects (SQLSTATE 40P01, observed live 2026-08-10).

CREATE OR REPLACE FUNCTION public.list_flowtable_tables(p_base_id uuid DEFAULT NULL, p_base_slug text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_base_id uuid;
BEGIN
  v_base_id := coalesce(p_base_id, (SELECT id FROM flowtable_bases WHERE slug = p_base_slug LIMIT 1));
  IF v_base_id IS NULL THEN RAISE EXCEPTION 'Provide p_base_id or a valid p_base_slug'; END IF;
  RETURN jsonb_build_object('base_id', v_base_id, 'tables', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'table_id', t.id, 'name', t.name, 'slug', t.slug,
      'record_count', (SELECT count(*) FROM flowtable_records r WHERE r.table_id = t.id),
      'fields', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object('key', f.key, 'name', f.name, 'type', f.type)
          || CASE WHEN coalesce(f.options, '{}'::jsonb) <> '{}'::jsonb
                  THEN jsonb_build_object('options', f.options)
                  ELSE '{}'::jsonb END
          ORDER BY f.position)
        FROM flowtable_fields f WHERE f.table_id = t.id), '[]'::jsonb)
    ) ORDER BY t.position)
    FROM flowtable_tables t WHERE t.base_id = v_base_id), '[]'::jsonb));
END; $$;

DROP POLICY IF EXISTS "Customers read own subscriptions" ON public.subscriptions;
CREATE POLICY "Customers read own subscriptions" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (
    is_staff(auth.uid())
    OR lower(customer_email) = lower(auth.jwt() ->> 'email')
  );

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS billing_interval text,
  ADD COLUMN IF NOT EXISTS default_term_months integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_billing_interval_chk') THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_billing_interval_chk
      CHECK (billing_interval IS NULL OR billing_interval IN ('month', 'year'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_default_term_months_chk') THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_default_term_months_chk
      CHECK (default_term_months IS NULL OR default_term_months > 0);
  END IF;
END $$;

UPDATE public.products
SET billing_interval = 'month'
WHERE type = 'recurring' AND billing_interval IS NULL;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS default_term_months integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotes_default_term_months_chk') THEN
    ALTER TABLE public.quotes
      ADD CONSTRAINT quotes_default_term_months_chk
      CHECK (default_term_months IS NULL OR default_term_months > 0);
  END IF;
END $$;