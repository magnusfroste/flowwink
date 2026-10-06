-- Prestationen får en agentyta — och chefen får se sina 1:1.
--
-- performance_goals, one_on_ones och performance_reviews har funnits sedan juli
-- med en adminpanel (PerformancePanel) och stod som "done" i paritetsfilen. Men
-- ingen skill fanns: agenten kunde varken sätta ett mål, boka ett 1:1 eller
-- skriva ett utvecklingssamtal, och processbatteriet körde aldrig lagret.
-- hire-to-retire-dokumentet sa ärligt "❌ Performance management". Dubbelytelagen
-- (UI + skill för varje förmåga) var bruten.
--
--   1. manage_performance(p_action, …): mål (create/update/list), 1:1 (schedule/
--      complete/list), utvecklingssamtal (start/submit/acknowledge/list) — samma
--      tabeller som panelen, gatade på HR-modulen (service_role för agenten).
--   2. org_chart(p_employee_id): chefskedjan uppåt och rapporterna nedåt ur
--      employees.manager_id, med öppna mål, nästa 1:1 och senaste samtal per person.
--   3. RLS-rättning: policyn på one_on_ones jämförde e.id = e.manager_id —
--      medarbetarraden med sig själv — så en chef såg inte sina 1:1 utan
--      admin-roll. Nu one_on_ones.manager_id — och HR-modulens roller (matrisen), inte
--      en handrullad admin-check, ser allas 1:1 som panelen förutsätter.

-- 3 ────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Participants manage 1:1s" ON public.one_on_ones;
CREATE POLICY "Participants manage 1:1s" ON public.one_on_ones
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM employees e WHERE (e.id = one_on_ones.employee_id OR e.id = one_on_ones.manager_id) AND e.user_id = auth.uid())
         OR can_access_module(auth.uid(), 'hr'))
  WITH CHECK (EXISTS (SELECT 1 FROM employees e WHERE (e.id = one_on_ones.employee_id OR e.id = one_on_ones.manager_id) AND e.user_id = auth.uid())
         OR can_access_module(auth.uid(), 'hr'));
DROP POLICY IF EXISTS "Participants see 1:1s" ON public.one_on_ones;
CREATE POLICY "Participants see 1:1s" ON public.one_on_ones
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM employees e WHERE (e.id = one_on_ones.employee_id OR e.id = one_on_ones.manager_id) AND e.user_id = auth.uid())
         OR can_access_module(auth.uid(), 'hr'));

-- 1 ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.manage_performance(
  p_action text,
  p_employee_id uuid DEFAULT NULL,
  p_goal_id uuid DEFAULT NULL,
  p_one_on_one_id uuid DEFAULT NULL,
  p_review_id uuid DEFAULT NULL,
  p_manager_id uuid DEFAULT NULL,
  p_reviewer_id uuid DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_target_date date DEFAULT NULL,
  p_weight integer DEFAULT NULL,
  p_progress_pct integer DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_scheduled_at timestamptz DEFAULT NULL,
  p_duration_minutes integer DEFAULT NULL,
  p_agenda text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_action_items jsonb DEFAULT NULL,
  p_employee_mood text DEFAULT NULL,
  p_period_start date DEFAULT NULL,
  p_period_end date DEFAULT NULL,
  p_period_type text DEFAULT NULL,
  p_overall_rating integer DEFAULT NULL,
  p_achievements text DEFAULT NULL,
  p_areas_of_improvement text DEFAULT NULL,
  p_goals_next_period text DEFAULT NULL,
  p_manager_comments text DEFAULT NULL,
  p_employee_comments text DEFAULT NULL,
  p_salary_adjustment_pct numeric DEFAULT NULL,
  p_promotion_recommended boolean DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid; v_out jsonb; v_status text; v_manager uuid;
BEGIN
  IF p_action NOT IN ('create_goal','update_goal','list_goals',
                      'schedule_one_on_one','complete_one_on_one','list_one_on_ones',
                      'start_review','submit_review','acknowledge_review','list_reviews') THEN
    RAISE EXCEPTION 'action must be one of create_goal, update_goal, list_goals, schedule_one_on_one, complete_one_on_one, list_one_on_ones, start_review, submit_review, acknowledge_review, list_reviews';
  END IF;
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'hr')) THEN
    RAISE EXCEPTION 'Requires the HR module — an admin can grant it under Users → Role Permissions';
  END IF;
  IF p_action IN ('create_goal','list_goals','schedule_one_on_one','list_one_on_ones','start_review','list_reviews') THEN
    IF p_employee_id IS NULL THEN RAISE EXCEPTION 'employee_id is required (manage_employee action:list)'; END IF;
    IF NOT EXISTS (SELECT 1 FROM employees WHERE id = p_employee_id) THEN RAISE EXCEPTION 'employee % not found', p_employee_id; END IF;
  END IF;

  -- ── Goals ────────────────────────────────────────────────────────────────
  IF p_action = 'create_goal' THEN
    IF NULLIF(trim(COALESCE(p_title, '')), '') IS NULL THEN RAISE EXCEPTION 'title is required'; END IF;
    INSERT INTO performance_goals (employee_id, title, description, category, target_date, weight, created_by)
    VALUES (p_employee_id, trim(p_title), p_description, COALESCE(p_category, 'professional'), p_target_date, COALESCE(p_weight, 1), auth.uid())
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'goal_id', v_id, 'status', 'active');

  ELSIF p_action = 'update_goal' THEN
    IF p_goal_id IS NULL THEN RAISE EXCEPTION 'goal_id is required'; END IF;
    IF p_status IS NOT NULL AND p_status NOT IN ('active', 'completed', 'cancelled') THEN
      RAISE EXCEPTION 'status must be active, completed or cancelled';
    END IF;
    UPDATE performance_goals
       SET title = COALESCE(NULLIF(trim(p_title), ''), title),
           description = COALESCE(p_description, description),
           category = COALESCE(p_category, category),
           target_date = COALESCE(p_target_date, target_date),
           weight = COALESCE(p_weight, weight),
           progress_pct = COALESCE(p_progress_pct, progress_pct),
           -- 100 % is done unless the caller says otherwise.
           status = COALESCE(p_status, CASE WHEN COALESCE(p_progress_pct, progress_pct) >= 100 THEN 'completed' ELSE status END),
           updated_at = now()
     WHERE id = p_goal_id
     RETURNING status INTO v_status;
    IF NOT FOUND THEN RAISE EXCEPTION 'goal_not_found'; END IF;
    RETURN jsonb_build_object('success', true, 'goal_id', p_goal_id, 'status', v_status);

  ELSIF p_action = 'list_goals' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(g) ORDER BY g.status = 'active' DESC, g.target_date NULLS LAST, g.created_at), '[]'::jsonb) INTO v_out
      FROM (SELECT * FROM performance_goals WHERE employee_id = p_employee_id AND (p_status IS NULL OR status = p_status)
             LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)) g;
    RETURN jsonb_build_object('goals', v_out);

  -- ── 1:1 ──────────────────────────────────────────────────────────────────
  ELSIF p_action = 'schedule_one_on_one' THEN
    IF p_scheduled_at IS NULL THEN RAISE EXCEPTION 'scheduled_at is required (ISO time with offset)'; END IF;
    v_manager := COALESCE(p_manager_id, (SELECT manager_id FROM employees WHERE id = p_employee_id));
    IF v_manager IS NULL THEN RAISE EXCEPTION 'The employee has no manager — pass manager_id or set manager_id with manage_employee'; END IF;
    IF v_manager = p_employee_id THEN RAISE EXCEPTION 'a 1:1 needs two people'; END IF;
    INSERT INTO one_on_ones (employee_id, manager_id, scheduled_at, duration_minutes, agenda, created_by)
    VALUES (p_employee_id, v_manager, p_scheduled_at, COALESCE(p_duration_minutes, 30), p_agenda, auth.uid())
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'one_on_one_id', v_id, 'manager_id', v_manager, 'status', 'scheduled');

  ELSIF p_action = 'complete_one_on_one' THEN
    IF p_one_on_one_id IS NULL THEN RAISE EXCEPTION 'one_on_one_id is required'; END IF;
    IF p_action_items IS NOT NULL AND jsonb_typeof(p_action_items) <> 'array' THEN RAISE EXCEPTION 'action_items must be an array of {text, owner?, due?}'; END IF;
    UPDATE one_on_ones
       SET status = 'completed', completed_at = COALESCE(completed_at, now()),
           notes = COALESCE(p_notes, notes), action_items = COALESCE(p_action_items, action_items),
           employee_mood = COALESCE(p_employee_mood, employee_mood), updated_at = now()
     WHERE id = p_one_on_one_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'one_on_one_not_found'; END IF;
    RETURN jsonb_build_object('success', true, 'one_on_one_id', p_one_on_one_id, 'status', 'completed');

  ELSIF p_action = 'list_one_on_ones' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(o) ORDER BY o.scheduled_at DESC), '[]'::jsonb) INTO v_out
      FROM (SELECT * FROM one_on_ones WHERE employee_id = p_employee_id AND (p_status IS NULL OR status = p_status)
             LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)) o;
    RETURN jsonb_build_object('one_on_ones', v_out);

  -- ── Reviews ──────────────────────────────────────────────────────────────
  ELSIF p_action = 'start_review' THEN
    IF p_period_start IS NULL OR p_period_end IS NULL THEN RAISE EXCEPTION 'period_start and period_end are required'; END IF;
    IF p_period_end < p_period_start THEN RAISE EXCEPTION 'period_end is before period_start'; END IF;
    IF p_period_type IS NOT NULL AND p_period_type NOT IN ('annual', 'quarterly', 'probation', 'ad_hoc') THEN
      RAISE EXCEPTION 'period_type must be annual, quarterly, probation or ad_hoc';
    END IF;
    INSERT INTO performance_reviews (employee_id, reviewer_id, period_start, period_end, period_type)
    VALUES (p_employee_id, COALESCE(p_reviewer_id, (SELECT manager_id FROM employees WHERE id = p_employee_id)), p_period_start, p_period_end, COALESCE(p_period_type, 'annual'))
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'review_id', v_id, 'status', 'draft');

  ELSIF p_action = 'submit_review' THEN
    IF p_review_id IS NULL THEN RAISE EXCEPTION 'review_id is required'; END IF;
    IF p_overall_rating IS NULL OR p_overall_rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'overall_rating 1–5 is required'; END IF;
    SELECT status INTO v_status FROM performance_reviews WHERE id = p_review_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'review_not_found'; END IF;
    IF v_status <> 'draft' THEN RAISE EXCEPTION 'Only a draft review can be submitted (it is %)', v_status; END IF;
    UPDATE performance_reviews
       SET overall_rating = p_overall_rating, achievements = COALESCE(p_achievements, achievements),
           areas_of_improvement = COALESCE(p_areas_of_improvement, areas_of_improvement),
           goals_next_period = COALESCE(p_goals_next_period, goals_next_period),
           manager_comments = COALESCE(p_manager_comments, manager_comments),
           salary_adjustment_pct = COALESCE(p_salary_adjustment_pct, salary_adjustment_pct),
           promotion_recommended = COALESCE(p_promotion_recommended, promotion_recommended),
           status = 'completed', updated_at = now()
     WHERE id = p_review_id;
    RETURN jsonb_build_object('success', true, 'review_id', p_review_id, 'status', 'completed');

  ELSIF p_action = 'acknowledge_review' THEN
    IF p_review_id IS NULL THEN RAISE EXCEPTION 'review_id is required'; END IF;
    SELECT status INTO v_status FROM performance_reviews WHERE id = p_review_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'review_not_found'; END IF;
    IF v_status <> 'completed' THEN RAISE EXCEPTION 'Only a completed review can be acknowledged (it is %)', v_status; END IF;
    UPDATE performance_reviews
       SET status = 'acknowledged', acknowledged_at = now(), employee_comments = COALESCE(p_employee_comments, employee_comments), updated_at = now()
     WHERE id = p_review_id;
    RETURN jsonb_build_object('success', true, 'review_id', p_review_id, 'status', 'acknowledged');

  ELSE -- list_reviews
    SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.period_end DESC), '[]'::jsonb) INTO v_out
      FROM (SELECT * FROM performance_reviews WHERE employee_id = p_employee_id AND (p_status IS NULL OR status = p_status)
             LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)) r;
    RETURN jsonb_build_object('reviews', v_out);
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.manage_performance(text, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, date, integer, integer, text, timestamptz, integer, text, text, jsonb, text, date, date, text, integer, text, text, text, text, text, numeric, boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_performance(text, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, date, integer, integer, text, timestamptz, integer, text, text, jsonb, text, date, date, text, integer, text, text, text, text, text, numeric, boolean, integer) TO authenticated, service_role;

-- 2 ────────────────────────────────────────────────────────────────────────
-- The reporting structure from one person's seat: the chain of managers above,
-- the people who report to them below (recursively), and for each what is open.
CREATE OR REPLACE FUNCTION public.org_chart(p_employee_id uuid DEFAULT NULL, p_depth integer DEFAULT 3)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH RECURSIVE
  gate AS (SELECT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'hr')) AS ok),
  roots AS (
    SELECT e.id FROM employees e
     WHERE (SELECT ok FROM gate)
       AND ((p_employee_id IS NOT NULL AND e.id = p_employee_id)
         OR (p_employee_id IS NULL AND e.manager_id IS NULL AND e.status = 'active'))
  ),
  down AS (
    SELECT e.id, e.manager_id, 0 AS depth FROM employees e WHERE e.id IN (SELECT id FROM roots)
    UNION ALL
    SELECT e.id, e.manager_id, d.depth + 1 FROM employees e JOIN down d ON e.manager_id = d.id
     WHERE d.depth < LEAST(GREATEST(COALESCE(p_depth, 3), 1), 10) AND e.status = 'active'
  ),
  up AS (
    SELECT e.id, e.manager_id, 0 AS depth FROM employees e WHERE p_employee_id IS NOT NULL AND e.id = p_employee_id
    UNION ALL
    SELECT m.id, m.manager_id, u.depth + 1 FROM employees m JOIN up u ON m.id = u.manager_id WHERE u.depth < 10
  ),
  person AS (
    SELECT e.id, e.name, e.title, e.department, e.manager_id, e.status,
           (SELECT count(*) FROM performance_goals g WHERE g.employee_id = e.id AND g.status = 'active') AS open_goals,
           (SELECT min(o.scheduled_at) FROM one_on_ones o WHERE o.employee_id = e.id AND o.status = 'scheduled' AND o.scheduled_at >= now()) AS next_one_on_one,
           (SELECT max(r.period_end) FROM performance_reviews r WHERE r.employee_id = e.id AND r.status IN ('completed', 'acknowledged')) AS last_review_period_end,
           (SELECT count(*) FROM employees x WHERE x.manager_id = e.id AND x.status = 'active') AS direct_reports
      FROM employees e
  )
  SELECT CASE WHEN NOT (SELECT ok FROM gate) THEN jsonb_build_object('error', 'Requires the HR module')
  ELSE jsonb_build_object(
    'root', p_employee_id,
    'managers_above', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY u.depth) FROM up u JOIN person p ON p.id = u.id WHERE u.depth > 0), '[]'::jsonb),
    'tree', COALESCE((SELECT jsonb_agg(to_jsonb(p) || jsonb_build_object('depth', d.depth) ORDER BY d.depth, p.name) FROM down d JOIN person p ON p.id = d.id), '[]'::jsonb))
  END;
$$;
REVOKE ALL ON FUNCTION public.org_chart(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_chart(uuid, integer) TO authenticated, service_role;
