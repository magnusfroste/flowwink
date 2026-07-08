import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { uploadDocumentForEntity, getDocumentSignedUrl } from './useDocuments';

export interface QuoteAttachment {
  id: string;
  quote_id: string;
  document_id: string;
  filename: string;
  uploaded_by: string | null;
  created_at: string;
  documents?: {
    id: string;
    file_url: string;
    file_name: string;
    file_size_bytes: number | null;
    file_type: string | null;
  } | null;
}

export function useQuoteAttachments(quoteId: string | null | undefined) {
  return useQuery({
    queryKey: ['quote-attachments', quoteId],
    enabled: !!quoteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quote_attachments' as any)
        .select('*, documents(id, file_url, file_name, file_size_bytes, file_type)')
        .eq('quote_id', quoteId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as QuoteAttachment[];
    },
  });
}

export function useAttachToQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ quoteId, file }: { quoteId: string; file: File }) => {
      const doc = await uploadDocumentForEntity({
        file,
        entityType: 'quote',
        entityId: quoteId,
        category: 'quote',
      });
      if (!doc) throw new Error('Upload failed');
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from('quote_attachments' as any).insert({
        quote_id: quoteId,
        document_id: doc.id,
        filename: file.name,
        uploaded_by: userData.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['quote-attachments', v.quoteId] });
      toast.success('Attachment added');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useRemoveQuoteAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ attachmentId, quoteId }: { attachmentId: string; quoteId: string }) => {
      const { error } = await supabase.from('quote_attachments' as any).delete().eq('id', attachmentId);
      if (error) throw error;
      return quoteId;
    },
    onSuccess: (quoteId) => {
      qc.invalidateQueries({ queryKey: ['quote-attachments', quoteId] });
      toast.success('Attachment removed');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export async function openQuoteAttachment(a: QuoteAttachment): Promise<void> {
  const path = a.documents?.file_url;
  if (!path) return;
  const url = await getDocumentSignedUrl(path, 120);
  if (url) window.open(url, '_blank', 'noopener');
}
