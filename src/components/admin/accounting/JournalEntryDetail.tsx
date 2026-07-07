import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { JournalEntry } from '@/hooks/useAccounting';
import { useAccountingPreferences } from '@/hooks/useSiteSettings';

interface Props {
  entry: JournalEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MATCH_SOURCE_LABEL: Record<string, string> = {
  'vendor-default': 'vendor default',
  keyword: 'keyword match',
  manual: 'manual',
};

function voucherLabel(e: any) {
  if (e.voucher_series && e.voucher_number != null) {
    return `${e.voucher_series}${e.voucher_number}${e.voucher_year ? `/${String(e.voucher_year).slice(-2)}` : ''}`;
  }
  return e.reference_number || null;
}

export function JournalEntryDetail({ entry, open, onOpenChange }: Props) {
  const { data: prefs } = useAccountingPreferences();

  const fmt = (cents: number | null | undefined) => {
    if (!cents) return '\u2014';
    const decimals = prefs?.decimals ?? 2;
    const decSep = prefs?.decimalSeparator ?? ',';
    const thouSep = prefs?.thousandsSeparator ?? ' ';
    const neg = cents < 0;
    const n = Math.abs(cents) / 100;
    const [intPart, decPart] = n.toFixed(decimals).split('.');
    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thouSep);
    const body = decimals > 0 ? `${grouped}${decSep}${decPart}` : grouped;
    return neg ? `\u2212${body}` : body;
  };

  const totalDebit = entry.lines?.reduce((s, l) => s + (l.debit_cents || 0), 0) || 0;
  const totalCredit = entry.lines?.reduce((s, l) => s + (l.credit_cents || 0), 0) || 0;
  const balanced = Math.abs(totalDebit - totalCredit) < 1;

  const templateId = (entry as any).template_id as string | null | undefined;
  const matchSource = (entry as any).match_source as string | null | undefined;
  const voucher = voucherLabel(entry);

  const { data: template } = useQuery({
    queryKey: ['accounting-template', templateId],
    enabled: !!templateId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounting_templates')
        .select('id, template_name')
        .eq('id', templateId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl">
        <SheetHeader className="space-y-2">
          <div className="flex items-baseline gap-3">
            {voucher && (
              <span className="font-mono text-sm font-semibold text-primary">{voucher}</span>
            )}
            <span className="font-mono text-xs text-muted-foreground">{entry.entry_date}</span>
            <Badge variant="secondary" className="ml-auto text-[10px]">{entry.status}</Badge>
          </div>
          <SheetTitle className="text-base font-normal leading-snug">{entry.description}</SheetTitle>
        </SheetHeader>

        {templateId && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              Booked via template:{' '}
              <span className="text-foreground">{template?.template_name ?? '…'}</span>
            </span>
            {matchSource && (
              <Badge variant="outline" className="font-normal text-[10px] px-1.5 py-0">
                {MATCH_SOURCE_LABEL[matchSource] ?? matchSource}
              </Badge>
            )}
          </div>
        )}

        <div className="mt-6 space-y-6">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
            {entry.reference_number && (
              <div>
                <div className="text-muted-foreground uppercase tracking-wide text-[10px]">Reference</div>
                <div className="font-mono mt-0.5">{entry.reference_number}</div>
              </div>
            )}
            <div>
              <div className="text-muted-foreground uppercase tracking-wide text-[10px]">Source</div>
              <div className="font-mono mt-0.5">{entry.source}</div>
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right w-28">Debit</TableHead>
                  <TableHead className="text-right w-28">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entry.lines?.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-xs font-semibold">{line.account_code}</span>
                        <span className="text-sm text-muted-foreground truncate">{line.account_name}</span>
                      </div>
                      {line.description && (
                        <div className="text-xs text-muted-foreground mt-0.5">{line.description}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-sm">
                      {fmt(line.debit_cents)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-sm">
                      {fmt(line.credit_cents)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-semibold">
                  <TableCell>Total {balanced && <span className="text-xs font-normal text-success ml-1">· balanced</span>}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{fmt(totalDebit)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{fmt(totalCredit)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
