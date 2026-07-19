import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { requireServiceOrRole } from '../_shared/edge-auth.ts';

/**
 * comms-send — the transactional-comms cluster (edge-surface refactor B2).
 *
 * Replaces eleven standalone functions that all shared one shape — fetch data,
 * render a template, send via the email lib: send-booking-confirmation,
 * send-order-confirmation, send-invoice-email, send-quote-email,
 * send-contact-email, send-return-confirmation, send-webinar-reminders,
 * send-booking-reminders, send-calendar-reminders, csat-dispatch, survey-send.
 *
 * Each former function's serve() body lives VERBATIM as ./[kind].ts — this
 * file only picks the handler and enforces the auth profile each function had:
 *
 *   - Most were deployed --no-verify-jwt (public checkout/booking flows, cron
 *     POSTs). comms-send is therefore deployed --no-verify-jwt too.
 *   - invoice_email, return_confirmation and csat_dispatch were JWT-gated
 *     (verify_jwt=true). They get an equivalent in-body gate here
 *     (service key or admin JWT) so consolidation NEVER widens access.
 *   - survey_send carries its own in-body gate inside its handler, unchanged.
 *
 * kind is read from ?kind=, from body.kind, or derived from the _skill field
 * agent-execute's edge: dispatch injects (so skill seeds flip to
 * edge:comms-send with zero agent-facing change).
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import { handler as bookingConfirmation } from './booking_confirmation.ts';
import { handler as orderConfirmation } from './order_confirmation.ts';
import { handler as invoiceEmail } from './invoice_email.ts';
import { handler as quoteEmail } from './quote_email.ts';
import { handler as contactEmail } from './contact_email.ts';
import { handler as returnConfirmation } from './return_confirmation.ts';
import { handler as webinarReminders } from './webinar_reminders.ts';
import { handler as bookingReminders } from './booking_reminders.ts';
import { handler as calendarReminders } from './calendar_reminders.ts';
import { handler as csatDispatch } from './csat_dispatch.ts';
import { handler as surveySend } from './survey_send.ts';

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  booking_confirmation: bookingConfirmation,
  order_confirmation: orderConfirmation,
  invoice_email: invoiceEmail,
  quote_email: quoteEmail,
  contact_email: contactEmail,
  return_confirmation: returnConfirmation,
  webinar_reminders: webinarReminders,
  booking_reminders: bookingReminders,
  calendar_reminders: calendarReminders,
  csat_dispatch: csatDispatch,
  survey_send: surveySend,
};

// Kinds whose standalone function was JWT-gated (verify_jwt=true). They keep
// equivalent protection via an in-body gate: service key or admin role.
const GATED = new Set(['invoice_email', 'return_confirmation', 'csat_dispatch']);

// Skill-name → kind, for calls arriving through agent-execute's edge: dispatch.
const SKILL_TO_KIND: Record<string, string> = {
  send_webinar_reminders: 'webinar_reminders',
  send_survey: 'survey_send',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  let kind = new URL(req.url).searchParams.get('kind') ?? '';
  let bodyText: string | null = null;

  if (!kind && req.method === 'POST') {
    // The body can only be read once — read it here, then hand the handler a
    // reconstructed Request carrying the same bytes.
    bodyText = await req.text();
    try {
      const parsed = JSON.parse(bodyText || '{}');
      kind = parsed?.kind ?? SKILL_TO_KIND[parsed?._skill] ?? '';
    } catch { /* not JSON — kind stays empty */ }
  }

  const handler = HANDLERS[kind];
  if (!handler) {
    return new Response(
      JSON.stringify({ error: `Unknown comms kind '${kind || '(none)'}'. Use one of: ${Object.keys(HANDLERS).join(', ')}.` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  if (GATED.has(kind)) {
    const auth = await requireServiceOrRole(req, getServiceClient());
    if (!auth.authorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  const delegated = bodyText === null
    ? req
    : new Request(req.url, { method: req.method, headers: req.headers, body: bodyText });

  return handler(delegated);
});
