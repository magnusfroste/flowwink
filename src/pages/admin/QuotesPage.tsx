import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import { useQuotes, getQuoteCustomerName, getQuoteCustomerEmail, getQuoteCompanyName, type QuoteStatus } from '@/hooks/useQuotes';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { QuoteDetailSheet } from '@/components/admin/quotes/QuoteDetailSheet';
import { CreateQuoteDialog } from '@/components/admin/quotes/CreateQuoteDialog';

const STATUS_COLORS: Record<QuoteStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  accepted: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  expired: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
};

export default function QuotesPage() {
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: quotes = [], isLoading } = useQuotes(
    statusFilter === 'all' ? undefined : statusFilter
  );

  const formatAmount = (cents: number, currency: string) => {
    return new Intl.NumberFormat('sv-SE', { style: 'currency', currency }).format(cents / 100);
  };

  return (
    <AdminLayout>
      <AdminPageHeader title="Quotes" description="Create and manage sales quotes">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Quote
        </Button>
      </AdminPageHeader>
      <AdminPageContainer>
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="draft">Draft</TabsTrigger>
            <TabsTrigger value="sent">Sent</TabsTrigger>
            <TabsTrigger value="accepted">Accepted</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
            <TabsTrigger value="expired">Expired</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="mt-4 rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Valid Until</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : quotes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No quotes yet
                  </TableCell>
                </TableRow>
              ) : (
                quotes.map((q) => {
                  const name = getQuoteCustomerName(q);
                  const email = getQuoteCustomerEmail(q);
                  const company = getQuoteCompanyName(q);
                  return (
                    <TableRow
                      key={q.id}
                      className="cursor-pointer"
                      onClick={() => setSelectedId(q.id)}
                    >
                      <TableCell className="font-mono text-sm">{q.quote_number}</TableCell>
                      <TableCell>
                        <div>{name}</div>
                        {company && <div className="text-xs text-muted-foreground">{company}</div>}
                        <div className="text-xs text-muted-foreground">{email}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={STATUS_COLORS[q.status]}>
                          {q.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatAmount(q.total_cents, q.currency)}
                      </TableCell>
                      <TableCell>
                        {q.valid_until ? format(new Date(q.valid_until), 'yyyy-MM-dd') : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {format(new Date(q.created_at), 'yyyy-MM-dd')}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <QuoteDetailSheet
          quoteId={selectedId}
          open={!!selectedId}
          onOpenChange={(open) => !open && setSelectedId(null)}
        />

        <CreateQuoteDialog open={createOpen} onOpenChange={setCreateOpen} />
      </AdminPageContainer>
    </AdminLayout>
  );
}
