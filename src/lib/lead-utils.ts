import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

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
 * Find or create company by email domain
 * Returns companyId and whether it was newly created (for enrichment trigger)
 */
async function findOrCreateCompanyByDomain(
  email: string, 
  companyName?: string
): Promise<{ companyId: string | null; isNew: boolean }> {
  const domain = extractDomain(email);
  if (!domain) return { companyId: null, isNew: false };

  try {
    // Try to find existing company by domain
    const { data: existingCompany } = await supabase
      .from('companies')
      .select('id')
      .eq('domain', domain)
      .maybeSingle();

    if (existingCompany) {
      return { companyId: existingCompany.id, isNew: false };
    }

    // Create new company from domain
    const name = companyName || domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
    const { data: newCompany, error } = await supabase
      .from('companies')
      .insert({
        name,
        domain,
      })
      .select('id')
      .single();

    if (error) {
      console.warn('Could not create company:', error);
      return { companyId: null, isNew: false };
    }

    return { companyId: newCompany.id, isNew: true };
  } catch (error) {
    console.warn('findOrCreateCompanyByDomain error:', error);
    return { companyId: null, isNew: false };
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

      // Trigger AI qualification
      qualifyLead(existingLead.id);

      return { lead: existingLead as Lead, isNew: false, error: null };
    }

    // Auto-match or create company by email domain
    const { companyId, isNew: isNewCompany } = await findOrCreateCompanyByDomain(email, company);

    // Trigger background enrichment for newly created companies
    if (companyId && isNewCompany) {
      triggerCompanyEnrichment(companyId);
    }

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

    // Auto-match or create company by email domain
    const { companyId, isNew: isNewCompany } = await findOrCreateCompanyByDomain(email);

    // Trigger background enrichment for newly created companies
    if (companyId && isNewCompany) {
      triggerCompanyEnrichment(companyId);
    }

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

    return { lead: newLead as Lead, isNew: true, error: null };
  } catch (error) {
    console.error('createLeadFromBooking error:', error);
    return { lead: null, isNew: false, error: error instanceof Error ? error.message : 'Unknown error' };
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
