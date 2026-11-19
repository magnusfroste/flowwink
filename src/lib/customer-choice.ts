/**
 * Who a new quote or invoice is for: a contact picked from the list, or a new
 * customer typed in place (2026-11-19). `ensureCustomerLead` makes the contact
 * — or finds the one that already has that address — when the draft is made.
 */
import { supabase } from '@/integrations/supabase/client';
import { addLeadActivity } from '@/lib/lead-utils';

export type CustomerChoice =
  | { mode: 'existing'; leadId: string }
  | { mode: 'new'; name: string; email: string };

export const EMPTY_CUSTOMER: CustomerChoice = { mode: 'existing', leadId: '' };

const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/** Whether the choice names somebody a draft can be made for. */
export function customerChosen(choice: CustomerChoice): boolean {
  return choice.mode === 'existing' ? !!choice.leadId : looksLikeEmail(choice.email);
}

/**
 * The contact a draft is made for: the one picked, or — for a new customer —
 * the contact that already carries the address, else a new one. Answers the
 * lead id and whether it was made now.
 */
export async function ensureCustomerLead(choice: CustomerChoice): Promise<{ leadId: string; created: boolean }> {
  if (choice.mode === 'existing') return { leadId: choice.leadId, created: false };
  const email = choice.email.trim().toLowerCase();
  const { data: existing, error: findErr } = await supabase.from('leads').select('id').eq('email', email).maybeSingle();
  if (findErr) throw findErr;
  if (existing) return { leadId: existing.id, created: false };
  const { data: lead, error } = await supabase
    .from('leads')
    .insert({ email, name: choice.name.trim() || null, source: 'manual', status: 'lead', score: 0, needs_review: false })
    .select('id')
    .single();
  if (error) throw error;
  await addLeadActivity({ leadId: lead.id, type: 'note', metadata: { note: 'Contact created with a new quote or invoice' } });
  return { leadId: lead.id, created: true };
}
