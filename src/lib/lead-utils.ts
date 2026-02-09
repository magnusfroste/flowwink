import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { notifyNewLead } from '@/lib/slack-notify';

export type LeadStatus = 'lead' | 'opportunity' | 'customer' | 'lost';

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
    const { error } = await supabase.functions.invoke('enrich-company', {
      body: { companyId },
    });
    if (error) {
      console.warn('Company enrichment failed:', error);
    }
  } catch (error) {
    console.warn('triggerCompanyEnrichment error:', error);
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
    console.warn('findCompanyByDomain error:', error);
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
}): Promise<{ lead: Lead | null; isNew: boolean; error: string | null }> {
  const { email, name, company, phone, formName, formData, sourceId, pageId } = options;

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

      if (Object.keys(updates).length > 0) {
        await supabase
          .from('leads')
          .update(updates)
          .eq('id', existingLead.id);
      }

      // Trigger AI qualification
      qualifyLead(existingLead.id);

      return { lead: { ...existingLead, ...updates } as Lead, isNew: false, error: null };
    }

    // Auto-match company by email domain (never auto-create)
    const { companyId } = await findCompanyByDomain(email);

    // Create new lead with company_id link
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
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to create lead:', insertError);
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

    return { lead: newLead as Lead, isNew: true, error: null };
  } catch (error) {
    console.error('createLeadFromForm error:', error);
    return { lead: null, isNew: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Create or update a lead from booking
 * High-intent signal with automatic company matching and enrichment
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

      // Update phone if not set
      if (phone && !existingLead.phone) {
        await supabase
          .from('leads')
          .update({ phone })
          .eq('id', existingLead.id);
      }

      // Trigger AI qualification
      qualifyLead(existingLead.id);

      return { lead: existingLead as Lead, isNew: false, error: null };
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
      console.error('Failed to create lead from booking:', insertError);
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

    return { lead: newLead as Lead, isNew: true, error: null };
  } catch (error) {
    console.error('createLeadFromBooking error:', error);
    return { lead: null, isNew: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Create or update a lead from webinar registration
 */
export async function createLeadFromWebinar(options: {
  email: string;
  name: string;
  phone?: string;
  webinarId: string;
  webinarTitle: string;
}): Promise<{ leadId: string | null; isNew: boolean; error: string | null }> {
  const { email, name, phone, webinarId, webinarTitle } = options;

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

      // Update phone if not set
      if (phone && !existingLead.phone) {
        await supabase
          .from('leads')
          .update({ phone })
          .eq('id', existingLead.id);
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
      console.error('Failed to create lead from webinar:', insertError);
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
    console.error('createLeadFromWebinar error:', error);
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
      console.error('Failed to add lead activity:', error);
      return { success: false, error: error.message };
    }

    // Update lead score
    const { data: activities } = await supabase
      .from('lead_activities')
      .select('points')
      .eq('lead_id', leadId);

    if (activities) {
      const totalScore = activities.reduce((sum, a) => sum + (a.points || 0), 0);
      await supabase
        .from('leads')
        .update({ score: totalScore })
        .eq('id', leadId);
    }

    return { success: true, error: null };
  } catch (error) {
    console.error('addLeadActivity error:', error);
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

    const { error } = await query;
    if (error) {
      console.error('updateLeadStatus error:', error);
      return { success: false, error: error.message };
    }
    return { success: true, error: null };
  } catch (error) {
    console.error('updateLeadStatus error:', error);
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
    console.error('trackNewsletterActivity error:', error);
  }
}

/**
 * Trigger AI qualification for a lead (fire-and-forget)
 */
export async function qualifyLead(leadId: string): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('qualify-lead', {
      body: { leadId },
    });

    if (error) {
      console.warn('Lead qualification failed:', error);
    }
  } catch (error) {
    console.warn('qualifyLead error:', error);
  }
}

/**
 * Get contact status display info (renamed from lead)
 */
export function getLeadStatusInfo(status: LeadStatus): { label: string; color: string } {
  const statusMap: Record<LeadStatus, { label: string; color: string }> = {
    lead: { label: 'Contact', color: 'bg-blue-500' },
    opportunity: { label: 'Opportunity', color: 'bg-amber-500' },
    customer: { label: 'Customer', color: 'bg-green-500' },
    lost: { label: 'Lost', color: 'bg-gray-500' },
  };
  return statusMap[status] || statusMap.lead;
}
