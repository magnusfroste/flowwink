
CREATE OR REPLACE FUNCTION public.seed_demo_contracts(p_run_id uuid, p_scenario text DEFAULT 'default')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_count int := 0; v_id uuid; v_suffix text; r record;
BEGIN
  v_suffix := substring(p_run_id::text,1,6);
  FOR r IN SELECT * FROM (VALUES
    ('MSA – Acme Corp ('||v_suffix||')',      'service'::contract_type, 'active'::contract_status,    'Acme Corp AB',         'legal+'||v_suffix||'@acme.example',     (current_date - 90)::date, (current_date + 275)::date, 'auto'::renewal_type, 12000000::bigint, 'SEK'),
    ('NDA – Beta Industries ('||v_suffix||')','nda'::contract_type,     'active'::contract_status,    'Beta Industries Ltd',  'legal+'||v_suffix||'@beta.example',     (current_date - 200)::date, (current_date + 165)::date,'none'::renewal_type,         0::bigint, 'SEK'),
    ('SOW – Northwind ('||v_suffix||')',      'service'::contract_type, 'draft'::contract_status,     'Northwind Trading',    'procurement+'||v_suffix||'@northwind.example', NULL, NULL, 'none'::renewal_type,           4500000::bigint, 'SEK'),
    ('Reseller – Gamma EU ('||v_suffix||')',  'other'::contract_type,   'pending_signature'::contract_status,'Gamma EU GmbH','contracts+'||v_suffix||'@gamma.example',(current_date - 5)::date,(current_date + 360)::date,'auto'::renewal_type, 25000000::bigint, 'EUR'),
    ('Old MSA – Delta Co ('||v_suffix||')',   'service'::contract_type, 'expired'::contract_status,   'Delta Co',             'admin+'||v_suffix||'@delta.example',    (current_date - 800)::date,(current_date - 60)::date, 'none'::renewal_type, 8000000::bigint, 'SEK')
  ) AS t(title,ctype,cstatus,cname,cmail,sd,ed,rt,val,cur) LOOP
    INSERT INTO public.contracts(title,contract_type,status,counterparty_name,counterparty_email,start_date,end_date,renewal_type,value_cents,currency,notes)
    VALUES (r.title,r.ctype,r.cstatus,r.cname,r.cmail,r.sd,r.ed,r.rt,r.val,r.cur,'Demo contract seeded by run '||v_suffix) RETURNING id INTO v_id;
    PERFORM public._demo_register_row(p_run_id,'contracts',v_id);
    v_count := v_count+1;
  END LOOP;
  RETURN jsonb_build_object('contracts', v_count);
END $$;

CREATE OR REPLACE FUNCTION public.seed_demo_companies(p_run_id uuid, p_scenario text DEFAULT 'default')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_count int := 0; v_id uuid; v_suffix text; r record;
BEGIN
  v_suffix := substring(p_run_id::text,1,6);
  FOR r IN SELECT * FROM (VALUES
    ('Acme Corp AB ('||v_suffix||')',         'acme-'||v_suffix||'.example',     'Manufacturing', '51-200',  '+4684441000', 'customer'::company_lifecycle_stage),
    ('Beta Industries Ltd ('||v_suffix||')',  'beta-'||v_suffix||'.example',     'Logistics',     '201-500', '+4485550100', 'customer'::company_lifecycle_stage),
    ('Northwind Trading ('||v_suffix||')',    'northwind-'||v_suffix||'.example','Retail',        '11-50',   '+4687123000', 'prospect'::company_lifecycle_stage),
    ('Gamma EU GmbH ('||v_suffix||')',        'gamma-'||v_suffix||'.example',    'SaaS',          '51-200',  '+49301234567','prospect'::company_lifecycle_stage),
    ('Helios Solar ('||v_suffix||')',         'helios-'||v_suffix||'.example',   'Energy',        '11-50',    NULL,         'prospect'::company_lifecycle_stage),
    ('Lumen Health ('||v_suffix||')',         'lumen-'||v_suffix||'.example',    'Healthcare',    '1000+',   '+4684442200', 'customer'::company_lifecycle_stage)
  ) AS t(nm,dom,ind,sz,ph,stg) LOOP
    INSERT INTO public.companies(name,domain,industry,size,phone,website,lifecycle_stage,notes)
    VALUES (r.nm,r.dom,r.ind,r.sz,r.ph,'https://'||r.dom,r.stg,'Demo company seeded by run '||v_suffix) RETURNING id INTO v_id;
    PERFORM public._demo_register_row(p_run_id,'companies',v_id);
    v_count := v_count+1;
  END LOOP;
  RETURN jsonb_build_object('companies', v_count);
END $$;

CREATE OR REPLACE FUNCTION public.seed_demo_deals(p_run_id uuid, p_scenario text DEFAULT 'default')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_count int := 0; v_id uuid; v_lead uuid; v_suffix text; r record;
BEGIN
  v_suffix := substring(p_run_id::text,1,6);
  FOR r IN SELECT * FROM (VALUES
    ('Lisa Andersson', 'lisa+'||v_suffix||'@acme.example',      'Acme Corp – platform expansion',  'proposal'::deal_stage,    18000000, (current_date + 30)::date),
    ('Marcus Berg',    'marcus+'||v_suffix||'@northwind.example','Northwind onboarding',           'qualified'::deal_stage,    4500000, (current_date + 45)::date),
    ('Sara Holm',      'sara+'||v_suffix||'@gamma.example',     'Gamma EU – year 2 renewal',       'negotiation'::deal_stage, 25000000, (current_date + 14)::date),
    ('Anders Lind',    'anders+'||v_suffix||'@helios.example',  'Helios pilot',                    'prospecting'::deal_stage,  1200000, (current_date + 60)::date),
    ('Eva Norén',      'eva+'||v_suffix||'@lumen.example',      'Lumen Health analytics',          'closed_won'::deal_stage,   9800000, (current_date - 7)::date)
  ) AS t(nm,em,title,stg,val,close) LOOP
    INSERT INTO public.leads(name,email,status,source,ai_summary)
    VALUES (r.nm,r.em,'opportunity'::lead_status,'demo','Lead for deal: '||r.title) RETURNING id INTO v_lead;
    PERFORM public._demo_register_row(p_run_id,'leads',v_lead);
    INSERT INTO public.deals(lead_id,stage,value_cents,currency,expected_close,notes,closed_at)
    VALUES (v_lead,r.stg,r.val,'SEK',r.close,r.title, CASE WHEN r.stg IN ('closed_won','closed_lost') THEN now() - interval '7 days' ELSE NULL END)
    RETURNING id INTO v_id;
    PERFORM public._demo_register_row(p_run_id,'deals',v_id);
    v_count := v_count+1;
  END LOOP;
  RETURN jsonb_build_object('deals', v_count, 'leads', v_count);
END $$;

-- Drop wiki (incompatible PK) and remove from dispatcher
DROP FUNCTION IF EXISTS public.seed_demo_wiki(uuid, text);

CREATE OR REPLACE FUNCTION public.seed_module_demo(p_module text, p_scenario text DEFAULT 'default')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_run_id uuid; v_result jsonb; v_module text;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can seed demo data';
  END IF;
  v_module := lower(trim(p_module));
  INSERT INTO demo_runs(module, scenario, created_by) VALUES (v_module, p_scenario, auth.uid()) RETURNING id INTO v_run_id;
  CASE v_module
    WHEN 'crm'          THEN v_result := seed_demo_crm(v_run_id, p_scenario);
    WHEN 'quotes'       THEN v_result := seed_demo_quotes(v_run_id, p_scenario);
    WHEN 'invoices'     THEN v_result := seed_demo_invoices(v_run_id, p_scenario);
    WHEN 'expenses'     THEN v_result := seed_demo_expenses(v_run_id, p_scenario);
    WHEN 'ecommerce'    THEN v_result := seed_demo_ecommerce(v_run_id, p_scenario);
    WHEN 'consultants'  THEN v_result := seed_demo_consultants(v_run_id, p_scenario);
    WHEN 'blog'         THEN v_result := seed_demo_blog(v_run_id, p_scenario);
    WHEN 'kb'           THEN v_result := seed_demo_kb(v_run_id, p_scenario);
    WHEN 'projects'     THEN v_result := seed_demo_projects(v_run_id, p_scenario);
    WHEN 'hr'           THEN v_result := seed_demo_hr(v_run_id, p_scenario);
    WHEN 'tickets'      THEN v_result := seed_demo_tickets(v_run_id, p_scenario);
    WHEN 'bookings'     THEN v_result := seed_demo_bookings(v_run_id, p_scenario);
    WHEN 'newsletter'   THEN v_result := seed_demo_newsletter(v_run_id, p_scenario);
    WHEN 'vendors'      THEN v_result := seed_demo_vendors(v_run_id, p_scenario);
    WHEN 'contracts'    THEN v_result := seed_demo_contracts(v_run_id, p_scenario);
    WHEN 'companies'    THEN v_result := seed_demo_companies(v_run_id, p_scenario);
    WHEN 'deals'        THEN v_result := seed_demo_deals(v_run_id, p_scenario);
    WHEN 'recruitment'  THEN v_result := seed_demo_recruitment(v_run_id, p_scenario);
    WHEN 'pricelists'   THEN v_result := seed_demo_pricelists(v_run_id, p_scenario);
    WHEN 'surveys'      THEN v_result := seed_demo_surveys(v_run_id, p_scenario);
    ELSE
      DELETE FROM demo_runs WHERE id = v_run_id;
      RAISE EXCEPTION 'Unsupported module: %', v_module;
  END CASE;
  RETURN jsonb_build_object('success', true, 'run_id', v_run_id, 'module', v_module, 'scenario', p_scenario, 'detail', v_result);
END $$;
