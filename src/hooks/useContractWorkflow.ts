/**
 * useContractWorkflow — markdown editing, public sign link, signing, versions.
 * Mirrors useQuoteWorkflow so external operators (ClawWink) and humans get
 * the same UX whether the document is a quote or a contract.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Contract } from '@/hooks/useContracts';

function generateToken(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function publicContractUrl(token: string): string {
  return `${window.location.origin}/contract/${token}`;
}

export function useContract(id: string | undefined) {
  return useQuery({
    queryKey: ['contract', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('contracts')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Contract & {
        body_markdown: string | null;
        body_updated_at: string | null;
        accept_token: string | null;
        sent_at: string | null;
        viewed_at: string | null;
        signer_name: string | null;
        signer_email: string | null;
        version: number;
      };
    },
    enabled: !!id,
  });
}

export function useContractVersions(contractId: string | undefined) {
  return useQuery({
    queryKey: ['contract-versions', contractId],
    queryFn: async () => {
      if (!contractId) return [];
      const { data, error } = await supabase
        .from('contract_versions')
        .select('*')
        .eq('contract_id', contractId)
        .order('version_number', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!contractId,
  });
}

export function useContractSignatures(contractId: string | undefined) {
  return useQuery({
    queryKey: ['contract-signatures', contractId],
    queryFn: async () => {
      if (!contractId) return [];
      const { data, error } = await supabase
        .from('contract_signatures')
        .select('*')
        .eq('contract_id', contractId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!contractId,
  });
}

/** Save contract body (markdown) — autosave-friendly, no toast spam. */
export function useSaveContractBody() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body_markdown }: { id: string; body_markdown: string }) => {
      const { error } = await supabase
        .from('contracts')
        .update({ body_markdown } as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['contract', vars.id] });
      qc.invalidateQueries({ queryKey: ['contracts'] });
    },
  });
}

async function snapshotContract(contract: Contract & { version?: number }, reason: string) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: existing } = await supabase
    .from('contract_versions')
    .select('version_number')
    .eq('contract_id', contract.id)
    .order('version_number', { ascending: false })
    .limit(1);
  const nextNum = (existing?.[0]?.version_number ?? 0) + 1;
  const { error } = await supabase.from('contract_versions').insert({
    contract_id: contract.id,
    version_number: nextNum,
    snapshot: contract as never,
    reason,
    created_by: user?.id ?? null,
  });
  if (error) throw error;
  return nextNum;
}

/** Generate / refresh public link, set status=pending_signature, snapshot version. */
export function useSendContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (contract: Contract & { accept_token?: string | null; version?: number; body_markdown?: string | null }) => {
      if (!contract.body_markdown || !contract.body_markdown.trim()) {
        throw new Error('Contract body is empty — write the agreement first.');
      }
      const token = contract.accept_token || generateToken();
      const versionNum = await snapshotContract(contract, 'sent_for_signature');
      const { error } = await supabase
        .from('contracts')
        .update({
          status: 'pending_signature',
          sent_at: new Date().toISOString(),
          accept_token: token,
          version: versionNum,
        } as never)
        .eq('id', contract.id);
      if (error) throw error;
      const url = publicContractUrl(token);

      // Actually EMAIL the signing link — the button said "Send" but only ever
      // copied to the clipboard, so a signing request could not leave the app.
      // Routes through comms-send → email-send (branded, provider-agnostic),
      // mirroring the quote send flow.
      let emailed = false;
      let simulated = false;
      if (contract.counterparty_email) {
        const { data, error: mailErr } = await supabase.functions.invoke('comms-send', {
          body: { kind: 'contract_email', contract_id: contract.id, public_url: url, reminder: contract.status === 'pending_signature' },
        });
        simulated = !!(data as { simulated?: boolean } | null)?.simulated;
        emailed = !mailErr && !!(data as { success?: boolean } | null)?.success && !simulated;
      }
      return { token, url, version: versionNum, emailed, simulated, to: contract.counterparty_email };
    },
    onSuccess: ({ url, emailed, simulated, to }) => {
      qc.invalidateQueries({ queryKey: ['contract'] });
      qc.invalidateQueries({ queryKey: ['contracts'] });
      if (emailed) {
        toast.success(`Signing link sent to ${to}`);
      } else {
        // No email went out (no provider, no recipient, or a failure) — copy
        // the link so the admin can still send it, and say so honestly rather
        // than claiming it was sent.
        navigator.clipboard?.writeText(url).catch(() => {});
        toast.success(
          simulated
            ? 'No email provider configured — signing link copied to clipboard'
            : to
              ? 'Could not email the link — copied to clipboard instead'
              : 'No customer email on the contract — signing link copied to clipboard',
        );
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Public lookup by token — used on /contract/:token */
export function usePublicContract(token: string | undefined) {
  return useQuery({
    queryKey: ['public-contract', token],
    queryFn: async () => {
      if (!token) return null;
      // Via RPC, not a table read: contracts has no anon SELECT policy, so the
      // direct query returned nothing for the one caller this page exists for —
      // the counterparty following the signing link. The token is the credential.
      // Cast: this RPC is newer than the generated Supabase types.
      const client = supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> };
      };
      const { data, error } = await client.rpc('get_public_contract', { p_token: token }).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!token,
  });
}

export function useSignContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      accept_token: string;
      action: 'accept' | 'reject';
      signer_name: string;
      signer_email: string;
      signature_data?: string;
      /** Optional drawn signature — data:image/png data-URL from SignaturePad. */
      signature_image?: string;
      comment?: string;
    }) => {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/contract-sign`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ ...input, user_agent: navigator.userAgent }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to sign contract');
      return data as { success: true; action: 'accept' | 'reject' };
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['public-contract'] });
      toast.success(vars.action === 'accept' ? 'Contract signed — thank you!' : 'Contract declined');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/**
 * "The customer opened the agreement" — through the token, never the table.
 * The direct insert + update this used to do ran as anon and has answered 401
 * since the 2026-08 hardening, so viewed_at was silently never set (view sweep,
 * 2026-10-01). mark_contract_viewed_by_token is SECURITY DEFINER, token-scoped,
 * stamps once and records the view.
 */
export async function markContractViewed(token: string) {
  const { error } = await supabase.rpc('mark_contract_viewed_by_token' as never, {
    p_token: token,
    p_user_agent: navigator.userAgent,
  } as never);
  if (error) throw error;
}
