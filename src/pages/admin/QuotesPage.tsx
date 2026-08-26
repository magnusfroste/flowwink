import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { LensToggle } from '@/components/admin/LensToggle';
import { useOwnershipLens } from '@/hooks/useOwnershipLens';
import { applyLens } from '@/lib/ownership';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Settings2 } from 'lucide-react';
import { QuoteProcessSettingsDialog } from '@/components/admin/quotes/QuoteProcessSettingsDialog';
import { useQuotes, getQuoteCustomerName, getQuoteCustomerEmail, getQuoteCompanyName, type QuoteStatus } from '@/hooks/useQuotes';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { OwnerChip } from '@/components/admin/OwnerChip';
import { QuoteDetailSheet } from '@/components/admin/quotes/QuoteDetailSheet';
import { CreateQuoteDialog } from '@/components/admin/quotes/CreateQuoteDialog';
import { RecurringQuotesTab } from '@/components/admin/quotes/RecurringQuotesTab';
import { useOpenOnQueryParam } from '@/hooks/useOpenOnQueryParam';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';

const STATUS_COLORS: Record<QuoteStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  accepted: 'bg-success/10 text-success',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  expired: 'bg-warning/10 text-warning',
};

export default function QuotesPage() {
  const { formatCurrency, formatDate, formatDateTime } = usePlatformFormat();
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | 'all'>('all');
  const [view, setView] = useState<'list' | 'recurring'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('id'));
  const [createOpen, setCreateOpen] = useState(false);
  const [processOpen, setProcessOpen] = useState(false);
  useOpenOnQueryParam('new', '1', () => setCreateOpen(true));

  useEffect(() => {
    const id = searchParams.get('id');
    if (id) setSelectedId(id);
  }, [searchParams]);

  const handleSheetOpenChange = (open: boolean) => {
    if (!open) {
      setSelectedId(null);
      if (searchParams.get('id')) {
        searchParams.delete('id');
        setSearchParams(searchParams, { replace: true });
      }
    }
  };

  const { data: rawQuotes = [], isLoading } = useQuotes(
    statusFilter === 'all' ? undefined : statusFilter
  );
  const { lens, uid, coveredUids } = useOwnershipLens();
  const quotes = applyLens(rawQuotes, 'quotes', lens, uid, coveredUids);

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader title="Quotes">
          <LensToggle />
          <Button size="sm" variant="outline" onClick={() => setProcessOpen(true)}>
            <Settings2 className="h-4 w-4 mr-1" /> Process
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Quote
          </Button>
        </AdminPageHeader>
        <QuoteProcessSettingsDialog open={processOpen} onOpenChange={setProcessOpen} />

        <Tabs value={view} onValueChange={(v) => setView(v as any)} className="mb-3">
          <TabsList>
            <TabsTrigger value="list">Quotes</TabsTrigger>
            <TabsTrigger value="recurring">Recurring</TabsTrigger>
          </TabsList>
        </Tabs>

        {view === 'recurring' ? (
          <RecurringQuotesTab />
        ) : (
        <>
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
                <TableHead>Owner</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Valid Until</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : quotes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
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
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <OwnerChip entity="quotes" recordId={q.id} ownerId={q.owner_id} />
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(q.total_cents, q.currency)}
                      </TableCell>
                      <TableCell>
                        {formatDate(q.valid_until)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDateTime(q.created_at)}
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

        <QuoteDetailSheet
          quoteId={selectedId}
          open={!!selectedId}
          onOpenChange={handleSheetOpenChange}
        />

        <CreateQuoteDialog open={createOpen} onOpenChange={setCreateOpen} />
      </AdminPageContainer>
    </AdminLayout>
  );
}
