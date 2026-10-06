-- Lönerevisionen gör rekommendationen till lön.
--
-- Lönegrader och band finns (manage_salary_grade), och ett utvecklingssamtal bär
-- salary_adjustment_pct — men ingenting tog rekommendationen vidare. En löneändring
-- var en UPDATE på employees.monthly_salary_cents utan datum, utan skäl och utan
-- historik: ingen kunde svara på "vad tjänade hon i mars" eller "vad kostar årets
-- revision". hire-to-retire-dokumentet sa ärligt "⚠️ Compensation planning …
-- what is missing is a budgeted revision round". Odoo löser det med kontraktsversioner;
-- vi löser det med en runda:
--
--   1. employee_salary_history: varje löneändring får en rad (från, till, %, datum,
--      källa, skäl, vem). En trigger på employees skriver raden när lönen ändras
--      utanför en runda (källa hire/manual), så historiken är komplett även för den
--      som aldrig kör en revision. Medarbetaren läser sin egen historik (portalen).
--   2. compensation_revisions + compensation_revision_lines: en runda har namn,
--      ikraftträdande, budget (% och/eller kr/mån) och ett default-påslag. Raderna
--      skapas för de aktiva anställda i omfånget med nuvarande lön, senaste
--      utvecklingssamtalets rekommendation (om ett finns och inte redan är förbrukat
--      av en tillämpad runda), compa-ratio före/efter mot lönegraden.
--   3. manage_compensation_revision(p_action, …): create → propose/exclude/include →
--      summary → approve (vägrar över budget utan p_force) → apply (vägrar före
--      ikraftträdandet utan p_force; skriver lönen, historiken OCH det gällande
--      anställningsavtalets lön i ett svep). apply_due för automationen, cancel,
--      history per anställd. Gatad på HR-modulen; service_role för agenten.

-- 2 ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.compensation_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  effective_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  budget_pct numeric(5,2),
  budget_cents bigint,
  default_pct numeric(5,2) NOT NULL DEFAULT 0,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  approved_by uuid,
  approved_at timestamptz,
  applied_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
  ALTER TABLE public.compensation_revisions
    ADD CONSTRAINT compensation_revisions_status_check CHECK (status IN ('draft', 'approved', 'applied', 'cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS compensation_revisions_status_effective_idx
  ON public.compensation_revisions (status, effective_date);

-- 1 ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.employee_salary_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  effective_date date NOT NULL DEFAULT current_date,
  previous_cents bigint,
  new_cents bigint NOT NULL,
  change_pct numeric(7,2),
  source text NOT NULL DEFAULT 'manual',
  reason text,
  revision_id uuid REFERENCES public.compensation_revisions(id) ON DELETE SET NULL,
  revision_line_id uuid,
  review_id uuid REFERENCES public.performance_reviews(id) ON DELETE SET NULL,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
  ALTER TABLE public.employee_salary_history
    ADD CONSTRAINT employee_salary_history_source_check CHECK (source IN ('hire', 'manual', 'revision'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS employee_salary_history_employee_idx
  ON public.employee_salary_history (employee_id, effective_date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.compensation_revision_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES public.compensation_revisions(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  current_cents bigint NOT NULL DEFAULT 0,
  proposed_cents bigint NOT NULL DEFAULT 0,
  change_pct numeric(7,2),
  recommended_pct numeric(5,2),
  review_id uuid REFERENCES public.performance_reviews(id) ON DELETE SET NULL,
  grade_id uuid REFERENCES public.salary_grades(id) ON DELETE SET NULL,
  compa_before numeric(6,3),
  compa_after numeric(6,3),
  rationale text,
  status text NOT NULL DEFAULT 'proposed',
  history_id uuid REFERENCES public.employee_salary_history(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (revision_id, employee_id)
);
DO $$ BEGIN
  ALTER TABLE public.compensation_revision_lines
    ADD CONSTRAINT compensation_revision_lines_status_check CHECK (status IN ('proposed', 'excluded', 'applied'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS compensation_revision_lines_employee_idx
  ON public.compensation_revision_lines (employee_id);

-- RLS: HR-modulens roller (matrisen) hanterar; medarbetaren läser sin egen historik.
ALTER TABLE public.compensation_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compensation_revision_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_salary_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "HR manages salary revisions" ON public.compensation_revisions;
CREATE POLICY "HR manages salary revisions" ON public.compensation_revisions
  FOR ALL TO authenticated
  USING (can_access_module(auth.uid(), 'hr')) WITH CHECK (can_access_module(auth.uid(), 'hr'));
DROP POLICY IF EXISTS "HR manages salary revision lines" ON public.compensation_revision_lines;
CREATE POLICY "HR manages salary revision lines" ON public.compensation_revision_lines
  FOR ALL TO authenticated
  USING (can_access_module(auth.uid(), 'hr')) WITH CHECK (can_access_module(auth.uid(), 'hr'));
DROP POLICY IF EXISTS "HR manages salary history" ON public.employee_salary_history;
CREATE POLICY "HR manages salary history" ON public.employee_salary_history
  FOR ALL TO authenticated
  USING (can_access_module(auth.uid(), 'hr')) WITH CHECK (can_access_module(auth.uid(), 'hr'));
DROP POLICY IF EXISTS "Employees see their own salary history" ON public.employee_salary_history;
CREATE POLICY "Employees see their own salary history" ON public.employee_salary_history
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_salary_history.employee_id AND e.user_id = auth.uid()));

-- Triggern: en löneändring utanför en runda får sin rad. Rundan sätter
-- flowwink.salary_change = 'revision' för sin transaktion och skriver raden själv
-- (med ikraftträdande, skäl och koppling till samtalet).
CREATE OR REPLACE FUNCTION public.employee_salary_history_trg() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(current_setting('flowwink.salary_change', true), '') = 'revision' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.monthly_salary_cents, 0) > 0 THEN
      INSERT INTO employee_salary_history (employee_id, effective_date, previous_cents, new_cents, change_pct, source, changed_by)
      VALUES (NEW.id, COALESCE(NEW.start_date, current_date), NULL, NEW.monthly_salary_cents, NULL, 'hire', auth.uid());
    END IF;
  ELSIF NEW.monthly_salary_cents IS DISTINCT FROM OLD.monthly_salary_cents THEN
    INSERT INTO employee_salary_history (employee_id, effective_date, previous_cents, new_cents, change_pct, source, changed_by)
    VALUES (NEW.id,
            CASE WHEN COALESCE(OLD.monthly_salary_cents, 0) = 0 THEN COALESCE(NEW.start_date, current_date) ELSE current_date END,
            OLD.monthly_salary_cents, COALESCE(NEW.monthly_salary_cents, 0),
            CASE WHEN COALESCE(OLD.monthly_salary_cents, 0) > 0
                 THEN round((COALESCE(NEW.monthly_salary_cents, 0) - OLD.monthly_salary_cents)::numeric * 100 / OLD.monthly_salary_cents, 2) END,
            CASE WHEN COALESCE(OLD.monthly_salary_cents, 0) = 0 THEN 'hire' ELSE 'manual' END,
            auth.uid());
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS employee_salary_history_trg ON public.employees;
CREATE TRIGGER employee_salary_history_trg
  AFTER INSERT OR UPDATE OF monthly_salary_cents ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.employee_salary_history_trg();

-- Summan av en runda — det approve mäter mot budgeten och det panelen visar.
CREATE OR REPLACE FUNCTION public.compensation_revision_totals(p_revision_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH r AS (SELECT * FROM compensation_revisions WHERE id = p_revision_id),
       l AS (SELECT * FROM compensation_revision_lines WHERE revision_id = p_revision_id),
       inc AS (SELECT * FROM l WHERE status IN ('proposed', 'applied')),
       t AS (SELECT COALESCE(sum(current_cents), 0)::bigint AS cur, COALESCE(sum(proposed_cents), 0)::bigint AS prop, count(*) AS n FROM inc),
       lim AS (SELECT LEAST(CASE WHEN r.budget_pct IS NOT NULL THEN floor(t.cur * r.budget_pct / 100)::bigint END, r.budget_cents) AS limit_cents FROM r, t),
       band AS (SELECT count(*) AS n FROM inc JOIN salary_grades g ON g.id = inc.grade_id
                 WHERE inc.proposed_cents < g.min_cents OR inc.proposed_cents > g.max_cents),
       dept AS (SELECT COALESCE(jsonb_agg(jsonb_build_object('department', d.department, 'headcount', d.n, 'current_cents', d.cur, 'proposed_cents', d.prop,
                                                             'delta_pct', CASE WHEN d.cur > 0 THEN round((d.prop - d.cur)::numeric * 100 / d.cur, 2) END)
                                          ORDER BY d.department), '[]'::jsonb) AS rows
                  FROM (SELECT COALESCE(e.department, '—') AS department, count(*) AS n, sum(inc.current_cents) AS cur, sum(inc.proposed_cents) AS prop
                          FROM inc JOIN employees e ON e.id = inc.employee_id GROUP BY 1) d)
  SELECT jsonb_build_object(
    'headcount', (SELECT count(*) FROM l),
    'included', t.n,
    'excluded', (SELECT count(*) FROM l WHERE status = 'excluded'),
    'total_current_cents', t.cur,
    'total_proposed_cents', t.prop,
    'delta_cents', t.prop - t.cur,
    'annual_delta_cents', (t.prop - t.cur) * 12,
    'delta_pct', CASE WHEN t.cur > 0 THEN round((t.prop - t.cur)::numeric * 100 / t.cur, 2) END,
    'budget_pct', r.budget_pct,
    'budget_cents', r.budget_cents,
    'budget_limit_cents', lim.limit_cents,
    'within_budget', lim.limit_cents IS NULL OR (t.prop - t.cur) <= lim.limit_cents,
    'over_by_cents', CASE WHEN lim.limit_cents IS NULL THEN 0 ELSE GREATEST((t.prop - t.cur) - lim.limit_cents, 0) END,
    'out_of_band_after', band.n,
    'by_department', dept.rows
  )
  FROM r, t, lim, band, dept;
$$;
REVOKE ALL ON FUNCTION public.compensation_revision_totals(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compensation_revision_totals(uuid) TO authenticated, service_role;

-- 3 ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.manage_compensation_revision(
  p_action text,
  p_revision_id uuid DEFAULT NULL,
  p_line_id uuid DEFAULT NULL,
  p_employee_id uuid DEFAULT NULL,
  p_employee_ids uuid[] DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_effective_date date DEFAULT NULL,
  p_budget_pct numeric DEFAULT NULL,
  p_budget_cents bigint DEFAULT NULL,
  p_default_pct numeric DEFAULT NULL,
  p_department text DEFAULT NULL,
  p_pct numeric DEFAULT NULL,
  p_new_cents bigint DEFAULT NULL,
  p_rationale text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_force boolean DEFAULT false,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_rev public.compensation_revisions;
  v_line public.compensation_revision_lines;
  v_emp public.employees;
  v_grade public.salary_grades;
  v_id uuid;
  v_hist uuid;
  v_new bigint;
  v_cur bigint;
  v_n integer;
  v_applied integer := 0;
  v_unchanged integer := 0;
  v_drifted integer := 0;
  v_contracts integer := 0;
  v_totals jsonb;
  v_out jsonb;
  v_ids uuid[] := '{}';
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'hr')) THEN
    RAISE EXCEPTION 'Only HR can run salary revisions';
  END IF;

  -- ── create ───────────────────────────────────────────────────────────────
  IF p_action = 'create' THEN
    IF p_name IS NULL OR btrim(p_name) = '' OR p_effective_date IS NULL THEN
      RAISE EXCEPTION 'create requires p_name and p_effective_date';
    END IF;
    IF p_default_pct IS NOT NULL AND p_default_pct NOT BETWEEN -50 AND 100 THEN
      RAISE EXCEPTION 'default_pct must be between -50 and 100';
    END IF;
    INSERT INTO compensation_revisions (name, effective_date, budget_pct, budget_cents, default_pct, scope, notes, created_by)
    VALUES (btrim(p_name), p_effective_date, p_budget_pct, p_budget_cents, COALESCE(p_default_pct, 0),
            jsonb_strip_nulls(jsonb_build_object('department', p_department, 'employee_ids', to_jsonb(p_employee_ids))), p_notes, auth.uid())
    RETURNING id INTO v_id;

    INSERT INTO compensation_revision_lines (revision_id, employee_id, current_cents, recommended_pct, review_id, grade_id, compa_before, proposed_cents, change_pct, compa_after, status, rationale)
    SELECT v_id, e.id, COALESCE(e.monthly_salary_cents, 0), rv.pct, rv.id, g.id,
           CASE WHEN g.id IS NOT NULL AND COALESCE(g.mid_cents, (g.min_cents + g.max_cents) / 2) > 0
                THEN round(COALESCE(e.monthly_salary_cents, 0)::numeric / COALESCE(g.mid_cents, (g.min_cents + g.max_cents) / 2), 3) END,
           CASE WHEN COALESCE(e.monthly_salary_cents, 0) > 0
                THEN round(e.monthly_salary_cents * (1 + COALESCE(rv.pct, COALESCE(p_default_pct, 0)) / 100))::bigint ELSE 0 END,
           CASE WHEN COALESCE(e.monthly_salary_cents, 0) > 0 THEN COALESCE(rv.pct, COALESCE(p_default_pct, 0)) END,
           CASE WHEN g.id IS NOT NULL AND COALESCE(e.monthly_salary_cents, 0) > 0 AND COALESCE(g.mid_cents, (g.min_cents + g.max_cents) / 2) > 0
                THEN round(round(e.monthly_salary_cents * (1 + COALESCE(rv.pct, COALESCE(p_default_pct, 0)) / 100))::numeric / COALESCE(g.mid_cents, (g.min_cents + g.max_cents) / 2), 3) END,
           CASE WHEN COALESCE(e.monthly_salary_cents, 0) > 0 THEN 'proposed' ELSE 'excluded' END,
           CASE WHEN COALESCE(e.monthly_salary_cents, 0) = 0 THEN 'No salary on record'
                WHEN rv.id IS NOT NULL THEN 'Review recommendation' ELSE 'Default adjustment' END
      FROM employees e
      LEFT JOIN salary_grades g ON g.id = e.salary_grade_id
      LEFT JOIN LATERAL (
        SELECT r.id, r.salary_adjustment_pct AS pct
          FROM performance_reviews r
         WHERE r.employee_id = e.id AND r.status IN ('completed', 'acknowledged') AND r.salary_adjustment_pct IS NOT NULL
           AND r.period_end >= p_effective_date - interval '18 months' AND r.period_end <= p_effective_date
           AND NOT EXISTS (SELECT 1 FROM compensation_revision_lines cl JOIN compensation_revisions cr ON cr.id = cl.revision_id
                            WHERE cl.review_id = r.id AND cr.status = 'applied')
         ORDER BY r.period_end DESC LIMIT 1) rv ON true
     WHERE e.status = 'active'
       AND (e.start_date IS NULL OR e.start_date <= p_effective_date)
       AND (e.end_date IS NULL OR e.end_date >= p_effective_date)
       AND (p_department IS NULL OR e.department = p_department)
       AND (p_employee_ids IS NULL OR e.id = ANY (p_employee_ids));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN jsonb_build_object('success', true, 'revision_id', v_id, 'status', 'draft', 'lines', v_n,
                              'totals', compensation_revision_totals(v_id));

  -- ── update (header, draft only) ──────────────────────────────────────────
  ELSIF p_action = 'update' THEN
    IF p_revision_id IS NULL THEN RAISE EXCEPTION 'revision_id is required'; END IF;
    SELECT * INTO v_rev FROM compensation_revisions WHERE id = p_revision_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'revision_not_found'; END IF;
    IF v_rev.status <> 'draft' THEN RAISE EXCEPTION 'Only a draft round can be changed (it is %)', v_rev.status; END IF;
    UPDATE compensation_revisions
       SET name = COALESCE(NULLIF(btrim(p_name), ''), name), effective_date = COALESCE(p_effective_date, effective_date),
           budget_pct = COALESCE(p_budget_pct, budget_pct), budget_cents = COALESCE(p_budget_cents, budget_cents),
           default_pct = COALESCE(p_default_pct, default_pct), notes = COALESCE(p_notes, notes), updated_at = now()
     WHERE id = p_revision_id RETURNING * INTO v_rev;
    RETURN jsonb_build_object('success', true, 'revision', to_jsonb(v_rev), 'totals', compensation_revision_totals(p_revision_id));

  -- ── propose / exclude / include (lines, draft only) ──────────────────────
  ELSIF p_action IN ('propose', 'exclude', 'include') THEN
    IF p_line_id IS NOT NULL THEN
      SELECT * INTO v_line FROM compensation_revision_lines WHERE id = p_line_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'line_not_found'; END IF;
    ELSIF p_revision_id IS NOT NULL AND p_employee_id IS NOT NULL THEN
      SELECT * INTO v_line FROM compensation_revision_lines WHERE revision_id = p_revision_id AND employee_id = p_employee_id;
    ELSE
      RAISE EXCEPTION '% requires p_line_id, or p_revision_id and p_employee_id', p_action;
    END IF;
    SELECT * INTO v_rev FROM compensation_revisions WHERE id = COALESCE(v_line.revision_id, p_revision_id);
    IF NOT FOUND THEN RAISE EXCEPTION 'revision_not_found'; END IF;
    IF v_rev.status <> 'draft' THEN RAISE EXCEPTION 'Only a draft round can be changed (it is %)', v_rev.status; END IF;

    IF v_line.id IS NULL THEN
      -- an employee who was not in the round (hired after it opened, or outside its scope)
      IF p_action <> 'propose' THEN RAISE EXCEPTION 'The employee is not in this round'; END IF;
      SELECT * INTO v_emp FROM employees WHERE id = p_employee_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'employee_not_found'; END IF;
      IF v_emp.status <> 'active' THEN RAISE EXCEPTION 'Only an active employee can be added to a round (% is %)', v_emp.name, v_emp.status; END IF;
      INSERT INTO compensation_revision_lines (revision_id, employee_id, current_cents, proposed_cents, grade_id)
      VALUES (v_rev.id, v_emp.id, COALESCE(v_emp.monthly_salary_cents, 0), COALESCE(v_emp.monthly_salary_cents, 0), v_emp.salary_grade_id)
      RETURNING * INTO v_line;
    END IF;

    IF p_action = 'exclude' THEN
      UPDATE compensation_revision_lines SET status = 'excluded', rationale = COALESCE(p_rationale, rationale), updated_at = now() WHERE id = v_line.id;
      RETURN jsonb_build_object('success', true, 'line_id', v_line.id, 'status', 'excluded', 'totals', compensation_revision_totals(v_rev.id));
    ELSIF p_action = 'include' THEN
      UPDATE compensation_revision_lines SET status = 'proposed', rationale = COALESCE(p_rationale, rationale), updated_at = now() WHERE id = v_line.id;
      RETURN jsonb_build_object('success', true, 'line_id', v_line.id, 'status', 'proposed', 'totals', compensation_revision_totals(v_rev.id));
    END IF;

    IF p_pct IS NULL AND p_new_cents IS NULL THEN RAISE EXCEPTION 'propose requires p_pct or p_new_cents'; END IF;
    v_new := COALESCE(p_new_cents, round(v_line.current_cents * (1 + p_pct / 100))::bigint);
    IF v_new < 0 THEN RAISE EXCEPTION 'A salary cannot be negative'; END IF;
    IF v_new < v_line.current_cents AND COALESCE(btrim(p_rationale), '') = '' THEN
      RAISE EXCEPTION 'A salary cut needs a rationale (p_rationale)';
    END IF;
    SELECT * INTO v_grade FROM salary_grades WHERE id = v_line.grade_id;
    UPDATE compensation_revision_lines
       SET proposed_cents = v_new,
           change_pct = CASE WHEN current_cents > 0 THEN round((v_new - current_cents)::numeric * 100 / current_cents, 2) END,
           compa_after = CASE WHEN v_grade.id IS NOT NULL AND COALESCE(v_grade.mid_cents, (v_grade.min_cents + v_grade.max_cents) / 2) > 0
                              THEN round(v_new::numeric / COALESCE(v_grade.mid_cents, (v_grade.min_cents + v_grade.max_cents) / 2), 3) END,
           rationale = COALESCE(p_rationale, rationale), status = 'proposed', updated_at = now()
     WHERE id = v_line.id RETURNING * INTO v_line;
    RETURN jsonb_build_object('success', true, 'line_id', v_line.id, 'employee_id', v_line.employee_id,
                              'current_cents', v_line.current_cents, 'proposed_cents', v_line.proposed_cents,
                              'change_pct', v_line.change_pct, 'compa_after', v_line.compa_after,
                              'in_band', CASE WHEN v_grade.id IS NULL THEN NULL ELSE v_new BETWEEN v_grade.min_cents AND v_grade.max_cents END,
                              'totals', compensation_revision_totals(v_rev.id));

  -- ── summary / get ────────────────────────────────────────────────────────
  ELSIF p_action IN ('summary', 'get') THEN
    IF p_revision_id IS NULL THEN RAISE EXCEPTION 'revision_id is required'; END IF;
    SELECT * INTO v_rev FROM compensation_revisions WHERE id = p_revision_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'revision_not_found'; END IF;
    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.name), '[]'::jsonb) INTO v_out
      FROM (SELECT l.*, e.name, e.title, e.department, g.code AS grade_code, g.min_cents AS band_min_cents, g.max_cents AS band_max_cents,
                   CASE WHEN g.id IS NULL THEN NULL ELSE l.proposed_cents BETWEEN g.min_cents AND g.max_cents END AS in_band
              FROM compensation_revision_lines l
              JOIN employees e ON e.id = l.employee_id
              LEFT JOIN salary_grades g ON g.id = l.grade_id
             WHERE l.revision_id = p_revision_id) x;
    RETURN jsonb_build_object('revision', to_jsonb(v_rev), 'totals', compensation_revision_totals(p_revision_id), 'lines', v_out);

  -- ── list ─────────────────────────────────────────────────────────────────
  ELSIF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(r) || jsonb_build_object('totals', compensation_revision_totals(r.id)) ORDER BY r.effective_date DESC, r.created_at DESC), '[]'::jsonb)
      INTO v_out
      FROM (SELECT * FROM compensation_revisions WHERE p_status IS NULL OR status = p_status
             ORDER BY effective_date DESC, created_at DESC LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)) r;
    RETURN jsonb_build_object('revisions', v_out);

  -- ── approve ──────────────────────────────────────────────────────────────
  ELSIF p_action = 'approve' THEN
    IF p_revision_id IS NULL THEN RAISE EXCEPTION 'revision_id is required'; END IF;
    SELECT * INTO v_rev FROM compensation_revisions WHERE id = p_revision_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'revision_not_found'; END IF;
    IF v_rev.status <> 'draft' THEN RAISE EXCEPTION 'Only a draft round can be approved (it is %)', v_rev.status; END IF;
    v_totals := compensation_revision_totals(p_revision_id);
    IF (v_totals->>'included')::int = 0 THEN RAISE EXCEPTION 'Nothing to approve: every line is excluded'; END IF;
    IF NOT (v_totals->>'within_budget')::boolean AND NOT COALESCE(p_force, false) THEN
      RAISE EXCEPTION 'Over budget by % kr/month (proposed +% %%, budget % kr/month): adjust the proposals, or approve with p_force',
        round((v_totals->>'over_by_cents')::numeric / 100), v_totals->>'delta_pct', round((v_totals->>'budget_limit_cents')::numeric / 100);
    END IF;
    UPDATE compensation_revisions
       SET status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_at = now(),
           notes = CASE WHEN NOT (v_totals->>'within_budget')::boolean
                        THEN concat_ws(E'\n', notes, format('Budget overridden on approval: +%s %% vs budget %s kr/month.', v_totals->>'delta_pct', round((v_totals->>'budget_limit_cents')::numeric / 100)))
                        ELSE notes END
     WHERE id = p_revision_id;
    RETURN jsonb_build_object('success', true, 'revision_id', p_revision_id, 'status', 'approved',
                              'budget_overridden', NOT (v_totals->>'within_budget')::boolean, 'totals', v_totals);

  -- ── apply ────────────────────────────────────────────────────────────────
  ELSIF p_action = 'apply' THEN
    IF p_revision_id IS NULL THEN RAISE EXCEPTION 'revision_id is required'; END IF;
    SELECT * INTO v_rev FROM compensation_revisions WHERE id = p_revision_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'revision_not_found'; END IF;
    IF v_rev.status <> 'approved' THEN RAISE EXCEPTION 'Only an approved round can be applied (it is %)', v_rev.status; END IF;
    IF v_rev.effective_date > current_date AND NOT COALESCE(p_force, false) THEN
      RAISE EXCEPTION 'The round is not yet effective (%): apply on or after that date, or p_force to apply early', v_rev.effective_date;
    END IF;
    PERFORM set_config('flowwink.salary_change', 'revision', true);
    FOR v_line IN SELECT * FROM compensation_revision_lines WHERE revision_id = p_revision_id AND status = 'proposed' ORDER BY created_at LOOP
      SELECT monthly_salary_cents INTO v_cur FROM employees WHERE id = v_line.employee_id FOR UPDATE;
      IF NOT FOUND THEN CONTINUE; END IF;
      IF v_cur IS DISTINCT FROM v_line.current_cents THEN v_drifted := v_drifted + 1; END IF;
      IF v_line.proposed_cents = v_cur THEN
        v_unchanged := v_unchanged + 1;
        UPDATE compensation_revision_lines SET status = 'applied', updated_at = now() WHERE id = v_line.id;
        CONTINUE;
      END IF;
      UPDATE employees SET monthly_salary_cents = v_line.proposed_cents, updated_at = now() WHERE id = v_line.employee_id;
      INSERT INTO employee_salary_history (employee_id, effective_date, previous_cents, new_cents, change_pct, source, reason, revision_id, revision_line_id, review_id, changed_by)
      VALUES (v_line.employee_id, v_rev.effective_date, v_cur, v_line.proposed_cents,
              CASE WHEN COALESCE(v_cur, 0) > 0 THEN round((v_line.proposed_cents - v_cur)::numeric * 100 / v_cur, 2) END,
              'revision', concat_ws(' — ', v_rev.name, v_line.rationale), v_rev.id, v_line.id, v_line.review_id, auth.uid())
      RETURNING id INTO v_hist;
      -- the contract in force follows the salary: that is what the revision changes
      UPDATE employment_contracts
         SET monthly_salary_cents = v_line.proposed_cents, updated_at = now(),
             metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('salary_revision_id', v_rev.id, 'salary_effective_date', v_rev.effective_date)
       WHERE employee_id = v_line.employee_id AND status IN ('active', 'signed')
         AND (end_date IS NULL OR end_date >= v_rev.effective_date);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_contracts := v_contracts + v_n;
      UPDATE compensation_revision_lines SET status = 'applied', history_id = v_hist, updated_at = now() WHERE id = v_line.id;
      v_applied := v_applied + 1;
    END LOOP;
    PERFORM set_config('flowwink.salary_change', '', true);
    UPDATE compensation_revisions SET status = 'applied', applied_at = now(), updated_at = now() WHERE id = p_revision_id;
    RETURN jsonb_build_object('success', true, 'revision_id', p_revision_id, 'status', 'applied', 'applied', v_applied,
                              'unchanged', v_unchanged, 'drifted', v_drifted, 'contracts_updated', v_contracts,
                              'effective_date', v_rev.effective_date, 'totals', compensation_revision_totals(p_revision_id));

  -- ── apply_due (the automation's verb) ────────────────────────────────────
  ELSIF p_action = 'apply_due' THEN
    FOR v_rev IN SELECT * FROM compensation_revisions WHERE status = 'approved' AND effective_date <= current_date ORDER BY effective_date LOOP
      PERFORM manage_compensation_revision('apply', p_revision_id := v_rev.id);
      v_ids := v_ids || v_rev.id;
    END LOOP;
    RETURN jsonb_build_object('success', true, 'applied', to_jsonb(v_ids), 'count', coalesce(array_length(v_ids, 1), 0));

  -- ── cancel ───────────────────────────────────────────────────────────────
  ELSIF p_action = 'cancel' THEN
    IF p_revision_id IS NULL THEN RAISE EXCEPTION 'revision_id is required'; END IF;
    SELECT * INTO v_rev FROM compensation_revisions WHERE id = p_revision_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'revision_not_found'; END IF;
    IF v_rev.status NOT IN ('draft', 'approved') THEN RAISE EXCEPTION 'Only a draft or approved round can be cancelled (it is %)', v_rev.status; END IF;
    UPDATE compensation_revisions SET status = 'cancelled', notes = COALESCE(p_notes, notes), updated_at = now() WHERE id = p_revision_id;
    RETURN jsonb_build_object('success', true, 'revision_id', p_revision_id, 'status', 'cancelled');

  -- ── history (per employee) ───────────────────────────────────────────────
  ELSIF p_action = 'history' THEN
    IF p_employee_id IS NULL THEN RAISE EXCEPTION 'history requires p_employee_id'; END IF;
    SELECT * INTO v_emp FROM employees WHERE id = p_employee_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'employee_not_found'; END IF;
    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.effective_date DESC, x.created_at DESC), '[]'::jsonb) INTO v_out
      FROM (SELECT h.*, r.name AS revision_name
              FROM employee_salary_history h LEFT JOIN compensation_revisions r ON r.id = h.revision_id
             WHERE h.employee_id = p_employee_id
             ORDER BY h.effective_date DESC, h.created_at DESC LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)) x;
    RETURN jsonb_build_object('employee_id', v_emp.id, 'name', v_emp.name, 'current_cents', v_emp.monthly_salary_cents, 'history', v_out);

  ELSE
    RAISE EXCEPTION 'Unknown action: % (create, update, propose, exclude, include, summary, list, approve, apply, apply_due, cancel, history)', p_action;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.manage_compensation_revision(text, uuid, uuid, uuid, uuid[], text, date, numeric, bigint, numeric, text, numeric, bigint, text, text, boolean, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_compensation_revision(text, uuid, uuid, uuid, uuid[], text, date, numeric, bigint, numeric, text, numeric, bigint, text, text, boolean, text, integer) TO authenticated, service_role;
