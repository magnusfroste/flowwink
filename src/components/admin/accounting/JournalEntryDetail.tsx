import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { JournalEntry } from '@/hooks/useAccounting';

const formatCents = (cents: number) =>
  cents ? new Intl.NumberFormat('en-US', { minimumFractionDigits: 0 }).format(cents / 100) : '—';

interface Props {
  entry: JournalEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function JournalEntryDetail({ entry, open, onOpenChange }: Props) {
  const totalDebit = entry.lines?.reduce((s, l) => s + (l.debit_cents || 0), 0) || 0;
  const totalCredit = entry.lines?.reduce((s, l) => s + (l.credit_cents || 0), 0) || 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{entry.description}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Date</span>
              <p className="font-medium">{entry.entry_date}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Status</span>
              <p><Badge variant="secondary">{entry.status}</Badge></p>
            </div>
            {entry.reference_number && (
              <div>
                <span className="text-muted-foreground">Reference</span>
                <p className="font-medium">{entry.reference_number}</p>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Source</span>
              <p className="font-medium">{entry.source}</p>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entry.lines?.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    <div className="font-mono text-xs">{line.account_code}</div>
                    <div className="text-sm">{line.account_name}</div>
                    {line.description && (
                      <div className="text-xs text-muted-foreground">{line.description}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCents(line.debit_cents)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCents(line.credit_cents)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold border-t-2">
                <TableCell>Total</TableCell>
                <TableCell className="text-right font-mono">{formatCents(totalDebit)}</TableCell>
                <TableCell className="text-right font-mono">{formatCents(totalCredit)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </SheetContent>
    </Sheet>
  );
}
