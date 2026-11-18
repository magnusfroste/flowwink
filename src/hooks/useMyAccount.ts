import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * What the signed-in customer has with the business, and what is waiting for
 * them — one read, my_account(), with one rule for "which rows are mine" (the
 * confirmed e-mail of the account, and the companies they are a contact of).
 * The portal's overview, its invoices and its agreements all read this.
 */
export interface MyInvoice {
  id: string;
  invoice_number: string;
  status: 'sent' | 'overdue' | 'paid' | 'partially_paid' | string;
  total_cents: number;
  paid_amount_cents: number;
  currency: string | null;
  issue_date: string | null;
  due_date: string | null;
  paid_at: string | null;
  public_token: string | null;
}
export interface MyAgreement {
  id: string;
  contract_number: string | null;
  title: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  signed_at: string | null;
  sent_at: string | null;
  accept_token: string;
}
export interface MyServiceSummary {
  id: string;
  product_name: string | null;
  status: string;
  unit_amount_cents: number | null;
  currency: string | null;
  billing_interval: string | null;
  next_invoice_date: string | null;
}
export interface MyWaitingQuote {
  id: string;
  quote_number: string;
  title: string | null;
  total_cents: number;
  currency: string;
  valid_until: string | null;
  accept_token: string;
}
export interface MyAccount {
  email_confirmed: boolean;
  invoices: MyInvoice[];
  agreements: MyAgreement[];
  services: MyServiceSummary[];
  quotes_waiting: MyWaitingQuote[];
  recent_orders: Array<{ id: string; status: string; fulfillment_status: string | null; total_cents: number; currency: string | null; created_at: string }>;
  open_cases: Array<{ id: string; ticket_number: string | null; subject: string; status: string; created_at: string }>;
}

const EMPTY: MyAccount = { email_confirmed: false, invoices: [], agreements: [], services: [], quotes_waiting: [], recent_orders: [], open_cases: [] };

/** An invoice the customer still owes money on. */
export const invoiceIsOpen = (i: MyInvoice) => i.status !== 'paid' && i.total_cents - i.paid_amount_cents > 0;
/** An agreement that waits for the customer's signature. */
export const agreementAwaitsSignature = (a: MyAgreement) => a.status === 'pending_signature';

export function useMyAccount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-account', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<MyAccount> => {
      const { data, error } = await supabase.rpc('my_account' as never);
      if (error) throw error;
      return { ...EMPTY, ...((data as unknown as Partial<MyAccount>) ?? {}) };
    },
  });
}
