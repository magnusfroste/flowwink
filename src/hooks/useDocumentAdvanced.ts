import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ================= Versions =================

export interface DocumentVersion {
  id: string;
  document_id: string;
  version_no: number;
  file_url: string;
  file_name: string | null;
  file_size_bytes: number | null;
  file_type: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export function useDocumentVersions(documentId: string | null | undefined) {
  return useQuery({
    queryKey: ['document-versions', documentId],
    enabled: !!documentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_versions' as any)
        .select('*')
        .eq('document_id', documentId!)
        .order('version_no', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as DocumentVersion[];
    },
  });
}

/**
 * Upload a new version: snapshots current file into document_versions,
 * uploads the new file into storage, updates the document row.
 */
export function useReplaceDocumentFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ documentId, file }: { documentId: string; file: File }) => {
      const { data: doc, error: docErr } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single();
      if (docErr || !doc) throw docErr ?? new Error('document not found');

      // Snapshot current file as a prior version
      const nextVersionNo = ((doc as any).current_version_no ?? 1);
      const { error: verErr } = await supabase.from('document_versions' as any).insert({
        document_id: documentId,
        version_no: nextVersionNo,
        file_url: doc.file_url,
        file_name: doc.file_name,
        file_size_bytes: doc.file_size_bytes,
        file_type: doc.file_type,
      });
      if (verErr) throw verErr;

      // Upload new file
      const { data: { user } } = await supabase.auth.getUser();
      const ext = file.name.split('.').pop() || 'bin';
      const path = `${user?.id ?? 'anon'}/${Date.now()}-v${nextVersionNo + 1}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('documents')
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (upErr) throw upErr;

      const { error: updErr } = await supabase
        .from('documents')
        .update({
          file_url: path,
          file_name: file.name,
          file_size_bytes: file.size,
          file_type: file.type || null,
          current_version_no: nextVersionNo + 1,
        } as any)
        .eq('id', documentId);
      if (updErr) throw updErr;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['document-versions', v.documentId] });
      qc.invalidateQueries({ queryKey: ['documents'] });
      toast.success('New version uploaded');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useRestoreDocumentVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ documentId, version }: { documentId: string; version: DocumentVersion }) => {
      // Snapshot current, then swap in the older version's file pointer.
      const { data: doc, error: dErr } = await supabase.from('documents').select('*').eq('id', documentId).single();
      if (dErr || !doc) throw dErr ?? new Error('not found');
      const nextVersionNo = ((doc as any).current_version_no ?? 1);
      await supabase.from('document_versions' as any).insert({
        document_id: documentId,
        version_no: nextVersionNo,
        file_url: doc.file_url,
        file_name: doc.file_name,
        file_size_bytes: doc.file_size_bytes,
        file_type: doc.file_type,
      });
      await supabase.from('documents').update({
        file_url: version.file_url,
        file_name: version.file_name,
        file_size_bytes: version.file_size_bytes,
        file_type: version.file_type,
        current_version_no: nextVersionNo + 1,
      } as any).eq('id', documentId);
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['document-versions', v.documentId] });
      qc.invalidateQueries({ queryKey: ['documents'] });
      toast.success(`Restored version ${v.version.version_no}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ================= Share links =================

export interface DocumentShareLink {
  id: string;
  document_id: string;
  token: string;
  expires_at: string | null;
  permissions: 'view' | 'download';
  revoked_at: string | null;
  access_count: number;
  last_accessed_at: string | null;
  created_by: string | null;
  created_at: string;
}

export function useDocumentShareLinks(documentId: string | null | undefined) {
  return useQuery({
    queryKey: ['document-share-links', documentId],
    enabled: !!documentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_share_links' as any)
        .select('*')
        .eq('document_id', documentId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as DocumentShareLink[];
    },
  });
}

export function useCreateDocumentShareLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { documentId: string; permissions: 'view' | 'download'; expiresInDays?: number | null }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const expires = input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 86400_000).toISOString()
        : null;
      const { data, error } = await supabase
        .from('document_share_links' as any)
        .insert({
          document_id: input.documentId,
          permissions: input.permissions,
          expires_at: expires,
          created_by: user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as DocumentShareLink;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['document-share-links', v.documentId] });
      toast.success('Share link created');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useRevokeDocumentShareLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, documentId }: { id: string; documentId: string }) => {
      const { error } = await supabase
        .from('document_share_links' as any)
        .update({ revoked_at: new Date().toISOString() } as any)
        .eq('id', id);
      if (error) throw error;
      return documentId;
    },
    onSuccess: (documentId) => {
      qc.invalidateQueries({ queryKey: ['document-share-links', documentId] });
      toast.success('Share link revoked');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function publicShareUrl(token: string): string {
  const base = import.meta.env.VITE_SUPABASE_URL as string;
  return `${base}/functions/v1/document-share?token=${token}`;
}

// ================= Signature requests =================

export interface DocumentSignatureRequest {
  id: string;
  document_id: string;
  signer_email: string;
  signer_name: string | null;
  token: string;
  status: 'draft' | 'sent' | 'signed' | 'declined' | 'expired';
  message: string | null;
  sent_at: string | null;
  signed_at: string | null;
  signature_type: 'typed' | 'drawn' | null;
  expires_at: string | null;
  created_at: string;
}

export function useDocumentSignatureRequests(documentId: string | null | undefined) {
  return useQuery({
    queryKey: ['document-signature-requests', documentId],
    enabled: !!documentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_signature_requests' as any)
        .select('id, document_id, signer_email, signer_name, token, status, message, sent_at, signed_at, signature_type, expires_at, created_at')
        .eq('document_id', documentId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as DocumentSignatureRequest[];
    },
  });
}

export function useCreateDocumentSignatureRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      documentId: string;
      signer_email: string;
      signer_name?: string;
      message?: string;
      expiresInDays?: number | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const expires = input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 86400_000).toISOString()
        : null;
      const { data, error } = await supabase
        .from('document_signature_requests' as any)
        .insert({
          document_id: input.documentId,
          signer_email: input.signer_email,
          signer_name: input.signer_name ?? null,
          message: input.message ?? null,
          expires_at: expires,
          created_by: user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;

      // Fire-and-forget: dispatch the request email
      await supabase.functions.invoke('document-sign-request', {
        body: { request_id: (data as any).id },
      });

      return data as unknown as DocumentSignatureRequest;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['document-signature-requests', v.documentId] });
      toast.success('Signature request sent');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCancelDocumentSignatureRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, documentId }: { id: string; documentId: string }) => {
      const { error } = await supabase
        .from('document_signature_requests' as any)
        .update({ status: 'declined' } as any)
        .eq('id', id);
      if (error) throw error;
      return documentId;
    },
    onSuccess: (documentId) => {
      qc.invalidateQueries({ queryKey: ['document-signature-requests', documentId] });
      toast.success('Signature request cancelled');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function publicSignUrl(token: string): string {
  return `${window.location.origin}/sign/document/${token}`;
}
