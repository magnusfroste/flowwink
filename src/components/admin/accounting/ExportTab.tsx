import { useEffect, useState, useMemo } from 'react';
import { resolveExportIdentity } from '@/lib/export-identity';
import { AccountingTabHeader } from './AccountingTabHeader';
import { useFiscalYear } from './FiscalYearContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Download, FileText, Loader2 } from 'lucide-react';
import { useAccountingLocale } from '@/hooks/useAccountingLocale';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { AccountingExportPayload } from '@/lib/locale-packs/types';

/**
 * Standardised accounting export — pluggable adapters per locale pack
 * (SIE 4 in SE, OECD SAF-T in generic, DATEV/FEC/IIF in future packs).
 *
 * Pulls a canonical AccountingExportPayload from the DB and lets the
 * active pack's adapter serialise it to the target format.
 */
export function ExportTab() {
  const { pack } = useAccountingLocale();
  const { toast } = useToast();
  const { year, fromDate, toDate } = useFiscalYear();
  const [from, setFrom] = useState(fromDate);
  const [to, setTo] = useState(toDate);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Follow the global fiscal-year selector; the user can still override the range.
  useEffect(() => {
    setFrom(fromDate);
    setTo(toDate);
  }, [year, fromDate, toDate]);

  const adapters = useMemo(() => pack.accounting_export_adapters ?? [], [pack]);

  const purposeLabel: Record<string, string> = {
    auditor_handoff: 'Auditor handoff',
    tax_authority: 'Tax authority',
    system_migration: 'System migration',
    general: 'General',
  };

  async function buildPayload(): Promise<AccountingExportPayload> {
    // Chart of accounts — read in pages.
    //
    // This is an export: its whole claim is completeness. An unfiltered
    // PostgREST select stops at 1000 rows and says nothing, and a BAS instance
    // holds 1263 accounts (measured 2026-08-23). Sorted by account_code the
    // silently dropped tail was the 8xxx–9xxx block, so every export shipped a
    // chart with its financial and year-end accounts missing and no error
    // anywhere. Paginate rather than upsert/`.in()` here because the entire
    // population genuinely is the subject.
    const CHART_PAGE = 500;
    type ChartRow = {
      account_code: string;
      account_name: string;
      account_type: string;
      account_category: string | null;
      normal_balance: string;
    };
    const chart: ChartRow[] = [];
    for (let from = 0; ; from += CHART_PAGE) {
      const { data: page, error: chartErr } = await supabase
        .from('chart_of_accounts')
        .select('account_code, account_name, account_type, account_category, normal_balance')
        .order('account_code')
        .range(from, from + CHART_PAGE - 1);
      if (chartErr) throw chartErr;
      const rows = (page ?? []) as ChartRow[];
      chart.push(...rows);
      if (rows.length < CHART_PAGE) break;
    }

    // Journal entries within range (posted only)
    const { data: entries, error: entryErr } = await supabase
      .from('journal_entries')
      .select(`
        id, voucher_series, voucher_number, entry_date, description, status,
        journal_entry_lines (account_code, debit_cents, credit_cents, description)
      `)
      .gte('entry_date', from)
      .lte('entry_date', to)
      .eq('status', 'posted')
      .order('entry_date');
    if (entryErr) throw entryErr;

    // The legal entity this export claims to be. site_settings is a key/value
    // store — the old code read `site_name`/`org_number` as columns, got a
    // swallowed 400, and shipped every customer's bookkeeping under the
    // platform's own name. The identity lives in the company_profile row
    // (Business Identity).
    const { data: settingsRow, error: identityErr } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'company_profile')
      .maybeSingle();
    if (identityErr) console.error('[export] company identity read failed:', identityErr.message);
    const identity = resolveExportIdentity(settingsRow?.value);
    if (!identity.complete) {
      // Empty is honest and gets caught on import; a wrong name gets imported.
      console.warn('[export] no legal entity in Business Identity — exporting without a company name');
    }

    return {
      company: {
        name: identity.name,
        org_number: identity.org_number,
        currency: pack.currency.code,
      },
      fiscal_year: { start: from, end: to },
      chart: (chart ?? []) as any,
      entries: (entries ?? []).map((e: any) => ({
        entry_number:
          e.voucher_number != null
            ? `${e.voucher_series ?? ''}${e.voucher_number}`
            : e.id,
        entry_date: e.entry_date,
        description: e.description ?? '',
        lines: (e.journal_entry_lines ?? []).map((l: any) => ({
          account_code: l.account_code,
          debit_cents: l.debit_cents ?? 0,
          credit_cents: l.credit_cents ?? 0,
          description: l.description ?? null,
        })),
      })),
    };
  }

  async function handleDownload(adapterId: string) {
    setBusyId(adapterId);
    try {
      const adapter = adapters.find((a) => a.id === adapterId);
      if (!adapter) throw new Error('Adapter not found');
      const payload = await buildPayload();
      const content = adapter.generate(payload, {
        date_from: from,
        date_to: to,
        generated_by: 'FlowWink',
      });
      const blob = new Blob([content], { type: adapter.mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `${pack.id}_${adapter.id}_${stamp}.${adapter.extension}`;
      a.click();
      URL.revokeObjectURL(url);
      toast({
        title: 'Export ready',
        description: `${adapter.label} — ${payload.entries.length} entries`,
      });
    } catch (e: any) {
      toast({
        title: 'Export failed',
        description: e.message ?? String(e),
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <AccountingTabHeader
        title="Standardised Export"
        description={<>Export the general ledger in the standard format your auditor or new accounting system expects. Formats are provided by the active locale pack ({pack.label}).</>}
      />

      <div className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-center gap-4 px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <Label htmlFor="from" className="text-xs text-muted-foreground">From</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40 h-9" />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="to" className="text-xs text-muted-foreground">To</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40 h-9" />
          </div>
        </div>


        {adapters.length === 0 ? (
          <div className="py-16 text-center">
            <h3 className="text-sm font-medium mb-1">No export adapters available</h3>
            <p className="text-sm text-muted-foreground">The active locale pack ({pack.label}) does not register any export formats.</p>
          </div>
        ) : (
          adapters.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-4 px-6 py-3 border-b border-border/40 last:border-b-0"
            >
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium truncate">{a.label}</span>
                  <span className="text-xs text-muted-foreground">.{a.extension}</span>
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {a.description ?? purposeLabel[a.purpose] ?? a.purpose}
                </div>
              </div>
              <Badge variant="outline" className="font-normal shrink-0">{purposeLabel[a.purpose] ?? a.purpose}</Badge>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDownload(a.id)}
                disabled={busyId !== null}
                className="shrink-0"
              >
                {busyId === a.id ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Download
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

