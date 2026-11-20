-- A page measured at the widths people read it in (#940).
--
-- The static page sensor (inspect_rendered_page) says which fields render. It
-- cannot say what overflows or is cut off on a phone: that takes a browser,
-- and the edge runtime has none. The page editor has one — the browser of the
-- person at the keyboard. They press "Check widths", the page is drawn at
-- 390, 768 and 1280 px, measured, and the measurement is kept here, where an
-- agent reads it through inspect_rendered_page.
--
-- Its own table, not a column on pages: recording a measurement must not look
-- like an edit of the page (updated_at, versions, translations going stale).
--
-- Idempotent: IF NOT EXISTS / CREATE OR REPLACE / DROP … IF EXISTS.

CREATE TABLE IF NOT EXISTS public.page_width_checks (
  page_id uuid PRIMARY KEY REFERENCES public.pages(id) ON DELETE CASCADE,
  checked_at timestamptz NOT NULL DEFAULT now(),
  checked_by uuid,
  -- Whether what was measured is what was saved (an unsaved draft is measured too).
  saved boolean NOT NULL DEFAULT true,
  -- [{ width, overflow_px, wider_than_screen: [{ block, tag, text, over_px }], cut_off: [{ block, tag, text }], squeezed: [...] }]
  widths jsonb NOT NULL DEFAULT '[]'::jsonb
);

COMMENT ON TABLE public.page_width_checks IS
  'The latest width measurement of a page, taken in an editor''s browser (#940). Read by inspect_rendered_page.';

ALTER TABLE public.page_width_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Page editors read width checks" ON public.page_width_checks;
CREATE POLICY "Page editors read width checks" ON public.page_width_checks
  FOR SELECT TO authenticated
  USING (public.can_access_module(auth.uid(), 'pages'));

REVOKE ALL ON TABLE public.page_width_checks FROM anon;
GRANT SELECT ON TABLE public.page_width_checks TO authenticated;
GRANT ALL ON TABLE public.page_width_checks TO service_role;

CREATE OR REPLACE FUNCTION public.record_page_width_check(p_page_id uuid, p_widths jsonb, p_saved boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_clean jsonb := '[]'::jsonb;
  v_item jsonb;
  v_width int;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'pages')) THEN
    RAISE EXCEPTION 'Recording a width check needs access to Pages' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pages WHERE id = p_page_id AND deleted_at IS NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Page not found');
  END IF;
  IF jsonb_typeof(p_widths) IS DISTINCT FROM 'array' OR jsonb_array_length(p_widths) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'p_widths must be a non-empty array of measurements');
  END IF;
  -- A measurement comes from a browser: keep its shape, cap its size.
  IF length(p_widths::text) > 40000 OR jsonb_array_length(p_widths) > 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'The measurement is larger than a width check can be');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_widths) LOOP
    IF jsonb_typeof(v_item -> 'width') IS DISTINCT FROM 'number' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Every measurement needs a numeric width');
    END IF;
    v_width := (v_item ->> 'width')::numeric::int;
    IF v_width < 240 OR v_width > 4000 THEN
      RETURN jsonb_build_object('success', false, 'error', 'A width is between 240 and 4000 px');
    END IF;
    v_clean := v_clean || jsonb_build_array(jsonb_build_object(
      'width', v_width,
      'overflow_px', GREATEST(0, COALESCE((v_item ->> 'overflow_px')::numeric::int, 0)),
      'wider_than_screen', CASE WHEN jsonb_typeof(v_item -> 'wider_than_screen') = 'array' THEN v_item -> 'wider_than_screen' ELSE '[]'::jsonb END,
      'cut_off', CASE WHEN jsonb_typeof(v_item -> 'cut_off') = 'array' THEN v_item -> 'cut_off' ELSE '[]'::jsonb END,
      'squeezed', CASE WHEN jsonb_typeof(v_item -> 'squeezed') = 'array' THEN v_item -> 'squeezed' ELSE '[]'::jsonb END
    ));
  END LOOP;

  INSERT INTO public.page_width_checks (page_id, checked_at, checked_by, saved, widths)
    VALUES (p_page_id, now(), auth.uid(), COALESCE(p_saved, true), v_clean)
  ON CONFLICT (page_id) DO UPDATE
    SET checked_at = EXCLUDED.checked_at, checked_by = EXCLUDED.checked_by,
        saved = EXCLUDED.saved, widths = EXCLUDED.widths;
  RETURN jsonb_build_object('success', true, 'page_id', p_page_id, 'widths', jsonb_array_length(v_clean));
END $fn$;

REVOKE ALL ON FUNCTION public.record_page_width_check(uuid, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_page_width_check(uuid, jsonb, boolean) TO authenticated, service_role;
