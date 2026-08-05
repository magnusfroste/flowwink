-- An agent could fill Flowtable but not open it.
--
-- The skill surface covered tables, fields, records and queries — everything
-- INSIDE a base — but creating the base itself was UI-only. OpenClaw, asked to
-- load product data on a fresh instance, hit the gap immediately: zero bases
-- existed and no skill could make one. The horizontal-data story (an agent
-- builds its own working surface) fails at step zero without this.
--
-- create + update only. Delete stays a human decision in the UI: a base is a
-- container for everything in it, and "remove the container" is not something
-- an agent should reach through the same verb that builds one.

CREATE OR REPLACE FUNCTION public.manage_flowtable_base(
  p_action text,
  p_name text DEFAULT NULL,
  p_slug text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_icon text DEFAULT NULL,
  p_color text DEFAULT NULL,
  p_base text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_slug text;
  v_row public.flowtable_bases%ROWTYPE;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can manage Flowtable bases';
  END IF;

  IF p_action = 'create' THEN
    IF p_name IS NULL OR trim(p_name) = '' THEN
      RETURN jsonb_build_object('error', 'p_name is required for create');
    END IF;
    v_slug := COALESCE(NULLIF(trim(p_slug), ''),
      regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g'));
    IF EXISTS (SELECT 1 FROM public.flowtable_bases WHERE slug = v_slug) THEN
      -- Idempotent for agents that retry: return the existing base instead of
      -- a duplicate-key error they would misread as "cannot create bases".
      SELECT * INTO v_row FROM public.flowtable_bases WHERE slug = v_slug;
      RETURN jsonb_build_object('base_id', v_row.id, 'name', v_row.name,
        'slug', v_row.slug, 'already_existed', true);
    END IF;
    INSERT INTO public.flowtable_bases (name, slug, description, icon, color, workspace_shared, owner_id)
    VALUES (trim(p_name), v_slug, NULLIF(trim(p_description), ''),
            COALESCE(NULLIF(trim(p_icon), ''), 'Table'),
            COALESCE(NULLIF(trim(p_color), ''), 'blue'),
            true,  -- agent-created bases are shared: colleagues must see them
            -- owner_id is NOT NULL and the service role has no auth.uid();
            -- an agent-created base belongs to the (first) admin.
            COALESCE(auth.uid(),
                     (SELECT user_id FROM public.user_roles WHERE role = 'admin'
                      ORDER BY created_at LIMIT 1)))
    RETURNING * INTO v_row;
    RETURN jsonb_build_object('base_id', v_row.id, 'name', v_row.name,
      'slug', v_row.slug, 'already_existed', false);

  ELSIF p_action = 'update' THEN
    SELECT * INTO v_row FROM public.flowtable_bases
    WHERE (p_base ~* '^[0-9a-f]{8}-' AND id = p_base::uuid) OR slug = lower(trim(p_base))
    LIMIT 1;
    IF v_row.id IS NULL THEN
      RETURN jsonb_build_object('error', 'Base not found: '||COALESCE(p_base,'(null)')||'. Pass slug or id.');
    END IF;
    UPDATE public.flowtable_bases SET
      name = COALESCE(NULLIF(trim(p_name), ''), name),
      description = COALESCE(NULLIF(trim(p_description), ''), description),
      icon = COALESCE(NULLIF(trim(p_icon), ''), icon),
      color = COALESCE(NULLIF(trim(p_color), ''), color),
      updated_at = now()
    WHERE id = v_row.id
    RETURNING * INTO v_row;
    RETURN jsonb_build_object('base_id', v_row.id, 'name', v_row.name, 'slug', v_row.slug);

  ELSE
    RETURN jsonb_build_object('error', 'Unknown action: '||COALESCE(p_action,'(null)')||'. Use create or update. Deleting a base is UI-only by design.');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.manage_flowtable_base(text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_flowtable_base(text, text, text, text, text, text, text) TO authenticated, service_role;
