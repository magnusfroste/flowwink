-- Tio konsulter i demoseeden — med CV-djup och det tillståndsrum seeden lär ut
--
-- Magnus (2026-09-02, inför Stefans demo): "kan vi utöka seed till 10
-- konsulter - lite varierande profiler" och "i UI visar bara väldigt lite om
-- konsulten - trodde vi hade mer kontext - som är simulerat inläst från deras
-- pdf". Seeden från 08-14 lärde ut fyra tillstånd (available /
-- partially_available / unavailable / inaktiv) med FYRA profiler vars text
-- var lärarens anteckning, inte konsultens — och det är summary+bio som
-- embeddas för den semantiska matchningen, så "Ask your agent to match her"
-- matchade inga uppdrag alls. Ingen profil bar experience_json, education
-- eller certifikat — fälten parse-resume och check-in-intervjun skriver.
--
-- Nu: tio profiler över tio kompetensområden med riktig profilprosa i
-- summary, ett markdown-bio i CV-form (som inläst från en PDF), två–tre
-- uppdrag i experience_json (formen consultant_checkin_update deklarerar:
-- title, company, start_date, end_date, description), utbildning,
-- certifikat, språk, varierade år och taxor. Tillståndsrummet finns kvar —
-- varje tillstånd förekommer minst en gång och nämns i första meningen.
-- Idempotent: CREATE OR REPLACE, samma signatur, samma registrering i
-- demo_run_items. Profilerna föds `stale` (triggern) och embeddas av
-- reindex-automationen eller matcherns eget sop.

CREATE OR REPLACE FUNCTION "public"."seed_demo_consultants"("p_run_id" "uuid", "p_scenario" "text" DEFAULT 'default'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_count int := 0; v_id uuid; v_suffix text; rec record;
BEGIN
  v_suffix := substring(p_run_id::text,1,6);
  FOR rec IN SELECT * FROM (VALUES
    -- 1. Frontend — available
    ('Anna Lindberg', 'Senior Frontend Engineer',
      'Available now. Eight years of React and TypeScript in product teams at fintech scale and two design-system rebuilds from scratch. Strong on accessibility, performance budgets and developer experience; comfortable owning the frontend architecture for a team of five to eight.',
      E'## Profile\nFrontend engineer who has spent eight years turning product ambition into shippable interfaces. Owns the whole frontend surface — architecture, component library, build pipeline and the conversation with design — and measures her work in Core Web Vitals and accessibility audits, not in features shipped.\n\n## Selected assignments\n- **Klarna Checkout** — rebuilt the merchant onboarding flow in React 18 with a new design system; time-to-first-transaction down 40 %.\n- **Kivra** — led the accessibility programme to WCAG 2.2 AA across the web client; ran the audit tooling into CI.\n- **Bonnier News** — Next.js migration of the subscription funnel; LCP from 4.1 s to 1.6 s on mobile.\n\n## How she works\nPairs with designers early, writes the ADR before the refactor, and leaves a component library the next team can actually use.',
      ARRAY['React','TypeScript','Next.js','Tailwind','Design Systems','Accessibility','Vitest','Storybook'], 8, 1450, 'available', ARRAY['Swedish','English'], true,
      '[{"title":"Senior Frontend Engineer","company":"Klarna","start_date":"2023-01","end_date":"2025-06","description":"Merchant onboarding rebuilt in React 18 on a new design system; owned frontend architecture for a team of seven."},{"title":"Frontend Lead (consultant)","company":"Kivra","start_date":"2021-03","end_date":"2022-12","description":"Accessibility programme to WCAG 2.2 AA; audit tooling in CI; mentoring of four developers."},{"title":"Frontend Developer","company":"Bonnier News","start_date":"2017-08","end_date":"2021-02","description":"Next.js migration of the subscription funnel; performance work that halved mobile LCP."}]'::jsonb,
      '[{"institution":"KTH Royal Institute of Technology","degree":"M.Sc. Media Technology","year":"2017"}]'::jsonb,
      ARRAY['IAAP CPACC','Google Mobile Web Specialist']),
    -- 2. Cloud — partially available
    ('Erik Johansson', 'Cloud Architect — AWS & Azure',
      'Partially available — booked around 50 %, open to a part-time engagement alongside the current one. Twelve years of cloud infrastructure; led three enterprise migrations to AWS and one to Azure. Event-driven serverless, landing zones, FinOps and Terraform at scale.',
      E'## Profile\nCloud architect who has run large migrations end to end: business case, landing zone, migration waves, cost governance and the operating model afterwards. Prefers boring, well-documented platforms over clever ones.\n\n## Selected assignments\n- **Scania** — AWS landing zone and migration of 140 workloads in 14 months; FinOps practice that cut run cost 31 %.\n- **Ericsson** — Azure platform for an internal developer portal; policy-as-code with Terraform and OPA.\n- **Stockholm Exergi** — event-driven serverless integration layer replacing a nightly batch platform.\n\n## Certifications & speaking\nAWS Solutions Architect Professional, Azure Solutions Architect Expert. Speaks at AWS Community Day Nordics.',
      ARRAY['AWS','Azure','Terraform','Kubernetes','Serverless','Event-driven architecture','FinOps','Landing zones'], 12, 1850, 'partially_available', ARRAY['Swedish','English'], true,
      '[{"title":"Lead Cloud Architect (consultant)","company":"Scania","start_date":"2022-09","end_date":"present","description":"AWS landing zone, 140-workload migration in 14 months, FinOps practice (-31 % run cost)."},{"title":"Cloud Architect (consultant)","company":"Ericsson","start_date":"2020-01","end_date":"2022-08","description":"Azure platform for an internal developer portal; policy-as-code with Terraform and OPA."},{"title":"Infrastructure Engineer","company":"Stockholm Exergi","start_date":"2014-05","end_date":"2019-12","description":"From on-prem VMware to an event-driven serverless integration layer."}]'::jsonb,
      '[{"institution":"Chalmers University of Technology","degree":"M.Sc. Computer Science and Engineering","year":"2013"}]'::jsonb,
      ARRAY['AWS Solutions Architect – Professional','Microsoft Azure Solutions Architect Expert','HashiCorp Terraform Associate']),
    -- 3. Design — unavailable
    ('Sofia Bergström', 'Product Designer',
      'Unavailable — fully booked on a client assignment until further notice; keep on the bench list. Ten years of end-to-end product design for B2B SaaS: discovery, user research, prototyping and design systems in Figma, working embedded in engineering teams.',
      E'## Profile\nProduct designer who works inside the engineering team rather than beside it. Runs discovery and research, prototypes in Figma, and hands over a design system with tokens the developers actually consume.\n\n## Selected assignments\n- **Fortnox** — redesign of the invoicing flow used by 450 000 companies; support tickets on invoicing down 27 %.\n- **Mentimeter** — design system (tokens, components, documentation) adopted by six product teams.\n- **Epidemic Sound** — research programme with 60 creator interviews feeding the 2024 roadmap.',
      ARRAY['Figma','User Research','Prototyping','Design Systems','UX Writing','Usability Testing','Design Tokens'], 10, 1350, 'unavailable', ARRAY['Swedish','English'], true,
      '[{"title":"Senior Product Designer (consultant)","company":"Fortnox","start_date":"2024-08","end_date":"present","description":"Invoicing flow redesign for 450 000 companies; support tickets on invoicing -27 %."},{"title":"Design Systems Lead","company":"Mentimeter","start_date":"2021-01","end_date":"2024-06","description":"Design system with tokens, components and docs adopted by six product teams."},{"title":"Product Designer","company":"Epidemic Sound","start_date":"2016-02","end_date":"2020-12","description":"Creator research programme; onboarding and search redesign."}]'::jsonb,
      '[{"institution":"Konstfack","degree":"M.F.A. Industrial Design","year":"2015"}]'::jsonb,
      ARRAY['Nielsen Norman Group UX Certification']),
    -- 4. Backend — inactive profile
    ('Lars Nilsson', 'Backend Engineer — Go & PostgreSQL',
      'Inactive profile — hidden from listings and matching until reviewed and reactivated. Nine years building reliable Go services on PostgreSQL with gRPC, strong observability (OpenTelemetry, Grafana) and a habit of writing the runbook before the incident.',
      E'## Profile\nBackend engineer for systems that must not go down: payments, ledgers, order flows. Go and PostgreSQL by default, Kafka where it earns its place, and observability from the first commit.\n\n## Selected assignments\n- **Trustly** — payment routing service in Go handling 2 000 req/s with p99 under 40 ms.\n- **Mathem** — order and picking domain split from a monolith into event-driven services.\n- **Svenska Spel** — ledger reconciliation service with exactly-once semantics on Kafka.',
      ARRAY['Go','PostgreSQL','gRPC','Microservices','OpenTelemetry','Kafka','Event sourcing'], 9, 1500, 'available', ARRAY['Swedish','English'], false,
      '[{"title":"Senior Backend Engineer (consultant)","company":"Trustly","start_date":"2022-03","end_date":"2024-12","description":"Payment routing in Go: 2 000 req/s, p99 < 40 ms, full OpenTelemetry tracing."},{"title":"Backend Engineer","company":"Mathem","start_date":"2019-06","end_date":"2022-02","description":"Order and picking domain extracted from the monolith into event-driven services."},{"title":"Software Engineer","company":"Svenska Spel","start_date":"2016-01","end_date":"2019-05","description":"Ledger reconciliation with exactly-once Kafka semantics."}]'::jsonb,
      '[{"institution":"Linköping University","degree":"M.Sc. Computer Science","year":"2015"}]'::jsonb,
      ARRAY['CKAD']),
    -- 5. Data — available from next month
    ('Maria Andersson', 'Data Engineer — Databricks & dbt',
      'Available from the first of next month. Seven years of modern data platforms: lakehouse architecture on Databricks, dbt and Airflow pipelines, Snowflake and BigQuery for analytics teams. Real-time streaming with Spark Structured Streaming in two retail companies.',
      E'## Profile\nData engineer who builds the platform analytics teams stop complaining about: modelled with dbt, orchestrated with Airflow, tested and documented, and cheap to run. Comfortable being the first data engineer in a company as well as one of twenty.\n\n## Selected assignments\n- **ICA** — lakehouse on Databricks replacing four warehouses; real-time stock signals with Structured Streaming.\n- **Boozt** — dbt modelling layer (900 models) with data contracts and CI; analyst onboarding from weeks to days.\n- **Tink** — Airflow platform and Snowflake cost programme (-45 % credits).',
      ARRAY['Databricks','Spark','dbt','Airflow','Snowflake','BigQuery','Python','SQL','Data Modelling'], 7, 1400, 'available', ARRAY['Swedish','English'], true,
      '[{"title":"Senior Data Engineer (consultant)","company":"ICA","start_date":"2023-05","end_date":"2025-08","description":"Databricks lakehouse replacing four warehouses; real-time stock signals with Structured Streaming."},{"title":"Analytics Engineer","company":"Boozt","start_date":"2021-01","end_date":"2023-04","description":"900-model dbt layer with data contracts and CI."},{"title":"Data Engineer","company":"Tink","start_date":"2018-09","end_date":"2020-12","description":"Airflow platform; Snowflake cost programme (-45 % credits)."}]'::jsonb,
      '[{"institution":"Uppsala University","degree":"M.Sc. Data Science","year":"2018"}]'::jsonb,
      ARRAY['Databricks Certified Data Engineer Professional','dbt Analytics Engineering Certification']),
    -- 6. DevOps — partially available
    ('Johan Karlsson', 'DevOps & Platform Engineer',
      'Partially available — two days a week free. Eleven years of platform engineering: Kubernetes on-prem and in cloud, GitHub Actions and ArgoCD delivery pipelines, internal developer platforms that cut lead time from weeks to hours. Has built platform teams at three scale-ups.',
      E'## Profile\nPlatform engineer who treats the developer platform as a product with users, an SLO and a roadmap. Kubernetes, GitOps and paved roads; measures success in lead time and change-failure rate.\n\n## Selected assignments\n- **Einride** — internal developer platform on GKE with ArgoCD; deploy lead time from 9 days to 2 hours.\n- **Voi** — on-prem to cloud Kubernetes migration for 60 services; zero-downtime cutover.\n- **Sinch** — GitHub Actions delivery pipelines and supply-chain hardening (SLSA level 2).',
      ARRAY['Kubernetes','GitHub Actions','ArgoCD','Terraform','Helm','Platform Engineering','SRE','GitOps'], 11, 1600, 'partially_available', ARRAY['Swedish','English','German'], true,
      '[{"title":"Staff Platform Engineer (consultant)","company":"Einride","start_date":"2023-02","end_date":"present","description":"Internal developer platform on GKE with ArgoCD; lead time 9 days → 2 hours."},{"title":"Platform Team Lead","company":"Voi","start_date":"2020-06","end_date":"2023-01","description":"On-prem to cloud Kubernetes for 60 services with zero-downtime cutover."},{"title":"DevOps Engineer","company":"Sinch","start_date":"2015-03","end_date":"2020-05","description":"Delivery pipelines and supply-chain hardening to SLSA 2."}]'::jsonb,
      '[{"institution":"Lund University","degree":"B.Sc. Computer Science","year":"2014"}]'::jsonb,
      ARRAY['CKA','CKS','AWS DevOps Engineer – Professional']),
    -- 7. AI/ML — available
    ('Emma Svensson', 'AI/ML Engineer — LLM applications',
      'Available now. Six years in machine learning, the last three on production LLM systems: retrieval-augmented generation, structured output, evaluation harnesses and cost control. PyTorch and Hugging Face for fine-tuning; ships with evals, not vibes.',
      E'## Profile\nML engineer who takes LLM features from demo to production: retrieval design, evaluation sets, guardrails, latency and cost budgets. Fine-tunes when it pays and says so when it does not.\n\n## Selected assignments\n- **Hemnet** — RAG-based listing assistant with an offline eval harness of 1 200 graded questions; hallucination rate below 2 %.\n- **Lovable** — structured-output pipeline and prompt regression suite for a code-generation product.\n- **Karolinska Institutet** — fine-tuned clinical-text classifier (PyTorch) under a data-protection impact assessment.',
      ARRAY['Python','LLM','RAG','LangChain','PyTorch','Hugging Face','Evaluation','MLOps','Vector search'], 6, 1750, 'available', ARRAY['Swedish','English'], true,
      '[{"title":"Senior ML Engineer (consultant)","company":"Hemnet","start_date":"2024-01","end_date":"2025-07","description":"RAG listing assistant with a 1 200-question eval harness; hallucination rate < 2 %."},{"title":"ML Engineer","company":"Lovable","start_date":"2022-09","end_date":"2023-12","description":"Structured-output pipeline and prompt regression suite."},{"title":"Machine Learning Engineer","company":"Karolinska Institutet","start_date":"2019-08","end_date":"2022-08","description":"Clinical-text classifier fine-tuning under DPIA."}]'::jsonb,
      '[{"institution":"KTH Royal Institute of Technology","degree":"M.Sc. Machine Learning","year":"2019"}]'::jsonb,
      ARRAY['AWS Machine Learning Specialty']),
    -- 8. Mobile — unavailable until Q1
    ('Niklas Persson', 'Mobile Developer — React Native & iOS',
      'Unavailable until Q1 — on a fixed-term assignment. Nine years of mobile: React Native with native modules, Swift on iOS and Kotlin on Android, app-store release trains and crash-free-rate work for consumer apps with millions of installs.',
      E'## Profile\nMobile engineer for consumer apps at scale. Cross-platform with React Native where it fits, native Swift and Kotlin where it does not, and a release train the whole team can trust.\n\n## Selected assignments\n- **SJ** — ticket app rebuilt in React Native with native payment modules; crash-free rate 99.8 %.\n- **Swish** — iOS security hardening and biometric flows in Swift.\n- **Spotify** — Android playback stability work in Kotlin on a 20-person squad.',
      ARRAY['React Native','Swift','Kotlin','iOS','Android','Mobile CI/CD','Fastlane'], 9, 1450, 'unavailable', ARRAY['Swedish','English'], true,
      '[{"title":"Lead Mobile Engineer (consultant)","company":"SJ","start_date":"2024-03","end_date":"present","description":"Ticket app rebuilt in React Native with native payment modules; crash-free 99.8 %."},{"title":"iOS Engineer","company":"Swish","start_date":"2021-01","end_date":"2024-02","description":"Security hardening and biometric flows in Swift."},{"title":"Android Engineer","company":"Spotify","start_date":"2016-06","end_date":"2020-12","description":"Playback stability in Kotlin."}]'::jsonb,
      '[{"institution":"Malmö University","degree":"B.Sc. Computer Science","year":"2016"}]'::jsonb,
      ARRAY['Apple Certified iOS Developer']),
    -- 9. Interim leadership — available from next week
    ('Linnea Holm', 'Interim Engineering Manager / CTO',
      'Available for interim roles from next week. Fourteen years in engineering leadership, twice CTO; specialises in scaling engineering from 5 to 50, untangling tech-debt crises and handing over cleanly to a permanent hire. Hiring, OKRs, agile at the portfolio level.',
      E'## Profile\nInterim technology leader for the moments a company cannot afford to get wrong: a CTO who left, a platform that stopped scaling, a team that stopped shipping. Stabilises within weeks, builds the operating rhythm, hires the permanent leader and leaves.\n\n## Selected assignments\n- **Doktor.se** — interim CTO for 11 months; engineering from 12 to 38, release cadence weekly, permanent CTO hired and onboarded.\n- **Qliro** — interim Head of Engineering during a re-platforming; tech-debt programme with board-level reporting.\n- **Anyfin** — VP Engineering (permanent) — organisation design for four product teams.',
      ARRAY['Engineering Leadership','Interim CTO','Hiring','OKRs','Agile','Coaching','Tech Strategy','Board reporting'], 14, 1900, 'available', ARRAY['Swedish','English','Finnish'], true,
      '[{"title":"Interim CTO","company":"Doktor.se","start_date":"2024-06","end_date":"2025-05","description":"Engineering 12 → 38, weekly release cadence, permanent CTO hired and onboarded."},{"title":"Interim Head of Engineering","company":"Qliro","start_date":"2022-08","end_date":"2024-04","description":"Re-platforming and tech-debt programme with board-level reporting."},{"title":"VP Engineering","company":"Anyfin","start_date":"2018-01","end_date":"2022-06","description":"Organisation design for four product teams; hired 25 engineers."}]'::jsonb,
      '[{"institution":"Aalto University","degree":"M.Sc. Software Engineering","year":"2011"},{"institution":"Stockholm School of Economics","degree":"Executive Education, Leading Technology Organisations","year":"2019"}]'::jsonb,
      ARRAY['ICF Associate Certified Coach']),
    -- 10. Security — partially available
    ('Oskar Lundgren', 'Security Engineer — AppSec',
      'Partially available — can take audits and threat-modelling workshops now, a full-time engagement from the autumn. Ten years of application security for SaaS: threat modelling, SOC 2 and ISO 27001 readiness, penetration testing and secure SDLC coaching for developer teams.',
      E'## Profile\nApplication security engineer who makes developers better at security instead of slower. Threat modelling in the design review, findings with fixes attached, and compliance programmes that survive the audit.\n\n## Selected assignments\n- **Truecaller** — SOC 2 Type II readiness in nine months; secure SDLC rolled out to 14 teams.\n- **Bankgirot** — penetration testing and threat modelling of a new payments API under regulatory review.\n- **Northvolt** — ISO 27001 programme for the software organisation; supplier security reviews.',
      ARRAY['AppSec','Threat Modelling','SOC 2','ISO 27001','Penetration Testing','OWASP','Secure SDLC','Burp Suite'], 10, 1700, 'partially_available', ARRAY['Swedish','English'], true,
      '[{"title":"Principal Security Engineer (consultant)","company":"Truecaller","start_date":"2023-09","end_date":"present","description":"SOC 2 Type II readiness in nine months; secure SDLC in 14 teams."},{"title":"Security Consultant","company":"Bankgirot","start_date":"2021-04","end_date":"2023-08","description":"Pentesting and threat modelling of a payments API under regulatory review."},{"title":"Information Security Lead","company":"Northvolt","start_date":"2018-02","end_date":"2021-03","description":"ISO 27001 programme and supplier security reviews."}]'::jsonb,
      '[{"institution":"KTH Royal Institute of Technology","degree":"M.Sc. Information and Communication Technology","year":"2015"}]'::jsonb,
      ARRAY['OSCP','CISSP','ISO 27001 Lead Implementer'])
  ) AS t(full_name, role_title, summary_text, bio_md, skill_arr, exp_years, rate_per_hour, avail_status, lang_arr, active_flag, experience, edu, certs) LOOP
    INSERT INTO public.consultant_profiles (name, title, email, summary, bio, skills, experience_years, hourly_rate_cents, currency, availability, languages, is_active, experience_json, education, certifications, linkedin_url)
    VALUES (rec.full_name, rec.role_title,
      lower(replace(rec.full_name,' ','.'))||'+'||v_suffix||'@example.demo',
      rec.summary_text, rec.bio_md, rec.skill_arr, rec.exp_years,
      rec.rate_per_hour*100, 'SEK', rec.avail_status, rec.lang_arr, rec.active_flag,
      rec.experience, rec.edu, rec.certs,
      'https://www.linkedin.com/in/'||lower(replace(rec.full_name,' ','-'))||'-demo')
    RETURNING id INTO v_id;
    PERFORM public._demo_register_row(p_run_id,'consultant_profiles',v_id);
    v_count := v_count+1;
  END LOOP;
  RETURN jsonb_build_object('table','consultant_profiles','inserted',v_count);
END $$;

ALTER FUNCTION "public"."seed_demo_consultants"("p_run_id" "uuid", "p_scenario" "text") OWNER TO "postgres";
