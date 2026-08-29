import { supabase } from '@/integrations/supabase/client';
import { callSkill } from '@/lib/call-skill';
import { logger } from '@/lib/logger';
import type { Json } from '@/integrations/supabase/types';
import { notifyNewLead } from '@/lib/slack-notify';
import { buildAttributionFields, logUtmConversion } from '@/lib/utm';

/** 'prospect' is the pre-lead: found by prospecting, not yet pursued. */
export type LeadStatus = 'prospect' | 'lead' | 'opportunity' | 'customer' | 'lost';

export interface Lead {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  company_id: string | null;
  phone: string | null;
  source: string;
  source_id: string | null;
  status: LeadStatus;
  score: number;
  ai_summary: string | null;
  ai_qualified_at: string | null;
  needs_review: boolean;
  assigned_to: string | null;
  converted_at: string | null;
  /** Why the contact was lost (price/timing/competitor/no_response/other). Set on lost, cleared on re-open. */
  lost_reason: string | null;
  lost_note: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/**
 * Extract domain from email address
 */
function extractDomain(email: string): string | null {
  const parts = email.toLowerCase().split('@');
  if (parts.length !== 2) return null;
  const domain = parts[1];
  // Skip common personal email domains
  const personalDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'live.com', 'msn.com', 'aol.com'];
  if (personalDomains.includes(domain)) return null;
  return domain;
}

/**
 * Trigger company enrichment in background (fire-and-forget)
 */
async function triggerCompanyEnrichment(companyId: string): Promise<void> {
  try {
    await callSkill('enrich_company', { companyId });
  } catch (error) {
    logger.warn('triggerCompanyEnrichment error:', error);
  }
}

/**
 * Match company by email domain (never auto-creates)
 * Returns companyId if an existing company matches the domain, null otherwise.
 * Admin can manually create and link companies from the contact detail page.
 */
async function findCompanyByDomain(
  email: string
): Promise<{ companyId: string | null }> {
  const domain = extractDomain(email);
  if (!domain) return { companyId: null };

  try {
    const { data: existingCompany } = await supabase
      .from('companies')
      .select('id')
      .eq('domain', domain)
      .maybeSingle();

    return { companyId: existingCompany?.id || null };
  } catch (error) {
    logger.warn('findCompanyByDomain error:', error);
    return { companyId: null };
  }
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  type: string;
  metadata: Record<string, unknown>;
  points: number;
  created_at: string;
}

// Activity point values
const ACTIVITY_POINTS: Record<string, number> = {
  form_submit: 10,
  booking: 10,         // High intent signal
  email_open: 3,
  link_click: 5,
  page_visit: 2,
  newsletter_subscribe: 8,
  webinar_register: 15,
  status_change: 0,
  note: 0,
  call: 5,
};

/**
 * Create or update a lead from form submission
 * Now auto-links to company by email domain
 */
export async function createLeadFromForm(options: {
  email: string;
  name?: string;
  company?: string;
  phone?: string;
  formName: string;
  formData: Record<string, unknown>;
  sourceId?: string;
  pageId?: string;
  /** The form_submissions row this lead came from — the RPC stamps lead_id
   *  back onto it so the inbox can show what happened (handled-provenance). */
  submissionId?: string;
}): Promise<{ lead: Lead | null; isNew: boolean; error: string | null }> {
  const { email, name, company, phone, formName, formData, sourceId, pageId, submissionId } = options;

  // The RPC is the working path. The client-side flow below fails for every
  // anonymous visitor: the duplicate check runs as anon so RLS filters it to
  // nothing, and .insert().select() needs RETURNING, which needs read rights
  // the July security sweep (correctly) removed — the whole INSERT is
  // rejected, the error is swallowed, and the visitor still sees "thank you".
  // ingest_form_lead is SECURITY DEFINER: real dedupe, no read grant, and it
  // returns nothing so an outsider cannot probe which emails exist in the CRM.
  // The legacy path stays as fallback for instances that have not run the
  // migration yet (the fleet runs several schema versions at once by design).
  // Since 20260821070000 it is a STAFF path only: "System can insert leads"
  // (WITH CHECK true) is gone, so the direct insert now needs leads in the
  // caller's module matrix. That takes nothing away — for an anonymous visitor
  // the fallback never worked, it only looked like it did.
  // Read once, before either path — both stamp the same values.
  const attributionOnSubmit = buildAttributionFields();

  try {
    const rpcCall = supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>;
    const { error: rpcError } = await rpcCall('ingest_form_lead', {
      p_email: email,
      p_name: name ?? null,
      p_company: company ?? null,
      p_phone: phone ?? null,
      p_form_name: formName,
      p_source_id: sourceId ?? null,
      p_page_id: pageId ?? null,
      p_submission_id: submissionId ?? null,
      p_form_data: (formData ?? {}) as never,
      // The tracked-visitor cookie id — lets the server stitch the browsing
      // history onto the lead (page_views.lead_id backfill). Null when the
      // visitor declined analytics cookies, and the server treats that as
      // "no journey to attach", which is the consent-respecting answer.
      p_visitor_id:
        typeof localStorage !== 'undefined' ? localStorage.getItem('pez_visitor_id') : null,
      // Attribution rides the PRIMARY path now. It was captured client-side all
      // along (captureUtmOnLanding) but only stamped in the legacy fallback
      // below — which fails for every anonymous visitor by design — so every
      // real form lead was born unattributed and the revenue report truthfully
      // showed nothing (growth audit 2026-08-14).
      p_first_utm_source: attributionOnSubmit.first_utm_source,
      p_first_utm_medium: attributionOnSubmit.first_utm_medium,
      p_first_utm_campaign: attributionOnSubmit.first_utm_campaign,
      p_last_utm_source: attributionOnSubmit.last_utm_source,
      p_last_utm_medium: attributionOnSubmit.last_utm_medium,
      p_last_utm_campaign: attributionOnSubmit.last_utm_campaign,
    });
    if (!rpcError) {
      return { lead: null, isNew: true, error: null };
    }
    logger.warn('ingest_form_lead unavailable, falling back to client path', rpcError.message);
  } catch (e) {
    logger.warn('ingest_form_lead threw, falling back to client path', e);
  }

  try {
    // Check if lead exists
    const { data: existingLead } = await supabase
      .from('leads')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (existingLead) {
      // Lead exists - add activity
      await addLeadActivity({
        leadId: existingLead.id,
        type: 'form_submit',
        metadata: {
          form_name: formName,
          form_data: formData,
          page_id: pageId,
        },
      });

      // Progressive enrichment: update missing fields from form data
      const updates: Record<string, string> = {};
      if (name && !existingLead.name) updates.name = name;
      if (phone && !existingLead.phone) updates.phone = phone;
      
      // Auto-link company if not already linked
      if (!existingLead.company_id) {
        const { companyId } = await findCompanyByDomain(email);
        if (companyId) {
          updates.company_id = companyId;
        }
      }

      // Enrichment is best-effort (the capture itself already succeeded), but a
      // denied write must not be reported back as applied: count the rows and
      // only merge the fields the database actually accepted.
      let applied: Record<string, string> = {};
      if (Object.keys(updates).length > 0) {
        const { data: enriched, error: enrichError } = await supabase
          .from('leads')
          .update(updates)
          .eq('id', existingLead.id)
          .select('id');
        if (enrichError) {
          logger.warn('Lead enrichment update failed:', enrichError);
        } else if (!enriched?.length) {
          logger.warn('Lead enrichment update matched 0 rows — no permission, or the contact is gone:', existingLead.id);
        } else {
          applied = updates;
        }
      }

      // Trigger AI qualification
      qualifyLead(existingLead.id);

      return { lead: { ...existingLead, ...applied } as unknown as Lead, isNew: false, error: null };
    }

    // Auto-match company by email domain (never auto-create)
    const { companyId } = await findCompanyByDomain(email);

    // Create new lead with company_id link
    const attribution = buildAttributionFields();
    const { data: newLead, error: insertError } = await supabase
      .from('leads')
      .insert({
        email,
        name: name || null,
        company: company || null, // Keep for backwards compat, but company_id is primary
        company_id: companyId,
        phone: phone || null,
        source: 'form',
        source_id: sourceId || null,
        status: 'lead',
        score: ACTIVITY_POINTS.form_submit,
        needs_review: false,
        ...attribution,
      })
      .select()
      .single();

    if (insertError) {
      logger.error('Failed to create lead:', insertError);
      return { lead: null, isNew: false, error: insertError.message };
    }

    // Add initial activity
    await addLeadActivity({
      leadId: newLead.id,
      type: 'form_submit',
      metadata: {
        form_name: formName,
        form_data: formData,
        page_id: pageId,
        is_initial: true,
        auto_matched_company: !!companyId,
      },
    });

    // Trigger AI qualification (async, don't wait)
    qualifyLead(newLead.id);

    // Slack notification (fire-and-forget)
    notifyNewLead({ name: name || '', email, source: 'form', score: ACTIVITY_POINTS.form_submit, leadId: newLead.id });

    // Attribution log (fire-and-forget)
    logUtmConversion('form_submit', newLead.id);

    return { lead: newLead as unknown as Lead, isNew: true, error: null };
  } catch (error) {
    logger.error('createLeadFromForm error:', error);
    return { lead: null, isNew: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Create or update a lead from booking
 * High-intent signal with automatic company matching and enrichment
 *
 * STAFF PATH. No public block calls this — the public BookingBlock creates no
 * lead at all; booking leads are born server-side in
 * comms-send/booking_confirmation.ts with the service key. The direct insert
 * below therefore requires leads in the caller's module matrix (see
 * 20260821070000). If a public surface ever needs this, give it a sister RPC
 * (ingest_booking_lead) rather than reopening the table.
 */
export async function createLeadFromBooking(options: {
  email: string;
  name: string;
  phone?: string;
  serviceName: string;
  bookingId: string;
  bookingDate: string;
}): Promise<{ lead: Lead | null; isNew: boolean; error: string | null }> {
  const { email, name, phone, serviceName, bookingId, bookingDate } = options;

  try {
    // Check if lead exists
    const { data: existingLead } = await supabase
      .from('leads')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (existingLead) {
      // Lead exists - add booking activity
      await addLeadActivity({
        leadId: existingLead.id,
        type: 'booking',
        metadata: {
          booking_id: bookingId,
          service_name: serviceName,
          booking_date: bookingDate,
        },
      });

      // Update phone if not set. Best-effort, but never silent: an RLS-denied
      // update returns success with 0 rows.
      if (phone && !existingLead.phone) {
        const { data: phoneRows, error: phoneError } = await supabase
          .from('leads')
          .update({ phone })
          .eq('id', existingLead.id)
          .select('id');
        if (phoneError) {
          logger.warn('Lead phone update failed:', phoneError);
        } else if (!phoneRows?.length) {
          logger.warn('Lead phone update matched 0 rows — no permission, or the contact is gone:', existingLead.id);
        }
      }

      // Trigger AI qualification
      qualifyLead(existingLead.id);

      return { lead: existingLead as unknown as Lead, isNew: false, error: null };
    }

    // Auto-match company by email domain (never auto-create)
    const { companyId } = await findCompanyByDomain(email);

    // Create new lead with company_id link
    const { data: newLead, error: insertError } = await supabase
      .from('leads')
      .insert({
        email,
        name: name || null,
        company_id: companyId,
        phone: phone || null,
        source: 'booking',
        source_id: bookingId,
        status: 'lead',
        score: ACTIVITY_POINTS.booking,
        needs_review: false,
      })
      .select()
      .single();

    if (insertError) {
      logger.error('Failed to create lead from booking:', insertError);
      return { lead: null, isNew: false, error: insertError.message };
    }

    // Add initial booking activity
    await addLeadActivity({
      leadId: newLead.id,
      type: 'booking',
      metadata: {
        booking_id: bookingId,
        service_name: serviceName,
        booking_date: bookingDate,
        is_initial: true,
        auto_matched_company: !!companyId,
      },
    });

    // Trigger AI qualification (async, don't wait)
    qualifyLead(newLead.id);

    // Slack notification (fire-and-forget)
    notifyNewLead({ name: name || '', email, source: 'booking', score: ACTIVITY_POINTS.booking, leadId: newLead.id });

    return { lead: newLead as unknown as Lead, isNew: true, error: null };
  } catch (error) {
    logger.error('createLeadFromBooking error:', error);
    return { lead: null, isNew: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Create or update a lead from webinar registration
 *
 * `isNew` is null on the RPC path on purpose: the server does not tell an
 * anonymous caller whether the address was already in the CRM — that is
 * exactly what an outsider would probe for. The lead id it does return is
 * useless without read rights, and the registration row needs it.
 */
export async function createLeadFromWebinar(options: {
  email: string;
  name: string;
  phone?: string;
  webinarId: string;
  webinarTitle: string;
}): Promise<{ leadId: string | null; isNew: boolean | null; error: string | null }> {
  const { email, name, phone, webinarId, webinarTitle } = options;

  // Same story as the form path (see createLeadFromForm): the client-side flow
  // below cannot work for an anonymous visitor. The existing-lead lookup runs
  // as anon and RLS filters it to nothing, .insert().select() needs RETURNING
  // which needs read rights anon does not have, and lead_activities has no
  // public-insert policy either — so every public webinar registration was
  // born without a contact while the visitor saw "Successfully registered!".
  // ingest_webinar_lead is SECURITY DEFINER: real dedupe, no read grant, and
  // it validates the webinar exists instead of trusting the caller.
  try {
    const rpcCall = supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: string | null; error: { message: string } | null }>;
    const { data: rpcLeadId, error: rpcError } = await rpcCall('ingest_webinar_lead', {
      p_email: email,
      p_name: name ?? null,
      p_phone: phone ?? null,
      p_webinar_id: webinarId,
      // The tracked-visitor cookie id — lets the server stitch the browsing
      // history onto the lead. Null when the visitor declined analytics
      // cookies, and the server treats that as "no journey to attach".
      p_visitor_id:
        typeof localStorage !== 'undefined' ? localStorage.getItem('pez_visitor_id') : null,
    });
    if (!rpcError) {
      if (rpcLeadId) {
        return { leadId: rpcLeadId, isNew: null, error: null };
      }
      // The RPC ran and refused: invalid email, or a webinar id that does not
      // exist. Falling through to the client path would only turn a refusal
      // into a silent failure — say so instead. The registration itself is the
      // caller's decision to continue with.
      logger.warn('ingest_webinar_lead refused the registration (invalid email or unknown webinar)');
      return { leadId: null, isNew: null, error: 'Registration could not be linked to a contact.' };
    }
    logger.warn('ingest_webinar_lead unavailable, falling back to client path', rpcError.message);
  } catch (e) {
    logger.warn('ingest_webinar_lead threw, falling back to client path', e);
  }

  // Legacy path — staff only since 20260821070000 (the open
  // "System can insert leads" policy is gone), kept for instances that have
  // not run the migration that adds the RPC.
  try {
    // Check if lead exists
    const { data: existingLead } = await supabase
      .from('leads')
      .select('id, phone')
      .eq('email', email)
      .maybeSingle();

    if (existingLead) {
      // Lead exists — add webinar activity
      await addLeadActivity({
        leadId: existingLead.id,
        type: 'webinar_register',
        metadata: {
          webinar_id: webinarId,
          webinar_title: webinarTitle,
        },
      });

      // Update phone if not set. Best-effort, but never silent: an RLS-denied
      // update returns success with 0 rows.
      if (phone && !existingLead.phone) {
        const { data: phoneRows, error: phoneError } = await supabase
          .from('leads')
          .update({ phone })
          .eq('id', existingLead.id)
          .select('id');
        if (phoneError) {
          logger.warn('Lead phone update failed:', phoneError);
        } else if (!phoneRows?.length) {
          logger.warn('Lead phone update matched 0 rows — no permission, or the contact is gone:', existingLead.id);
        }
      }

      return { leadId: existingLead.id, isNew: false, error: null };
    }

    // Auto-match company by email domain (never auto-create)
    const { companyId } = await findCompanyByDomain(email);

    // Create new lead
    const { data: newLead, error: insertError } = await supabase
      .from('leads')
      .insert({
        email,
        name: name || null,
        company_id: companyId,
        phone: phone || null,
        source: 'webinar',
        source_id: webinarId,
        status: 'lead',
        score: ACTIVITY_POINTS.webinar_register,
        needs_review: false,
      })
      .select('id')
      .single();

    if (insertError) {
      logger.error('Failed to create lead from webinar:', insertError);
      return { leadId: null, isNew: false, error: insertError.message };
    }

    // Add initial webinar activity
    await addLeadActivity({
      leadId: newLead.id,
      type: 'webinar_register',
      metadata: {
        webinar_id: webinarId,
        webinar_title: webinarTitle,
        is_initial: true,
        auto_matched_company: !!companyId,
      },
    });

    // Trigger AI qualification
    qualifyLead(newLead.id);

    // Slack notification (fire-and-forget)
    notifyNewLead({ name: name || '', email, source: 'webinar', score: ACTIVITY_POINTS.webinar_register, leadId: newLead.id });

    return { leadId: newLead.id, isNew: true, error: null };
  } catch (error) {
    logger.error('createLeadFromWebinar error:', error);
    return { leadId: null, isNew: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Add activity to a lead
 */
export async function addLeadActivity(options: {
  leadId: string;
  type: string;
  metadata?: Record<string, unknown>;
}): Promise<{ success: boolean; error: string | null }> {
  const { leadId, type, metadata = {} } = options;
  const points = ACTIVITY_POINTS[type] || 0;

  try {
    const { error } = await supabase
      .from('lead_activities')
      .insert([{
        lead_id: leadId,
        type,
        metadata: metadata as Json,
        points,
      }]);

    if (error) {
      logger.error('Failed to add lead activity:', error);
      return { success: false, error: error.message };
    }

    // Update lead score
    const { data: activities } = await supabase
      .from('lead_activities')
      .select('points')
      .eq('lead_id', leadId);

    if (activities) {
      const totalScore = activities.reduce((sum, a) => sum + (a.points || 0), 0);
      // The activity itself landed, so this stays non-fatal — but a denied score
      // write returns success with 0 rows and would otherwise leave the score
      // quietly stale forever.
      const { data: scored, error: scoreError } = await supabase
        .from('leads')
        .update({ score: totalScore })
        .eq('id', leadId)
        .select('id');
      if (scoreError) {
        logger.warn('Lead score update failed:', scoreError);
      } else if (!scored?.length) {
        logger.warn('Lead score update matched 0 rows — no permission, or the contact is gone:', leadId);
      }
    }

    return { success: true, error: null };
  } catch (error) {
    logger.error('addLeadActivity error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Update lead status (used by Deals module when deal stage changes)
 */
export async function updateLeadStatus(
  leadId: string,
  status: LeadStatus,
  options?: { onlyIfCurrentStatus?: LeadStatus; convertedAt?: boolean }
): Promise<{ success: boolean; error: string | null }> {
  try {
    let query = supabase
      .from('leads')
      .update({
        status,
        ...(options?.convertedAt ? { converted_at: new Date().toISOString() } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId);

    if (options?.onlyIfCurrentStatus) {
      query = query.eq('status', options.onlyIfCurrentStatus);
    }

    const { data, error } = await query.select('id');
    if (error) {
      logger.error('updateLeadStatus error:', error);
      return { success: false, error: error.message };
    }
    if (!data?.length) {
      // With onlyIfCurrentStatus this is the guard doing its job (the contact
      // had already moved on) — expected, not a failure. Without it, 0 rows
      // means the write was refused or the contact is gone.
      if (options?.onlyIfCurrentStatus) {
        logger.debug('updateLeadStatus: guard did not match, status left untouched:', leadId);
        return { success: true, error: null };
      }
      logger.error('updateLeadStatus matched 0 rows:', leadId);
      return { success: false, error: 'Nothing was updated — you may not have permission, or the contact is gone.' };
    }
    return { success: true, error: null };
  } catch (error) {
    logger.error('updateLeadStatus error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Track newsletter activity for a lead
 */
export async function trackNewsletterActivity(options: {
  email: string;
  type: 'email_open' | 'link_click';
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { email, type, metadata = {} } = options;

  try {
    // Find lead by email
    const { data: lead } = await supabase
      .from('leads')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (lead) {
      await addLeadActivity({
        leadId: lead.id,
        type,
        metadata,
      });
    }
  } catch (error) {
    logger.error('trackNewsletterActivity error:', error);
  }
}

/**
 * Trigger AI qualification for a lead (fire-and-forget)
 */
export async function qualifyLead(leadId: string): Promise<void> {
  try {
    await callSkill('qualify_lead', { leadId });
  } catch (error) {
    logger.warn('qualifyLead error:', error);
  }
}

/**
 * Get contact status display info (renamed from lead)
 */
export function getLeadStatusInfo(status: LeadStatus): { label: string; color: string } {
  const statusMap: Record<LeadStatus, { label: string; color: string }> = {
    prospect: { label: 'Prospect', color: 'bg-slate-500' },
    lead: { label: 'Contact', color: 'bg-blue-500' },
    opportunity: { label: 'Opportunity', color: 'bg-amber-500' },
    customer: { label: 'Customer', color: 'bg-green-500' },
    lost: { label: 'Lost', color: 'bg-gray-500' },
  };
  return statusMap[status] || statusMap.lead;
}
