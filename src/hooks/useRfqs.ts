import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type RfqStatus = 'draft' | 'sent' | 'bidding' | 'closed' | 'awarded' | 'cancelled';
export type RfqBidStatus = 'pending' | 'submitted' | 'awarded' | 'rejected' | 'withdrawn';

export interface Rfq {
  id: string;
  rfq_number: string;
  title: string;
  description: string | null;
  status: RfqStatus;
  issue_date: string;
  response_deadline: string | null;
  expected_delivery: string | null;
  currency: string;
  notes: string | null;
  awarded_vendor_id: string | null;
  awarded_po_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RfqLine {
  id: string;
  rfq_id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  target_unit_price_cents: number | null;
  notes: string | null;
  position: number;
}

export interface RfqLineOffer {
  rfq_line_id: string;
  unit_price_cents: number;
  lead_time_days?: number;
  note?: string;
}

export interface RfqBid {
  id: string;
  rfq_id: string;
  vendor_id: string;
  status: RfqBidStatus;
  invited_at: string;
  submitted_at: string | null;
  total_cents: number;
  lead_time_days: number | null;
  payment_terms: string | null;
  validity_days: number | null;
  notes: string | null;
  line_offers: RfqLineOffer[];
}

export function useRfqs() {
  return useQuery({
    queryKey: ['rfqs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rfqs')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Rfq[];
    },
  });
}

export function useRfq(id: string | null) {
  return useQuery({
    queryKey: ['rfq', id],
    enabled: !!id,
    queryFn: async () => {
      const [rfqRes, linesRes, bidsRes] = await Promise.all([
        supabase.from('rfqs').select('*').eq('id', id!).single(),
        supabase.from('rfq_lines').select('*').eq('rfq_id', id!).order('position'),
        supabase.from('rfq_bids').select('*, vendors(name, email, currency)').eq('rfq_id', id!),
      ]);
      if (rfqRes.error) throw rfqRes.error;
      if (linesRes.error) throw linesRes.error;
      if (bidsRes.error) throw bidsRes.error;
      return {
        rfq: rfqRes.data as unknown as Rfq,
        lines: (linesRes.data ?? []) as unknown as RfqLine[],
        bids: (bidsRes.data ?? []) as unknown as (RfqBid & { vendors: { name: string; email: string | null; currency: string } | null })[],
      };
    },
  });
}

export function useCreateRfq() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      description?: string;
      response_deadline?: string;
      expected_delivery?: string;
      currency?: string;
      lines: Array<Omit<RfqLine, 'id' | 'rfq_id' | 'position'>>;
      vendor_ids: string[];
    }) => {
      const { data: rfq, error: rfqErr } = await supabase
        .from('rfqs')
        .insert([{
          title: input.title,
          description: input.description,
          response_deadline: input.response_deadline,
          expected_delivery: input.expected_delivery,
          currency: input.currency ?? 'SEK',
          status: 'draft' as const,
        }])
        .select()
        .single();
      if (rfqErr) throw rfqErr;

      if (input.lines.length) {
        const { error: linesErr } = await supabase.from('rfq_lines').insert(
          input.lines.map((l, i) => ({ ...l, rfq_id: rfq.id, position: i })),
        );
        if (linesErr) throw linesErr;
      }

      if (input.vendor_ids.length) {
        const { error: bidsErr } = await supabase.from('rfq_bids').insert(
          input.vendor_ids.map(vid => ({ rfq_id: rfq.id, vendor_id: vid })),
        );
        if (bidsErr) throw bidsErr;
      }

      return rfq as Rfq;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rfqs'] });
      toast.success('RFQ created');
    },
    onError: (e: any) => toast.error(e.message ?? 'Failed to create RFQ'),
  });
}

export function useUpdateRfqStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: RfqStatus }) => {
      const { error } = await supabase.from('rfqs').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['rfqs'] });
      qc.invalidateQueries({ queryKey: ['rfq', v.id] });
      toast.success('RFQ status updated');
    },
  });
}

export function useSubmitBid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      bid_id: string;
      rfq_id: string;
      line_offers: RfqLineOffer[];
      lead_time_days?: number;
      payment_terms?: string;
      validity_days?: number;
      notes?: string;
    }) => {
      const total = input.line_offers.reduce((sum, o) => sum + (o.unit_price_cents || 0), 0);
      // Note: total here is per-line price sum; multiply by qty happens at award time.
      // For display we recompute against rfq_lines on the client.
      const { error } = await supabase
        .from('rfq_bids')
        .update({
          line_offers: input.line_offers,
          lead_time_days: input.lead_time_days,
          payment_terms: input.payment_terms,
          validity_days: input.validity_days,
          notes: input.notes,
          total_cents: total,
          status: 'submitted',
          submitted_at: new Date().toISOString(),
        })
        .eq('id', input.bid_id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['rfq', v.rfq_id] });
      toast.success('Bid submitted');
    },
    onError: (e: any) => toast.error(e.message ?? 'Failed to submit bid'),
  });
}

export function useAwardRfq() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ rfq_id, bid_id }: { rfq_id: string; bid_id: string }) => {
      const { data, error } = await supabase.rpc('award_rfq', {
        _rfq_id: rfq_id,
        _bid_id: bid_id,
      });
      if (error) throw error;
      return data as string; // PO id
    },
    onSuccess: (poId, v) => {
      qc.invalidateQueries({ queryKey: ['rfqs'] });
      qc.invalidateQueries({ queryKey: ['rfq', v.rfq_id] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast.success(`Awarded — purchase order created`);
      return poId;
    },
    onError: (e: any) => toast.error(e.message ?? 'Failed to award RFQ'),
  });
}
