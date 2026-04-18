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
import { format } from 'date-fns';
import { Upload, RefreshCw, Wand2, X, FileText } from 'lucide-react';
import {
  useBankTransactions,
  useImportBatches,
  useSyncStripe,
  useImportBankFile,
  useAutoMatch,
  useIgnoreTransaction,
  type BankTxStatus,
} from '@/hooks/useReconciliation';

const STATUS_COLORS: Record<BankTxStatus, string> = {
  unmatched: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  matched: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  partial: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  ignored: 'bg-muted text-muted-foreground',
};

export default function ReconciliationPage() {
  const [tab, setTab] = useState<'transactions' | 'imports'>('transactions');
  const [statusFilter, setStatusFilter] = useState<BankTxStatus | 'all'>('unmatched');
  const [importFormat, setImportFormat] = useState<'csv' | 'camt053' | 'sie'>('csv');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: txs = [], isLoading } = useBankTransactions(
    statusFilter === 'all' ? undefined : statusFilter,
  );
  const { data: batches = [] } = useImportBatches();
  const syncStripe = useSyncStripe();
  const importFile = useImportBankFile();
  const autoMatch = useAutoMatch();
  const ignoreTx = useIgnoreTransaction();

  const fmt = (cents: number, currency: string) =>
    new Intl.NumberFormat('sv-SE', { style: 'currency', currency }).format(cents / 100);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    importFile.mutate({ fileName: file.name, content, format: importFormat });
    e.target.value = '';
  };

  return (
    <AdminLayout>
      <AdminPageHeader
        title="Reconciliation"
        description="Match bank transactions against invoices, expenses and orders"
      >
        <div className="flex items-center gap-2">
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
            <SelectTrigger className="w-32 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="csv">CSV</SelectItem>
              <SelectItem value="camt053">CAMT.053</SelectItem>
              <SelectItem value="sie">SIE</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={importFile.isPending}>
            <Upload className="h-4 w-4 mr-1" />
            Import file
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xml,.sie,.se"
            className="hidden"
            onChange={handleFile}
          />
        </div>
      </AdminPageHeader>

      <AdminPageContainer>
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="imports">Import history</TabsTrigger>
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
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Loading…
                      </TableCell>
                    </TableRow>
                  ) : txs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No transactions
                      </TableCell>
                    </TableRow>
                  ) : (
                    txs.map((tx) => (
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
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Ignore"
                              onClick={() => ignoreTx.mutate(tx.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </>
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
      </AdminPageContainer>
    </AdminLayout>
  );
}
