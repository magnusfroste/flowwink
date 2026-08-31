-- Affärsmejlen är sajtinnehåll — offerten och avtalet på mallrälsen.
--
-- Mallsystemet fick ett språk (20260903110000) och bokningsbekräftelsen går
-- genom det. Men mejlen i själva AFFÄREN — offerten och signeringsbegäran —
-- var hårdkodad engelsk HTML rakt i avsändarna. En svensk kund som får en
-- offert från en svensk sajt fick den på engelska, och ingenting en operatör
-- eller agent kunde göra åt saken utan en kodändring.
--
-- Samma mönster som bokningens seed (20260828170000):
--   * Seedas återhävdbart, WHERE NOT EXISTS på (name, locale) — en operatörs
--     omskrivning skrivs ALDRIG över.
--   * locale='en' UTTRYCKLIGEN. Triggern sätter annars sajtens språk på nya
--     rader, och de här är skrivna på engelska — produktens golv. Att låta en
--     svensk instans stämpla dem 'sv' vore samma lögn som pages.locale-defaulten.
--   * ALL språktext bor i mallen. Koden prerendrar bara DATA: radlistor,
--     belopp, adresser. Etiketterna (Item, Amount, Subtotal, Valid until) står
--     i mallens text, annars kan de aldrig översättas.
--   * Sortnamnen är KINDS: quote_email, quote_reminder, contract_email,
--     contract_reminder. En påminnelse är en annan sorts meddelande med egen
--     ton — inte en flagga i samma mall, för replace-rendering kan inte grena.
--
-- En medveten förenkling: offertknappen säger "Open quote" oavsett om offerten
-- är i avtalsläge (approve) eller signeringsläge (sign). Distinktionen bar
-- juridisk nyans i koden, men den bor redan på offertSIDAN som renderar rätt —
-- mejlknappen behöver bara öppna den. Hellre en neutral etikett som går att
-- översätta än en precis som inte gör det.

DO $$
DECLARE
  v_quote_html text;
  v_quote_box text;
  v_contract_html text;
BEGIN
  -- Delade byggstenar. Beloppen och raderna är data ({{items_rows}} är färdiga
  -- <tr> utan språk); rubrikraden och etiketterna är mallens text.
  v_quote_box :=
    '<div style="background:#f9fafb;border:1px solid #e6e8ec;border-radius:8px;padding:16px;margin:16px 0">'
 || '<div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:#6b7280">Quote</span><strong>{{quote_number}}</strong></div>'
 || '<div style="margin-bottom:6px">{{quote_title}}</div>'
 || '<table style="width:100%;border-collapse:collapse;margin:12px 0 4px">'
 || '<thead><tr>'
 || '<th style="text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;padding-bottom:6px;border-bottom:1px solid #e6e8ec">Item</th>'
 || '<th style="text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280;padding-bottom:6px;border-bottom:1px solid #e6e8ec">Amount</th>'
 || '</tr></thead><tbody>{{items_rows}}</tbody></table>'
 || '<div style="display:flex;justify-content:space-between;margin-top:8px;font-size:13px"><span style="color:#6b7280">Subtotal</span><span style="font-family:ui-monospace,monospace">{{subtotal}}</span></div>'
 || '<div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:#6b7280">Tax</span><span style="font-family:ui-monospace,monospace">{{tax}}</span></div>'
 || '<div style="display:flex;justify-content:space-between;margin-top:6px;border-top:1px solid #e6e8ec;padding-top:6px"><strong>Total</strong><strong style="font-family:ui-monospace,monospace">{{total}}</strong></div>'
 || '<div style="display:flex;justify-content:space-between;margin-top:8px;font-size:12px;color:#6b7280"><span>Valid until</span><span>{{valid_until}}</span></div>'
 || '</div>';

  v_quote_html :=
    '<h1 style="margin:0 0 8px;font-size:20px">{{heading}}</h1>'
 || '<p style="margin:0 0 16px;color:#4b5563">{{intro}}</p>'
 || '{{custom_block}}'
 || v_quote_box
 || '<div style="text-align:center;margin:24px 0">'
 || '<a href="{{cta_url}}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">Open quote</a>'
 || '</div>'
 || '<p style="margin:16px 0 0;font-size:12px;color:#6b7280;word-break:break-all">Or copy this link:<br/>{{cta_url}}</p>';

  v_contract_html :=
    '<h2 style="margin:0 0 12px;font-size:20px">{{contract_title}}</h2>'
 || '<p>{{intro}}</p>'
 || '{{custom_block}}'
 || '<div style="background:#f9fafb;border:1px solid #e6e8ec;border-radius:8px;padding:12px 16px;margin:16px 0;font-size:14px">'
 || '<div><span style="color:#6b7280">Agreement</span> &nbsp; <strong>{{contract_number}}</strong></div>'
 || '</div>'
 || '<p style="margin:24px 0"><a href="{{cta_url}}" style="display:inline-block;padding:12px 24px;background-color:#111;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600">Review &amp; sign</a></p>'
 || '<p style="font-size:12px;color:#6b7280;word-break:break-all">Or open this link:<br/>{{cta_url}}</p>';

  -- {{heading}}/{{intro}} är EGNA mallfält i sorterna nedan, så tonen skiljer
  -- sig mellan förstautskick och påminnelse utan att koden grenar.
  INSERT INTO email_templates (name, locale, subject, html, category, variables, active)
  SELECT 'quote_email', 'en',
         'Quote {{quote_number}} from {{site_name}}',
         replace(replace(v_quote_html,
           '{{heading}}', 'Your quote {{quote_number}}'),
           '{{intro}}', 'Thank you for your interest. Please find your quote below.'),
         'sales',
         '["quote_number","quote_title","site_name","items_rows","subtotal","tax","total","valid_until","cta_url","custom_block"]'::jsonb,
         true
  WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'quote_email' AND locale = 'en');

  INSERT INTO email_templates (name, locale, subject, html, category, variables, active)
  SELECT 'quote_reminder', 'en',
         'Reminder: Quote {{quote_number}} from {{site_name}}',
         replace(replace(v_quote_html,
           '{{heading}}', 'Reminder: Quote {{quote_number}}'),
           '{{intro}}', 'This is a friendly reminder regarding the quote we sent you.'),
         'sales',
         '["quote_number","quote_title","site_name","items_rows","subtotal","tax","total","valid_until","cta_url","custom_block"]'::jsonb,
         true
  WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'quote_reminder' AND locale = 'en');

  INSERT INTO email_templates (name, locale, subject, html, category, variables, active)
  SELECT 'contract_email', 'en',
         'Agreement {{contract_number}} from {{site_name}} — ready to sign',
         replace(v_contract_html,
           '{{intro}}', 'Please review and sign the agreement below.'),
         'sales',
         '["contract_title","contract_number","site_name","cta_url","custom_block"]'::jsonb,
         true
  WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'contract_email' AND locale = 'en');

  INSERT INTO email_templates (name, locale, subject, html, category, variables, active)
  SELECT 'contract_reminder', 'en',
         'Reminder: sign {{contract_number}} from {{site_name}}',
         replace(v_contract_html,
           '{{intro}}', 'A reminder to review and sign the agreement below.'),
         'sales',
         '["contract_title","contract_number","site_name","cta_url","custom_block"]'::jsonb,
         true
  WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'contract_reminder' AND locale = 'en');
END $$;

-- ── Bevisas där den körs ───────────────────────────────────────────────────
DO $$
DECLARE v jsonb; kind text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  FOREACH kind IN ARRAY ARRAY['quote_email','quote_reminder','contract_email','contract_reminder'] LOOP
    -- En svensk mottagare på en sajt utan svensk version ska ändå få ETT mejl.
    v := public.resolve_email_template(kind, 'sv');
    IF NOT (v ->> 'ok')::boolean THEN
      RAISE EXCEPTION 'resolve(%): no template resolved at all — an email would not go out', kind;
    END IF;
    IF (v ->> 'html') IS NULL OR length(v ->> 'html') < 100 THEN
      RAISE EXCEPTION 'resolve(%): the template came back without a body', kind;
    END IF;
    -- Etiketterna måste bo i MALLEN — det är hela flytten.
    IF kind LIKE 'quote%' AND (v ->> 'html') NOT LIKE '%Subtotal%' THEN
      RAISE EXCEPTION 'resolve(%): the labels are not in the template text', kind;
    END IF;
  END LOOP;
  RAISE NOTICE 'business emails: 4 kinds seeded and resolvable';
END $$;
