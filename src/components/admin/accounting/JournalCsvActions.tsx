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
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
