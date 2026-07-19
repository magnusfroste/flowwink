import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { callSkill } from '@/lib/call-skill';

export type Customer360TimelineEvent = {
  id: string;
  ts: string;
  kind:
    | 'lead_created'
    | 'lead_activity'
    | 'deal'
    | 'order'
    | 'invoice'
    | 'quote'
    | 'ticket'
    | 'booking'
    | 'subscription'
    | 'chat'
    | 'webinar'
    | 'task';
  title: string;
  subtitle?: string;
  amount?: number;
  status?: string;
  href?: string;
};

export type Customer360 = {
  success: true;
  identity: {
    lead_id: string | null;
    email: string | null;
    name: string | null;
    phone: string | null;
    status: string | null;
    score: number | null;
    source: string | null;
    ai_summary: string | null;
    company: { id: string; name: string; domain: string; industry: string; size: string } | null;
    created_at: string | null;
    converted_at: string | null;
  };
  kpis: {
    lifetime_value: number;
    open_deals_value: number;
    open_invoices_value: number;
    open_tickets: number;
    total_orders: number;
    total_invoices: number;
  };
  counts: Record<string, number>;
  timeline: Customer360TimelineEvent[];
  raw: Record<string, any[]>;
};

/** Fetch the unified 360° payload for a lead_id OR email. */
export function useCustomer360(params: { leadId?: string; email?: string }) {
  return useQuery({
    queryKey: ['customer-360', params.leadId ?? null, params.email ?? null],
    enabled: Boolean(params.leadId || params.email),
    queryFn: async (): Promise<Customer360> => {
      const args: Record<string, string> = {};
      if (params.leadId) args.lead_id = params.leadId;
      if (params.email) args.email = params.email;
      const data = await callSkill('get_customer_360', args);
      return data as unknown as Customer360;
    },
  });
}
