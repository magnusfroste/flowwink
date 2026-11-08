-- ============================================================
-- Migration: a paid order gets its receipt — order_receipt in en + sv
-- Date: 2026-11-08
-- Safe to re-run: Yes (seeds only where name + locale are missing)
-- ============================================================
--
-- A paid order's receipt is its paid invoice: the books' own figures, the
-- company's number series, a page and a PDF. The "Receipt on paid order"
-- automation runs send_invoice_for_order on order.paid, and this is the mail
-- it sends, in the language the customer ordered in. The words live here,
-- editable under Communications → Templates; the code passes data only. A
-- fragment: email-send frames it in the business's brand. Seeded where
-- (name, locale) is missing, so an operator's own version survives.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('order_receipt', 'en', 'commerce',
       'Receipt {{invoice_number}} from {{site_name}}',
       '<h2 style="margin:0 0 12px;font-size:20px">Receipt {{invoice_number}}</h2>'
       || '<p>Hi{{#customer_name}} {{customer_name}}{{/customer_name}},</p>'
       || '<p>Thank you for your order. It is paid in full: <strong>{{total}}</strong>, including {{tax}} VAT.</p>'
       || '{{#receipt_url}}<p><a href="{{receipt_url}}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">View receipt and download PDF</a></p>{{/receipt_url}}'
       || '<p style="color:#666;font-size:13px">If you have any questions, just reply to this email.</p>',
       '["customer_name","invoice_number","total","tax","order_ref","receipt_url","site_name"]'),
      ('order_receipt', 'sv', 'commerce',
       'Kvitto {{invoice_number}} från {{site_name}}',
       '<h2 style="margin:0 0 12px;font-size:20px">Kvitto {{invoice_number}}</h2>'
       || '<p>Hej{{#customer_name}} {{customer_name}}{{/customer_name}}!</p>'
       || '<p>Tack för din beställning. Den är betald i sin helhet: <strong>{{total}}</strong>, varav moms {{tax}}.</p>'
       || '{{#receipt_url}}<p><a href="{{receipt_url}}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">Visa kvittot och ladda ner PDF</a></p>{{/receipt_url}}'
       || '<p style="color:#666;font-size:13px">Har du frågor? Svara på det här mejlet så hjälper vi dig.</p>',
       '["customer_name","invoice_number","total","tax","order_ref","receipt_url","site_name"]')
    ) AS t(name, locale, category, subject, html, variables)
  LOOP
    INSERT INTO public.email_templates (name, locale, subject, html, category, variables, active)
    SELECT r.name, r.locale, r.subject, r.html, r.category, r.variables::jsonb, true
    WHERE NOT EXISTS (SELECT 1 FROM public.email_templates WHERE name = r.name AND locale = r.locale);
  END LOOP;
END $$;
