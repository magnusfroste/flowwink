import { useState, useRef } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Upload, RefreshCw, Wand2, X, FileText, ScanLine, Trash2, BookOpen, Settings2, Plus } from 'lucide-react';
import {
  useBankTransactions,
  useImportBatches,
  useSyncStripe,
  useImportBankFile,
  usePreviewBankImage,
  useCommitBankImage,
  useAutoMatch,
  useIgnoreTransaction,
  useBookFromUnmatched,
  type BankTxStatus,
  type OcrTransaction,
  type BankTransaction,
} from '@/hooks/useReconciliation';
import {
  useBankAccounts,
  useUpsertBankAccount,
  useArchiveBankAccount,
  useBankReconciliationSummary,
  type BankAccount,
} from '@/hooks/useBankAccounts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const STATUS_COLORS: Record<BankTxStatus, string> = {
  unmatched: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  matched: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  partial: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  ignored: 'bg-muted text-muted-foreground',
};

type ImportFormat = 'csv' | 'camt053' | 'sie' | 'image';

export default function ReconciliationPage() {
  const [tab, setTab] = useState<'transactions' | 'reconciliation' | 'imports' | 'accounts'>('transactions');
  const [statusFilter, setStatusFilter] = useState<BankTxStatus | 'all'>('unmatched');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [importFormat, setImportFormat] = useState<ImportFormat>('csv');
  const [ocrProvider, setOcrProvider] = useState<'openai' | 'gemini'>('openai');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // OCR preview state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFileName, setPreviewFileName] = useState('');
  const [previewRows, setPreviewRows] = useState<OcrTransaction[]>([]);
  const [previewCurrency, setPreviewCurrency] = useState('SEK');

  // Book dialog state
  const [bookOpen, setBookOpen] = useState(false);
  const [bookTx, setBookTx] = useState<BankTransaction | null>(null);
  const [bookCounterCode, setBookCounterCode] = useState('');
  const [bookCounterName, setBookCounterName] = useState('');
  const [bookDescription, setBookDescription] = useState('');

  // Account editor state
  const [accountEditor, setAccountEditor] = useState<Partial<BankAccount> | null>(null);

  // Period for reconciliation summary
  const today = new Date();
  const [periodStart, setPeriodStart] = useState(format(startOfMonth(today), 'yyyy-MM-dd'));
  const [periodEnd, setPeriodEnd] = useState(format(endOfMonth(today), 'yyyy-MM-dd'));

  const { data: txs = [], isLoading } = useBankTransactions(
    statusFilter === 'all' ? undefined : statusFilter,
    accountFilter === 'all' ? undefined : accountFilter,
  );
  const { data: batches = [] } = useImportBatches();
  const { data: bankAccounts = [] } = useBankAccounts();
  const { data: summary = [] } = useBankReconciliationSummary(periodStart, periodEnd);

  const syncStripe = useSyncStripe();
  const importFile = useImportBankFile();
  const previewImage = usePreviewBankImage();
  const commitImage = useCommitBankImage();
  const autoMatch = useAutoMatch();
  const ignoreTx = useIgnoreTransaction();
  const bookFromUnmatched = useBookFromUnmatched();
  const upsertAccount = useUpsertBankAccount();
  const archiveAccount = useArchiveBankAccount();

  const fmt = (cents: number, currency: string) =>
    new Intl.NumberFormat('sv-SE', { style: 'currency', currency }).format(cents / 100);

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const s = r.result as string;
        resolve(s.includes(',') ? s.split(',')[1] : s);
      };
      r.onerror = reject;
      r.readAsDataURL(file);
    });

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (importFormat === 'image') {
      const contentBase64 = await fileToBase64(file);
      const res = await previewImage.mutateAsync({
        fileName: file.name,
        contentBase64,
        mimeType: file.type || 'application/octet-stream',
        provider: ocrProvider,
      });
      setPreviewFileName(file.name);
      setPreviewRows(res.transactions);
      setPreviewCurrency(res.currency_default || 'SEK');
      setPreviewOpen(true);
    } else {
      const content = await file.text();
      importFile.mutate({ fileName: file.name, content, format: importFormat });
    }
    e.target.value = '';
  };

  const updatePreviewRow = (i: number, patch: Partial<OcrTransaction>) =>
    setPreviewRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removePreviewRow = (i: number) =>
    setPreviewRows((prev) => prev.filter((_, idx) => idx !== i));

  const handleCommit = async () => {
    if (!previewRows.length) return;
    await commitImage.mutateAsync({
      fileName: previewFileName,
      transactions: previewRows,
      currency_default: previewCurrency,
    });
    setPreviewOpen(false);
    setPreviewRows([]);
  };

  const openBookDialog = (tx: BankTransaction) => {
    setBookTx(tx);
    setBookCounterCode(tx.amount_cents < 0 ? '4000' : '3000');
    setBookCounterName(tx.amount_cents < 0 ? 'Expense' : 'Sales revenue');
    setBookDescription(tx.counterparty || tx.description || tx.reference || 'Bank transaction');
    setBookOpen(true);
  };

  const handleBook = async () => {
    if (!bookTx) return;
    const account = bankAccounts.find((a) => a.id === bookTx.bank_account_id);
    const glAccount = account?.gl_account || '1930';
    await bookFromUnmatched.mutateAsync({
      bank_transaction_id: bookTx.id,
      bank_gl_account: glAccount,
      counter_account_code: bookCounterCode.trim(),
      counter_account_name: bookCounterName.trim(),
      amount_cents: bookTx.amount_cents,
      currency: bookTx.currency,
      entry_date: bookTx.transaction_date,
      description: bookDescription,
      reference: bookTx.reference || undefined,
    });
    setBookOpen(false);
    setBookTx(null);
  };

  const handleSaveAccount = async () => {
    if (!accountEditor?.name) return;
    await upsertAccount.mutateAsync(accountEditor as any);
    setAccountEditor(null);
  };

  return (
    <AdminLayout>
      <AdminPageHeader
        title="Reconciliation"
        description="Match bank transactions against invoices, expenses and orders"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="w-44 h-9">
              <SelectValue placeholder="All accounts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {bankAccounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} ({a.gl_account})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => autoMatch.mutate()}
            disabled={autoMatch.isPending}
          >
            <Wand2 className="h-4 w-4 mr-1" />
            Auto-match
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncStripe.mutate()}
            disabled={syncStripe.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${syncStripe.isPending ? 'animate-spin' : ''}`} />
            Sync Stripe
          </Button>
          <Select value={importFormat} onValueChange={(v: any) => setImportFormat(v)}>
            <SelectTrigger className="w-40 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="csv">CSV</SelectItem>
              <SelectItem value="camt053">CAMT.053</SelectItem>
              <SelectItem value="sie">SIE</SelectItem>
              <SelectItem value="image">Image / PDF (OCR)</SelectItem>
            </SelectContent>
          </Select>
          {importFormat === 'image' && (
            <Select value={ocrProvider} onValueChange={(v: any) => setOcrProvider(v)}>
              <SelectTrigger className="w-32 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="gemini">Gemini</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={importFile.isPending || previewImage.isPending}
          >
            {importFormat === 'image' ? (
              <ScanLine className="h-4 w-4 mr-1" />
            ) : (
              <Upload className="h-4 w-4 mr-1" />
            )}
            {previewImage.isPending ? 'Reading…' : importFormat === 'image' ? 'Scan image' : 'Import file'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept={importFormat === 'image' ? 'image/*,application/pdf' : '.csv,.xml,.sie,.se'}
            className="hidden"
            onChange={handleFile}
          />
        </div>
      </AdminPageHeader>

      <AdminPageContainer>
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
            <TabsTrigger value="imports">Import history</TabsTrigger>
            <TabsTrigger value="accounts">Bank accounts</TabsTrigger>
          </TabsList>
        </Tabs>

        {tab === 'transactions' && (
          <>
            <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)} className="mt-4">
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="unmatched">Unmatched</TabsTrigger>
                <TabsTrigger value="partial">Partial</TabsTrigger>
                <TabsTrigger value="matched">Matched</TabsTrigger>
                <TabsTrigger value="ignored">Ignored</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="mt-4 rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Counterparty</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        Loading…
                      </TableCell>
                    </TableRow>
                  ) : txs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        No transactions
                      </TableCell>
                    </TableRow>
                  ) : (
                    txs.map((tx) => {
                      const account = bankAccounts.find((a) => a.id === tx.bank_account_id);
                      return (
                        <TableRow key={tx.id}>
                          <TableCell className="font-mono text-sm">
                            {format(new Date(tx.transaction_date), 'yyyy-MM-dd')}
                          </TableCell>
                          <TableCell>
                            {tx.counterparty || '—'}
                            {tx.description && (
                              <div className="text-xs text-muted-foreground truncate max-w-xs">
                                {tx.description}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{tx.reference || '—'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {account ? `${account.name} · ${account.gl_account}` : '—'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs uppercase">
                              {tx.source}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={STATUS_COLORS[tx.status]}>
                              {tx.status}
                            </Badge>
                          </TableCell>
                          <TableCell
                            className={`text-right font-mono ${tx.amount_cents < 0 ? 'text-red-600 dark:text-red-400' : ''}`}
                          >
                            {fmt(tx.amount_cents, tx.currency)}
                          </TableCell>
                          <TableCell>
                            {tx.status === 'unmatched' && (
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  title="Book & reconcile"
                                  onClick={() => openBookDialog(tx)}
                                >
                                  <BookOpen className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  title="Ignore"
                                  onClick={() => ignoreTx.mutate(tx.id)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {tab === 'reconciliation' && (
          <div className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Period</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">From</Label>
                    <Input
                      type="date"
                      value={periodStart}
                      onChange={(e) => setPeriodStart(e.target.value)}
                      className="h-9 w-44"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">To</Label>
                    <Input
                      type="date"
                      value={periodEnd}
                      onChange={(e) => setPeriodEnd(e.target.value)}
                      className="h-9 w-44"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bank account</TableHead>
                    <TableHead>GL account</TableHead>
                    <TableHead className="text-right">Bank total</TableHead>
                    <TableHead className="text-right">Ledger total</TableHead>
                    <TableHead className="text-right">Diff</TableHead>
                    <TableHead className="text-right">Tx</TableHead>
                    <TableHead className="text-right">Unmatched</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No bank accounts.
                      </TableCell>
                    </TableRow>
                  ) : (
                    summary.map((s) => {
                      const reconciled = s.diff_cents === 0;
                      return (
                        <TableRow key={s.bank_account_id}>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell className="font-mono text-xs">{s.gl_account}</TableCell>
                          <TableCell className="text-right font-mono">
                            {fmt(s.bank_total_cents, s.currency)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmt(s.ledger_total_cents, s.currency)}
                          </TableCell>
                          <TableCell
                            className={`text-right font-mono ${
                              reconciled ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {fmt(s.diff_cents, s.currency)}
                            {reconciled && <span className="ml-1">✓</span>}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">{s.bank_count}</TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {s.bank_unmatched_count > 0 ? (
                              <Badge variant="secondary" className={STATUS_COLORS.unmatched}>
                                {s.bank_unmatched_count}
                              </Badge>
                            ) : (
                              '0'
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              Diff = sum of bank transactions – net movement on the GL account in the period. ✓ means reconciled.
            </p>
          </div>
        )}

        {tab === 'imports' && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">Recent imports</CardTitle>
            </CardHeader>
            <CardContent>
              {batches.length === 0 ? (
                <p className="text-sm text-muted-foreground">No imports yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>File</TableHead>
                      <TableHead className="text-right">Imported</TableHead>
                      <TableHead className="text-right">Errors</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batches.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(b.created_at), 'yyyy-MM-dd HH:mm')}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs uppercase">
                            {b.source}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {b.file_name ? (
                            <span className="flex items-center gap-1">
                              <FileText className="h-3 w-3" /> {b.file_name}
                            </span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">{b.imported_count}</TableCell>
                        <TableCell className="text-right font-mono">{b.error_count}</TableCell>
                        <TableCell>
                          <Badge
                            variant={b.status === 'failed' ? 'destructive' : 'secondary'}
                            className="text-xs"
                          >
                            {b.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {tab === 'accounts' && (
          <Card className="mt-4">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Bank accounts</CardTitle>
              <Button
                size="sm"
                onClick={() =>
                  setAccountEditor({ name: '', currency: 'SEK', gl_account: '1930', is_default: false })
                }
              >
                <Plus className="h-4 w-4 mr-1" />
                Add account
              </Button>
            </CardHeader>
            <CardContent>
              {bankAccounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No bank accounts.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Account #</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead>GL</TableHead>
                      <TableHead>Stripe</TableHead>
                      <TableHead>Default</TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bankAccounts.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{a.name}</TableCell>
                        <TableCell className="font-mono text-xs">{a.account_number || '—'}</TableCell>
                        <TableCell>{a.currency}</TableCell>
                        <TableCell className="font-mono text-xs">{a.gl_account}</TableCell>
                        <TableCell className="font-mono text-xs">{a.stripe_account_id || '—'}</TableCell>
                        <TableCell>
                          {a.is_default && <Badge variant="secondary">default</Badge>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setAccountEditor(a)}
                            >
                              <Settings2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Archive"
                              onClick={() => archiveAccount.mutate(a.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </AdminPageContainer>

      {/* OCR preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Review extracted transactions</DialogTitle>
            <DialogDescription>
              {previewRows.length} row{previewRows.length === 1 ? '' : 's'} from{' '}
              <span className="font-medium">{previewFileName}</span>. Edit or delete any row before
              importing — vision models can misread amounts.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[55vh] overflow-auto">
            {previewRows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No transactions extracted.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Date</TableHead>
                    <TableHead>Counterparty</TableHead>
                    <TableHead>Reference / description</TableHead>
                    <TableHead className="text-right w-32">Amount</TableHead>
                    <TableHead className="w-20">CCY</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Input
                          value={r.transaction_date}
                          onChange={(e) => updatePreviewRow(i, { transaction_date: e.target.value })}
                          className="h-8 text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={r.counterparty || ''}
                          onChange={(e) => updatePreviewRow(i, { counterparty: e.target.value })}
                          className="h-8 text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={r.reference || r.description || ''}
                          onChange={(e) => updatePreviewRow(i, { description: e.target.value })}
                          className="h-8 text-xs"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          value={(r.amount_cents / 100).toFixed(2)}
                          onChange={(e) =>
                            updatePreviewRow(i, {
                              amount_cents: Math.round(parseFloat(e.target.value || '0') * 100),
                            })
                          }
                          className="h-8 text-xs text-right tabular-nums"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={r.currency}
                          onChange={(e) =>
                            updatePreviewRow(i, { currency: e.target.value.toUpperCase() })
                          }
                          className="h-8 text-xs uppercase"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => removePreviewRow(i)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCommit}
              disabled={!previewRows.length || commitImage.isPending}
            >
              {commitImage.isPending ? 'Importing…' : `Import ${previewRows.length} rows`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Book from unmatched dialog */}
      <Dialog open={bookOpen} onOpenChange={setBookOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Book & reconcile</DialogTitle>
            <DialogDescription>
              Creates a journal entry and marks the bank transaction as matched in one step.
            </DialogDescription>
          </DialogHeader>

          {bookTx && (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date</span>
                  <span className="font-mono">{bookTx.transaction_date}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Counterparty</span>
                  <span>{bookTx.counterparty || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount</span>
                  <span
                    className={`font-mono ${bookTx.amount_cents < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}
                  >
                    {fmt(bookTx.amount_cents, bookTx.currency)}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Bank GL</span>
                  <span className="font-mono">
                    {bankAccounts.find((a) => a.id === bookTx.bank_account_id)?.gl_account || '1930'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Counter account code</Label>
                  <Input
                    value={bookCounterCode}
                    onChange={(e) => setBookCounterCode(e.target.value)}
                    placeholder="4000"
                    className="h-9 font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs">Counter account name</Label>
                  <Input
                    value={bookCounterName}
                    onChange={(e) => setBookCounterName(e.target.value)}
                    placeholder="Expense"
                    className="h-9"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Input
                  value={bookDescription}
                  onChange={(e) => setBookDescription(e.target.value)}
                  className="h-9"
                />
              </div>

              <p className="text-xs text-muted-foreground">
                {bookTx.amount_cents < 0
                  ? `Will book: Dt ${bookCounterCode} / Cr bank.`
                  : `Will book: Dt bank / Cr ${bookCounterCode}.`}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setBookOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleBook}
              disabled={!bookCounterCode || !bookCounterName || bookFromUnmatched.isPending}
            >
              {bookFromUnmatched.isPending ? 'Booking…' : 'Book & reconcile'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bank account editor */}
      <Dialog open={!!accountEditor} onOpenChange={(o) => !o && setAccountEditor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{accountEditor?.id ? 'Edit account' : 'Add bank account'}</DialogTitle>
          </DialogHeader>

          {accountEditor && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Name</Label>
                <Input
                  value={accountEditor.name || ''}
                  onChange={(e) => setAccountEditor({ ...accountEditor, name: e.target.value })}
                  placeholder="Main bank"
                  className="h-9"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Account number</Label>
                  <Input
                    value={accountEditor.account_number || ''}
                    onChange={(e) =>
                      setAccountEditor({ ...accountEditor, account_number: e.target.value })
                    }
                    className="h-9 font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs">Currency</Label>
                  <Input
                    value={accountEditor.currency || 'SEK'}
                    onChange={(e) =>
                      setAccountEditor({ ...accountEditor, currency: e.target.value.toUpperCase() })
                    }
                    className="h-9 uppercase"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">GL account</Label>
                  <Input
                    value={accountEditor.gl_account || '1930'}
                    onChange={(e) =>
                      setAccountEditor({ ...accountEditor, gl_account: e.target.value })
                    }
                    className="h-9 font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs">Stripe account ID (opt)</Label>
                  <Input
                    value={accountEditor.stripe_account_id || ''}
                    onChange={(e) =>
                      setAccountEditor({ ...accountEditor, stripe_account_id: e.target.value })
                    }
                    placeholder="acct_…"
                    className="h-9 font-mono text-xs"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={accountEditor.is_default || false}
                  onChange={(e) =>
                    setAccountEditor({ ...accountEditor, is_default: e.target.checked })
                  }
                />
                Default account (auto-assigned to new imports)
              </label>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAccountEditor(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveAccount} disabled={!accountEditor?.name || upsertAccount.isPending}>
              {upsertAccount.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
