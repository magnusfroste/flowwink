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
      return { token, url, version: versionNum };
    },
    onSuccess: ({ url }) => {
      qc.invalidateQueries({ queryKey: ['contract'] });
      qc.invalidateQueries({ queryKey: ['contracts'] });
      navigator.clipboard?.writeText(url).catch(() => {});
      toast.success('Contract ready for signing — link copied');
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
      const { data, error } = await supabase
        .from('contracts')
        .select('id,title,counterparty_name,counterparty_email,status,body_markdown,signed_at,version,currency,value_cents,start_date,end_date')
        .eq('accept_token', token)
        .maybeSingle();
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

export async function markContractViewed(contractId: string) {
  await supabase.from('contract_signatures').insert({
    contract_id: contractId,
    action: 'view',
    user_agent: navigator.userAgent,
  });
  await supabase
    .from('contracts')
    .update({ viewed_at: new Date().toISOString() } as never)
    .eq('id', contractId)
    .is('viewed_at', null);
}
