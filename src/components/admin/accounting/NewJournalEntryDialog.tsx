import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, FileText } from 'lucide-react';
import { useCreateJournalEntry, useJournals } from '@/hooks/useAccounting';
import { supabase } from '@/integrations/supabase/client';
import { useChartOfAccounts, useAccountingTemplates } from '@/hooks/useAccounting';
import type { TemplateLine } from '@/hooks/useAccounting';
import { useAccountingLocale } from '@/hooks/useAccountingLocale';
import { useAnalyticAccounts } from '@/hooks/useAnalyticAccounting';

interface LineInput {
  account_code: string;
  account_name: string;
  debit_cents: number;
  credit_cents: number;
  description: string;
  analytic_account_id: string | null;
}

const emptyLine = (): LineInput => ({
  account_code: '',
  account_name: '',
  debit_cents: 0,
  credit_cents: 0,
  description: '',
  analytic_account_id: null,
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewJournalEntryDialog({ open, onOpenChange }: Props) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [journalId, setJournalId] = useState<string>('');
  const [lines, setLines] = useState<LineInput[]>([emptyLine(), emptyLine()]);

  const { locale } = useAccountingLocale();
  const createEntry = useCreateJournalEntry();
  // What this verification rests on. BFL 5:7 wants a verification to identify
  // its underlying documents, and the moment someone is typing the entry is the
  // moment they have the receipt in their hand.
  const [docs, setDocs] = useState<{ label: string; file_url: string; file_name: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  const uploadReceipt = async (file: File) => {
    setUploading(true);
    try {
      const path = `journal/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`;
      const { error } = await supabase.storage.from('documents').upload(path, file);
      if (error) throw error;
      const { data } = supabase.storage.from('documents').getPublicUrl(path);
      setDocs((d) => [...d, { label: file.name, file_url: data.publicUrl, file_name: file.name }]);
    } finally {
      setUploading(false);
    }
  };
  const { data: accounts } = useChartOfAccounts(locale);
  const { data: templates } = useAccountingTemplates(locale);
  const { data: journals } = useJournals();
  const { data: analyticAccounts } = useAnalyticAccounts(true);

  const updateLine = (index: number, updates: Partial<LineInput>) => {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, ...updates } : l))
    );
  };

  const handleAccountSelect = (index: number, code: string) => {
    const account = accounts?.find((a) => a.account_code === code);
    updateLine(index, {
      account_code: code,
      account_name: account?.account_name || '',
    });
  };

  const applyTemplate = (templateId: string) => {
    const template = templates?.find((t) => t.id === templateId);
    if (!template) return;

    setDescription(template.template_name);
    const templateLines: LineInput[] = ((template.template_lines as TemplateLine[] | null) ?? []).map((tl) => ({
      account_code: tl.account_code,
      account_name: tl.account_name,
      debit_cents: 0,
      credit_cents: 0,
      description: tl.description ?? '',
      analytic_account_id: null,
    }));
    setLines(templateLines);
  };

  const totalDebit = lines.reduce((s, l) => s + l.debit_cents, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit_cents, 0);
  const isBalanced = totalDebit === totalCredit && totalDebit > 0;

  const formatKr = (cents: number) => (cents / 100).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleSubmit = async () => {
    await createEntry.mutateAsync({
      entry_date: date,
      description,
      reference_number: reference || undefined,
      journal_id: journalId || undefined,
      documents: docs.map((d) => ({ kind: 'file' as const, ...d })),
      lines: lines
        .filter((l) => l.account_code && (l.debit_cents > 0 || l.credit_cents > 0))
        .map((l) => ({
          account_code: l.account_code,
          account_name: l.account_name,
          debit_cents: l.debit_cents,
          credit_cents: l.credit_cents,
          description: l.description,
          analytic_account_id: l.analytic_account_id,
        })),
    });
    onOpenChange(false);
    // Reset form
    setDate(new Date().toISOString().split('T')[0]);
    setDescription('');
    setReference('');
    setJournalId('');
    setLines([emptyLine(), emptyLine()]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Journal Entry</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template selector */}
          {templates && templates.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground">Apply template</Label>
              <Select onValueChange={applyTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Select template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <div className="flex items-center gap-2">
                        <FileText className="h-3 w-3" />
                        {t.template_name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Header fields */}
          <div className="grid grid-cols-4 gap-4">
            <div>
              <Label>Journal</Label>
              <Select value={journalId} onValueChange={setJournalId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {journals?.map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.code} — {j.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Löneutbetalning mars"
              />
            </div>
            <div>
              <Label>Reference</Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          {/* Lines */}
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_1fr_110px_110px_140px_auto] gap-2 text-xs font-medium text-muted-foreground px-1">
              <span>Account</span>
              <span>Description</span>
              <span className="text-right">Debit</span>
              <span className="text-right">Credit</span>
              <span>Analytic</span>
              <span></span>
            </div>

            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_110px_110px_140px_auto] gap-2">
                <Select
                  value={line.account_code}
                  onValueChange={(val) => handleAccountSelect(i, val)}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Account...">
                      {line.account_code
                        ? `${line.account_code} ${line.account_name}`
                        : 'Account...'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {accounts?.map((a) => (
                      <SelectItem key={a.account_code} value={a.account_code}>
                        {a.account_code} {a.account_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={line.description}
                  onChange={(e) => updateLine(i, { description: e.target.value })}
                  placeholder="Description"
                  className="text-sm"
                />
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={line.debit_cents ? (line.debit_cents / 100).toString() : ''}
                  onChange={(e) =>
                    updateLine(i, { debit_cents: Math.round((Number(e.target.value) || 0) * 100), credit_cents: 0 })
                  }
                  placeholder="0.00"
                  className="text-right text-sm"
                />
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={line.credit_cents ? (line.credit_cents / 100).toString() : ''}
                  onChange={(e) =>
                    updateLine(i, { credit_cents: Math.round((Number(e.target.value) || 0) * 100), debit_cents: 0 })
                  }
                  placeholder="0.00"
                  className="text-right text-sm"
                />
                <Select
                  value={line.analytic_account_id ?? 'none'}
                  onValueChange={(val) =>
                    updateLine(i, { analytic_account_id: val === 'none' ? null : val })
                  }
                  disabled={!analyticAccounts || analyticAccounts.length === 0}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="none">— None —</SelectItem>
                    {analyticAccounts?.map((aa) => (
                      <SelectItem key={aa.id} value={aa.id}>
                        {aa.code} — {aa.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10"
                  onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                  disabled={lines.length <= 2}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setLines((prev) => [...prev, emptyLine()])}
            >
              <Plus className="h-4 w-4 mr-1" /> Add line
            </Button>
          </div>

          {/* Underlying documentation. BFL 5:7 wants a verification to identify
              what it rests on, and the moment someone is typing the entry is
              the moment they have the receipt in their hand — so it lives here
              rather than behind a later step. */}
          <div className="space-y-2 border-t pt-4">
            <Label>Underlying documents</Label>
            {docs.length > 0 && (
              <ul className="rounded-md border divide-y text-sm">
                {docs.map((d, i) => (
                  <li key={d.file_url} className="flex items-center gap-2 px-3 py-1.5">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{d.label}</span>
                    <Button type="button" variant="ghost" size="sm" className="ml-auto h-7 px-2"
                      onClick={() => setDocs((x) => x.filter((_, j) => j !== i))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <Input type="file" disabled={uploading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadReceipt(f); e.target.value = ''; }} />
            <p className="text-xs text-muted-foreground">
              The receipt, invoice or statement this entry was booked from.
            </p>
          </div>

          {/* Totals */}
          <div className="flex items-center justify-between border-t pt-4">
            <div className="flex gap-6 text-sm">
              <span>
                Debit: <strong>{formatKr(totalDebit)}</strong>
              </span>
              <span>
                Credit: <strong>{formatKr(totalCredit)}</strong>
              </span>
              {!isBalanced && totalDebit + totalCredit > 0 && (
                <span className="text-destructive font-medium">
                  Diff: {formatKr(Math.abs(totalDebit - totalCredit))}
                </span>
              )}
            </div>
            <Button
              onClick={handleSubmit}
              disabled={!isBalanced || !description || !journalId || createEntry.isPending}
            >
              {createEntry.isPending ? 'Creating...' : 'Post Entry'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
