-- Mejlen på mottagarens språk — fem kundmejl som fortfarande var engelsk HTML i kod.
--
-- Bokningspåminnelsen, kalenderpåminnelsen, webbinariemejlen, returbekräftelsen
-- och nyhetsbrevets dubbla opt-in byggde ämne och brödtext som hårdkodad
-- engelska i edge-koden. En svensk kund fick alltså engelsk post, och ingen
-- operatör kunde ändra en mening utan en deploy. Samma recept som bokningen,
-- offerten och fakturan (20260828170000, 20260903210000):
--   * ALLA ord bor i mallen. Koden skickar bara DATA — namn, datum, tider,
--     länkar — formaterat på företagets klocka i mallens språk, och
--     HTML-escapat (_shared/email/mail-template.ts).
--   * Villkorstext uttrycks med sektioner ({{#key}}…{{/key}}) som motorn i
--     _shared/template-render.ts stryker när variabeln är tom. Webbinariemejlet
--     är EN mall för fyra tillfällen: sorten kommer som flagga (is_confirm,
--     is_t24, is_t1, is_attended, is_missed) och mallen har en sektion per sort.
--   * Saknas mallen skickar koden sin inbyggda engelska text (Law 4) — ett mejl
--     uteblir aldrig för att en mall fattas.
--   * Seedas på en och sv, uttryckligen (triggern stämplar annars sajtens språk
--     på en engelsk text), och bara där (name, locale) saknas: en operatör som
--     redan skrivit sin egen version behåller den.
--   * Tjänstegeneriskt med flit: "bokning", aldrig samtal, möte eller klipptid —
--     instansens röst är en mallredigering, aldrig kod.
--
-- Mottagarspråket: bokningen och returens order bär en part → partner_language.
-- Kalenderhändelsen bara när den hör till en part (related_entity 'partner').
-- Webbinarieanmälan och nyhetsbrevsprenumeranten via sin `lang` (besökarens
-- språk) där den finns; annars sajtens standardspråk.

DO $$
DECLARE
  -- Ramen för fristående dokument (påminnelserna). Retur- och
  -- nyhetsbrevsmejlen är fragment — email-send ramar in dem med varumärket.
  v_open  text := '<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f9;margin:0;padding:24px;color:#111">'
               || '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e6e8ec">';
  v_close text := '<p style="margin:24px 0 0;color:#9ca3af;font-size:12px">{{site_name}}</p></div></body></html>';
  v_box   text := '<div style="background:#f9fafb;border:1px solid #e6e8ec;border-radius:8px;padding:16px 20px;margin:16px 0">';
  v_btn   text := 'style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none"';
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      -- ── booking_reminder ─────────────────────────────────────────────────
      ('booking_reminder', 'en', 'transactional',
       'Reminder: your booking on {{date}}',
       v_open
       || '<h1 style="margin:0 0 12px;font-size:20px">Reminder about your booking</h1>'
       || '<p style="margin:0 0 12px">Hello{{#customer_name}} {{customer_name}}{{/customer_name}},</p>'
       || '<p style="margin:0 0 12px;color:#374151">This is a reminder about your upcoming booking:</p>'
       || v_box
       || '{{#service_name}}<p style="margin:4px 0"><strong>Service:</strong> {{service_name}}</p>{{/service_name}}'
       || '<p style="margin:4px 0"><strong>Date:</strong> {{date}}</p>'
       || '<p style="margin:4px 0"><strong>Time:</strong> {{start_time}}–{{end_time}}</p>'
       || '{{#duration_minutes}}<p style="margin:4px 0"><strong>Duration:</strong> {{duration_minutes}} minutes</p>{{/duration_minutes}}'
       || '{{#meeting_url}}<p style="margin:4px 0"><strong>Join the meeting:</strong> <a href="{{meeting_url}}">{{meeting_url}}</a></p>{{/meeting_url}}'
       || '</div>'
       || '<p style="margin:0;color:#6b7280;font-size:14px">If you need to change or cancel your booking, please contact us as soon as possible.</p>'
       || v_close,
       '["customer_name","service_name","date","start_time","end_time","duration_minutes","meeting_url","site_name"]'),
      ('booking_reminder', 'sv', 'transactional',
       'Påminnelse: din bokning {{date}}',
       v_open
       || '<h1 style="margin:0 0 12px;font-size:20px">Påminnelse om din bokning</h1>'
       || '<p style="margin:0 0 12px">Hej{{#customer_name}} {{customer_name}}{{/customer_name}}!</p>'
       || '<p style="margin:0 0 12px;color:#374151">Här kommer en påminnelse om din bokning:</p>'
       || v_box
       || '{{#service_name}}<p style="margin:4px 0"><strong>Tjänst:</strong> {{service_name}}</p>{{/service_name}}'
       || '<p style="margin:4px 0"><strong>Datum:</strong> {{date}}</p>'
       || '<p style="margin:4px 0"><strong>Tid:</strong> {{start_time}}–{{end_time}}</p>'
       || '{{#duration_minutes}}<p style="margin:4px 0"><strong>Längd:</strong> {{duration_minutes}} minuter</p>{{/duration_minutes}}'
       || '{{#meeting_url}}<p style="margin:4px 0"><strong>Länk till mötet:</strong> <a href="{{meeting_url}}">{{meeting_url}}</a></p>{{/meeting_url}}'
       || '</div>'
       || '<p style="margin:0;color:#6b7280;font-size:14px">Behöver du ändra eller avboka? Hör av dig till oss så snart som möjligt.</p>'
       || v_close,
       '["customer_name","service_name","date","start_time","end_time","duration_minutes","meeting_url","site_name"]'),

      -- ── calendar_reminder ────────────────────────────────────────────────
      ('calendar_reminder', 'en', 'transactional',
       'Reminder: {{title}}',
       v_open
       || '<h1 style="margin:0 0 12px;font-size:20px">Reminder about your upcoming event</h1>'
       || '<p style="margin:0 0 12px">Hello{{#name}} {{name}}{{/name}},</p>'
       || '<p style="margin:0 0 12px;color:#374151">This is a reminder about an event in your calendar:</p>'
       || v_box
       || '<p style="margin:4px 0"><strong>{{title}}</strong></p>'
       || '<p style="margin:4px 0"><strong>Date:</strong> {{date}}</p>'
       || '<p style="margin:4px 0"><strong>Time:</strong> {{start_time}}{{#end_time}}–{{end_time}}{{/end_time}}</p>'
       || '{{#location}}<p style="margin:4px 0"><strong>Location:</strong> {{location}}</p>{{/location}}'
       || '</div>'
       || v_close,
       '["name","title","date","start_time","end_time","location","site_name"]'),
      ('calendar_reminder', 'sv', 'transactional',
       'Påminnelse: {{title}}',
       v_open
       || '<h1 style="margin:0 0 12px;font-size:20px">Påminnelse inför {{title}}</h1>'
       || '<p style="margin:0 0 12px">Hej{{#name}} {{name}}{{/name}}!</p>'
       || '<p style="margin:0 0 12px;color:#374151">Här kommer en påminnelse om något som snart står i din kalender:</p>'
       || v_box
       || '<p style="margin:4px 0"><strong>{{title}}</strong></p>'
       || '<p style="margin:4px 0"><strong>Datum:</strong> {{date}}</p>'
       || '<p style="margin:4px 0"><strong>Tid:</strong> {{start_time}}{{#end_time}}–{{end_time}}{{/end_time}}</p>'
       || '{{#location}}<p style="margin:4px 0"><strong>Plats:</strong> {{location}}</p>{{/location}}'
       || '</div>'
       || v_close,
       '["name","title","date","start_time","end_time","location","site_name"]'),

      -- ── webinar_reminder (en mall, fyra tillfällen) ──────────────────────
      ('webinar_reminder', 'en', 'transactional',
       '{{#is_confirm}}You''re registered: {{title}}{{/is_confirm}}'
       || '{{#is_t24}}Tomorrow: {{title}}{{/is_t24}}'
       || '{{#is_t1}}Starting soon: {{title}}{{/is_t1}}'
       || '{{#is_attended}}Thanks for joining {{title}}{{/is_attended}}'
       || '{{#is_missed}}We missed you at {{title}}{{/is_missed}}',
       v_open
       || '<h1 style="margin:0 0 12px;font-size:20px">'
       || '{{#is_confirm}}You''re registered!{{/is_confirm}}'
       || '{{#is_t24}}Starting in 24 hours{{/is_t24}}'
       || '{{#is_t1}}Starting within the hour{{/is_t1}}'
       || '{{#is_attended}}Thanks for joining!{{/is_attended}}'
       || '{{#is_missed}}We missed you{{/is_missed}}'
       || '</h1>'
       || '<p style="margin:0 0 16px;color:#4b5563">Hi{{#name}} {{name}}{{/name}},</p>'
       || '{{#is_confirm}}<p style="margin:0 0 8px;color:#4b5563">Your spot for <strong>{{title}}</strong> is confirmed.</p><p style="margin:0;color:#4b5563">{{when}}</p>{{/is_confirm}}'
       || '{{#is_t24}}<p style="margin:0 0 8px;color:#4b5563"><strong>{{title}}</strong> starts tomorrow.</p><p style="margin:0;color:#4b5563">{{when}}</p>{{/is_t24}}'
       || '{{#is_t1}}<p style="margin:0 0 8px;color:#4b5563"><strong>{{title}}</strong> is about to begin.</p>{{/is_t1}}'
       || '{{#is_attended}}<p style="margin:0;color:#4b5563">Great to have you at <strong>{{title}}</strong>.</p>{{/is_attended}}'
       || '{{#is_missed}}<p style="margin:0;color:#4b5563">Sorry we didn''t see you at <strong>{{title}}</strong>.</p>{{/is_missed}}'
       || '{{#join_url}}<p style="margin:16px 0"><a href="{{join_url}}" ' || v_btn || '>Join the webinar</a></p>{{/join_url}}'
       || '{{#recording_url}}<p style="margin:16px 0"><a href="{{recording_url}}" ' || v_btn || '>Watch the recording</a></p>{{/recording_url}}'
       || v_close,
       '["name","title","when","join_url","recording_url","site_name","is_confirm","is_t24","is_t1","is_attended","is_missed"]'),
      ('webinar_reminder', 'sv', 'transactional',
       '{{#is_confirm}}Du är anmäld: {{title}}{{/is_confirm}}'
       || '{{#is_t24}}I morgon: {{title}}{{/is_t24}}'
       || '{{#is_t1}}Snart börjar det: {{title}}{{/is_t1}}'
       || '{{#is_attended}}Tack för att du var med på {{title}}{{/is_attended}}'
       || '{{#is_missed}}Vi saknade dig på {{title}}{{/is_missed}}',
       v_open
       || '<h1 style="margin:0 0 12px;font-size:20px">'
       || '{{#is_confirm}}Du är anmäld!{{/is_confirm}}'
       || '{{#is_t24}}I morgon är det dags{{/is_t24}}'
       || '{{#is_t1}}Vi börjar inom en timme{{/is_t1}}'
       || '{{#is_attended}}Tack för att du var med!{{/is_attended}}'
       || '{{#is_missed}}Vi saknade dig{{/is_missed}}'
       || '</h1>'
       || '<p style="margin:0 0 16px;color:#4b5563">Hej{{#name}} {{name}}{{/name}}!</p>'
       || '{{#is_confirm}}<p style="margin:0 0 8px;color:#4b5563">Din plats på <strong>{{title}}</strong> är bekräftad.</p><p style="margin:0;color:#4b5563">{{when}}</p>{{/is_confirm}}'
       || '{{#is_t24}}<p style="margin:0 0 8px;color:#4b5563"><strong>{{title}}</strong> börjar i morgon.</p><p style="margin:0;color:#4b5563">{{when}}</p>{{/is_t24}}'
       || '{{#is_t1}}<p style="margin:0 0 8px;color:#4b5563"><strong>{{title}}</strong> börjar alldeles strax.</p>{{/is_t1}}'
       || '{{#is_attended}}<p style="margin:0;color:#4b5563">Roligt att du var med på <strong>{{title}}</strong>.</p>{{/is_attended}}'
       || '{{#is_missed}}<p style="margin:0;color:#4b5563">Tråkigt att vi inte såg dig på <strong>{{title}}</strong>.</p>{{/is_missed}}'
       || '{{#join_url}}<p style="margin:16px 0"><a href="{{join_url}}" ' || v_btn || '>Gå med i webbinariet</a></p>{{/join_url}}'
       || '{{#recording_url}}<p style="margin:16px 0"><a href="{{recording_url}}" ' || v_btn || '>Se inspelningen</a></p>{{/recording_url}}'
       || v_close,
       '["name","title","when","join_url","recording_url","site_name","is_confirm","is_t24","is_t1","is_attended","is_missed"]'),

      -- ── return_confirmation (fragment) ───────────────────────────────────
      ('return_confirmation', 'en', 'commerce',
       'Return approved — {{rma_number}}',
       '<h2 style="margin:0 0 12px;font-size:20px">Your return has been approved</h2>'
       || '<p>Hi{{#customer_name}} {{customer_name}}{{/customer_name}},</p>'
       || '<p>We''ve approved your return request <strong>{{rma_number}}</strong>.</p>'
       || '{{#label_url}}<p><strong>Return label:</strong> <a href="{{label_url}}">Download label (PDF)</a></p>{{/label_url}}'
       || '{{#no_label}}<p><em>A return label will be sent separately.</em></p>{{/no_label}}'
       || '{{#tracking}}<p><strong>Tracking:</strong> {{tracking}}</p>{{/tracking}}'
       || '<h3 style="margin:20px 0 8px;font-size:16px">Return instructions</h3>'
       || '{{#custom_instructions}}<p>{{custom_instructions}}</p>{{/custom_instructions}}'
       || '{{#standard_instructions}}<p>Please pack the item(s) securely, in the original packaging when possible. Attach the return label to the outside of the package and drop it off at your nearest carrier location.</p>{{/standard_instructions}}'
       || '<p style="color:#666;font-size:12px;margin-top:32px">Please quote the RMA number {{rma_number}} whenever you contact us about this return.</p>',
       '["customer_name","rma_number","label_url","no_label","tracking","custom_instructions","standard_instructions"]'),
      ('return_confirmation', 'sv', 'commerce',
       'Returen är godkänd — {{rma_number}}',
       '<h2 style="margin:0 0 12px;font-size:20px">Din retur är godkänd</h2>'
       || '<p>Hej{{#customer_name}} {{customer_name}}{{/customer_name}}!</p>'
       || '<p>Vi har godkänt din retur <strong>{{rma_number}}</strong>.</p>'
       || '{{#label_url}}<p><strong>Returetikett:</strong> <a href="{{label_url}}">Ladda ner etiketten (PDF)</a></p>{{/label_url}}'
       || '{{#no_label}}<p><em>Returetiketten skickas till dig separat.</em></p>{{/no_label}}'
       || '{{#tracking}}<p><strong>Spårning:</strong> {{tracking}}</p>{{/tracking}}'
       || '<h3 style="margin:20px 0 8px;font-size:16px">Så skickar du tillbaka</h3>'
       || '{{#custom_instructions}}<p>{{custom_instructions}}</p>{{/custom_instructions}}'
       || '{{#standard_instructions}}<p>Packa varorna ordentligt, gärna i originalförpackningen. Fäst returetiketten på utsidan av paketet och lämna in det hos närmaste ombud.</p>{{/standard_instructions}}'
       || '<p style="color:#666;font-size:12px;margin-top:32px">Ange returnumret {{rma_number}} när du kontaktar oss om den här returen.</p>',
       '["customer_name","rma_number","label_url","no_label","tracking","custom_instructions","standard_instructions"]'),

      -- ── newsletter_confirm (fragment) ────────────────────────────────────
      ('newsletter_confirm', 'en', 'transactional',
       'Confirm your subscription',
       '<h2 style="margin:0 0 12px;font-size:20px;">Confirm your subscription</h2>'
       || '<p>Please confirm your newsletter subscription by clicking the button below.</p>'
       || '<p style="margin:24px 0;"><a href="{{confirm_url}}" style="display:inline-block;padding:12px 24px;background-color:{{button_color}};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Confirm subscription</a></p>'
       || '<p style="color:#666666;font-size:13px;">If you didn''t subscribe, you can safely ignore this email.</p>',
       '["confirm_url","button_color","site_name"]'),
      ('newsletter_confirm', 'sv', 'transactional',
       'Bekräfta din prenumeration',
       '<h2 style="margin:0 0 12px;font-size:20px;">Bekräfta din prenumeration</h2>'
       || '<p>Bekräfta att du vill få vårt nyhetsbrev genom att klicka på knappen nedan.</p>'
       || '<p style="margin:24px 0;"><a href="{{confirm_url}}" style="display:inline-block;padding:12px 24px;background-color:{{button_color}};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Bekräfta prenumerationen</a></p>'
       || '<p style="color:#666666;font-size:13px;">Har du inte anmält dig kan du bortse från det här mejlet.</p>',
       '["confirm_url","button_color","site_name"]')
    ) AS t(name, locale, category, subject, html, variables)
  LOOP
    INSERT INTO public.email_templates (name, locale, subject, html, category, variables, active)
    SELECT r.name, r.locale, r.subject, r.html, r.category, r.variables::jsonb, true
    WHERE NOT EXISTS (
      SELECT 1 FROM public.email_templates WHERE name = r.name AND locale = r.locale
    );
  END LOOP;
END $$;

-- ── Bevisas där den körs ───────────────────────────────────────────────────
DO $$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(n, ', ') INTO v_missing
  FROM unnest(ARRAY['booking_reminder', 'calendar_reminder', 'webinar_reminder',
                    'return_confirmation', 'newsletter_confirm']) AS n
  WHERE NOT EXISTS (SELECT 1 FROM public.email_templates WHERE name = n AND locale = 'en');
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'recipient-language mail templates: English version missing after seeding: %', v_missing;
  END IF;
END $$;
