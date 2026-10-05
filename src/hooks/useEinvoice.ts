import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { UblValidation } from '../../supabase/functions/_shared/einvoice/ubl';

/**
 * UBL/Peppol for one invoice — export, dispatch, the dispatch ledger — and
 * the instance's e-invoice settings (bank details, Peppol id, access point).
 * All of it goes through the `einvoice` edge function, the same door the
 * agent's export_invoice_ubl / send_einvoice use.
 */

export interface EinvoiceSettings {
  bankgiro?: string;
  iban?: string;
  bic?: string;
  peppol_id?: string;
  access_point_url?: string;
  access_point_name?: string;
}

export interface EinvoiceExport {
  xml: string;
  validation: UblValidation;
  totals: { tax_inclusive_cents: number; payable_cents: number };
  recipient_id: string | null;
  sender_id: string | null;
  invoice_number: string;
}

export interface EinvoiceDispatch {
  id: string;
  status: 'simulated' | 'sent' | 'accepted' | 'rejected' | 'failed';
  provider: string | null;
  provider_ref: string | null;
  recipient_id: string | null;
  error_message: string | null;
  created_at: string;
  sent_at: string | null;
}

const SETTINGS_KEY = 'einvoice';

export function useEinvoiceSettings() {
  return useQuery({
    queryKey: ['site_settings', SETTINGS_KEY],
    queryFn: async () => {
      const { data, error } = await supabase.from('site_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle();
      if (error) throw new Error(error.message);
      return ((data?.value as EinvoiceSettings) ?? {}) as EinvoiceSettings;
    },
  });
}

export function useUpdateEinvoiceSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (next: EinvoiceSettings) => {
      const { error } = await supabase.from('site_settings')
        .upsert({ key: SETTINGS_KEY, value: next as never }, { onConflict: 'key' });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['site_settings', SETTINGS_KEY] }); toast.success('E-invoice settings saved'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('einvoice', { body });
  if (error) {
    // A 422 (validation refused) still carries a readable body.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try { const j = await ctx.json(); throw new Error(j.error ?? error.message); } catch (inner) { if (inner instanceof Error && inner.message !== error.message) throw inner; }
    }
    throw new Error(error.message);
  }
  if (data && data.error && !data.success) throw new Error(String(data.error));
  return data as T;
}

/** The rendered document and its validation — fetched on demand, not on every sheet open. */
export function useEinvoiceExport(invoiceId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['einvoice-export', invoiceId],
    enabled: !!invoiceId && enabled,
    queryFn: () => call<EinvoiceExport>({ action: 'export', invoice_id: invoiceId }),
  });
}

export function useEinvoiceDispatches(invoiceId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['einvoice-dispatches', invoiceId],
    enabled: !!invoiceId && enabled,
    queryFn: async () => (await call<{ dispatches: EinvoiceDispatch[] }>({ action: 'list', invoice_id: invoiceId })).dispatches,
  });
}

export function useSendEinvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { invoiceId: string; dryRun?: boolean }) =>
      call<{ success: boolean; dry_run?: boolean; message: string; would_simulate?: boolean; dispatch?: EinvoiceDispatch }>({ action: 'dispatch', invoice_id: v.invoiceId, dry_run: v.dryRun === true }),
    onSuccess: (r, v) => {
      qc.invalidateQueries({ queryKey: ['einvoice-dispatches', v.invoiceId] });
      if (r.dry_run) toast.info(r.message);
      else if (r.dispatch?.status === 'sent') toast.success(r.message);
      else toast.warning(r.message);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Download the XML as a file, straight from the export the hook already has. */
export function downloadXml(xml: string, filename: string) {
  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
