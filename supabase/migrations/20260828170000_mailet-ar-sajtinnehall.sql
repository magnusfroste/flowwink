-- Mailet är sajtinnehåll.
--
-- Bokningsbekräftelsen var 40 rader engelsk HTML hårdkodad i funktionskroppen
-- (Lovable-lila gradient, "Hello {name}") — oredigerbar för admin OCH agent,
-- trots att hela mallrälsen redan fanns: email_templates + {{variabler}} +
-- email-send-routerns template_name-stöd (dunning använder den i dag).
-- Klassen är samma som statusfärgerna: rälsen byggd, adoptionen saknades.
--
-- Default-mallen är TJÄNST-GENERISK med flit (Magnus reservation 2026-08-25):
-- en bokning är tid + tjänst + namn — plattformen antar aldrig samtal, möte
-- eller klipptid. Instansens röst ("vi ringer dig på {{customer_phone}}",
-- "välkommen till salongen") är en MALLREDIGERING, via admin-UI:t eller
-- manage_email_template — aldrig kod.
--
-- Återhävdbar seed (plattformskonfig-klassen): INSERT bara när namnet saknas,
-- så en operatörs omskrivning ÖVERLEVER varje omkörning och deploy.
INSERT INTO public.email_templates (name, subject, html, text, category, variables, active)
SELECT
  'booking_confirmation',
  'Booking confirmation — {{date}}',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Booking confirmation</title></head>'
  || '<body style="font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">'
  || '<h1 style="font-size: 22px; margin: 0 0 16px;">Booking confirmation</h1>'
  || '<p>Hello {{customer_name}},</p>'
  || '<p>Thank you for your booking. Here are the details:</p>'
  || '<div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">'
  || '<p style="margin:4px 0;"><strong>Service:</strong> {{service_name}}</p>'
  || '<p style="margin:4px 0;"><strong>Date:</strong> {{date}}</p>'
  || '<p style="margin:4px 0;"><strong>Time:</strong> {{start_time}}–{{end_time}}</p>'
  || '</div>'
  || '{{notes_block}}'
  || '<p>If anything changes, just reply to this email.</p>'
  || '<p style="color:#6b7280; font-size: 13px; margin-top: 28px;">{{site_name}}</p>'
  || '</body></html>',
  'Hello {{customer_name}}, your booking of {{service_name}} on {{date}} at {{start_time}}–{{end_time}} is received. {{site_name}}',
  'transactional',
  '["customer_name","service_name","date","start_time","end_time","notes_block","site_name"]'::jsonb,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.email_templates WHERE name = 'booking_confirmation'
);
