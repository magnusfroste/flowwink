-- Demo seeds teach the state space — educational fixtures, not marketing.
--
-- Decision (2026-08-12): per-module "Seed demo data" exists to let a fresh
-- operator — human or agent — see the MODULE working in all its states before
-- real content exists. The operator already installed FlowWink; seeds must
-- teach the module, not sell the platform. Two rules, applied to all 30
-- seeders below:
--   1. Cover the state space, not volume: one row per major status
--      (draft/sent/paid/overdue…, open/resolved…, published/draft/scheduled…).
--   2. Rows teach and invite: titles/notes name the state they demonstrate
--      and, where natural, invite the agentic workflow ("This is a draft —
--      ask your agent to finish it").
--
-- Every status value was verified against the actual CHECK constraints and
-- enum types (never guessed); INSERT column lists follow the proven originals
-- with only schema-verified additions. Cleanup registration
-- (_demo_register_row) and run-id suffixing preserved everywhere, so
-- reset/sweep keeps working. Idempotent: CREATE OR REPLACE only.

CREATE OR REPLACE FUNCTION "public"."seed_demo_accounting"("p_run_id" "uuid", "p_scenario" "text" DEFAULT 'default'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_je int := 0;
  v_jel int := 0;
  v_id uuid;
  r RECORD;
  v_line_id uuid;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('Posted expense paid from bank — cloud hosting',                          '6540', 'IT services',       '1930', 'Bank',              348000, CURRENT_DATE - 20, 'posted'),
    ('Posted expense on credit — office supplies (creates a trade payable)',   '6110', 'Office supplies',   '2440', 'Trade payables',    125000, CURRENT_DATE - 25, 'posted'),
    ('Posted revenue on credit — consulting (creates a trade receivable)',     '1510', 'Trade receivables', '3041', 'Consulting revenue',1500000, CURRENT_DATE - 15, 'posted'),
    ('Posted small charge — bank fee (fees post like any other expense)',      '6570', 'Bank fees',         '1930', 'Bank',                7500, CURRENT_DATE - 10, 'posted'),
    ('Draft entry — office rent, not yet posted. Ask your agent to post it.',  '5010', 'Rent',              '1930', 'Bank',             2500000, CURRENT_DATE - 5,  'draft')
  ) AS t(descr, debit_code, debit_name, credit_code, credit_name, amount_cents, when_, status_) LOOP
    INSERT INTO journal_entries (entry_date, description, status, source)
    VALUES (r.when_, r.descr, r.status_, 'manual')
    RETURNING id INTO v_id;
    PERFORM _demo_register_row(p_run_id, 'journal_entries', v_id);
    v_je := v_je + 1;

    INSERT INTO journal_entry_lines (journal_entry_id, account_code, account_name, debit_cents, credit_cents)
    VALUES (v_id, r.debit_code, r.debit_name, r.amount_cents, 0)
    RETURNING id INTO v_line_id;
    PERFORM _demo_register_row(p_run_id, 'journal_entry_lines', v_line_id);

    INSERT INTO journal_entry_lines (journal_entry_id, account_code, account_name, debit_cents, credit_cents)
    VALUES (v_id, r.credit_code, r.credit_name, 0, r.amount_cents)
    RETURNING id INTO v_line_id;
    PERFORM _demo_register_row(p_run_id, 'journal_entry_lines', v_line_id);
    v_jel := v_jel + 2;
  END LOOP;
  RETURN jsonb_build_object('journal_entries', v_je, 'lines', v_jel);
END $$;


ALTER FUNCTION "public"."seed_demo_accounting"("p_run_id" "uuid", "p_scenario" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."seed_demo_approvals"("p_run_id" "uuid", "p_scenario" "text" DEFAULT 'default'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_rules int := 0;
  v_reqs int := 0;
  v_id uuid;
  r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('Expense over 5,000 SEK',     'Threshold rule — expenses above this amount require admin approval',        'expense', 500000, 'admin'::app_role),
    ('Purchase order over 25k',    'Threshold rule on a different entity type (purchase orders)',               'purchase_order', 2500000, 'admin'::app_role),
    ('Customer discount approval', 'Rule without an amount threshold — every matching quote needs approval',    'quote', NULL, 'admin'::app_role)
  ) AS t(name_, desc_, entity, thresh, role_) LOOP
    INSERT INTO approval_rules (name, description, entity_type, amount_threshold_cents, currency, required_role)
    VALUES (r.name_, r.desc_, r.entity, r.thresh, 'SEK', r.role_)
    RETURNING id INTO v_id;
    PERFORM _demo_register_row(p_run_id, 'approval_rules', v_id);
    v_rules := v_rules + 1;
  END LOOP;

  FOR r IN SELECT * FROM (VALUES
    ('expense',        'Pending request — travel to Berlin. Ask your agent to review and decide.', 750000, 'pending',   'Pending state — waiting for an approver; this is the row the approval workflow acts on'),
    ('purchase_order', 'Pending request — annual license renewal',                                4800000, 'pending',   'Second pending row — shows the queue with more than one open item'),
    ('quote',          'Approved request — 25% discount for a strategic account',                       0, 'approved',  'Approved state — resolved_at set; the discount may proceed'),
    ('expense',        'Rejected request — client dinner above per-diem limit',                    620000, 'rejected',  'Rejected state — resolved_at set; requester must revise or drop it'),
    ('expense',        'Cancelled request — withdrawn by the requester before a decision',         180000, 'cancelled', 'Cancelled state — closed without an approve/reject decision')
  ) AS t(entity, reason_, amount, status_, ctx_) LOOP
    INSERT INTO approval_requests (entity_type, entity_id, amount_cents, currency, reason, status, required_role, context, resolved_at)
    VALUES (
      r.entity, gen_random_uuid()::text, r.amount, 'SEK', r.reason_,
      r.status_::approval_status, 'admin'::app_role,
      jsonb_build_object('demo_note', r.ctx_),
      CASE WHEN r.status_ IN ('approved','rejected') THEN now() - interval '1 day' END
    ) RETURNING id INTO v_id;
    PERFORM _demo_register_row(p_run_id, 'approval_requests', v_id);
    v_reqs := v_reqs + 1;
  END LOOP;

  RETURN jsonb_build_object('rules', v_rules, 'requests', v_reqs);
END $$;


ALTER FUNCTION "public"."seed_demo_approvals"("p_run_id" "uuid", "p_scenario" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."seed_demo_blog"("p_run_id" "uuid", "p_scenario" "text" DEFAULT 'default'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_post_id uuid;
  v_count int := 0;
  v_posts jsonb := jsonb_build_array(
    jsonb_build_object(
      'title', 'Welcome to your blog — how publishing works',
      'slug', 'demo-welcome-publishing',
      'excerpt', 'A published post. Write, fill in SEO fields, publish — that is the whole flow.',
      'body', 'Every post starts as a draft. When it is ready you publish it, which stamps published_at and makes it visible on the public site. The SEO fields (title, description, keywords) live on the post and feed the page metadata — this post has them filled in as an example. Write posts yourself in the editor, or ask your agent to draft one for you.',
      'state', 'published',
      'image_seed', 'blog-welcome',
      'image_alt', 'An open notebook next to a keyboard'
    ),
    jsonb_build_object(
      'title', 'This is a draft — ask your agent to finish it',
      'slug', 'demo-unfinished-draft',
      'excerpt', 'Drafts are invisible to visitors until published.',
      'body', 'This post is a draft: it has no published_at and does not appear on the public site. Try asking your agent to finish the text, fill in the SEO fields and publish it — that is the normal handoff between you and the agent.',
      'state', 'draft',
      'image_seed', 'blog-draft',
      'image_alt', 'A half-finished sketch on paper'
    ),
    jsonb_build_object(
      'title', 'Scheduled — this post publishes itself in three days',
      'slug', 'demo-scheduled-post',
      'excerpt', 'A draft with scheduled_at set three days ahead.',
      'body', 'This post has scheduled_at set three days from when the demo was seeded. Scheduled posts stay hidden until the scheduler publishes them at the set time. Use this to queue a week of content in one sitting — or ask your agent to plan and schedule a series for you.',
      'state', 'scheduled',
      'image_seed', 'blog-scheduled',
      'image_alt', 'A wall calendar with a circled date'
    )
  );
  v_post jsonb;
BEGIN
  FOR v_post IN SELECT * FROM jsonb_array_elements(v_posts) LOOP
    INSERT INTO public.blog_posts (title, slug, excerpt, content_json, status, published_at, scheduled_at, meta_json, featured_image, featured_image_alt)
    VALUES (
      v_post->>'title',
      v_post->>'slug' || '-' || substring(p_run_id::text, 1, 6),
      v_post->>'excerpt',
      jsonb_build_object(
        'type', 'doc',
        'content', jsonb_build_array(
          jsonb_build_object(
            'type', 'paragraph',
            'content', jsonb_build_array(
              jsonb_build_object('type', 'text', 'text', v_post->>'body')
            )
          )
        )
      ),
      CASE WHEN v_post->>'state' = 'published' THEN 'published'::public.page_status ELSE 'draft'::public.page_status END,
      CASE WHEN v_post->>'state' = 'published' THEN now() ELSE NULL END,
      CASE WHEN v_post->>'state' = 'scheduled' THEN now() + interval '3 days' ELSE NULL END,
      CASE WHEN v_post->>'state' = 'published'
        THEN jsonb_build_object(
          'seoTitle', 'Welcome to your blog — publishing basics',
          'description', 'How drafts, publishing and SEO fields work in the blog module.',
          'keywords', jsonb_build_array('blog', 'publishing', 'seo')
        )
        ELSE '{}'::jsonb END,
      'https://picsum.photos/seed/' || (v_post->>'image_seed') || '/1200/630',
      v_post->>'image_alt'
    )
    RETURNING id INTO v_post_id;

    PERFORM public._demo_register_row(p_run_id, 'blog_posts', v_post_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('blog_posts_created', v_count);
END $$;


ALTER FUNCTION "public"."seed_demo_blog"("p_run_id" "uuid", "p_scenario" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."seed_demo_bookings"("p_run_id" "uuid", "p_scenario" "text" DEFAULT 'default'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_svc_count int := 0; v_bk_count int := 0; v_id uuid;
        v_consult uuid; v_strategy uuid; v_legacy uuid; v_suffix text;
        r record;
BEGIN
  v_suffix := substring(p_run_id::text,1,6);
  -- Services: one free, one paid, one inactive (is_active = false hides it from the public booking page).
  INSERT INTO public.booking_services(name,description,duration_minutes,price_cents,color,sort_order,is_active)
  VALUES ('Discovery call ('||v_suffix||')','Free 30-min intro call — the zero-price service variant.',30,0,'#10b981',1,true) RETURNING id INTO v_consult;
  PERFORM public._demo_register_row(p_run_id,'booking_services',v_consult);

  INSERT INTO public.booking_services(name,description,duration_minutes,price_cents,color,sort_order,is_active)
  VALUES ('Strategy session ('||v_suffix||')','Paid 60-min session — the priced service variant.',60,150000,'#3b82f6',2,true) RETURNING id INTO v_strategy;
  PERFORM public._demo_register_row(p_run_id,'booking_services',v_strategy);

  INSERT INTO public.booking_services(name,description,duration_minutes,price_cents,color,sort_order,is_active)
  VALUES ('Legacy workshop ('||v_suffix||') — inactive','is_active = false: hidden from the public booking page but kept for history.',240,800000,'#8b5cf6',3,false) RETURNING id INTO v_legacy;
  PERFORM public._demo_register_row(p_run_id,'booking_services',v_legacy);
  v_svc_count := 3;

  -- One booking per status: pending, confirmed, completed, cancelled.
  FOR r IN SELECT * FROM (VALUES
    (v_consult,  'Olof Berg',     'olof@example.com',    NULL,             7, 'pending',   'Status pending: awaiting confirmation — ask your agent to confirm it and send the email.', NULL::timestamptz,          NULL::text),
    (v_strategy, 'Maria Lund',    'maria.l@example.com', '+46707654321',   2, 'confirmed', 'Status confirmed: the reminder automation picks this one up before start_time.',           NULL,                        NULL),
    (v_strategy, 'Karl Wahlberg', 'karl@example.com',    NULL,            -3, 'completed', 'Status completed: a finished appointment — follow-up material for your agent.',            NULL,                        NULL),
    (v_consult,  'Pia Hansson',   'pia@example.com',     NULL,             5, 'cancelled', 'Status cancelled: cancelled_at and cancelled_reason record what happened.',                now() - interval '1 day',    'Customer rescheduled')
  ) AS t(svc,cname,cemail,cphone,day_offset,status,note,cat,creason) LOOP
    INSERT INTO public.bookings(service_id,customer_name,customer_email,customer_phone,start_time,end_time,status,notes,cancelled_at,cancelled_reason)
    VALUES (r.svc, r.cname, r.cemail, r.cphone,
            (current_date + (r.day_offset || ' days')::interval + interval '10 hours')::timestamptz,
            (current_date + (r.day_offset || ' days')::interval + interval '11 hours')::timestamptz,
            r.status, r.note, r.cat, r.creason)
    RETURNING id INTO v_id;
    PERFORM public._demo_register_row(p_run_id,'bookings',v_id);
    v_bk_count := v_bk_count+1;
  END LOOP;
  RETURN jsonb_build_object('booking_services', v_svc_count, 'bookings', v_bk_count);
END $$;


ALTER FUNCTION "public"."seed_demo_bookings"("p_run_id" "uuid", "p_scenario" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."seed_demo_companies"("p_run_id" "uuid", "p_scenario" "text" DEFAULT 'default'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_count int := 0; v_id uuid; v_suffix text; r record;
BEGIN
  v_suffix := substring(p_run_id::text,1,6);
  -- One company per lifecycle_stage: prospect, customer, churned (plus one bare prospect to enrich).
  FOR r IN SELECT * FROM (VALUES
    ('Prospect: Northwind Trading ('||v_suffix||')', 'northwind-'||v_suffix||'.example','Retail',        '11-50',   '+4687123000', 'prospect'::company_lifecycle_stage, 'Lifecycle prospect: not yet a customer — the pipeline starts here.',                                    NULL::timestamptz),
    ('Enrich me: Helios Solar ('||v_suffix||')',     'helios-'||v_suffix||'.example',   NULL,            NULL,      NULL,          'prospect'::company_lifecycle_stage, 'Lifecycle prospect with empty fields: ask your agent to enrich this company from its domain.',           NULL),
    ('Customer: Acme Corp AB ('||v_suffix||')',      'acme-'||v_suffix||'.example',     'Manufacturing', '51-200',  '+4684441000', 'customer'::company_lifecycle_stage, 'Lifecycle customer: customer_since marks when the prospect converted.',                                  now() - interval '400 days'),
    ('Churned: Delta Logistics ('||v_suffix||')',    'delta-'||v_suffix||'.example',    'Logistics',     '201-500', NULL,          'churned'::company_lifecycle_stage,  'Lifecycle churned: a former customer — this is where a win-back play starts.',                           now() - interval '900 days')
  ) AS t(nm,dom,ind,sz,ph,stg,note,since) LOOP
    INSERT INTO public.companies(name,domain,industry,size,phone,website,lifecycle_stage,notes,customer_since)
    VALUES (r.nm,r.dom,r.ind,r.sz,r.ph,'https://'||r.dom,r.stg,r.note,r.since) RETURNING id INTO v_id;
    PERFORM public._demo_register_row(p_run_id,'companies',v_id);
    v_count := v_count+1;
  END LOOP;
  RETURN jsonb_build_object('companies', v_count);
END $$;


ALTER FUNCTION "public"."seed_demo_companies"("p_run_id" "uuid", "p_scenario" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."seed_demo_consultants"("p_run_id" "uuid", "p_scenario" "text" DEFAULT 'default'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_count int := 0; v_id uuid; v_suffix text; rec record;
BEGIN
  v_suffix := substring(p_run_id::text,1,6);
  FOR rec IN SELECT * FROM (VALUES
    ('Anna Lindberg',   'Senior Frontend Engineer', 'Available — free to start a new assignment now. Ask your agent to match her against an open request.',                              ARRAY['React','TypeScript','Tailwind','Design Systems'], 8,  1450, 'available',           ARRAY['Swedish','English'], true),
    ('Erik Johansson',  'Cloud Architect',          'Partially available — booked around 50%, can take a part-time engagement alongside the current one.',                               ARRAY['AWS','Terraform','Kubernetes','Node.js'],         12, 1850, 'partially_available', ARRAY['Swedish','English'], true),
    ('Sofia Bergström', 'Product Designer',         'Unavailable — fully booked on a client assignment. Keep on the bench list and revisit when it ends.',                               ARRAY['Figma','Prototyping','User Research'],            10, 1350, 'unavailable',         ARRAY['Swedish','English'], true),
    ('Lars Nilsson',    'Backend Engineer',         'Inactive profile — hidden from listings and matching. Ask your agent to review, update the skills and reactivate it.',              ARRAY['Go','PostgreSQL','gRPC'],                          9,  1500, 'available',           ARRAY['Swedish','English'], false)
  ) AS t(full_name, role_title, summary_text, skill_arr, exp_years, rate_per_hour, avail_status, lang_arr, active_flag) LOOP
    INSERT INTO public.consultant_profiles (name, title, email, summary, bio, skills, experience_years, hourly_rate_cents, currency, availability, languages, is_active)
    VALUES (rec.full_name, rec.role_title,
      lower(replace(rec.full_name,' ','.'))||'+'||v_suffix||'@example.demo',
      rec.summary_text, rec.summary_text, rec.skill_arr, rec.exp_years,
      rec.rate_per_hour*100, 'SEK', rec.avail_status, rec.lang_arr, rec.active_flag)
    RETURNING id INTO v_id;
    PERFORM public._demo_register_row(p_run_id,'consultant_profiles',v_id);
    v_count := v_count+1;
  END LOOP;
  RETURN jsonb_build_object('table','consultant_profiles','inserted',v_count);
END $$;


ALTER FUNCTION "public"."seed_demo_consultants"("p_run_id" "uuid", "p_scenario" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."seed_demo_contracts"("p_run_id" "uuid", "p_scenario" "text" DEFAULT 'default'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_count int := 0; v_id uuid; v_suffix text; v_body text; r record;
BEGIN
  v_suffix := substring(p_run_id::text,1,6);
  -- One contract per contract_status: draft, pending_signature, active, expired, terminated.
  FOR r IN SELECT * FROM (VALUES
    ('Draft: SOW – Northwind ('||v_suffix||')',              'service'::contract_type, 'draft'::contract_status,             'Northwind Trading',   'procurement+'||v_suffix||'@northwind.example', NULL::date,                 NULL::date,                 'none'::renewal_type,  4500000::bigint, 'SEK', NULL::timestamptz,           NULL::timestamptz,          'Status draft: not yet sent — ask your agent to finish the body and send it for signature.'),
    ('Pending signature: Reseller – Gamma EU ('||v_suffix||')','other'::contract_type, 'pending_signature'::contract_status, 'Gamma EU GmbH',       'contracts+'||v_suffix||'@gamma.example',       (current_date - 5)::date,   (current_date + 360)::date, 'auto'::renewal_type, 25000000::bigint, 'EUR', NULL,                         NULL,                        'Status pending_signature: sent and awaiting the counterparty''s signature.'),
    ('Active: MSA – Acme Corp ('||v_suffix||')',             'service'::contract_type, 'active'::contract_status,            'Acme Corp AB',        'legal+'||v_suffix||'@acme.example',            (current_date - 335)::date, (current_date + 30)::date,  'auto'::renewal_type, 12000000::bigint, 'SEK', now() - interval '335 days',  NULL,                        'Status active with auto-renewal and end_date ~30 days out — this is what the renewal radar watches.'),
    ('Expired: NDA – Beta Industries ('||v_suffix||')',      'nda'::contract_type,     'expired'::contract_status,           'Beta Industries Ltd', 'legal+'||v_suffix||'@beta.example',            (current_date - 800)::date, (current_date - 60)::date,  'none'::renewal_type,        0::bigint, 'SEK', now() - interval '800 days',  NULL,                        'Status expired: end_date has passed with no renewal.'),
    ('Terminated: Lease – Delta Co ('||v_suffix||')',        'lease'::contract_type,   'terminated'::contract_status,        'Delta Co',            'admin+'||v_suffix||'@delta.example',           (current_date - 400)::date, (current_date + 330)::date, 'manual'::renewal_type, 8000000::bigint, 'SEK', now() - interval '400 days',  now() - interval '30 days',  'Status terminated: ended before end_date — terminated_at records when.')
  ) AS t(title,ctype,cstatus,cname,cmail,sd,ed,rt,val,cur,signed,term,note) LOOP
    v_body := E'# ' || r.title || E'\n\n'
      || E'**Parties.** This agreement is entered into between the Provider and ' || r.cname || E'.\n\n'
      || E'## 1. Scope\nThe Provider shall deliver the agreed services described in the accompanying Statement of Work. This demo contract is generated automatically as part of demo data.\n\n'
      || E'## 2. Term\nThe agreement starts on the effective date and remains in force until terminated by either party with written notice in accordance with the renewal terms.\n\n'
      || E'## 3. Fees\nFees and currency are as stated in the contract metadata. Invoices are issued monthly in arrears unless otherwise agreed.\n\n'
      || E'## 4. Confidentiality\nBoth parties shall keep all non-public information confidential and shall not disclose it to any third party without prior written consent.\n\n'
      || E'## 5. Governing law\nThis agreement is governed by Swedish law. Disputes shall be resolved by the courts of Stockholm.\n\n'
      || E'_Seeded by demo run ' || v_suffix || E'._';
    INSERT INTO public.contracts(title,contract_type,status,counterparty_name,counterparty_email,start_date,end_date,renewal_type,value_cents,currency,notes,body_markdown,signed_at,terminated_at)
    VALUES (r.title,r.ctype,r.cstatus,r.cname,r.cmail,r.sd,r.ed,r.rt,r.val,r.cur,r.note,v_body,r.signed,r.term) RETURNING id INTO v_id;
    PERFORM public._demo_register_row(p_run_id,'contracts',v_id);
    v_count := v_count+1;
  END LOOP;
  RETURN jsonb_build_object('contracts', v_count);
END $$;


ALTER FUNCTION "public"."seed_demo_contracts"("p_run_id" "uuid", "p_scenario" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."seed_demo_crm"("p_run_id" "uuid", "p_scenario" "text" DEFAULT 'default'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_count int := 0; v_lead_id uuid; rec record;
BEGIN
  -- One lead per lead_status, plus one needs_review variant: lead, opportunity, customer, lost.
  FOR rec IN SELECT * FROM (VALUES
    ('New lead: Anna Lindberg',    'anna.lindberg+'||substring(p_run_id::text,1,6)||'@nordicfin.demo',  'lead',        35, false, 'Status lead: fresh inbound, unqualified. Ask your agent to qualify and score this lead.',            NULL::timestamptz, NULL::text),
    ('Flagged: Maria Holm',        'maria+'||substring(p_run_id::text,1,6)||'@holm-consulting.demo',    'lead',        55, true,  'Status lead with needs_review = true: the AI wants a human look before qualifying further.',          NULL, NULL),
    ('Opportunity: Johan Persson', 'johan+'||substring(p_run_id::text,1,6)||'@persson-tech.demo',       'opportunity', 88, false, 'Status opportunity: qualified and deal-ready. Ask your agent to create a deal from this lead.',       NULL, NULL),
    ('Customer: Erik Sjöberg',     'erik+'||substring(p_run_id::text,1,6)||'@sjoberg-bygg.demo',        'customer',    95, false, 'Status customer: converted_at marks when this lead became a customer.',                               now() - interval '30 days', NULL),
    ('Lost: Sara Eklund',          'sara.eklund+'||substring(p_run_id::text,1,6)||'@eklundlaw.demo',    'lost',        40, false, 'Status lost: lost_reason records WHY — lost-discipline keeps the pipeline honest.',                   NULL, 'No budget this year')
  ) AS t(name, email, status, score, review, summary, conv, lostr) LOOP
    INSERT INTO public.leads (email, name, status, score, source, ai_summary, needs_review, converted_at, lost_reason)
    VALUES (rec.email, rec.name, rec.status::lead_status, rec.score, 'demo:'||p_scenario, rec.summary, rec.review, rec.conv, rec.lostr)
    RETURNING id INTO v_lead_id;
    PERFORM public._demo_register_row(p_run_id, 'leads', v_lead_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('table','leads','inserted',v_count);
END $$;


ALTER FUNCTION "public"."seed_demo_crm"("p_run_id" "uuid", "p_scenario" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."seed_demo_deals"("p_run_id" "uuid", "p_scenario" "text" DEFAULT 'default'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_count int := 0; v_id uuid; v_lead uuid; v_suffix text; r record;
BEGIN
  v_suffix := substring(p_run_id::text,1,6);
  -- One deal per pipeline stage (skipping 'lead' — that state lives on the leads table).
  FOR r IN SELECT * FROM (VALUES
    ('Anders Lind',    'anders+'||v_suffix||'@helios.example',   'Stage prospecting: first contact made — ask your agent for a research brief on this company', 'prospecting'::deal_stage,  1200000, (current_date + 60)::date, NULL::text),
    ('Marcus Berg',    'marcus+'||v_suffix||'@northwind.example','Stage qualified: budget and need confirmed, ready for a proposal',                            'qualified'::deal_stage,    4500000, (current_date + 45)::date, NULL),
    ('Lisa Andersson', 'lisa+'||v_suffix||'@acme.example',       'Stage proposal: quote is out — ask your agent to draft the follow-up',                        'proposal'::deal_stage,    18000000, (current_date + 30)::date, NULL),
    ('Sara Holm',      'sara+'||v_suffix||'@gamma.example',      'Stage negotiation: terms under discussion, expected close is near',                           'negotiation'::deal_stage, 25000000, (current_date + 14)::date, NULL),
    ('Eva Norén',      'eva+'||v_suffix||'@lumen.example',       'Stage closed_won: closed_at is set the moment a deal closes',                                 'closed_won'::deal_stage,   9800000, (current_date - 7)::date,  NULL),
    ('Karin Ek',       'karin+'||v_suffix||'@vertex.example',    'Stage closed_lost: lost_reason records WHY — lost-discipline keeps the pipeline honest',      'closed_lost'::deal_stage,  6000000, (current_date - 3)::date,  'Chose competitor on price')
  ) AS t(nm,em,title,stg,val,close,lostr) LOOP
    INSERT INTO public.leads(name,email,status,source,ai_summary)
    VALUES (r.nm,r.em,'opportunity'::lead_status,'demo','Lead for deal: '||r.title) RETURNING id INTO v_lead;
    PERFORM public._demo_register_row(p_run_id,'leads',v_lead);
    INSERT INTO public.deals(lead_id,stage,value_cents,currency,expected_close,notes,closed_at,lost_reason)
    VALUES (v_lead,r.stg,r.val,'SEK',r.close,r.title, CASE WHEN r.stg IN ('closed_won','closed_lost') THEN now() - interval '7 days' ELSE NULL END, r.lostr)
    RETURNING id INTO v_id;
    PERFORM public._demo_register_row(p_run_id,'deals',v_id);
    v_count := v_count+1;
  END LOOP;
  RETURN jsonb_build_object('deals', v_count, 'leads', v_count);
END $$;


ALTER FUNCTION "public"."seed_demo_deals"("p_run_id" "uuid", "p_scenario" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."seed_demo_documents"("p_run_id" "uuid", "p_scenario" "text" DEFAULT 'default'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_count int := 0; v_id uuid; v_suffix text; r record;
BEGIN
  v_suffix := substring(p_run_id::text,1,6);
  FOR r IN SELECT * FROM (VALUES
    ('Extracted and searchable — the agent can read this one ('||v_suffix||')', 'employee-handbook.md', 'text/markdown', 'hr', 'Policies',
      'Extraction succeeded: the markdown body below is indexed, so search and your agent can quote it.',
      E'# Employee Handbook\n\n## Working hours\nStandard week is 40h. Flexible start between 07:00 and 10:00.\n\n## Leave\n25 paid vacation days per year.\n\n## Expenses\nSubmit within 30 days via the Expenses module. Receipts required.\n\nThis document shows extraction_status = success: its text is searchable and readable by the agent.',
      'success', NULL),
    ('Waiting for extraction — content not readable yet ('||v_suffix||')', 'quarterly-report.pdf', 'application/pdf', 'finance', 'Reports',
      'Extraction is pending: the file is stored but its text has not been indexed, so the agent cannot read it yet.',
      NULL, 'pending', NULL),
    ('Extraction failed — password-protected PDF ('||v_suffix||')', 'signed-agreement-locked.pdf', 'application/pdf', 'legal', 'Contracts',
      'Extraction failed and the error is recorded. Re-upload without password protection, or ask your agent to chase the sender for an unlocked copy.',
      NULL, 'failed', 'Encrypted PDF: the text layer could not be read.'),
    ('Unsupported format — stored but never indexed ('||v_suffix||')', 'design-assets.zip', 'application/zip', 'marketing', 'Brand',
      'Archives are kept as files only: extraction_status = unsupported means no text extraction is attempted for this type.',
      NULL, 'unsupported', NULL),
    ('Image file — extraction not applicable ('||v_suffix||')', 'logo-primary.png', 'image/png', 'marketing', 'Brand',
      'Images get extraction_status = not_applicable: nothing to extract, and that is expected rather than an error.',
      NULL, 'not_applicable', NULL)
  ) AS t(title,fname,ftype,cat,folder,descr,md,xstatus,xerr) LOOP
    INSERT INTO public.documents(title,file_name,file_url,file_type,category,folder,description,content_md,extraction_status,extraction_error,content_extracted_at,source,tags)
    VALUES (r.title, r.fname, 'demo://'||r.fname, r.ftype, r.cat, r.folder, r.descr, r.md, r.xstatus, r.xerr,
            CASE WHEN r.xstatus='success' THEN now() ELSE NULL END, 'demo-seed', ARRAY['demo', r.cat])
    RETURNING id INTO v_id;
    PERFORM public._demo_register_row(p_run_id,'documents',v_id);
    v_count := v_count+1;
  END LOOP;
  RETURN jsonb_build_object('documents', v_count);
END $$;


ALTER FUNCTION "public"."seed_demo_documents"("p_run_id" "uuid", "p_scenario" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."seed_demo_ecommerce"("p_run_id" "uuid", "p_scenario" "text" DEFAULT 'default'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count int := 0;
  v_products_created int := 0;
  v_order_id uuid;
  v_item_id uuid;
  v_prod_id uuid;
  v_product_ids uuid[];
  v_product_names text[];
  v_product_prices int[];
  rec record;
  prec record;
  v_idx int;
  v_pick_id uuid;
  v_pick_name text;
  v_pick_price int;
  v_total int;
BEGIN
  -- Products cover the state space: one_time vs recurring, active vs inactive
  FOR prec IN
    SELECT * FROM (VALUES
      ('Demo: Starter Plan',      'A one-time product (type = one_time) — shown in the shop.',                                              'one_time',  49900, true,  'demo-starter-plan'),
      ('Demo: Pro Subscription',  'A recurring product (type = recurring) — pairs with the subscriptions module.',                          'recurring', 99900, true,  'demo-pro-subscription'),
      ('Demo: Onboarding Pack',   'A one-time service product with a higher price point.',                                                  'one_time',  79900, true,  'demo-onboarding-pack'),
      ('Demo: Legacy Add-on',     'Inactive product (is_active = false) — hidden from the shop. Ask your agent to relaunch or retire it.',  'one_time',  29900, false, 'demo-legacy-addon')
    ) AS t(p_name, p_desc, p_type, p_price, p_active, p_seed)
  LOOP
    INSERT INTO public.products (name, description, type, price_cents, currency, is_active, sort_order, image_url)
    VALUES (
      prec.p_name, prec.p_desc, prec.p_type::product_type, prec.p_price, 'SEK', prec.p_active, v_products_created,
      'https://picsum.photos/seed/' || prec.p_seed || '/800/600'
    )
    RETURNING id INTO v_prod_id;

    PERFORM public._demo_register_row(p_run_id, 'products', v_prod_id);
    v_products_created := v_products_created + 1;
  END LOOP;

  SELECT array_agg(id), array_agg(name), array_agg(price_cents)
    INTO v_product_ids, v_product_names, v_product_prices
  FROM (
    SELECT id, name, price_cents
    FROM public.products
    WHERE is_active = true AND price_cents > 0
    ORDER BY sort_order NULLS LAST, created_at
    LIMIT 12
  ) p;

  IF v_product_ids IS NULL OR array_length(v_product_ids, 1) = 0 THEN
    RETURN jsonb_build_object('products_created', v_products_created, 'orders_created', 0, 'skipped', 'no active products');
  END IF;

  -- Orders cover payment status (pending/paid/completed/refunded) and the
  -- fulfillment ladder (unfulfilled → packed → shipped → delivered)
  FOR rec IN
    SELECT * FROM (VALUES
      ('Anna Lindberg',    'anna.lindberg@example.demo', 'pending',   'unfulfilled', 0, 'Awaiting payment — nothing to fulfil yet.'),
      ('Erik Johansson',   'erik.j@example.demo',        'paid',      'unfulfilled', 1, 'Paid but unfulfilled — ask your agent to pick, pack and ship it.'),
      ('Sofia Bergström',  'sofia.b@example.demo',       'paid',      'packed',      2, 'Packed and ready for carrier pickup.'),
      ('Lars Nilsson',     'lars.nilsson@example.demo',  'paid',      'shipped',     4, 'Shipped — tracking number attached.'),
      ('Maria Andersson',  'maria.a@example.demo',       'completed', 'delivered',   7, 'Delivered and completed — the end state.'),
      ('Nils Olsson',      'nils.o@example.demo',        'refunded',  'unfulfilled', 9, 'Refunded before fulfilment — no shipping timestamps.')
    ) AS t(customer, email, status, fulfillment, days_ago, note)
  LOOP
    v_idx := (v_count % array_length(v_product_ids, 1)) + 1;
    v_pick_id := v_product_ids[v_idx];
    v_pick_name := v_product_names[v_idx];
    v_pick_price := v_product_prices[v_idx];
    v_total := v_pick_price * (1 + (v_count % 2));

    INSERT INTO public.orders (
      customer_email, customer_name, status, fulfillment_status,
      total_cents, currency, metadata, created_at,
      picked_at, packed_at, shipped_at, delivered_at,
      tracking_number, tracking_url, fulfillment_notes
    ) VALUES (
      rec.email, rec.customer, rec.status, rec.fulfillment,
      v_total, 'SEK', jsonb_build_object('demo', true), now() - (rec.days_ago || ' days')::interval,
      CASE WHEN rec.fulfillment IN ('picked','packed','shipped','delivered') THEN now() - ((rec.days_ago - 0) || ' days')::interval ELSE NULL END,
      CASE WHEN rec.fulfillment IN ('packed','shipped','delivered') THEN now() - ((rec.days_ago - 0) || ' days')::interval ELSE NULL END,
      CASE WHEN rec.fulfillment IN ('shipped','delivered') THEN now() - ((rec.days_ago - 1) || ' days')::interval ELSE NULL END,
      CASE WHEN rec.fulfillment = 'delivered' THEN now() - ((rec.days_ago - 2) || ' days')::interval ELSE NULL END,
      CASE WHEN rec.fulfillment IN ('shipped','delivered') THEN 'DEMO' || lpad((v_count + 1)::text, 6, '0') ELSE NULL END,
      CASE WHEN rec.fulfillment IN ('shipped','delivered') THEN 'https://tracking.example.demo/DEMO' || lpad((v_count + 1)::text, 6, '0') ELSE NULL END,
      rec.note
    )
    RETURNING id INTO v_order_id;

    PERFORM public._demo_register_row(p_run_id, 'orders', v_order_id);

    INSERT INTO public.order_items (order_id, product_id, product_name, quantity, price_cents)
    VALUES (v_order_id, v_pick_id, v_pick_name, 1 + (v_count % 2), v_pick_price)
    RETURNING id INTO v_item_id;

    PERFORM public._demo_register_row(p_run_id, 'order_items', v_item_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('products_created', v_products_created, 'orders_created', v_count);
END $$;


ALTER FUNCTION "public"."seed_demo_ecommerce"("p_run_id" "uuid", "p_scenario" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."seed_demo_expenses"("p_run_id" "uuid", "p_scenario" "text" DEFAULT 'default'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_count int := 0; v_id uuid; v_user uuid; rec record;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    SELECT user_id INTO v_user FROM public.user_roles WHERE role='admin'::app_role LIMIT 1;
  END IF;
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('table','expenses','inserted',0,'skipped','no admin user');
  END IF;
  FOR rec IN SELECT * FROM (VALUES
    ('Draft expense — taxi receipt. Ask your agent to submit it.',        'travel',    45000,  9000,  'Demo Taxi',           'draft'),
    ('Submitted expense — awaiting approval decision',                    'office',    12000,  2400,  'Demo Office Supply',  'submitted'),
    ('Approved expense — ready to be booked to the ledger',               'training',  250000, 50000, 'TechConf Demo',       'approved'),
    ('Rejected expense — missing receipt; can be edited and resubmitted', 'travel',    62000,  12400, 'Demo Restaurant',     'rejected'),
    ('Booked expense — posted to accounting as a journal entry',          'office',    8900,   1780,  'Demo Software',       'booked'),
    ('Paid expense — reimbursed to the employee; end of the lifecycle',   'travel',    31000,  6200,  'Demo Hotel',          'paid')
  ) AS t(description, category, amount, vat, vendor, status_) LOOP
    INSERT INTO public.expenses (user_id, expense_date, description, amount_cents, vat_cents, currency, category, vendor, status)
    VALUES (v_user, CURRENT_DATE - (v_count*3), rec.description, rec.amount, rec.vat, 'SEK', rec.category, rec.vendor||' [demo:'||p_scenario||']', rec.status_)
    RETURNING id INTO v_id;
    PERFORM public._demo_register_row(p_run_id,'expenses',v_id);
    v_count := v_count+1;
  END LOOP;
  RETURN jsonb_build_object('table','expenses','inserted',v_count);
END $$;


ALTER FUNCTION "public"."seed_demo_expenses"("p_run_id" "uuid", "p_scenario" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."seed_demo_hr"("p_run_id" "uuid", "p_scenario" "text" DEFAULT 'default'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_count int := 0; v_id uuid; r record;
BEGIN
  -- Covers status (active / on_leave / terminated) and employment_type (full_time / part_time / contractor)
  FOR r IN SELECT * FROM (VALUES
    ('Anna Lindberg',  'anna.lindberg+'||substring(p_run_id::text,1,6)||'@demo.flowwink.com',  'CTO',                'Engineering', 'full_time',  75000, 'active',     NULL::int, 'Active full-time employee — the default state.'),
    ('Sara Johansson', 'sara.j+'||substring(p_run_id::text,1,6)||'@demo.flowwink.com',         'Head of Sales',      'Sales',       'full_time',  60000, 'active',     NULL,      'Active — appears in org chart, headcount and payroll.'),
    ('Johan Persson',  'johan.p+'||substring(p_run_id::text,1,6)||'@demo.flowwink.com',        'Support Specialist', 'Support',     'part_time',  30000, 'active',     NULL,      'Part-time (employment_type = part_time).'),
    ('Linda Karlsson', 'linda.k+'||substring(p_run_id::text,1,6)||'@demo.flowwink.com',        'Marketing Lead',     'Marketing',   'full_time',  50000, 'on_leave',   NULL,      'On parental leave (status = on_leave) — still employed, excluded from active views.'),
    ('Erik Nilsson',   'erik.n+'||substring(p_run_id::text,1,6)||'@demo.flowwink.com',         'Contract Developer', 'Engineering', 'contractor', 45000, 'terminated', 30,        'Terminated contractor with an end date — kept for history. Ask your agent to run offboarding next time.')
  ) AS t(name,email,title,dept,etype,salary,status,end_days_ago,note) LOOP
    INSERT INTO public.employees(name,email,title,department,employment_type,start_date,monthly_salary_cents,status,end_date,notes)
    VALUES (r.name,r.email,r.title,r.dept,r.etype,current_date - (200 + v_count*150), r.salary*100, r.status,
            CASE WHEN r.end_days_ago IS NOT NULL THEN current_date - r.end_days_ago ELSE NULL END,
            r.note)
    RETURNING id INTO v_id;
    PERFORM public._demo_register_row(p_run_id,'employees',v_id);
    v_count := v_count+1;
  END LOOP;
  RETURN jsonb_build_object('employees', v_count);
END $$;


ALTER FUNCTION "public"."seed_demo_hr"("p_run_id" "uuid", "p_scenario" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."seed_demo_inventory"("p_run_id" "uuid", "p_scenario" "text" DEFAULT 'default'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_main_loc uuid;
  v_vendor_loc uuid;
  v_cust_loc uuid;
  v_product RECORD;
  v_first_prod uuid;
  v_quant_id uuid;
  v_move_id uuid;
  v_quants int := 0;
  v_moves int := 0;
  v_qty int;
BEGIN
  SELECT id INTO v_main_loc FROM stock_locations WHERE code='WH/MAIN' LIMIT 1;
  SELECT id INTO v_vendor_loc FROM stock_locations WHERE code='WH/VENDORS' LIMIT 1;
  SELECT id INTO v_cust_loc FROM stock_locations WHERE code='WH/CUSTOMERS' LIMIT 1;

  IF v_main_loc IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no main warehouse');
  END IF;

  -- Three products get on-hand stock plus a done receipt (state = done is what counts as stock)
  FOR v_product IN
    SELECT id, name FROM products WHERE is_active = true ORDER BY created_at LIMIT 3
  LOOP
    v_qty := 40 + v_quants * 20;

    INSERT INTO stock_quants (product_id, location_id, quantity, reserved_quantity)
    VALUES (v_product.id, v_main_loc, v_qty, 0)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_quant_id;

    IF v_quant_id IS NOT NULL THEN
      INSERT INTO demo_run_items (run_id, table_name, row_id) VALUES (p_run_id, 'stock_quants', v_quant_id);
      v_quants := v_quants + 1;
    END IF;

    INSERT INTO stock_moves (product_id, quantity, move_type, from_location_id, to_location_id, state, notes, reference_type)
    VALUES (v_product.id, v_qty, 'in', v_vendor_loc, v_main_loc, 'done', 'Completed receipt (move_type = in, state = done) — this filled the on-hand quant.', 'demo-seed')
    RETURNING id INTO v_move_id;
    INSERT INTO demo_run_items (run_id, table_name, row_id) VALUES (p_run_id, 'stock_moves', v_move_id);
    v_moves := v_moves + 1;

    IF v_first_prod IS NULL THEN
      v_first_prod := v_product.id;
    END IF;
  END LOOP;

  -- Remaining move states on the first product: draft, cancelled, plus a done outbound
  IF v_first_prod IS NOT NULL THEN
    INSERT INTO stock_moves (product_id, quantity, move_type, from_location_id, to_location_id, state, notes, reference_type)
    VALUES (v_first_prod, 15, 'in', v_vendor_loc, v_main_loc, 'draft', 'Draft receipt (state = draft) — not counted in stock yet. Ask your agent to confirm it.', 'demo-seed')
    RETURNING id INTO v_move_id;
    INSERT INTO demo_run_items (run_id, table_name, row_id) VALUES (p_run_id, 'stock_moves', v_move_id);
    v_moves := v_moves + 1;

    INSERT INTO stock_moves (product_id, quantity, move_type, from_location_id, to_location_id, state, notes, reference_type)
    VALUES (v_first_prod, 5, 'out', v_main_loc, v_cust_loc, 'done', 'Customer shipment (move_type = out, state = done).', 'demo-seed')
    RETURNING id INTO v_move_id;
    INSERT INTO demo_run_items (run_id, table_name, row_id) VALUES (p_run_id, 'stock_moves', v_move_id);
    v_moves := v_moves + 1;

    INSERT INTO stock_moves (product_id, quantity, move_type, from_location_id, to_location_id, state, notes, reference_type)
    VALUES (v_first_prod, 10, 'out', v_main_loc, v_cust_loc, 'cancelled', 'Cancelled shipment (state = cancelled) — never affected stock.', 'demo-seed')
    RETURNING id INTO v_move_id;
    INSERT INTO demo_run_items (run_id, table_name, row_id) VALUES (p_run_id, 'stock_moves', v_move_id);
    v_moves := v_moves + 1;
  END IF;

  RETURN jsonb_build_object('quants', v_quants, 'moves', v_moves);
END;
$$;


ALTER FUNCTION "public"."seed_demo_inventory"("p_run_id" "uuid", "p_scenario" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."seed_demo_invoices"("p_run_id" "uuid", "p_scenario" "text" DEFAULT 'default'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_count int := 0; v_id uuid; v_number text; rec record;
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    ('Draft Invoice Demo AB',   'kontakt@draft.demo',    'draft',     18000, -2,  25, 'Draft state — not yet sent. Ask your agent to review and send it.'),
    ('Sent Invoice Demo AB',    'info@sent.demo',        'sent',      45000, -10, 20, 'Sent state — awaiting payment, due date in the future.'),
    ('Paid Invoice Demo AB',    'ekonomi@paid.demo',     'paid',      92000, -30, -5, 'Paid state — settled in full; paid_at and paid_amount_cents are set.'),
    ('Overdue Invoice Demo AB', 'faktura@overdue.demo',  'overdue',   36000, -40, -12,'Overdue state — due date passed, unpaid. This is the row the dunning automation acts on.'),
    ('Cancelled Invoice Demo',  'admin@cancelled.demo',  'cancelled', 12000, -20, 10, 'Cancelled state — voided before payment; excluded from receivables.')
  ) AS t(customer, email, status, total, issue_offset, due_offset, note) LOOP
    v_number := 'DEMO-INV-'||substring(p_run_id::text,1,6)||'-'||lpad((v_count+1)::text,3,'0');
    INSERT INTO public.invoices (invoice_number, status, customer_name, customer_email, subtotal_cents, tax_cents, total_cents, currency, issue_date, due_date, line_items, notes, paid_at, paid_amount_cents)
    VALUES (v_number, rec.status::invoice_status, rec.customer, rec.email,
      (rec.total*0.8)::int, (rec.total*0.2)::int, rec.total, 'SEK',
      CURRENT_DATE+rec.issue_offset, CURRENT_DATE+rec.due_offset,
      jsonb_build_array(jsonb_build_object('description','Demo services','quantity',1,'unit_price_cents',(rec.total*0.8)::int)),
      'demo:'||p_scenario||' — '||rec.note,
      CASE WHEN rec.status='paid' THEN now() ELSE NULL END,
      CASE WHEN rec.status='paid' THEN rec.total ELSE 0 END)
    RETURNING id INTO v_id;
    PERFORM public._demo_register_row(p_run_id,'invoices',v_id);
    v_count := v_count+1;
  END LOOP;
  RETURN jsonb_build_object('table','invoices','inserted',v_count);
END $$;


ALTER FUNCTION "public"."seed_demo_invoices"("p_run_id" "uuid", "p_scenario" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."seed_demo_kb"("p_run_id" "uuid", "p_scenario" "text" DEFAULT 'default'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_cat_id uuid;
  v_art_id uuid;
  v_arts jsonb := jsonb_build_array(
    jsonb_build_object('title', 'Published and featured — visitors and the chat agent see this', 'slug', 'demo-published-featured',
      'question', 'How do knowledge base articles work?',
      'answer', 'Articles are Q&A pairs: a question visitors ask and the answer they get. Published articles appear on the public help pages, and featured ones are pinned at the top. Articles also feed the chat agent, so a good answer here means a good answer in chat.',
      'published', true, 'featured', true, 'in_chat', true),
    jsonb_build_object('title', 'This article is unpublished — ask your agent to review and publish it', 'slug', 'demo-unpublished',
      'question', 'What does unpublished mean for a KB article?',
      'answer', 'Unpublished articles are invisible to visitors and excluded from chat. Use this state to draft answers before they go live. Try asking your agent to review this answer and publish it.',
      'published', false, 'featured', false, 'in_chat', true),
    jsonb_build_object('title', 'Published but kept out of chat — the include_in_chat flag', 'slug', 'demo-not-in-chat',
      'question', 'Can an article be public but excluded from the chat agent?',
      'answer', 'Yes. Each article has an include_in_chat flag. This one is published on the help pages but the chat agent will not use it — handy for legal text or content that reads badly as a chat answer.',
      'published', true, 'featured', false, 'in_chat', false)
  );
  v_art jsonb;
  v_count int := 0;
BEGIN
  INSERT INTO public.kb_categories (name, slug, description, sort_order)
  VALUES ('Getting started with the knowledge base', 'demo-kb-states-' || substring(p_run_id::text, 1, 6),
          'One article per state: published + featured, unpublished draft, and published-but-not-in-chat.', 100)
  RETURNING id INTO v_cat_id;

  PERFORM public._demo_register_row(p_run_id, 'kb_categories', v_cat_id);

  FOR v_art IN SELECT * FROM jsonb_array_elements(v_arts) LOOP
    INSERT INTO public.kb_articles (title, slug, question, answer_text, category_id, is_published, is_featured, include_in_chat)
    VALUES (
      v_art->>'title',
      v_art->>'slug' || '-' || substring(p_run_id::text, 1, 6),
      v_art->>'question',
      v_art->>'answer',
      v_cat_id,
      (v_art->>'published')::boolean,
      (v_art->>'featured')::boolean,
      (v_art->>'in_chat')::boolean
    )
    RETURNING id INTO v_art_id;

    PERFORM public._demo_register_row(p_run_id, 'kb_articles', v_art_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('kb_category_created', 1, 'kb_articles_created', v_count);
END $$;


ALTER FUNCTION "public"."seed_demo_kb"("p_run_id" "uuid", "p_scenario" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."seed_demo_newsletter"("p_run_id" "uuid", "p_scenario" "text" DEFAULT 'default'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_count int := 0; v_id uuid; v_suffix text; r record;
BEGIN
  v_suffix := substring(p_run_id::text,1,6);
  FOR r IN SELECT * FROM (VALUES
    ('confirmed.reader+'||v_suffix||'@example.com', 'Confirmed subscriber — receives every send',            'confirmed',    -60),
    ('new.confirm+'||v_suffix||'@example.com',      'Confirmed recently — the newest cohort',                'confirmed',     -2),
    ('pending.optin+'||v_suffix||'@example.com',    'Pending — has not clicked the double opt-in email yet', 'pending',       -1),
    ('former.reader+'||v_suffix||'@example.com',    'Unsubscribed — kept only for send suppression',         'unsubscribed', -90)
  ) AS t(email,name,status,day_offset) LOOP
    INSERT INTO public.newsletter_subscribers(email,name,status,confirmed_at,unsubscribed_at)
    VALUES (r.email, r.name, r.status,
            CASE WHEN r.status='confirmed' THEN now() + (r.day_offset || ' days')::interval ELSE NULL END,
            CASE WHEN r.status='unsubscribed' THEN now() + (r.day_offset || ' days')::interval ELSE NULL END)
    RETURNING id INTO v_id;
    PERFORM public._demo_register_row(p_run_id,'newsletter_subscribers',v_id);
    v_count := v_count+1;
  END LOOP;
  RETURN jsonb_build_object('newsletter_subscribers', v_count);
END $$;


ALTER FUNCTION "public"."seed_demo_newsletter"("p_run_id" "uuid", "p_scenario" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."seed_demo_pos"("p_run_id" "uuid", "p_scenario" "text" DEFAULT 'default'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_reg_id uuid;
  v_sess_closed uuid;
  v_sess_open uuid;
  v_sess_id uuid;
  v_sale_id uuid;
  v_first_sale uuid;
  v_id uuid;
  v_count_sales int := 0;
  v_lines int := 0;
  v_prod RECORD;
  r RECORD;
  v_total int;
  v_line_count int;
  v_qty int;
  v_unit int;
  v_line_total int;
BEGIN
  SELECT id INTO v_reg_id FROM pos_registers WHERE active = true LIMIT 1;
  IF v_reg_id IS NULL THEN
    -- create a permanent demo register (NOT registered for demo cleanup —
    -- pos_sales.register_id lacks CASCADE so deleting registers fails)
    INSERT INTO pos_registers (name, location, currency, default_tax_rate, active)
    VALUES ('Demo Register #1', 'Main store', 'SEK', 25.00, true)
    RETURNING id INTO v_reg_id;
  END IF;

  -- Session state space: one closed (with cash variance), one still open
  INSERT INTO pos_sessions (register_id, cashier_name, status, opening_cash_cents, opened_at, closed_at, closing_cash_cents, expected_cash_cents, cash_variance_cents, total_sales_cents, sales_count, notes)
  VALUES (v_reg_id, 'Demo Cashier', 'closed', 100000, now() - interval '8 hours', now() - interval '30 minutes', 250000, 247500, 2500, 0, 0,
          'Closed session — counted cash was 25,00 over expected: this is what a cash variance looks like.')
  RETURNING id INTO v_sess_closed;
  PERFORM _demo_register_row(p_run_id, 'pos_sessions', v_sess_closed);

  INSERT INTO pos_sessions (register_id, cashier_name, status, opening_cash_cents, opened_at, closed_at, closing_cash_cents, expected_cash_cents, cash_variance_cents, total_sales_cents, sales_count, notes)
  VALUES (v_reg_id, 'Demo Cashier', 'open', 100000, now() - interval '2 hours', NULL, NULL, NULL, NULL, 0, 0,
          'Open session — ask your agent to close it and reconcile the drawer.')
  RETURNING id INTO v_sess_open;
  PERFORM _demo_register_row(p_run_id, 'pos_sessions', v_sess_open);

  -- Sale state space: completed / refunded / voided, across payment methods
  FOR r IN SELECT * FROM (VALUES
    (false, 'card',  'completed', 300),
    (false, 'swish', 'completed', 240),
    (false, 'card',  'refunded',  180),
    (false, 'cash',  'voided',    120),
    (true,  'cash',  'completed',  10)
  ) AS t(in_open_sess, method, status, mins_ago) LOOP
    v_sess_id := CASE WHEN r.in_open_sess THEN v_sess_open ELSE v_sess_closed END;
    v_total := 0;
    v_line_count := 1 + (v_count_sales % 2);

    INSERT INTO pos_sales (register_id, session_id, cashier_id, subtotal_cents, tax_cents, discount_cents, total_cents, currency, payment_method, status, refund_of, created_at)
    VALUES (v_reg_id, v_sess_id, NULL, 0, 0, 0, 0, 'SEK', r.method, r.status,
            CASE WHEN r.status = 'refunded' THEN v_first_sale ELSE NULL END,
            now() - (r.mins_ago * interval '1 minute'))
    RETURNING id INTO v_sale_id;
    PERFORM _demo_register_row(p_run_id, 'pos_sales', v_sale_id);
    v_count_sales := v_count_sales + 1;
    IF v_first_sale IS NULL THEN
      v_first_sale := v_sale_id;
    END IF;

    FOR v_prod IN SELECT id, name, COALESCE(price_cents, 9900) AS p FROM products WHERE is_active = true ORDER BY created_at LIMIT v_line_count LOOP
      v_qty := 1 + (v_count_sales % 2);
      v_unit := v_prod.p;
      v_line_total := v_qty * v_unit;
      v_total := v_total + v_line_total;
      INSERT INTO pos_sale_lines (sale_id, product_id, product_name, quantity, unit_price_cents, tax_rate, line_total_cents)
      VALUES (v_sale_id, v_prod.id, v_prod.name, v_qty, v_unit, 25.00, v_line_total)
      RETURNING id INTO v_id;
      PERFORM _demo_register_row(p_run_id, 'pos_sale_lines', v_id);
      v_lines := v_lines + 1;
    END LOOP;

    IF v_total = 0 THEN
      v_total := 9900;
      INSERT INTO pos_sale_lines (sale_id, product_name, quantity, unit_price_cents, tax_rate, line_total_cents)
      VALUES (v_sale_id, 'Walk-in item', 1, 9900, 25.00, 9900)
      RETURNING id INTO v_id;
      PERFORM _demo_register_row(p_run_id, 'pos_sale_lines', v_id);
      v_lines := v_lines + 1;
    END IF;

    UPDATE pos_sales SET subtotal_cents = round(v_total/1.25)::int, tax_cents = v_total - round(v_total/1.25)::int, total_cents = v_total WHERE id = v_sale_id;

    -- Voided sales never took payment; refunded sales keep their original payment row
    IF r.status <> 'voided' THEN
      INSERT INTO pos_payments (sale_id, method, amount_cents)
      VALUES (v_sale_id, r.method, v_total)
      RETURNING id INTO v_id;
      PERFORM _demo_register_row(p_run_id, 'pos_payments', v_id);
    END IF;
  END LOOP;

  UPDATE pos_sessions AS s
     SET total_sales_cents = (SELECT COALESCE(SUM(total_cents),0) FROM pos_sales WHERE session_id = s.id),
         sales_count = (SELECT COUNT(*) FROM pos_sales WHERE session_id = s.id)
   WHERE s.id IN (v_sess_closed, v_sess_open);

  RETURN jsonb_build_object('sales', v_count_sales, 'lines', v_lines);
END $$;


ALTER FUNCTION "public"."seed_demo_pos"("p_run_id" "uuid", "p_scenario" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."seed_demo_pricelists"("p_run_id" "uuid", "p_scenario" "text" DEFAULT 'default'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_count int := 0; v_id uuid; v_suffix text; r record;
BEGIN
  v_suffix := substring(p_run_id::text,1,6);
  FOR r IN SELECT * FROM (VALUES
    ('Standard SEK ('||v_suffix||')',        'Default list — is_default=true, lowest precedence fallback for every customer', 'SEK', true,  100, true,  -30, 365),
    ('Partner 20% ('||v_suffix||')',         'Higher-priority list (lower number wins) — overrides the default for partners', 'SEK', false,  50, true,  -30, 365),
    ('Expired Campaign ('||v_suffix||')',    'Validity window in the past — active flag on, but dates exclude it from pricing', 'SEK', false,  25, true, -120, -30),
    ('Disabled Draft List ('||v_suffix||')', 'Inactive list — is_active=false; ask your agent to finish and activate it',     'SEK', false,  75, false, -30, 365)
  ) AS t(nm,descr,cur,isdef,prio,active,from_off,until_off) LOOP
    INSERT INTO public.pricelists(name,description,currency,is_default,priority,is_active,valid_from,valid_until)
    VALUES (r.nm,r.descr,r.cur,r.isdef,r.prio,r.active,current_date + r.from_off, current_date + r.until_off)
    RETURNING id INTO v_id;
    PERFORM public._demo_register_row(p_run_id,'pricelists',v_id);
    v_count := v_count+1;
  END LOOP;
  RETURN jsonb_build_object('pricelists', v_count);
END $$;


ALTER FUNCTION "public"."seed_demo_pricelists"("p_run_id" "uuid", "p_scenario" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."seed_demo_projects"("p_run_id" "uuid", "p_scenario" "text" DEFAULT 'default'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_project_id uuid;
  v_task_id uuid;
  v_projects_created int := 0;
  v_tasks_created int := 0;
  v_members_added int := 0;
  v_suffix text := substring(p_run_id::text, 1, 6);
  v_member_ids uuid[];
  v_member_count int;
  prec record;
  trec record;
  v_idx int;
  v_assignee uuid;
BEGIN
  -- Pick up to 3 employees that have a real auth user_id (skip demo-only employees)
  SELECT COALESCE(array_agg(user_id), ARRAY[]::uuid[])
    INTO v_member_ids
  FROM (
    SELECT user_id FROM public.employees
    WHERE user_id IS NOT NULL AND status = 'active'
    ORDER BY created_at ASC
    LIMIT 3
  ) e;
  v_member_count := array_length(v_member_ids, 1);

  -- Three projects covering the state space: active, overdue, archived
  FOR prec IN
    SELECT * FROM (VALUES
      ('Demo: Active Project ('||v_suffix||')',   'Acme Retail AB',     'An active project with tasks in every status — todo, in progress, review and done.',                          '#6366f1', 160000, 40, (current_date + 60)::date, true,  true),
      ('Demo: Overdue Project ('||v_suffix||')',  'Sundsvall Tech',     'The deadline has passed — this is what an overdue project looks like. Ask your agent to reschedule or close it.', '#f59e0b', 200000, 30, (current_date - 14)::date, true,  false),
      ('Demo: Archived Project ('||v_suffix||')', 'Malmö Finans Group', 'Archived (is_active = false) — hidden from active views but kept for reporting.',                              '#10b981', 220000, 20, (current_date - 90)::date, false, false)
    ) AS t(p_name, p_client, p_desc, p_color, p_rate, p_budget, p_deadline, p_active, p_seed_tasks)
  LOOP
    INSERT INTO public.projects (name, client_name, description, color, hourly_rate_cents, currency, is_billable, is_active, budget_hours, deadline)
    VALUES (prec.p_name, prec.p_client, prec.p_desc, prec.p_color, prec.p_rate, 'SEK', true, prec.p_active, prec.p_budget, prec.p_deadline)
    RETURNING id INTO v_project_id;

    PERFORM public._demo_register_row(p_run_id, 'projects', v_project_id);
    v_projects_created := v_projects_created + 1;

    -- Add team members (cascade-cleaned on project delete)
    IF v_member_count IS NOT NULL AND v_member_count > 0 THEN
      FOR v_idx IN 1..v_member_count LOOP
        INSERT INTO public.project_members (project_id, user_id, role, tracks_time)
        VALUES (v_project_id, v_member_ids[v_idx],
                CASE WHEN v_idx = 1 THEN 'lead' ELSE 'member' END, true)
        ON CONFLICT (project_id, user_id) DO NOTHING;
        v_members_added := v_members_added + 1;
      END LOOP;
    END IF;

    -- Tasks only on the active project: one per status, one per priority
    IF prec.p_seed_tasks THEN
      v_idx := 0;
      FOR trec IN
        SELECT * FROM (VALUES
          ('Kickoff workshop — done',                          'done',         'medium', 0),
          ('Backend integration — in progress',                'in_progress',  'high',   1),
          ('Design system — waiting in review',                'review',       'urgent', 2),
          ('Launch checklist — todo. Ask your agent to plan it','todo',        'low',    3)
        ) AS t(p_title, p_status, p_priority, p_sort)
      LOOP
        v_assignee := NULL;
        IF v_member_count IS NOT NULL AND v_member_count > 0 THEN
          v_assignee := v_member_ids[(v_idx % v_member_count) + 1];
        END IF;

        INSERT INTO public.project_tasks (project_id, title, status, priority, sort_order, completed_at, estimated_hours, assigned_to)
        VALUES (
          v_project_id,
          trec.p_title,
          trec.p_status::project_task_status,
          trec.p_priority::project_task_priority,
          trec.p_sort,
          CASE WHEN trec.p_status = 'done' THEN now() - ((5 - trec.p_sort) || ' days')::interval ELSE NULL END,
          4 + trec.p_sort,
          v_assignee
        )
        RETURNING id INTO v_task_id;

        PERFORM public._demo_register_row(p_run_id, 'project_tasks', v_task_id);
        v_tasks_created := v_tasks_created + 1;
        v_idx := v_idx + 1;
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'projects_created', v_projects_created,
    'tasks_created', v_tasks_created,
    'members_added', v_members_added,
    'team_size', COALESCE(v_member_count, 0)
  );
END $$;


ALTER FUNCTION "public"."seed_demo_projects"("p_run_id" "uuid", "p_scenario" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."seed_demo_quotes"("p_run_id" "uuid", "p_scenario" "text" DEFAULT 'default'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count int := 0;
  v_items_count int := 0;
  v_qid uuid;
  v_qnum text;
  v_lead RECORD;
  v_product RECORD;
  v_unit_price bigint;
  v_qty int;
  v_subtotal bigint;
  v_tax bigint;
  v_status text;
  -- One quote per major quote_status (pending_approval and cancelled left out to keep volume low).
  v_statuses text[] := ARRAY['draft','sent','viewed','accepted','rejected','expired'];
  v_titles text[] := ARRAY[
    'Draft quote — ask your agent to finish and send it',
    'Sent quote — awaiting customer response',
    'Viewed quote — the customer opened it; time for a follow-up',
    'Accepted quote — ready to convert to an invoice',
    'Rejected quote — capture the reason and learn from it',
    'Expired quote — valid_until has passed; ask your agent to reissue it'
  ];
  v_idx int := 1;
BEGIN
  FOR v_lead IN
    SELECT l.id, l.name, l.email, c.name AS company_name
    FROM leads l
    LEFT JOIN companies c ON c.id = l.company_id
    WHERE l.email IS NOT NULL
    ORDER BY l.created_at DESC
    LIMIT 6
  LOOP
    v_status := v_statuses[((v_count) % array_length(v_statuses,1)) + 1];
    v_qnum := 'DEMO-Q-'||to_char(now(),'YYYY')||'-'||lpad((v_count+1)::text,4,'0')||'-'||substring(p_run_id::text,1,4);

    INSERT INTO quotes (
      quote_number, status, lead_id,
      customer_name, customer_email, customer_company,
      title, intro_text, terms_text,
      subtotal_cents, tax_cents, total_cents, currency,
      valid_until, notes,
      sent_at, viewed_at, accepted_at, rejected_at
    ) VALUES (
      v_qnum, v_status::quote_status, v_lead.id,
      v_lead.name, v_lead.email, v_lead.company_name,
      v_titles[((v_count) % array_length(v_titles,1)) + 1],
      'Thank you for the opportunity to quote on this engagement.',
      'Payment terms: 30 days net. Quote valid for 30 days.',
      0, 0, 0, 'SEK',
      CASE WHEN v_status = 'expired' THEN (now() - interval '5 days')::date ELSE (now() + interval '30 days')::date END,
      'demo:'||p_scenario,
      CASE WHEN v_status IN ('sent','viewed','accepted','rejected','expired') THEN now() - interval '10 days' ELSE NULL END,
      CASE WHEN v_status IN ('viewed','accepted','rejected') THEN now() - interval '3 days' ELSE NULL END,
      CASE WHEN v_status = 'accepted' THEN now() - interval '2 days' ELSE NULL END,
      CASE WHEN v_status = 'rejected' THEN now() - interval '1 day' ELSE NULL END
    )
    RETURNING id INTO v_qid;
    PERFORM _demo_register_row(p_run_id,'quotes',v_qid);
    v_count := v_count + 1;

    v_idx := 0;
    FOR v_product IN
      SELECT id, name, price_cents FROM products WHERE is_active = true ORDER BY random() LIMIT 3
    LOOP
      v_qty := 1 + floor(random()*4)::int;
      v_unit_price := COALESCE(v_product.price_cents, 150000);
      v_subtotal := v_qty * v_unit_price;
      v_tax := (v_subtotal * 0.25)::bigint;

      INSERT INTO quote_items (
        quote_id, position, description, quantity, unit, unit_price_cents,
        tax_rate_pct, line_subtotal_cents, line_tax_cents, line_total_cents, product_id
      ) VALUES (
        v_qid, v_idx, v_product.name, v_qty, 'st', v_unit_price,
        25.00, v_subtotal, v_tax, v_subtotal + v_tax, v_product.id
      );
      v_idx := v_idx + 1;
      v_items_count := v_items_count + 1;
    END LOOP;

    IF v_idx = 0 THEN
      v_unit_price := 75000 + floor(random()*30)::int * 5000;
      v_qty := 1 + floor(random()*3)::int;
      v_subtotal := v_qty * v_unit_price;
      v_tax := (v_subtotal * 0.25)::bigint;
      INSERT INTO quote_items (
        quote_id, position, description, quantity, unit, unit_price_cents,
        tax_rate_pct, line_subtotal_cents, line_tax_cents, line_total_cents
      ) VALUES (
        v_qid, 0, 'Consulting services', v_qty, 'h', v_unit_price,
        25.00, v_subtotal, v_tax, v_subtotal + v_tax
      );
      v_items_count := v_items_count + 1;
    END IF;

    UPDATE quotes SET
      subtotal_cents = COALESCE((SELECT SUM(line_subtotal_cents) FROM quote_items WHERE quote_id = v_qid), 0),
      tax_cents = COALESCE((SELECT SUM(line_tax_cents) FROM quote_items WHERE quote_id = v_qid), 0),
      total_cents = COALESCE((SELECT SUM(line_total_cents) FROM quote_items WHERE quote_id = v_qid), 0)
    WHERE id = v_qid;
  END LOOP;

  RETURN jsonb_build_object('quotes', v_count, 'line_items', v_items_count, 'skipped_reason',
    CASE WHEN v_count = 0 THEN 'no leads found — seed CRM first' ELSE NULL END);
END;
$$;


ALTER FUNCTION "public"."seed_demo_quotes"("p_run_id" "uuid", "p_scenario" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."seed_demo_reconciliation"("p_run_id" "uuid", "p_scenario" "text" DEFAULT 'default'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count int := 0;
  v_id uuid;
  v_bank_id uuid;
  r RECORD;
  i int := 1;
BEGIN
  SELECT id INTO v_bank_id FROM bank_accounts WHERE archived = false ORDER BY is_default DESC, created_at LIMIT 1;
  IF v_bank_id IS NULL THEN
    INSERT INTO bank_accounts (name, account_number, currency, gl_account, is_default)
    VALUES ('Demo Operating Account', 'SE45 5000 0000 0583 9825 7466', 'SEK', '1930', true)
    RETURNING id INTO v_bank_id;
    PERFORM _demo_register_row(p_run_id, 'bank_accounts', v_bank_id);
  END IF;

  FOR r IN SELECT * FROM (VALUES
    ('Globex Inc',       'INV-2025-0142', 1500000, CURRENT_DATE - 14, 'matched',   'Matched inflow — fully reconciled against a customer invoice'),
    ('AWS EMEA SARL',    'AWS-INV-9381',  -348000, CURRENT_DATE - 5,  'matched',   'Matched outflow — negative amount, reconciled against a vendor bill'),
    ('Pied Piper',       'INV-2025-0156',  125000, CURRENT_DATE - 6,  'partial',   'Partial match — half reconciled; ask your agent to find the rest'),
    ('Unknown transfer', 'TXN-998877',      85000, CURRENT_DATE - 1,  'unmatched', 'Unmatched inflow — this is the row the reconciliation workflow acts on'),
    ('Bank fee',         'FEE-202511',      -7500, CURRENT_DATE - 3,  'unmatched', 'Unmatched outflow — small bank fee waiting to be booked'),
    ('Own account',      'INTTRF-4411',     50000, CURRENT_DATE - 2,  'ignored',   'Ignored — internal transfer, deliberately excluded from matching')
  ) AS t(party, ref_, amount, when_, status_, note_) LOOP
    INSERT INTO bank_transactions (
      bank_account_id, source, external_id, transaction_date, amount_cents,
      currency, counterparty, reference, description, status, matched_amount_cents
    ) VALUES (
      v_bank_id, 'csv', 'demo-'||p_run_id::text||'-'||i, r.when_, r.amount,
      'SEK', r.party, r.ref_, r.note_, r.status_,
      CASE r.status_ WHEN 'matched' THEN abs(r.amount) WHEN 'partial' THEN abs(r.amount)/2 ELSE 0 END
    ) RETURNING id INTO v_id;
    PERFORM _demo_register_row(p_run_id, 'bank_transactions', v_id);
    v_count := v_count + 1;
    i := i + 1;
  END LOOP;
  RETURN jsonb_build_object('bank_transactions', v_count);
END $$;


ALTER FUNCTION "public"."seed_demo_reconciliation"("p_run_id" "uuid", "p_scenario" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."seed_demo_recruitment"("p_run_id" "uuid", "p_scenario" "text" DEFAULT 'default'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_count int := 0; v_id uuid; v_suffix text; r record;
BEGIN
  v_suffix := substring(p_run_id::text,1,6);
  -- One posting per job_posting_status: published, draft, closed, archived (employment types varied too).
  FOR r IN SELECT * FROM (VALUES
    ('Published: Senior Backend Engineer ('||v_suffix||')', 'senior-backend-'||v_suffix,  'Engineering', 'Stockholm', 'hybrid', 'full_time'::employment_kind,  'published'::job_posting_status, 650000, 850000, 'Status published: live on the public careers page and accepting applications.',                    true,  false),
    ('Draft: Marketing Intern ('||v_suffix||')',            'marketing-intern-'||v_suffix,'Marketing',   'Stockholm', 'hybrid', 'internship'::employment_kind, 'draft'::job_posting_status,     180000, 220000, 'Status draft: not yet visible — ask your agent to finish this posting and publish it.',            false, false),
    ('Closed: Interim Data Engineer ('||v_suffix||')',      'interim-data-'||v_suffix,    'Engineering', 'Remote EU', 'remote', 'contract'::employment_kind,   'closed'::job_posting_status,    700000, 900000, 'Status closed: position filled — closed_at marks when applications stopped.',                      true,  true),
    ('Archived: Office Coordinator ('||v_suffix||')',       'office-coord-'||v_suffix,    'Operations',  'Göteborg',  'onsite', 'part_time'::employment_kind,  'archived'::job_posting_status,  240000, 300000, 'Status archived: hidden everywhere but kept for history and reporting.',                           true,  true)
  ) AS t(title,slug,dept,loc,remote,etype,stat,smin,smax,descr,pub,closed) LOOP
    INSERT INTO public.job_postings(title,slug,department,location,remote_policy,employment_type,status,salary_min_cents,salary_max_cents,currency,description,requirements,published_at,closed_at)
    VALUES (r.title,r.slug,r.dept,r.loc,r.remote,r.etype,r.stat,r.smin*100,r.smax*100,'SEK',
      r.descr,
      'Strong fundamentals, collaborative mindset, fluent in English.',
      CASE WHEN r.pub THEN now() - interval '30 days' ELSE NULL END,
      CASE WHEN r.closed THEN now() - interval '5 days' ELSE NULL END)
    RETURNING id INTO v_id;
    PERFORM public._demo_register_row(p_run_id,'job_postings',v_id);
    v_count := v_count+1;
  END LOOP;
  RETURN jsonb_build_object('job_postings', v_count);
END $$;


ALTER FUNCTION "public"."seed_demo_recruitment"("p_run_id" "uuid", "p_scenario" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."seed_demo_sla"("p_run_id" "uuid", "p_scenario" "text" DEFAULT 'default'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_pols int := 0;
  v_viols int := 0;
  v_id uuid;
  v_policy_id uuid;
  r RECORD;
BEGIN
  -- Policies cover entity types, a priority-filtered policy, and one disabled policy
  FOR r IN SELECT * FROM (VALUES
    ('Urgent tickets: first response 1h', 'Priority-filtered policy — applies only to urgent tickets.',                                      'ticket', 'first_response',  60,  'urgent', true),
    ('All tickets: resolve within 5 days','Resolution SLA across all priorities.',                                                           'ticket', 'resolution',    7200, 'all',    true),
    ('New leads: first contact in 24h',   'Sales follow-up SLA on leads.',                                                                   'lead',   'first_contact', 1440, 'all',    true),
    ('Quotes: follow up within 3 days',   'Disabled policy (enabled = false) — not monitored. Ask your agent to enable it when ready.',      'quote',  'follow_up',     4320, 'all',    false)
  ) AS t(name_, desc_, entity, metric_, mins, prio, enabled_) LOOP
    INSERT INTO sla_policies (name, description, entity_type, metric, threshold_minutes, priority, enabled)
    VALUES (r.name_, r.desc_, r.entity, r.metric_, r.mins, r.prio, r.enabled_)
    RETURNING id INTO v_id;
    PERFORM _demo_register_row(p_run_id, 'sla_policies', v_id);
    v_pols := v_pols + 1;
  END LOOP;

  -- Use one policy to attach violations covering severity (warning/critical/breach) and open vs resolved
  SELECT id INTO v_policy_id FROM sla_policies WHERE entity_type='ticket' AND metric='first_response' ORDER BY created_at DESC LIMIT 1;
  IF v_policy_id IS NOT NULL THEN
    FOR r IN SELECT * FROM (VALUES
      ('ticket', 'first_response',  60,   75, 'warning',  NULL::timestamptz,       'Open warning — 15 minutes over threshold.'),
      ('ticket', 'first_response',  60,  190, 'critical', NULL::timestamptz,       'Open critical — more than 3x over threshold.'),
      ('ticket', 'resolution',    7200, 8400, 'breach',   NULL::timestamptz,       'Open breach on the resolution SLA — this is what escalations fire on.'),
      ('ticket', 'first_response',  60,   72, 'warning',  now() - interval '2 days','Resolved violation — kept for compliance history.')
    ) AS t(entity, metric_, thresh, actual_, sev, resolved, note_) LOOP
      INSERT INTO sla_violations (policy_id, entity_type, entity_id, metric, threshold_minutes, actual_minutes, severity, resolved_at, notes)
      VALUES (v_policy_id, r.entity, gen_random_uuid()::text, r.metric_, r.thresh, r.actual_, r.sev, r.resolved, r.note_)
      RETURNING id INTO v_id;
      PERFORM _demo_register_row(p_run_id, 'sla_violations', v_id);
      v_viols := v_viols + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('policies', v_pols, 'violations', v_viols);
END $$;


ALTER FUNCTION "public"."seed_demo_sla"("p_run_id" "uuid", "p_scenario" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."seed_demo_subscriptions"("p_run_id" "uuid", "p_scenario" "text" DEFAULT 'default'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count int := 0;
  v_id uuid;
  r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('Active Monthly Demo AB', 'billing@active.example',   'Pro Plan',   'active',   19900,  'month', false, 'Active state — the healthy baseline; renews every period'),
    ('Active Annual Demo AB',  'ap@annual.example',        'Pro Annual', 'active',   199900, 'year',  false, 'Active yearly interval — same state, longer billing period'),
    ('Trialing Demo AB',       'trial@trialing.example',   'Starter',    'trialing', 4900,   'month', false, 'Trialing state — trial_end set; converts to active or churns'),
    ('Past Due Demo AB',       'billing@pastdue.example',  'Pro Plan',   'past_due', 19900,  'month', false, 'Past due state — payment failed. This is the row dunning acts on; ask your agent to follow up'),
    ('Canceled Demo AB',       'billing@canceled.example', 'Pro Plan',   'canceled', 19900,  'month', true,  'Canceled state — canceled_at set; counts as churn'),
    ('Paused Demo AB',         'finance@paused.example',   'Starter',    'paused',   4900,   'month', false, 'Paused state — billing suspended without churning')
  ) AS t(cust, email, plan, status_, amount, interval_, canceled, note_) LOOP
    INSERT INTO subscriptions (
      customer_name, customer_email, product_name, status, unit_amount_cents,
      currency, billing_interval, current_period_start, current_period_end,
      trial_end, canceled_at, provider, metadata
    ) VALUES (
      r.cust, r.email, r.plan, r.status_::subscription_status, r.amount,
      'sek', r.interval_,
      now() - interval '15 days',
      CASE WHEN r.interval_='year' THEN now() + interval '350 days' ELSE now() + interval '15 days' END,
      CASE WHEN r.status_='trialing' THEN now() + interval '7 days' END,
      CASE WHEN r.canceled THEN now() - interval '5 days' END,
      'manual',
      jsonb_build_object('seeded', true, 'demo_note', r.note_)
    ) RETURNING id INTO v_id;
    PERFORM _demo_register_row(p_run_id, 'subscriptions', v_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('subscriptions', v_count);
END $$;


ALTER FUNCTION "public"."seed_demo_subscriptions"("p_run_id" "uuid", "p_scenario" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."seed_demo_surveys"("p_run_id" "uuid", "p_scenario" "text" DEFAULT 'default'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_count int := 0; v_id uuid; v_suffix text; r record;
BEGIN
  v_suffix := substring(p_run_id::text,1,6);
  FOR r IN SELECT * FROM (VALUES
    ('NPS — quarterly relationship survey ('||v_suffix||')', 'nps',  'Active NPS template: a 0-10 score plus one open question. Automations can send it on a schedule.',
      '[{"id":"q1","type":"nps","prompt":"How likely are you to recommend us?"},{"id":"q2","type":"text","prompt":"What is the main reason for your score?"}]'::jsonb, true),
    ('CSAT — sent after a ticket closes ('||v_suffix||')',   'csat', 'Active CSAT template: satisfaction rating tied to a specific interaction, typically a closed support ticket.',
      '[{"id":"q1","type":"csat","prompt":"How satisfied are you with the support you received?"},{"id":"q2","type":"text","prompt":"Anything we could do better?"}]'::jsonb, true),
    ('CES — effort score after onboarding ('||v_suffix||')', 'ces',  'Active CES template: measures how easy it was to get something done. Lower effort predicts retention.',
      '[{"id":"q1","type":"ces","prompt":"How easy was it to get set up?"},{"id":"q2","type":"text","prompt":"What was the hardest step?"}]'::jsonb, true),
    ('Inactive custom survey — ask your agent to revise and activate it ('||v_suffix||')', 'custom', 'Inactive template: not offered anywhere until is_active is set. Custom kind means you define every question yourself.',
      '[{"id":"q1","type":"text","prompt":"This draft question needs work — what should we ask?"}]'::jsonb, false)
  ) AS t(nm,kind,descr,qs,active) LOOP
    INSERT INTO public.survey_templates(name,kind,description,questions,is_active)
    VALUES (r.nm,r.kind,r.descr,r.qs,r.active) RETURNING id INTO v_id;
    PERFORM public._demo_register_row(p_run_id,'survey_templates',v_id);
    v_count := v_count+1;
  END LOOP;
  RETURN jsonb_build_object('survey_templates', v_count);
END $$;


ALTER FUNCTION "public"."seed_demo_surveys"("p_run_id" "uuid", "p_scenario" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."seed_demo_tickets"("p_run_id" "uuid", "p_scenario" "text" DEFAULT 'default'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tickets int := 0;
  v_comments int := 0;
  v_id uuid;
  r RECORD;
  v_lead RECORD;
  v_sla interval;
  v_resolved_at timestamptz;
  v_closed_at timestamptz;
  v_lead_id uuid;
  v_company_id uuid;
BEGIN
  -- One ticket per status: new, open, in_progress, waiting, resolved, closed
  FOR r IN SELECT * FROM (VALUES
    ('Checkout fails on card payment',   'Payment page errors out after entering card details. This ticket is brand new and unassigned.',   'new',         'urgent', 'bug',     'Maria Andersson','maria@example.com', 'Internal note: still unassigned — ask your agent to triage this and pick an assignee.', true),
    ('Copy of last month''s invoice',    'How do I download a copy of last month''s invoice? I need it for accounting.',                    'open',        'medium', 'billing', 'Per Svensson','per.s@example.com', 'You can download invoices under Settings → Billing. This ticket stays open until you confirm.', false),
    ('Calendar sync broken since update','Bookings stopped syncing to Google Calendar after last week''s update.',                          'in_progress', 'high',   'bug',     'Tom Karlsson','tom@example.com', 'Reproduced — engineering is investigating the OAuth token refresh. Status: in progress.', false),
    ('Export contacts to CSV',           'Is there a CSV export for contacts? Which fields does it include?',                               'waiting',     'medium', 'question','Eva Holm','eva.h@example.com', 'We asked which fields you need — this ticket is waiting on the customer''s reply.', false),
    ('Dark mode request',                'Would love a dark mode for the dashboard.',                                                       'resolved',    'low',    'feature', 'Lisa Berg','lisa@example.com', 'Added to the roadmap and marked resolved — note the resolved_at timestamp.', false),
    ('Refund for order #1042',           'Wrong size delivered — refund requested and completed.',                                          'closed',      'low',    'other',   'Nils Olsson','nils@example.com', 'Refund completed and ticket closed. Closed tickets carry both resolved_at and closed_at.', false)
  ) AS t(subject, desc_, status, prio, cat, cname, cemail, reply_, is_internal) LOOP

    v_sla := CASE r.prio
      WHEN 'urgent' THEN interval '4 hours'
      WHEN 'high' THEN interval '1 day'
      WHEN 'medium' THEN interval '3 days'
      ELSE interval '7 days'
    END;

    v_resolved_at := CASE WHEN r.status IN ('resolved','closed') THEN now() - interval '1 day' ELSE NULL END;
    v_closed_at := CASE WHEN r.status = 'closed' THEN now() - interval '6 hours' ELSE NULL END;

    -- Try to link to an existing lead (preferred)
    SELECT id, company_id INTO v_lead_id, v_company_id
    FROM leads WHERE email IS NOT NULL ORDER BY random() LIMIT 1;

    INSERT INTO tickets (
      subject, description, status, priority, category,
      contact_name, contact_email, source,
      lead_id, company_id,
      sla_deadline, resolved_at, closed_at
    ) VALUES (
      r.subject, r.desc_,
      r.status::ticket_status, r.prio::ticket_priority, r.cat::ticket_category,
      r.cname, r.cemail, 'manual',
      v_lead_id, v_company_id,
      now() + v_sla, v_resolved_at, v_closed_at
    )
    RETURNING id INTO v_id;
    PERFORM _demo_register_row(p_run_id, 'tickets', v_id);
    v_tickets := v_tickets + 1;

    -- Customer message thread starter
    INSERT INTO ticket_comments (ticket_id, content, is_internal, author_type, author_name)
    VALUES (v_id, r.desc_, false, 'customer', r.cname);
    v_comments := v_comments + 1;

    -- Agent reply (or internal note for the unassigned ticket)
    INSERT INTO ticket_comments (ticket_id, content, is_internal, author_type, author_name)
    VALUES (v_id, r.reply_, r.is_internal, 'agent', 'Support Team');
    v_comments := v_comments + 1;
  END LOOP;

  RETURN jsonb_build_object('tickets', v_tickets, 'comments', v_comments);
END;
$$;


ALTER FUNCTION "public"."seed_demo_tickets"("p_run_id" "uuid", "p_scenario" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."seed_demo_timesheets"("p_run_id" "uuid", "p_scenario" "text" DEFAULT 'default'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count int := 0;
  v_id uuid;
  v_proj RECORD;
  v_emp_id uuid;
  r RECORD;
BEGIN
  -- One project, five entries covering the state space:
  -- billable+invoiced, billable+uninvoiced, non-billable, old vs today
  FOR v_proj IN SELECT id FROM projects ORDER BY created_at DESC LIMIT 1 LOOP
    SELECT id INTO v_emp_id FROM employees ORDER BY random() LIMIT 1;
    FOR r IN SELECT * FROM (VALUES
      (21, 6.0, 'Billable and already invoiced — locked to an invoice (is_invoiced = true).', true,  true),
      (7,  7.5, 'Billable but not yet invoiced — ask your agent to draft the invoice.',       true,  false),
      (5,  3.0, 'Billable, uninvoiced — accumulates toward the next invoice run.',            true,  false),
      (2,  2.0, 'Internal work — not billable (is_billable = false), never invoiced.',        false, false),
      (0,  1.5, 'Logged today — shows up in this week''s timesheet.',                         true,  false)
    ) AS t(days_ago, hrs, descr, billable, invoiced) LOOP
      INSERT INTO time_entries (project_id, employee_id, entry_date, hours, description, is_billable, is_invoiced)
      VALUES (
        v_proj.id, v_emp_id,
        (CURRENT_DATE - r.days_ago)::date,
        r.hrs,
        r.descr,
        r.billable,
        r.invoiced
      ) RETURNING id INTO v_id;
      PERFORM _demo_register_row(p_run_id, 'time_entries', v_id);
      v_count := v_count + 1;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('time_entries', v_count);
END $$;


ALTER FUNCTION "public"."seed_demo_timesheets"("p_run_id" "uuid", "p_scenario" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."seed_demo_vendors"("p_run_id" "uuid", "p_scenario" "text" DEFAULT 'default'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_count int := 0; v_id uuid; v_suffix text; r record;
BEGIN
  v_suffix := substring(p_run_id::text,1,6);
  FOR r IN SELECT * FROM (VALUES
    ('Nordic Office Supplies AB ('||v_suffix||')', 'orders+'||v_suffix||'@nordicoffice.se',   '+4684441100', 'https://nordicoffice.se',  'net30','SEK', true,  'Standard SEK vendor on net30 — the typical case'),
    ('CloudHost EU ('||v_suffix||')',              'billing+'||v_suffix||'@cloudhost.eu',     NULL,          'https://cloudhost.eu',     'net15','EUR', true,  'Foreign-currency vendor (EUR) on net15 — exercises FX and shorter terms'),
    ('Stockholm Catering ('||v_suffix||')',        'sales+'||v_suffix||'@sthlmcatering.se',   '+4687123344', NULL,                       'net14','SEK', true,  'Minimal record — no website; ask your agent to enrich this vendor'),
    ('Legal Partners KB ('||v_suffix||')',         'invoice+'||v_suffix||'@legalpartners.se', '+4686677788', 'https://legalpartners.se', 'net30','SEK', true,  'Services vendor — legal fees, typically booked to a different account than goods'),
    ('Retired Printworks ('||v_suffix||')',        'info+'||v_suffix||'@retiredprint.se',     NULL,          NULL,                       'net30','SEK', false, 'Inactive vendor — is_active=false hides it from pickers but keeps history')
  ) AS t(name,email,phone,web,terms,curr,active,notes) LOOP
    INSERT INTO public.vendors(name,email,phone,website,payment_terms,currency,notes,is_active)
    VALUES (r.name,r.email,r.phone,r.web,r.terms,r.curr,r.notes,r.active) RETURNING id INTO v_id;
    PERFORM public._demo_register_row(p_run_id,'vendors',v_id);
    v_count := v_count+1;
  END LOOP;
  RETURN jsonb_build_object('vendors', v_count);
END $$;


ALTER FUNCTION "public"."seed_demo_vendors"("p_run_id" "uuid", "p_scenario" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."seed_demo_webinars"("p_run_id" "uuid", "p_scenario" "text" DEFAULT 'default'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_webinars int := 0;
  v_regs int := 0;
  v_wid uuid;
  r RECORD;
  v_lead RECORD;
  v_reg_count int;
  i int;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('Completed webinar — recording attached, follow-ups sent',   'This one already ran. Attendance is tracked per registrant and the recording URL is set — the follow-up automation works from exactly this state.', 'Recap · Attendance · Recording · Follow-up', now() - interval '14 days',       60, 'completed', true),
    ('Published webinar — open for registration',                 'Published webinars are visible on the public site and collect registrations. Reminder emails go out automatically at T-24h and T-1h.',              'Intro · Demo · Q&A',                        now() + interval '7 days',        45, 'published', false),
    ('Live right now — this is what an in-progress webinar looks like', 'Status live means the session has started. Registrants got their T-1h reminder; attendance is confirmed afterwards.',                        'Welcome · Main session · Q&A',              now() - interval '20 minutes',    60, 'live',      false),
    ('Draft webinar — ask your agent to finish the agenda and publish', 'Drafts are internal only: no public page, no registrations. Ask your agent to complete the description and publish it.',                     'TBD — agenda not finished',                 now() + interval '21 days',       45, 'draft',     false),
    ('Cancelled webinar — registrants should get a notice',       'Cancelled after registrations came in. The registrant list is intact — a good test case for asking your agent to draft the cancellation email.',   'Cancelled — was: Intro · Demo · Q&A',       now() + interval '3 days',        45, 'cancelled', false)
  ) AS t(title, desc_, agenda_, when_, dur, status_, has_recording) LOOP

    INSERT INTO webinars (title, description, agenda, date, duration_minutes, max_attendees, platform, meeting_url, recording_url, status)
    VALUES (
      r.title, r.desc_, r.agenda_, r.when_, r.dur, 200,
      'google_meet',
      'https://meet.google.com/demo-'||substring(md5(r.title),1,3)||'-'||substring(md5(r.title),4,4)||'-'||substring(md5(r.title),8,3),
      CASE WHEN r.has_recording THEN 'https://example.com/recordings/'||substring(md5(r.title),1,12)||'.mp4' ELSE NULL END,
      r.status_
    )
    RETURNING id INTO v_wid;
    PERFORM _demo_register_row(p_run_id, 'webinars', v_wid);
    v_webinars := v_webinars + 1;

    v_reg_count := 0;
    FOR v_lead IN
      SELECT id, name, email FROM leads
      WHERE email IS NOT NULL
      ORDER BY random()
      LIMIT (2 + floor(random()*3)::int)
    LOOP
      INSERT INTO webinar_registrations (
        webinar_id, name, email, lead_id, registered_at,
        attended, follow_up_sent,
        reminder_confirm_sent_at, reminder_t24_sent_at, reminder_t1_sent_at, reminder_post_sent_at
      ) VALUES (
        v_wid, v_lead.name, v_lead.email, v_lead.id,
        r.when_ - interval '7 days' + (random() * interval '6 days'),
        CASE WHEN r.status_ = 'completed' THEN random() < 0.65 ELSE false END,
        CASE WHEN r.status_ = 'completed' THEN random() < 0.8 ELSE false END,
        r.when_ - interval '7 days',
        CASE WHEN r.when_ < now() + interval '1 day' THEN r.when_ - interval '24 hours' ELSE NULL END,
        CASE WHEN r.when_ < now() + interval '1 hour' THEN r.when_ - interval '1 hour' ELSE NULL END,
        CASE WHEN r.status_ = 'completed' THEN r.when_ + interval '2 hours' ELSE NULL END
      );
      v_regs := v_regs + 1;
      v_reg_count := v_reg_count + 1;
    END LOOP;

    IF v_reg_count < 3 THEN
      FOR i IN 1..(3 - v_reg_count) LOOP
        INSERT INTO webinar_registrations (webinar_id, name, email, registered_at)
        VALUES (
          v_wid,
          (ARRAY['Alex Demo','Sara Demo','Karl Demo','Mia Demo','Jonas Demo'])[1 + floor(random()*5)::int],
          'demo'||floor(random()*9999)::int||'@example.com',
          r.when_ - interval '5 days'
        );
        v_regs := v_regs + 1;
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('webinars', v_webinars, 'registrations', v_regs);
END;
$$;


ALTER FUNCTION "public"."seed_demo_webinars"("p_run_id" "uuid", "p_scenario" "text") OWNER TO "postgres";

-- Re-assert the 2026-07-23 security posture on the replaced helpers: the
-- seed_demo_* internals must not be directly callable via PostgREST. CREATE OR
-- REPLACE preserves existing ACLs on live instances; this makes the fresh
-- replay independent of ordering assumptions.
DO $revoke$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'seed\_demo\_%'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated', r.sig);
  END LOOP;
END $revoke$;
