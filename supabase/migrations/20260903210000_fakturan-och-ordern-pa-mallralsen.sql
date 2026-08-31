-- Fakturan och ordern på mallrälsen — de två sista hårdkodade affärsmejlen.
--
-- Samma recept som offerten/avtalet (20260903150000) och bokningen:
--   * Seedas återhävdbart, WHERE NOT EXISTS på (name, locale).
--   * locale='en' UTTRYCKLIGEN — triggern hade annars stämplat sajtens språk
--     på mallar som är skrivna på engelska.
--   * ALL språktext bor i mallen (Item, Amount, Subtotal, Due, Product,
--     Quantity, Total, knapptexter, footern). Koden prerendrar bara DATA:
--     radlistor, belopp, datum, länkar.
--   * Villkorstext uttrycks med sektioner ({{#due_date}}…{{/due_date}},
--     {{#items_rows}}…{{/items_rows}}, {{#customer_name}}…) — motorn i
--     _shared/template-render.ts stryker sektionen när variabeln är tom.
--
-- Sorter: invoice_email, invoice_reminder (påminnelsen är en egen sort med
-- egen ton — replace-rendering kan inte grena), order_confirmation.
--
-- Mottagarspråket: fakturan har partner_id → partner_language som offerten.
-- Ordern har ingen part (e-handelskund utan register) — den löses med sajtens
-- standardspråk, vilket är ärligt snarare än en gissning på Accept-Language.

DO $$
DECLARE
  v_invoice_html text;
  v_order_html text;
BEGIN
  v_invoice_html :=
    '<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f9;margin:0;padding:24px;color:#111">'
 || '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e6e8ec">'
 || '<h1 style="margin:0 0 8px;font-size:20px">{{heading}}</h1>'
 || '<p style="margin:0 0 16px;color:#4b5563">{{intro}}</p>'
 || '{{custom_block}}'
 || '<div style="background:#f9fafb;border:1px solid #e6e8ec;border-radius:8px;padding:16px;margin:16px 0">'
 || '<div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:#6b7280">Invoice</span><strong>{{invoice_number}}</strong></div>'
 || '{{#items_rows}}<table style="width:100%;border-collapse:collapse;margin:12px 0 4px">'
 || '<thead><tr>'
 || '<th style="text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;padding-bottom:6px;border-bottom:1px solid #e6e8ec">Item</th>'
 || '<th style="text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280;padding-bottom:6px;border-bottom:1px solid #e6e8ec">Amount</th>'
 || '</tr></thead><tbody>{{items_rows}}</tbody></table>{{/items_rows}}'
 || '<div style="display:flex;justify-content:space-between;margin-top:8px;font-size:13px"><span style="color:#6b7280">Subtotal</span><span style="font-family:ui-monospace,monospace">{{subtotal}}</span></div>'
 || '<div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:#6b7280">Tax</span><span style="font-family:ui-monospace,monospace">{{tax}}</span></div>'
 || '<div style="display:flex;justify-content:space-between;margin-top:6px;border-top:1px solid #e6e8ec;padding-top:6px"><strong>Total</strong><strong style="font-family:ui-monospace,monospace">{{total}}</strong></div>'
 || '{{#due_date}}<div style="display:flex;justify-content:space-between;margin-top:8px;font-size:12px;color:#6b7280"><span>Due</span><span>{{due_date}}</span></div>{{/due_date}}'
 || '</div>'
 || '<div style="text-align:center;margin:24px 0">'
 || '<a href="{{cta_url}}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">View &amp; pay invoice</a>'
 || '</div>'
 || '<p style="margin:16px 0 0;font-size:12px;color:#6b7280;word-break:break-all">Or copy this link: <br/>{{cta_url}}</p>'
 || '<hr style="border:none;border-top:1px solid #e6e8ec;margin:24px 0"/>'
 || '<p style="margin:0;font-size:12px;color:#9ca3af">Sent by {{site_name}}</p>'
 || '</div></body></html>';

  v_order_html :=
    '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>'
 || '<body style="font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif; background-color: #f9fafb; margin: 0; padding: 40px 20px;">'
 || '<div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">'
 || '<div style="background-color: #18181b; padding: 32px; text-align: center;">'
 || '<h1 style="color: #ffffff; margin: 0; font-size: 24px;">Order confirmation</h1>'
 || '</div>'
 || '<div style="padding: 32px;">'
 || '<p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">Hello{{#customer_name}} {{customer_name}}{{/customer_name}}!</p>'
 || '<p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">Thank you for your order! We have received your payment and your order is now being processed.</p>'
 || '<div style="background-color: #f9fafb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">'
 || '<h2 style="color: #18181b; font-size: 18px; margin: 0 0 16px;">Order details</h2>'
 || '<table style="width: 100%; border-collapse: collapse;">'
 || '<thead><tr style="background-color: #e5e7eb;">'
 || '<th style="padding: 12px; text-align: left; font-size: 14px;">Product</th>'
 || '<th style="padding: 12px; text-align: center; font-size: 14px;">Quantity</th>'
 || '<th style="padding: 12px; text-align: right; font-size: 14px;">Price</th>'
 || '</tr></thead>'
 || '<tbody>{{items_rows}}</tbody>'
 || '<tfoot><tr>'
 || '<td colspan="2" style="padding: 16px 12px; font-weight: bold; font-size: 16px;">Total</td>'
 || '<td style="padding: 16px 12px; font-weight: bold; font-size: 16px; text-align: right;">{{total}}</td>'
 || '</tr></tfoot></table></div>'
 || '<div style="background-color: #f9fafb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">'
 || '<h3 style="color: #18181b; font-size: 14px; margin: 0 0 12px;">Order information</h3>'
 || '<p style="color: #6b7280; font-size: 14px; margin: 0; line-height: 1.8;">'
 || '<strong>Order ID:</strong> {{order_ref}}…<br>'
 || '<strong>Email:</strong> {{customer_email}}<br>'
 || '<strong>Date:</strong> {{order_date}}</p></div>'
 || '<p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0;">If you have any questions, please don''t hesitate to contact us.</p>'
 || '</div>'
 || '<div style="background-color: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">'
 || '<p style="color: #9ca3af; font-size: 12px; margin: 0;">{{site_name}} — This is an automated message. Please do not reply to this email.</p>'
 || '</div></div></body></html>';

  INSERT INTO email_templates (name, locale, subject, html, category, variables, active)
  SELECT 'invoice_email', 'en',
         'Invoice {{invoice_number}} from {{site_name}}',
         replace(replace(v_invoice_html,
           '{{heading}}', 'Invoice {{invoice_number}}'),
           '{{intro}}', 'Please find your invoice attached. You can also view and pay it online.'),
         'billing',
         '["invoice_number","site_name","items_rows","subtotal","tax","total","due_date","cta_url","custom_block"]'::jsonb,
         true
  WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'invoice_email' AND locale = 'en');

  INSERT INTO email_templates (name, locale, subject, html, category, variables, active)
  SELECT 'invoice_reminder', 'en',
         'Reminder: Invoice {{invoice_number}} from {{site_name}}',
         replace(replace(v_invoice_html,
           '{{heading}}', 'Reminder: Invoice {{invoice_number}}'),
           '{{intro}}', 'This is a friendly reminder that the invoice below is awaiting payment.'),
         'billing',
         '["invoice_number","site_name","items_rows","subtotal","tax","total","due_date","cta_url","custom_block"]'::jsonb,
         true
  WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'invoice_reminder' AND locale = 'en');

  INSERT INTO email_templates (name, locale, subject, html, category, variables, active)
  SELECT 'order_confirmation', 'en',
         'Order confirmation — {{order_ref}}',
         v_order_html,
         'commerce',
         '["customer_name","items_rows","total","order_ref","customer_email","order_date","site_name"]'::jsonb,
         true
  WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'order_confirmation' AND locale = 'en');
END $$;

-- ── Bevisas där den körs ───────────────────────────────────────────────────
DO $$
DECLARE v jsonb; kind text; v_html text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  FOREACH kind IN ARRAY ARRAY['invoice_email','invoice_reminder','order_confirmation'] LOOP
    -- En svensk mottagare på en sajt utan svensk version ska ändå få ETT mejl.
    v := public.resolve_email_template(kind, 'sv');
    IF NOT coalesce((v ->> 'ok')::boolean, false) THEN
      RAISE EXCEPTION 'resolve(%): no template resolved at all — an email would not go out', kind;
    END IF;
    v_html := v ->> 'html';
    IF v_html IS NULL OR length(v_html) < 100 THEN
      RAISE EXCEPTION 'resolve(%): the template came back without a body', kind;
    END IF;
    -- Etiketterna måste bo i MALLEN — det är hela flytten.
    IF kind LIKE 'invoice%' AND v_html NOT LIKE '%Subtotal%' THEN
      RAISE EXCEPTION 'resolve(%): the labels are not in the template text', kind;
    END IF;
    IF kind = 'order_confirmation' AND v_html NOT LIKE '%Quantity%' THEN
      RAISE EXCEPTION 'resolve(%): the labels are not in the template text', kind;
    END IF;
    -- Sektionerna måste vara balanserade åt båda hållen.
    IF (length(v_html) - length(replace(v_html, '{{#', ''))) / 3
       <> (length(v_html) - length(replace(v_html, '{{/', ''))) / 3 THEN
      RAISE EXCEPTION 'resolve(%): unbalanced template sections', kind;
    END IF;
  END LOOP;
  RAISE NOTICE 'invoice + order emails: 3 kinds seeded and resolvable';
END $$;
