import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import { useInvoices, getInvoiceCustomerName, getInvoiceCustomerEmail, getInvoiceCompanyName, type InvoiceStatus } from '@/hooks/useInvoices';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { InvoiceDetailSheet } from '@/components/admin/invoices/InvoiceDetailSheet';
import { CreateInvoiceDialog } from '@/components/admin/invoices/CreateInvoiceDialog';

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  overdue: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

export default function InvoicesPage() {
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: invoices = [], isLoading } = useInvoices(
    statusFilter === 'all' ? undefined : statusFilter
  );

  const formatAmount = (cents: number, currency: string) => {
    return new Intl.NumberFormat('sv-SE', { style: 'currency', currency }).format(cents / 100);
  };

  return (
    <AdminLayout>
      <AdminPageHeader title="Invoices" description="Manage invoices and track payments">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Invoice
        </Button>
      </AdminPageHeader>
      <AdminPageContainer>
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="draft">Draft</TabsTrigger>
            <TabsTrigger value="sent">Sent</TabsTrigger>
            <TabsTrigger value="overdue">Overdue</TabsTrigger>
            <TabsTrigger value="paid">Paid</TabsTrigger>
            <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
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
                <TableHead>Due Date</TableHead>
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
              ) : invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No invoices yet
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((inv) => {
                  const name = getInvoiceCustomerName(inv);
                  const email = getInvoiceCustomerEmail(inv);
                  const company = getInvoiceCompanyName(inv);
                  return (
                    <TableRow
                      key={inv.id}
                      className="cursor-pointer"
                      onClick={() => setSelectedId(inv.id)}
                    >
                      <TableCell className="font-mono text-sm">{inv.invoice_number}</TableCell>
                      <TableCell>
                        <div>{name}</div>
                        {company && <div className="text-xs text-muted-foreground">{company}</div>}
                        <div className="text-xs text-muted-foreground">{email}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={STATUS_COLORS[inv.status]}>
                          {inv.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatAmount(inv.total_cents, inv.currency)}
                      </TableCell>
                      <TableCell>
                        {inv.due_date ? format(new Date(inv.due_date), 'yyyy-MM-dd') : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {format(new Date(inv.created_at), 'yyyy-MM-dd')}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <InvoiceDetailSheet
          invoiceId={selectedId}
          open={!!selectedId}
          onOpenChange={(open) => !open && setSelectedId(null)}
        />

        <CreateInvoiceDialog open={createOpen} onOpenChange={setCreateOpen} />
      </AdminPageContainer>
    </AdminLayout>
  );
}
