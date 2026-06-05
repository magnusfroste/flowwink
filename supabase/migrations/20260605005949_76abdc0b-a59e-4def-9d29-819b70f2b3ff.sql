
-- ============================================================
-- Demo seeders for additional common modules: hr, tickets,
-- bookings, newsletter, purchasing (vendors).
-- All standalone (no cross-module FK requirements).
-- ============================================================

-- ---------- HR (employees) ----------
CREATE OR REPLACE FUNCTION public.seed_demo_hr(p_run_id uuid, p_scenario text DEFAULT 'default')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int := 0; v_id uuid; r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('Anna Lindberg',  'anna.lindberg@demo.flowwink.com',  'CTO',                'Engineering', 'full_time', 75000),
    ('Marcus Bergström','marcus.b@demo.flowwink.com',      'Senior Developer',   'Engineering', 'full_time', 55000),
    ('Sara Johansson', 'sara.j@demo.flowwink.com',         'Head of Sales',      'Sales',       'full_time', 60000),
    ('Erik Nilsson',   'erik.n@demo.flowwink.com',         'Account Executive',  'Sales',       'full_time', 45000),
    ('Linda Karlsson', 'linda.k@demo.flowwink.com',        'Marketing Lead',     'Marketing',   'full_time', 50000),
    ('Johan Persson',  'johan.p@demo.flowwink.com',        'Support Specialist', 'Support',     'part_time', 30000)
  ) AS t(name,email,title,dept,etype,salary) LOOP
    INSERT INTO employees(name,email,title,department,employment_type,start_date,monthly_salary_cents,status)
    VALUES (r.name,r.email,r.title,r.dept,r.etype,current_date - (interval '1 day' * (random()*900)::int), r.salary*100,'active')
    RETURNING id INTO v_id;
    INSERT INTO demo_run_items(run_id,table_name,record_id) VALUES (p_run_id,'employees',v_id);
    v_count := v_count+1;
  END LOOP;
  RETURN jsonb_build_object('employees', v_count);
END $$;

-- ---------- Tickets (support) ----------
CREATE OR REPLACE FUNCTION public.seed_demo_tickets(p_run_id uuid, p_scenario text DEFAULT 'default')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int := 0; v_id uuid; r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('Login problem on mobile app',        'I cannot log in from my iPhone since this morning.',                'new',         'high',   'bug',           'Maria Andersson','maria@example.com'),
    ('Question about invoicing',           'How do I get a copy of last month''s invoice?',                     'open',        'medium', 'billing',       'Per Svensson','per.s@example.com'),
    ('Feature request: dark mode',         'Would love a dark mode for the dashboard.',                          'open',        'low',    'feature_request','Lisa Berg','lisa@example.com'),
    ('Sync error with Google Calendar',    'My bookings aren''t syncing to Google Calendar anymore.',            'in_progress', 'high',   'bug',           'Tom Karlsson','tom@example.com'),
    ('How do I export contacts?',          'Looking for a CSV export option in the CRM.',                        'resolved',    'low',    'question',      'Eva Holm','eva.h@example.com'),
    ('Refund request order #1042',         'Wrong size delivered, would like a refund.',                         'new',         'urgent', 'other',         'Nils Olsson','nils@example.com')
  ) AS t(subject,desc_,status,prio,cat,cname,cemail) LOOP
    INSERT INTO tickets(subject,description,status,priority,category,contact_name,contact_email,source)
    VALUES (r.subject,r.desc_,r.status::ticket_status,r.prio::ticket_priority,r.cat::ticket_category,r.cname,r.cemail,'manual')
    RETURNING id INTO v_id;
    INSERT INTO demo_run_items(run_id,table_name,record_id) VALUES (p_run_id,'tickets',v_id);
    v_count := v_count+1;
  END LOOP;
  RETURN jsonb_build_object('tickets', v_count);
END $$;

-- ---------- Bookings (services + bookings together) ----------
CREATE OR REPLACE FUNCTION public.seed_demo_bookings(p_run_id uuid, p_scenario text DEFAULT 'default')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_svc_count int := 0; v_bk_count int := 0; v_id uuid;
        v_consult uuid; v_strategy uuid; v_workshop uuid;
        r record;
BEGIN
  -- Services
  INSERT INTO booking_services(name,description,duration_minutes,price_cents,color,sort_order)
  VALUES ('Discovery call','Free 30-min intro call to discuss your needs.',30,0,'#10b981',1)
  RETURNING id INTO v_consult;
  INSERT INTO demo_run_items(run_id,table_name,record_id) VALUES (p_run_id,'booking_services',v_consult);

  INSERT INTO booking_services(name,description,duration_minutes,price_cents,color,sort_order)
  VALUES ('Strategy session','1-hour deep dive on growth strategy.',60,150000,'#3b82f6',2)
  RETURNING id INTO v_strategy;
  INSERT INTO demo_run_items(run_id,table_name,record_id) VALUES (p_run_id,'booking_services',v_strategy);

  INSERT INTO booking_services(name,description,duration_minutes,price_cents,color,sort_order)
  VALUES ('Half-day workshop','4-hour hands-on workshop with your team.',240,800000,'#8b5cf6',3)
  RETURNING id INTO v_workshop;
  INSERT INTO demo_run_items(run_id,table_name,record_id) VALUES (p_run_id,'booking_services',v_workshop);
  v_svc_count := 3;

  -- Bookings (mix of past/future, services)
  FOR r IN SELECT * FROM (VALUES
    (v_consult,  'Anders Eriksson','anders@example.com', '+46701234567',  2, 'confirmed'),
    (v_strategy, 'Maria Lund',     'maria.l@example.com','+46707654321',  5, 'confirmed'),
    (v_consult,  'Olof Berg',      'olof@example.com',   NULL,            7, 'pending'),
    (v_workshop, 'Inga Nyström',   'inga@acme.com',      '+46708887766', 14, 'confirmed'),
    (v_strategy, 'Karl Wahlberg',  'karl@example.com',   NULL,           -3, 'completed'),
    (v_consult,  'Pia Hansson',    'pia@example.com',    NULL,           -7, 'cancelled')
  ) AS t(svc,cname,cemail,cphone,day_offset,status) LOOP
    INSERT INTO bookings(service_id,customer_name,customer_email,customer_phone,start_time,end_time,status)
    VALUES (
      r.svc, r.cname, r.cemail, r.cphone,
      (current_date + (r.day_offset || ' days')::interval + interval '10 hours')::timestamptz,
      (current_date + (r.day_offset || ' days')::interval + interval '11 hours')::timestamptz,
      r.status
    )
    RETURNING id INTO v_id;
    INSERT INTO demo_run_items(run_id,table_name,record_id) VALUES (p_run_id,'bookings',v_id);
    v_bk_count := v_bk_count+1;
  END LOOP;

  RETURN jsonb_build_object('booking_services', v_svc_count, 'bookings', v_bk_count);
END $$;

-- ---------- Newsletter subscribers ----------
CREATE OR REPLACE FUNCTION public.seed_demo_newsletter(p_run_id uuid, p_scenario text DEFAULT 'default')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int := 0; v_id uuid; r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('emma.lindqvist@example.com','Emma Lindqvist','confirmed', -45),
    ('jonas.berg@example.com',    'Jonas Berg',    'confirmed', -30),
    ('sofia.holm@example.com',    'Sofia Holm',    'confirmed', -20),
    ('mikael.s@example.com',      'Mikael Sjögren','confirmed', -15),
    ('helena.k@example.com',      'Helena Karlsson','confirmed',-10),
    ('viktor.p@example.com',      'Viktor Pettersson','pending', -2),
    ('anna.demo@example.com',     'Anna Demo',     'pending',    -1),
    ('old.subscriber@example.com','Old Subscriber','unsubscribed',-120)
  ) AS t(email,name,status,day_offset) LOOP
    INSERT INTO newsletter_subscribers(email,name,status,confirmed_at,unsubscribed_at)
    VALUES (
      r.email, r.name, r.status,
      CASE WHEN r.status='confirmed' THEN now() + (r.day_offset || ' days')::interval ELSE NULL END,
      CASE WHEN r.status='unsubscribed' THEN now() + (r.day_offset || ' days')::interval ELSE NULL END
    )
    ON CONFLICT (email) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      INSERT INTO demo_run_items(run_id,table_name,record_id) VALUES (p_run_id,'newsletter_subscribers',v_id);
      v_count := v_count+1;
    END IF;
    v_id := NULL;
  END LOOP;
  RETURN jsonb_build_object('newsletter_subscribers', v_count);
END $$;

-- ---------- Vendors (purchasing) ----------
CREATE OR REPLACE FUNCTION public.seed_demo_vendors(p_run_id uuid, p_scenario text DEFAULT 'default')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int := 0; v_id uuid; r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('Nordic Office Supplies AB', 'orders@nordicoffice.se',    '+4684441100', 'https://nordicoffice.se',    'net30','SEK','Office furniture and stationery'),
    ('CloudHost EU',              'billing@cloudhost.eu',      NULL,          'https://cloudhost.eu',       'net15','EUR','Server hosting and CDN'),
    ('Stockholm Catering',        'sales@sthlmcatering.se',    '+4687123344', NULL,                          'net14','SEK','Office lunch and event catering'),
    ('Print & Design Studio',     'hello@printdesign.se',      NULL,          'https://printdesign.se',     'net30','SEK','Marketing materials and signage'),
    ('Legal Partners KB',         'invoice@legalpartners.se',  '+4686677788', 'https://legalpartners.se',   'net30','SEK','Corporate legal services'),
    ('IT Hardware Wholesale',     'b2b@ithardware.eu',         NULL,          'https://ithardware.eu',      'net30','EUR','Laptops, monitors, peripherals')
  ) AS t(name,email,phone,web,terms,curr,notes) LOOP
    INSERT INTO vendors(name,email,phone,website,payment_terms,currency,notes,is_active)
    VALUES (r.name,r.email,r.phone,r.web,r.terms,r.curr,r.notes,true)
    RETURNING id INTO v_id;
    INSERT INTO demo_run_items(run_id,table_name,record_id) VALUES (p_run_id,'vendors',v_id);
    v_count := v_count+1;
  END LOOP;
  RETURN jsonb_build_object('vendors', v_count);
END $$;

-- ---------- Extend dispatcher ----------
CREATE OR REPLACE FUNCTION public.seed_module_demo(p_module text, p_scenario text DEFAULT 'default')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_run_id uuid; v_result jsonb; v_module text;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can seed demo data';
  END IF;
  v_module := lower(trim(p_module));
  INSERT INTO demo_runs(module, scenario, created_by) VALUES (v_module, p_scenario, auth.uid()) RETURNING id INTO v_run_id;
  CASE v_module
    WHEN 'crm'         THEN v_result := seed_demo_crm(v_run_id, p_scenario);
    WHEN 'quotes'      THEN v_result := seed_demo_quotes(v_run_id, p_scenario);
    WHEN 'invoices'    THEN v_result := seed_demo_invoices(v_run_id, p_scenario);
    WHEN 'expenses'    THEN v_result := seed_demo_expenses(v_run_id, p_scenario);
    WHEN 'ecommerce'   THEN v_result := seed_demo_ecommerce(v_run_id, p_scenario);
    WHEN 'consultants' THEN v_result := seed_demo_consultants(v_run_id, p_scenario);
    WHEN 'blog'        THEN v_result := seed_demo_blog(v_run_id, p_scenario);
    WHEN 'kb'          THEN v_result := seed_demo_kb(v_run_id, p_scenario);
    WHEN 'projects'    THEN v_result := seed_demo_projects(v_run_id, p_scenario);
    WHEN 'hr'          THEN v_result := seed_demo_hr(v_run_id, p_scenario);
    WHEN 'tickets'     THEN v_result := seed_demo_tickets(v_run_id, p_scenario);
    WHEN 'bookings'    THEN v_result := seed_demo_bookings(v_run_id, p_scenario);
    WHEN 'newsletter'  THEN v_result := seed_demo_newsletter(v_run_id, p_scenario);
    WHEN 'vendors'     THEN v_result := seed_demo_vendors(v_run_id, p_scenario);
    ELSE
      DELETE FROM demo_runs WHERE id = v_run_id;
      RAISE EXCEPTION 'Unsupported module: %. Supported: crm, quotes, invoices, expenses, ecommerce, consultants, blog, kb, projects, hr, tickets, bookings, newsletter, vendors', v_module;
  END CASE;
  RETURN jsonb_build_object('success', true, 'run_id', v_run_id, 'module', v_module, 'scenario', p_scenario, 'detail', v_result);
END $$;
