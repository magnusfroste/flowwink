-- Påminnelsekedjans mallar finns (andra genomgången, 2026-10-26).
--
-- dunning-processor skickar template_name 'dunning-step-1' … 'dunning-step-5'
-- till email-send, men ingen migration har någonsin skapat de mallarna:
-- email-send svarade 400 "Template not found" och VARJE påminnelse om en
-- misslyckad prenumerationsbetalning landade som email_failed. Det här är
-- plattformskonfiguration (mejlet hör till kedjan, inte till en organisations
-- egna val) — alltså seedas den, på engelska och svenska, och bara där mallen
-- saknas: en operatör som redan skrivit sin egen behåller den.
--
-- Variabler (email-send ersätter {{token}} bokstavligt; processorn
-- HTML-escapar dem): name, product_name, amount (formaterat på företagets
-- sätt), attempt_count, failure_reason.

DO $$
DECLARE
  v_shell text :=
    '<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f9;margin:0;padding:24px;color:#111">'
 || '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e6e8ec">'
 || '<h1 style="margin:0 0 12px;font-size:20px">{{heading}}</h1>'
 || '<p style="margin:0 0 12px">{{greeting}}</p>'
 || '<p style="margin:0 0 12px;color:#374151">{{body}}</p>'
 || '<p style="margin:0;color:#6b7280;font-size:13px">{{footer}}</p>'
 || '</div></body></html>';
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      -- step, locale, subject, heading, greeting, body, footer
      (1, 'en', 'Your payment for {{product_name}} did not go through',
          'We could not take your payment', 'Hi{{#name}} {{name}}{{/name}},',
          'The payment of {{amount}} for {{product_name}} did not go through. Please check your card or payment details — we will try again automatically.',
          'If you have already updated your details, you can ignore this message.'),
      (2, 'en', 'Reminder: payment for {{product_name}} is still outstanding',
          'Your payment is still outstanding', 'Hi{{#name}} {{name}}{{/name}},',
          'We still have not been able to collect {{amount}} for {{product_name}} (attempt {{attempt_count}}). Please update your payment details to keep your subscription active.',
          'If you have already paid, you can ignore this message.'),
      (3, 'en', 'Urgent: {{product_name}} will be paused soon',
          'Action needed', 'Hi{{#name}} {{name}}{{/name}},',
          'The payment of {{amount}} for {{product_name}} is still outstanding. Please update your payment details as soon as possible to avoid interruption.',
          'Questions? Just reply to this e-mail.'),
      (4, 'en', 'Final notice: payment for {{product_name}}',
          'Final notice', 'Hi{{#name}} {{name}}{{/name}},',
          'This is our final reminder about {{amount}} for {{product_name}}. If we cannot collect the payment, the subscription will be cancelled.',
          'Questions? Just reply to this e-mail.'),
      (5, 'en', 'Your subscription to {{product_name}} has been cancelled',
          'Subscription cancelled', 'Hi{{#name}} {{name}}{{/name}},',
          'We could not collect {{amount}} for {{product_name}}, so the subscription has now been cancelled. You are welcome to start it again at any time.',
          'Thank you for having been a customer.'),
      (1, 'sv', 'Din betalning för {{product_name}} gick inte igenom',
          'Vi kunde inte dra betalningen', 'Hej{{#name}} {{name}}{{/name}},',
          'Betalningen på {{amount}} för {{product_name}} gick inte igenom. Kontrollera ditt kort eller dina betaluppgifter — vi försöker igen automatiskt.',
          'Har du redan uppdaterat dina uppgifter kan du bortse från det här meddelandet.'),
      (2, 'sv', 'Påminnelse: betalningen för {{product_name}} är fortfarande obetald',
          'Betalningen är fortfarande obetald', 'Hej{{#name}} {{name}}{{/name}},',
          'Vi har ännu inte kunnat dra {{amount}} för {{product_name}} (försök {{attempt_count}}). Uppdatera dina betaluppgifter så att prenumerationen fortsätter.',
          'Har du redan betalat kan du bortse från det här meddelandet.'),
      (3, 'sv', 'Brådskande: {{product_name}} pausas snart',
          'Åtgärd krävs', 'Hej{{#name}} {{name}}{{/name}},',
          'Betalningen på {{amount}} för {{product_name}} är fortfarande obetald. Uppdatera dina betaluppgifter så snart som möjligt för att undvika avbrott.',
          'Frågor? Svara bara på det här mejlet.'),
      (4, 'sv', 'Sista påminnelsen: betalning för {{product_name}}',
          'Sista påminnelsen', 'Hej{{#name}} {{name}}{{/name}},',
          'Det här är vår sista påminnelse om {{amount}} för {{product_name}}. Kan vi inte dra betalningen avslutas prenumerationen.',
          'Frågor? Svara bara på det här mejlet.'),
      (5, 'sv', 'Din prenumeration på {{product_name}} har avslutats',
          'Prenumerationen är avslutad', 'Hej{{#name}} {{name}}{{/name}},',
          'Vi kunde inte dra {{amount}} för {{product_name}}, så prenumerationen har nu avslutats. Du är välkommen att starta den igen när du vill.',
          'Tack för att du har varit kund.')
    ) AS t(step, locale, subject, heading, greeting, body, footer)
  LOOP
    INSERT INTO public.email_templates (name, locale, subject, html, category, variables, active)
    SELECT 'dunning-step-' || r.step, r.locale, r.subject,
           replace(replace(replace(replace(v_shell,
             '{{heading}}', r.heading), '{{greeting}}', r.greeting), '{{body}}', r.body), '{{footer}}', r.footer),
           'billing',
           '["name","product_name","amount","attempt_count","failure_reason"]'::jsonb,
           true
    WHERE NOT EXISTS (
      SELECT 1 FROM public.email_templates WHERE name = 'dunning-step-' || r.step AND locale = r.locale
    );
  END LOOP;
END $$;

-- ── Bevisas där den körs ───────────────────────────────────────────────────
DO $$
DECLARE v_missing int;
BEGIN
  SELECT count(*) INTO v_missing
  FROM generate_series(1, 5) s
  WHERE NOT EXISTS (SELECT 1 FROM public.email_templates WHERE name = 'dunning-step-' || s AND locale = 'en');
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'dunning templates: % English step(s) missing after seeding', v_missing;
  END IF;
END $$;
