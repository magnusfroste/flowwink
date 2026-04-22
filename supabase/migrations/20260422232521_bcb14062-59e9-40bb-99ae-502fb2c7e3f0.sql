
-- =========================================================
-- Employment Contracts & Onboarding Templates
-- =========================================================

-- Onboarding templates (reusable checklist templates)
CREATE TABLE IF NOT EXISTS public.onboarding_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  department text,
  employment_type text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.onboarding_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view onboarding templates" ON public.onboarding_templates;
CREATE POLICY "Authenticated can view onboarding templates"
  ON public.onboarding_templates FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage onboarding templates" ON public.onboarding_templates;
CREATE POLICY "Admins manage onboarding templates"
  ON public.onboarding_templates FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS trg_onboarding_templates_updated_at ON public.onboarding_templates;
CREATE TRIGGER trg_onboarding_templates_updated_at
  BEFORE UPDATE ON public.onboarding_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Employment contract templates
CREATE TABLE IF NOT EXISTS public.employment_contract_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  employment_type text NOT NULL DEFAULT 'permanent', -- permanent | fixed_term | trial | consultant
  body_markdown text NOT NULL DEFAULT '',
  default_probation_months integer DEFAULT 6,
  default_notice_period_days integer DEFAULT 30,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employment_contract_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated view contract templates" ON public.employment_contract_templates;
CREATE POLICY "Authenticated view contract templates"
  ON public.employment_contract_templates FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage contract templates" ON public.employment_contract_templates;
CREATE POLICY "Admins manage contract templates"
  ON public.employment_contract_templates FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS trg_employment_contract_templates_updated_at ON public.employment_contract_templates;
CREATE TRIGGER trg_employment_contract_templates_updated_at
  BEFORE UPDATE ON public.employment_contract_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Employment contracts (per employee)
CREATE TABLE IF NOT EXISTS public.employment_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.employment_contract_templates(id) ON DELETE SET NULL,
  title text NOT NULL,
  employment_type text NOT NULL DEFAULT 'permanent',
  start_date date NOT NULL,
  end_date date,
  probation_end_date date,
  notice_period_days integer DEFAULT 30,
  monthly_salary_cents bigint,
  hourly_rate_cents bigint,
  currency text NOT NULL DEFAULT 'SEK',
  weekly_hours numeric(5,2) DEFAULT 40.0,
  body_markdown text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft', -- draft | sent | signed | active | terminated | expired
  sent_at timestamptz,
  signed_at timestamptz,
  signed_by_employee_at timestamptz,
  signed_by_employer_at timestamptz,
  terminated_at timestamptz,
  termination_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employment_contracts_employee ON public.employment_contracts(employee_id);
CREATE INDEX IF NOT EXISTS idx_employment_contracts_status ON public.employment_contracts(status);

ALTER TABLE public.employment_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage employment contracts" ON public.employment_contracts;
CREATE POLICY "Admins manage employment contracts"
  ON public.employment_contracts FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Employees view own contracts" ON public.employment_contracts;
CREATE POLICY "Employees view own contracts"
  ON public.employment_contracts FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = employment_contracts.employee_id AND e.user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS trg_employment_contracts_updated_at ON public.employment_contracts;
CREATE TRIGGER trg_employment_contracts_updated_at
  BEFORE UPDATE ON public.employment_contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RPC: apply onboarding template to an employee (creates onboarding_checklists row)
CREATE OR REPLACE FUNCTION public.apply_onboarding_template(
  p_employee_id uuid,
  p_template_id uuid
) RETURNS public.onboarding_checklists
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_tpl public.onboarding_templates;
  v_emp public.employees;
  v_row public.onboarding_checklists;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can apply onboarding templates';
  END IF;

  SELECT * INTO v_tpl FROM public.onboarding_templates WHERE id = p_template_id;
  IF v_tpl.id IS NULL THEN RAISE EXCEPTION 'Onboarding template not found'; END IF;

  SELECT * INTO v_emp FROM public.employees WHERE id = p_employee_id;
  IF v_emp.id IS NULL THEN RAISE EXCEPTION 'Employee not found'; END IF;

  INSERT INTO public.onboarding_checklists (employee_id, title, items, created_by)
  VALUES (
    p_employee_id,
    v_tpl.name,
    v_tpl.items,
    auth.uid()
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- RPC: sign employment contract (employee or employer side)
CREATE OR REPLACE FUNCTION public.sign_employment_contract(
  p_contract_id uuid,
  p_side text DEFAULT 'employee'  -- 'employee' | 'employer'
) RETURNS public.employment_contracts
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_row public.employment_contracts;
  v_emp public.employees;
  v_is_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_row FROM public.employment_contracts WHERE id = p_contract_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Contract not found'; END IF;

  v_is_admin := has_role(auth.uid(), 'admin'::app_role);

  IF p_side = 'employer' THEN
    IF NOT v_is_admin THEN RAISE EXCEPTION 'Only admins can sign as employer'; END IF;
    UPDATE public.employment_contracts
    SET signed_by_employer_at = now(),
        status = CASE WHEN signed_by_employee_at IS NOT NULL THEN 'signed' ELSE status END,
        signed_at = CASE WHEN signed_by_employee_at IS NOT NULL THEN now() ELSE signed_at END
    WHERE id = p_contract_id RETURNING * INTO v_row;
  ELSE
    -- employee side
    SELECT * INTO v_emp FROM public.employees WHERE id = v_row.employee_id;
    IF NOT v_is_admin AND (v_emp.user_id IS NULL OR v_emp.user_id <> auth.uid()) THEN
      RAISE EXCEPTION 'Not authorized to sign this contract';
    END IF;
    UPDATE public.employment_contracts
    SET signed_by_employee_at = now(),
        status = CASE WHEN signed_by_employer_at IS NOT NULL THEN 'signed' ELSE status END,
        signed_at = CASE WHEN signed_by_employer_at IS NOT NULL THEN now() ELSE signed_at END
    WHERE id = p_contract_id RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

-- Seed a few default templates (idempotent via name uniqueness check)
INSERT INTO public.onboarding_templates (name, description, employment_type, is_default, items)
SELECT 'Standard Onboarding (Permanent)', 'Default onboarding flow for permanent hires', 'permanent', true,
  '[
    {"id":"welcome","title":"Welcome email + first-day info","done":false,"category":"hr"},
    {"id":"contract","title":"Sign employment contract","done":false,"category":"hr"},
    {"id":"it_account","title":"Create IT account & email","done":false,"category":"it"},
    {"id":"laptop","title":"Provision laptop & access cards","done":false,"category":"it"},
    {"id":"policies","title":"Read & accept company policies","done":false,"category":"compliance"},
    {"id":"buddy","title":"Assign onboarding buddy","done":false,"category":"culture"},
    {"id":"intro_meeting","title":"Schedule intro with team","done":false,"category":"culture"},
    {"id":"30day_review","title":"30-day check-in scheduled","done":false,"category":"hr"}
  ]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.onboarding_templates WHERE name = 'Standard Onboarding (Permanent)');

INSERT INTO public.onboarding_templates (name, description, employment_type, is_default, items)
SELECT 'Consultant Quick Onboarding', 'Lightweight onboarding for consultants', 'consultant', false,
  '[
    {"id":"contract","title":"Sign consultant agreement","done":false,"category":"hr"},
    {"id":"it_account","title":"Create access (email + tools)","done":false,"category":"it"},
    {"id":"nda","title":"NDA signed","done":false,"category":"compliance"},
    {"id":"kickoff","title":"Project kick-off meeting","done":false,"category":"culture"}
  ]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.onboarding_templates WHERE name = 'Consultant Quick Onboarding');

-- Seed default Swedish-style permanent contract template
INSERT INTO public.employment_contract_templates (name, description, employment_type, is_default, default_probation_months, default_notice_period_days, body_markdown)
SELECT 'Tillsvidareanställning (Standard)', 'Default permanent employment contract — Swedish standard', 'permanent', true, 6, 30,
$body$# Anställningsavtal

**Arbetsgivare:** {{company_name}}
**Arbetstagare:** {{employee_name}}
**Personnummer:** {{personal_number}}

## 1. Anställning
Befattning: **{{title}}**
Avdelning: {{department}}
Tillträdesdag: **{{start_date}}**
Anställningsform: Tillsvidareanställning

## 2. Lön
Månadslön: **{{monthly_salary}} {{currency}}**
Lönen utbetalas den 25:e varje månad.

## 3. Arbetstid
Ordinarie arbetstid: **{{weekly_hours}} timmar per vecka**.

## 4. Provanställning
Anställningen inleds med en provanställning om **{{probation_months}} månader**.

## 5. Uppsägningstid
Uppsägningstiden är **{{notice_period_days}} dagar** för båda parter.

## 6. Semester
Semester utgår enligt semesterlagen och företagets semesterpolicy.

## 7. Sekretess
Arbetstagaren förbinder sig att inte röja företagshemligheter.

---
Ort & datum: ____________________
Arbetsgivare: ____________________
Arbetstagare: ____________________
$body$
WHERE NOT EXISTS (SELECT 1 FROM public.employment_contract_templates WHERE name = 'Tillsvidareanställning (Standard)');
