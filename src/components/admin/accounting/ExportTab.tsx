import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  const [from, setFrom] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [busyId, setBusyId] = useState<string | null>(null);

  const adapters = useMemo(() => pack.accounting_export_adapters ?? [], [pack]);

  const purposeLabel: Record<string, string> = {
    auditor_handoff: 'Auditor handoff',
    tax_authority: 'Tax authority',
    system_migration: 'System migration',
    general: 'General',
  };

  async function buildPayload(): Promise<AccountingExportPayload> {
    // Chart of accounts
    const { data: chart, error: chartErr } = await supabase
      .from('chart_of_accounts')
      .select('account_code, account_name, account_type, account_category, normal_balance')
      .order('account_code');
    if (chartErr) throw chartErr;

    // Journal entries within range (posted only)
    const { data: entries, error: entryErr } = await supabase
      .from('journal_entries')
      .select(`
        id, entry_number, entry_date, description, status,
        journal_entry_lines (account_code, debit_cents, credit_cents, description)
      `)
      .gte('entry_date', from)
      .lte('entry_date', to)
      .eq('status', 'posted')
      .order('entry_date');
    if (entryErr) throw entryErr;

    // Site identity (best-effort)
    const { data: settings } = await supabase
      .from('site_settings')
      .select('site_name, org_number')
      .maybeSingle();

    return {
      company: {
        name: (settings as any)?.site_name ?? 'FlowWink',
        org_number: (settings as any)?.org_number ?? null,
        currency: pack.currency.code,
      },
      fiscal_year: { start: from, end: to },
      chart: (chart ?? []) as any,
      entries: (entries ?? []).map((e: any) => ({
        entry_number: e.entry_number ?? e.id,
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
      <Card>
        <CardHeader>
          <CardTitle>Standardised accounting export</CardTitle>
          <CardDescription>
            Export the general ledger in the standard format your auditor or new
            accounting system expects. Formats are provided by the active locale
            pack ({pack.label}).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="from">From</Label>
              <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to">To</Label>
              <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {adapters.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No export adapters registered for {pack.label}.
            </CardContent>
          </Card>
        )}
        {adapters.map((a) => (
          <Card key={a.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">{a.label}</CardTitle>
                </div>
                <Badge variant="secondary">{purposeLabel[a.purpose] ?? a.purpose}</Badge>
              </div>
              <CardDescription>{a.description ?? `.${a.extension}`}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => handleDownload(a.id)}
                disabled={busyId !== null}
                className="w-full"
              >
                {busyId === a.id ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Download .{a.extension}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
