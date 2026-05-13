// Email Dispatch — unified email sending for all modules
// Actions: contact, booking, order, invoice, quote
// Delegates to email-send for provider selection (SMTP/Resend)
import { getServiceClient } from '../_shared/supabase-clients.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function fmtMoney(cents: number, currency: string) {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency }).format((cents || 0) / 100);
}
function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

async function getSiteName(supabase: any): Promise<string> {
  const { data } = await supabase.from('site_settings').select('value').eq('key', 'general').maybeSingle();
  return (data?.value as any)?.site_name || (data?.value as any)?.siteName || 'FlowWink';
}
async function getEmailConfig(supabase: any): Promise<{ fromName: string; fromEmail: string }> {
  const { data } = await supabase.from('site_settings').select('value').eq('key', 'integrations').maybeSingle();
  const cfg = (data?.value as any)?.resend?.config?.emailConfig;
  return { fromName: cfg?.fromName || 'FlowWink', fromEmail: cfg?.fromEmail || 'onboarding@resend.dev' };
}
async function sendEmail(supabase: any, to: string, subject: string, html: string, tags: Record<string, string>, fromOverride?: string, attachments?: any[]) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/email-send`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ to, subject, html, tags, fromOverride, attachments }),
  });
  if (!res.ok) throw new Error(`email-send failed: HTTP ${res.status}`);
  const data = await res.json();
  if (!data?.success) throw new Error(data?.error || 'email-send returned failure');
  return data;
}

// ─── Action: contact ────────────────────────────────────────────────────────
async function handleContact(body: any): Promise<any> {
  if (!body.to || !body.subject || !body.body) throw new Error('to, subject, body required');
  const html = body.body.split('\n').map((l: string) => l.trim() === '' ? '<br>' : `<p>${l}</p>`).join('');
  return sendEmail(getServiceClient(), body.toName ? `${body.toName} <${body.to}>` : body.to, body.subject, html, { source: 'email-dispatch:contact' });
}

// ─── Action: booking ────────────────────────────────────────────────────────
async function handleBooking(body: any): Promise<any> {
  const supabase = getServiceClient();
  const { data: booking } = await supabase.from('bookings').select('*, service:booking_services(name, duration_minutes, price_cents, currency)').eq('id', body.bookingId).single();
  if (!booking) throw new Error('Booking not found');

  // Lead creation (simplified)
  try {
    const { data: existing } = await supabase.from('leads').select('id').eq('email', booking.customer_email).maybeSingle();
    if (!existing) {
      await supabase.from('leads').insert({ email: booking.customer_email, name: booking.customer_name, phone: booking.customer_phone, source: 'booking', status: 'lead', score: 10 });
    }
  } catch { /* continue */ }

  const siteName = await getSiteName(supabase);
  const { fromName, fromEmail } = await getEmailConfig(supabase);
  const start = new Date(booking.start_time);
  const end = new Date(booking.end_time);
  const dateStr = start.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = `${start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
  let priceText = '';
  if (booking.service?.price_cents > 0) {
    priceText = `<p><strong>Price:</strong> ${new Intl.NumberFormat('en-US', { style: 'currency', currency: booking.service.currency || 'USD' }).format(booking.service.price_cents / 100)}</p>`;
  }

  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:20px">
    <h1 style="text-align:center">Booking Confirmation</h1>
    <p>Hello ${booking.customer_name}! Thank you for your booking.</p>
    <div style="background:#f9fafb;padding:20px;border-radius:8px;margin:20px 0">
      ${booking.service ? `<p><strong>Service:</strong> ${booking.service.name}</p>` : ''}
      <p><strong>Date:</strong> ${dateStr}</p><p><strong>Time:</strong> ${timeStr}</p>
      ${booking.service?.duration_minutes ? `<p><strong>Duration:</strong> ${booking.service.duration_minutes} minutes</p>` : ''}
      ${priceText}
    </div>
    <hr><p style="color:#9ca3af;font-size:12px;text-align:center">${siteName}</p>
  </body></html>`;

  await sendEmail(supabase, booking.customer_email, `Booking Confirmation - ${dateStr}`, html, { source: 'email-dispatch:booking', booking_id: body.bookingId }, `${fromName} <${fromEmail}>`);
  await supabase.from('bookings').update({ confirmation_sent_at: new Date().toISOString() }).eq('id', body.bookingId);
  return { success: true };
}

// ─── Action: order ──────────────────────────────────────────────────────────
async function handleOrder(body: any): Promise<any> {
  const supabase = getServiceClient();
  const { data: order } = await supabase.from('orders').select('*').eq('id', body.orderId).single();
  if (!order) throw new Error('Order not found');
  const { data: items } = await supabase.from('order_items').select('*').eq('order_id', body.orderId);
  const siteName = await getSiteName(supabase);
  const { fromName, fromEmail } = await getEmailConfig(supabase);
  const itemsHtml = (items || []).map((it: any) => `<tr><td style="padding:12px">${it.product_name}</td><td style="padding:12px;text-align:center">${it.quantity}</td><td style="padding:12px;text-align:right">${fmtMoney(it.price_cents * it.quantity, order.currency)}</td></tr>`).join('');

  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:20px">
    <h1 style="text-align:center">Order Confirmation</h1>
    <p>Hello${order.customer_name ? ` ${order.customer_name}` : ''}! Thank you for your order.</p>
    <table style="width:100%;border-collapse:collapse">${itemsHtml}<tr><td colspan="2" style="padding:16px;font-weight:bold">Total</td><td style="padding:16px;text-align:right;font-weight:bold">${fmtMoney(order.total_cents, order.currency)}</td></tr></table>
    <hr><p style="color:#9ca3af;font-size:12px;text-align:center">${siteName}</p>
  </body></html>`;

  await sendEmail(supabase, order.customer_email, `Order Confirmation - ${order.id.slice(0, 8)}`, html, { source: 'email-dispatch:order', order_id: order.id }, `${fromName} <${fromEmail}>`);
  await supabase.from('orders').update({ confirmation_sent_at: new Date().toISOString() }).eq('id', body.orderId);
  return { success: true };
}

// ─── Action: invoice ────────────────────────────────────────────────────────
async function handleInvoice(body: any): Promise<any> {
  const supabase = getServiceClient();
  const { data: invoice } = await supabase.from('invoices').select('*, leads(name, email)').eq('id', body.invoice_id).single();
  if (!invoice) throw new Error('Invoice not found');
  const recipientEmail = invoice.customer_email || invoice.leads?.email;
  const recipientName = invoice.customer_name || invoice.leads?.name;
  if (!recipientEmail) throw new Error('No email for invoice');

  const siteName = await getSiteName(supabase);
  const currency = invoice.currency || 'SEK';
  const total = fmtMoney(invoice.total_cents, currency);
  const subtotal = fmtMoney(invoice.subtotal_cents, currency);
  const tax = fmtMoney(invoice.tax_cents, currency);
  const dueDate = invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('sv-SE') : null;
  const heading = body.reminder ? `Reminder: Invoice ${invoice.invoice_number}` : `Invoice ${invoice.invoice_number}`;

  const items = invoice.line_items || [];
  const itemRows = items.map((it: any) => {
    const qty = Number(it.qty ?? it.quantity ?? 1);
    const unit = Number(it.unit_price_cents ?? 0);
    return `<tr><td style="padding:8px 0">${escapeHtml(it.description || '')}<div style="color:#6b7280;font-size:11px">${qty} × ${fmtMoney(unit, currency)}</div></td><td style="padding:8px 0;text-align:right">${fmtMoney(qty * unit, currency)}</td></tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
    <div style="background:#fff;border-radius:12px;padding:32px">
      <h1 style="margin:0 0 8px;font-size:20px">${heading}</h1>
      ${body.custom_message ? `<p style="white-space:pre-wrap">${escapeHtml(body.custom_message)}</p>` : ''}
      <div style="background:#f9fafb;border-radius:8px;padding:16px">
        <div style="display:flex;justify-content:space-between"><span>Invoice</span><strong>${invoice.invoice_number}</strong></div>
        <table style="width:100%;border-collapse:collapse;margin:12px 0">${itemRows}</table>
        <div style="display:flex;justify-content:space-between"><span>Subtotal</span><span>${subtotal}</span></div>
        <div style="display:flex;justify-content:space-between"><span>Tax</span><span>${tax}</span></div>
        <div style="display:flex;justify-content:space-between;border-top:1px solid #e6e8ec;padding-top:6px"><strong>Total</strong><strong>${total}</strong></div>
        ${dueDate ? `<div style="margin-top:8px;font-size:12px;color:#6b7280"><span>Due</span><span>${dueDate}</span></div>` : ''}
      </div>
      <div style="text-align:center;margin:24px 0"><a href="${body.public_url}" style="display:inline-block;background:#111;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">View & pay invoice</a></div>
      <hr><p style="margin:0;font-size:12px;color:#9ca3af">Sent by ${escapeHtml(siteName)}</p>
    </div>
  </body></html>`;

  // Generate PDF
  let attachments: any[] | undefined;
  try {
    const pdfResp = await fetch(`${SUPABASE_URL}/functions/v1/generate-invoice-pdf`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ invoice_id: invoice.id }),
    });
    if (pdfResp.ok) {
      const pdfBytes = new Uint8Array(await pdfResp.arrayBuffer());
      let binary = '';
      for (let i = 0; i < pdfBytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, Array.from(pdfBytes.subarray(i, i + 0x8000)) as any);
      attachments = [{ filename: `${invoice.invoice_number}.pdf`, content: btoa(binary), contentType: 'application/pdf' }];
    }
  } catch { /* PDF optional */ }

  const subject = body.reminder ? `Reminder: Invoice ${invoice.invoice_number}` : `Invoice ${invoice.invoice_number} from ${siteName}`;
  await sendEmail(supabase, recipientEmail, subject, html, { source: 'email-dispatch:invoice', invoice_id: invoice.id }, undefined, attachments);
  if (invoice.status === 'draft') await supabase.from('invoices').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', invoice.id);
  return { success: true, has_pdf: !!attachments?.length };
}

// ─── Action: quote ──────────────────────────────────────────────────────────
async function handleQuote(body: any): Promise<any> {
  const supabase = getServiceClient();
  const { data: quote } = await supabase.from('quotes').select('*').eq('id', body.quote_id).single();
  if (!quote) throw new Error('Quote not found');
  const { data: items } = await supabase.from('quote_items').select('*').eq('quote_id', body.quote_id);
  const siteName = await getSiteName(supabase);
  const currency = quote.currency || 'SEK';
  const total = fmtMoney(quote.total_cents, currency);
  const subtotal = fmtMoney(quote.subtotal_cents, currency);
  const tax = fmtMoney(quote.tax_cents, currency);
  const validUntil = quote.valid_until ? new Date(quote.valid_until).toLocaleDateString('sv-SE') : null;
  const heading = body.reminder ? `Reminder: Quote ${quote.quote_number}` : `Your quote ${quote.quote_number}`;

  const itemRows = (items || []).map((it: any) => `<tr><td style="padding:8px 0">${escapeHtml(it.description || '')}</td><td style="padding:8px 0;text-align:right">${fmtMoney((it.qty || 1) * (it.unit_price_cents || 0), currency)}</td></tr>`).join('');

  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#fff;border-radius:12px;padding:32px">
      <h1 style="margin:0 0 8px;font-size:20px">${heading}</h1>
      ${body.custom_message ? `<p style="white-space:pre-wrap">${escapeHtml(body.custom_message)}</p>` : ''}
      <div style="background:#f9fafb;border-radius:8px;padding:16px">
        <table style="width:100%;border-collapse:collapse">${itemRows}</table>
        <div style="display:flex;justify-content:space-between"><span>Subtotal</span><span>${subtotal}</span></div>
        <div style="display:flex;justify-content:space-between"><span>Tax</span><span>${tax}</span></div>
        <div style="display:flex;justify-content:space-between;border-top:1px solid #e6e8ec;padding-top:6px"><strong>Total</strong><strong>${total}</strong></div>
        ${validUntil ? `<div style="margin-top:8px;font-size:12px;color:#6b7280"><span>Valid until</span><span>${validUntil}</span></div>` : ''}
      </div>
      <div style="text-align:center;margin:24px 0"><a href="${body.public_url}" style="display:inline-block;background:#111;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">View & sign quote</a></div>
      <hr><p style="margin:0;font-size:12px;color:#9ca3af">Sent by ${escapeHtml(siteName)}</p>
    </div>
  </body></html>`;

  await sendEmail(supabase, quote.customer_email, heading, html, { source: 'email-dispatch:quote', quote_id: quote.id });
  await supabase.from('quotes').update({ sent_at: new Date().toISOString() }).eq('id', body.quote_id);
  return { success: true };
}

// ─── Router ──────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    let action = url.searchParams.get('action');
    if (!action) { try { action = (await req.json()).action; } catch { /* */ } }
    const body = await req.json();
    let result: any;
    switch (action) {
      case 'contact': result = await handleContact(body); break;
      case 'booking': result = await handleBooking(body); break;
      case 'order': result = await handleOrder(body); break;
      case 'invoice': result = await handleInvoice(body); break;
      case 'quote': result = await handleQuote(body); break;
      default: return new Response(JSON.stringify({ error: 'Unknown action. Use: contact, booking, order, invoice, quote' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });<think>
    }
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) { return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
});
