/**
 * useQuoteWorkflow — extended quote actions for Full scope:
 *  - Send for approval (creates approval_request when above threshold)
 *  - Send to customer (generates accept_token if missing, sets sent_at)
 *  - Get public link
 *  - Snapshot version
 *  - Public accept / reject (anonymous flow)
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useApprovals } from '@/hooks/useApprovals';
import type { Quote } from '@/hooks/useQuotes';

function generateToken(): string {
  // 32-char URL-safe token
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function publicQuoteUrl(token: string): string {
  return `${window.location.origin}/quote/${token}`;
}

export function useQuoteVersions(quoteId: string | undefined) {
  return useQuery({
    queryKey: ['quote-versions', quoteId],
    queryFn: async () => {
      if (!quoteId) return [];
      const { data, error } = await supabase
        .from('quote_versions')
        .select('*')
        .eq('quote_id', quoteId)
        .order('version_number', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!quoteId,
  });
}

export function useQuoteSignatures(quoteId: string | undefined) {
  return useQuery({
    queryKey: ['quote-signatures', quoteId],
    queryFn: async () => {
      if (!quoteId) return [];
      const { data, error } = await supabase
        .from('quote_signatures')
        .select('*')
        .eq('quote_id', quoteId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!quoteId,
  });
}

async function snapshotQuote(quote: Quote, reason: string) {
  const { data: { user } } = await supabase.auth.getUser();
  // Take next version number
  const { data: existing } = await supabase
    .from('quote_versions')
    .select('version_number')
    .eq('quote_id', quote.id)
    .order('version_number', { ascending: false })
    .limit(1);
  const nextNum = (existing?.[0]?.version_number ?? 0) + 1;
  const { error } = await supabase.from('quote_versions').insert({
    quote_id: quote.id,
    version_number: nextNum,
    snapshot: quote as never,
    reason,
    created_by: user?.id ?? null,
  });
  if (error) throw error;
  return nextNum;
}

/** Request approval before sending. If no rule matches, the quote is auto-marked as ready-to-send. */
export function useRequestQuoteApproval() {
  const qc = useQueryClient();
  const approvals = useApprovals();
  return useMutation({
    mutationFn: async (quote: Quote) => {
      const evalRes = await approvals.evaluate('quote', quote.total_cents, quote.currency);
      if (!evalRes.required) {
        return { required: false, message: 'No approval required — ready to send' };
      }
      const reqRes = await approvals.request.mutateAsync({
        entity_type: 'quote',
        entity_id: quote.id,
        amount_cents: quote.total_cents,
        currency: quote.currency,
        reason: `Quote ${quote.quote_number} pending review`,
      });
      // Mark quote as pending_approval and link
      const { error } = await supabase
        .from('quotes')
        .update({ status: 'pending_approval' as never, approval_request_id: (reqRes as { id: string }).id } as never)
        .eq('id', quote.id);
      if (error) throw error;
      return { required: true, request_id: (reqRes as { id: string }).id, role: evalRes.requiredRole };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['quotes'] });
      qc.invalidateQueries({ queryKey: ['quote'] });
      qc.invalidateQueries({ queryKey: ['approvals'] });
      if (res.required) {
        toast.success(`Approval requested (${res.role})`);
      } else {
        toast.success(res.message);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Send the quote to the customer: ensures accept_token, sets status=sent, snapshots version, and emails customer. */
export function useSendQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Quote | { quote: Quote; custom_message?: string }) => {
      const quote = 'quote' in input ? input.quote : input;
      const custom_message = 'quote' in input ? input.custom_message : undefined;
      if ((quote.status as string) === 'pending_approval') {
        throw new Error('Quote is pending approval — cannot send yet');
      }
      const token = (quote as unknown as { accept_token?: string }).accept_token || generateToken();
      const versionNum = await snapshotQuote(quote, 'sent_to_customer');
      const { error } = await supabase
        .from('quotes')
        .update({
          status: 'sent' as never,
          sent_at: new Date().toISOString(),
          accept_token: token,
          version: versionNum,
        } as never)
        .eq('id', quote.id);
      if (error) throw error;

      const url = publicQuoteUrl(token);
      let emailSent = false;
      let emailError: string | undefined;
      try {
        const { data, error: fnErr } = await supabase.functions.invoke('send-quote-email', {
          body: { quote_id: quote.id, public_url: url, custom_message },
        });
        if (fnErr) throw fnErr;
        emailSent = !!(data as { success?: boolean })?.success;
      } catch (e) {
        emailError = e instanceof Error ? e.message : 'Email send failed';
      }
      return { token, url, version: versionNum, emailSent, emailError };
    },
    onSuccess: ({ url, emailSent, emailError }) => {
      qc.invalidateQueries({ queryKey: ['quotes'] });
      qc.invalidateQueries({ queryKey: ['quote'] });
      navigator.clipboard?.writeText(url).catch(() => {});
      if (emailSent) {
        toast.success('Quote sent to customer — link copied');
      } else {
        toast.warning(`Quote marked as sent, but email failed: ${emailError ?? 'unknown'}. Link copied.`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Resend a reminder email for an already-sent quote (does not change status/version). */
export function useSendQuoteReminder() {
  return useMutation({
    mutationFn: async (input: { quote: Quote; custom_message?: string }) => {
      const token = (input.quote as unknown as { accept_token?: string }).accept_token;
      if (!token) throw new Error('Quote has no public link yet — send it first');
      const url = publicQuoteUrl(token);
      const { data, error } = await supabase.functions.invoke('send-quote-email', {
        body: { quote_id: input.quote.id, public_url: url, reminder: true, custom_message: input.custom_message },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => toast.success('Reminder sent to customer'),
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Public lookup by token — used on /quote/:token */
export function usePublicQuote(token: string | undefined) {
  return useQuery({
    queryKey: ['public-quote', token],
    queryFn: async () => {
      if (!token) return null;
      const { data, error } = await supabase
        .from('quotes')
        .select('*')
        .eq('accept_token', token)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!token,
  });
}

/** Public accept/reject. Records signature audit. */
export function useSignQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      quote_id: string;
      action: 'accept' | 'reject';
      signer_name: string;
      signer_email: string;
      signature_data?: string;
      comment?: string;
    }) => {
      // Record signature
      const { error: sigErr } = await supabase.from('quote_signatures').insert({
        quote_id: input.quote_id,
        action: input.action,
        signer_name: input.signer_name,
        signer_email: input.signer_email,
        signature_data: input.signature_data ?? null,
        comment: input.comment ?? null,
        user_agent: navigator.userAgent,
      });
      if (sigErr) throw sigErr;

      // Update quote status
      const updates: Record<string, unknown> = {};
      if (input.action === 'accept') {
        updates.status = 'accepted';
        updates.accepted_at = new Date().toISOString();
      } else {
        updates.status = 'rejected';
        updates.rejected_at = new Date().toISOString();
      }
      const { error } = await supabase.from('quotes').update(updates as never).eq('id', input.quote_id);
      if (error) throw error;
      return { ok: true };
    },
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['public-quote'] });
      toast.success(vars.action === 'accept' ? 'Quote accepted — thank you!' : 'Quote declined');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Mark a public quote as viewed (idempotent) */
export async function markQuoteViewed(quoteId: string) {
  await supabase.from('quote_signatures').insert({
    quote_id: quoteId,
    action: 'view',
    user_agent: navigator.userAgent,
  });
  await supabase
    .from('quotes')
    .update({ status: 'viewed' as never, viewed_at: new Date().toISOString() } as never)
    .eq('id', quoteId)
    .eq('status', 'sent');
}
