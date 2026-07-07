import { useRef, useState } from 'react';
import Papa from 'papaparse';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Download, Upload, MoreHorizontal, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCreateJournalEntry, useJournals } from '@/hooks/useAccounting';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Discreet CSV import/export for journal entries.
 * CSV columns:
 *   entry_date, reference_number, description, journal_code,
 *   account_code, account_name, debit, credit, line_description
 * Rows sharing (entry_date + reference_number + description) group into one entry.
 * Amounts are in major units (e.g. SEK 1234.56), converted to cents on import.
 */
export function JournalCsvActions({
  statusFilter,
  journalFilter,
}: {
  statusFilter: string;
  journalFilter: string;
}) {
  const { toast } = useToast();
  const { data: journals } = useJournals();
  const createEntry = useCreateJournalEntry();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeBankEvents, setWipeBankEvents] = useState(false);
  const [wiping, setWiping] = useState(false);

  async function handleWipe() {
    setWiping(true);
    try {
      const { data, error } = await supabase.rpc('admin_wipe_journal', {
        p_delete_bank_events: wipeBankEvents,
      });
      if (error) throw error;
      const r = (data ?? {}) as {
        entries_deleted?: number;
        lines_deleted?: number;
        bank_events?: number;
        periods_reopened?: number;
      };
      const parts: string[] = [];
      parts.push(`${r.entries_deleted ?? 0} entries`);
      if (wipeBankEvents) {
        parts.push(`${r.bank_events ?? 0} bank events deleted`);
      } else {
        parts.push(`${r.bank_events ?? 0} events reset`);
      }
      if ((r.periods_reopened ?? 0) > 0) {
        parts.push(`${r.periods_reopened} periods reopened`);
      }
      toast({ title: 'Deleted', description: parts.join(' · ') });

      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      queryClient.invalidateQueries({ queryKey: ['journal-entry'] });
      queryClient.invalidateQueries({ queryKey: ['account-balances'] });
      queryClient.invalidateQueries({ queryKey: ['account-ledger'] });
      queryClient.invalidateQueries({ queryKey: ['events-to-book'] });
      queryClient.invalidateQueries({ queryKey: ['events-booked'] });
      queryClient.invalidateQueries({ queryKey: ['events-booked-count'] });
      queryClient.invalidateQueries({ queryKey: ['template-registry-stats'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-periods'] });

      setWipeOpen(false);
      setWipeBankEvents(false);
    } catch (err: any) {
      toast({
        title: 'Delete failed',
        description: err.message ?? String(err),
        variant: 'destructive',
      });
    } finally {
      setWiping(false);
    }
  }

  const journalByCode = new Map((journals || []).map((j) => [j.code, j]));
  const journalById = new Map((journals || []).map((j) => [j.id, j]));

  async function handleExport(delimiter: ',' | ';' | '\t') {
    setBusy(true);
    try {
      let q = supabase
        .from('journal_entries')
        .select('*')
        .order('entry_date', { ascending: false });
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      if (journalFilter !== 'all') q = q.eq('journal_id', journalFilter);
      const { data: entries, error } = await q;
      if (error) throw error;

      const ids = (entries || []).map((e: any) => e.id);
      const { data: lines, error: le } = await supabase
        .from('journal_entry_lines')
        .select('*')
        .in('journal_entry_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
      if (le) throw le;

      const linesByEntry = new Map<string, any[]>();
      (lines || []).forEach((l: any) => {
        const arr = linesByEntry.get(l.journal_entry_id) || [];
        arr.push(l);
        linesByEntry.set(l.journal_entry_id, arr);
      });

      const rows: any[] = [];
      (entries || []).forEach((e: any) => {
        const jCode = e.journal_id ? journalById.get(e.journal_id)?.code || '' : '';
        const els = linesByEntry.get(e.id) || [];
        if (!els.length) {
          rows.push({
            entry_date: e.entry_date,
            reference_number: e.reference_number || '',
            description: e.description,
            journal_code: jCode,
            account_code: '',
            account_name: '',
            debit: '',
            credit: '',
            line_description: '',
          });
          return;
        }
        els.forEach((l) => {
          rows.push({
            entry_date: e.entry_date,
            reference_number: e.reference_number || '',
            description: e.description,
            journal_code: jCode,
            account_code: l.account_code,
            account_name: l.account_name,
            debit: l.debit_cents ? (l.debit_cents / 100).toFixed(2) : '',
            credit: l.credit_cents ? (l.credit_cents / 100).toFixed(2) : '',
            line_description: l.description || '',
          });
        });
      });

      const csv = Papa.unparse(rows, { delimiter });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `journal-entries-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Exported', description: `${rows.length} rows` });
    } catch (err: any) {
      toast({ title: 'Export failed', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(file: File) {
    setBusy(true);
    try {
      const text = await file.text();
      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        delimitersToGuess: [',', ';', '\t'],
      });
      if (parsed.errors.length) {
        throw new Error(parsed.errors[0].message);
      }

      const groups = new Map<string, { header: any; lines: any[] }>();
      for (const row of parsed.data) {
        const entry_date = (row.entry_date || '').trim();
        const description = (row.description || '').trim();
        const reference_number = (row.reference_number || '').trim();
        if (!entry_date || !description) continue;
        const key = `${entry_date}|${reference_number}|${description}`;
        if (!groups.has(key)) {
          groups.set(key, {
            header: {
              entry_date,
              description,
              reference_number: reference_number || undefined,
              journal_code: (row.journal_code || '').trim(),
            },
            lines: [],
          });
        }
        const debit = parseFloat((row.debit || '0').replace(',', '.')) || 0;
        const credit = parseFloat((row.credit || '0').replace(',', '.')) || 0;
        const account_code = (row.account_code || '').trim();
        if (!account_code) continue;
        groups.get(key)!.lines.push({
          account_code,
          account_name: (row.account_name || '').trim() || account_code,
          debit_cents: Math.round(debit * 100),
          credit_cents: Math.round(credit * 100),
          description: (row.line_description || '').trim() || undefined,
        });
      }

      let ok = 0;
      const errors: string[] = [];
      for (const [key, g] of groups) {
        if (!g.lines.length) continue;
        try {
          const journal_id = g.header.journal_code
            ? journalByCode.get(g.header.journal_code)?.id
            : undefined;
          await createEntry.mutateAsync({
            entry_date: g.header.entry_date,
            description: g.header.description,
            reference_number: g.header.reference_number,
            journal_id,
            source: 'csv-import',
            status: 'draft',
            lines: g.lines,
          });
          ok++;
        } catch (e: any) {
          errors.push(`${key}: ${e.message}`);
        }
      }

      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      toast({
        title: `Imported ${ok} entries`,
        description: errors.length ? `${errors.length} failed — first: ${errors[0]}` : 'All entries created as draft',
        variant: errors.length ? 'destructive' : 'default',
      });
    } catch (err: any) {
      toast({ title: 'Import failed', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.tsv,text/csv,text/tab-separated-values"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleImport(f);
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" disabled={busy} title="CSV import/export">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />
            Import CSV…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => handleExport(',')}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV (comma)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExport(';')}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV (semicolon)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExport('\t')}>
            <Download className="h-4 w-4 mr-2" />
            Export TSV (tab)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setWipeOpen(true);
            }}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete all…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={wipeOpen} onOpenChange={(o) => !wiping && setWipeOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all journal entries?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes every journal entry and resets bank events to unbooked
              (they reappear in Events to book). Closed periods are reopened. This is a
              dev/iteration tool.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2 pt-2">
            <Checkbox
              id="wipe-bank-events"
              checked={wipeBankEvents}
              onCheckedChange={(v) => setWipeBankEvents(v === true)}
              disabled={wiping}
            />
            <Label htmlFor="wipe-bank-events" className="text-sm cursor-pointer">
              Also delete bank events
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={wiping}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleWipe();
              }}
              disabled={wiping}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {wiping && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
