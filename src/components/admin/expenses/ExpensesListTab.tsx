import { useState } from 'react';
import { useExpenses, useSubmitExpenses } from '@/hooks/useExpenses';
import { AddExpenseDialog } from './AddExpenseDialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Receipt, Users, AlertCircle, Send } from 'lucide-react';
import { format } from 'date-fns';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-primary/10 text-primary',
  approved: 'bg-green-500/10 text-green-700 dark:text-green-400',
  rejected: 'bg-destructive/10 text-destructive',
  booked: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
};

const CATEGORY_LABELS: Record<string, string> = {
  travel: 'Travel',
  meals: 'Meals',
  office: 'Office',
  software: 'Software',
  representation: 'Representation',
  other: 'Other',
};

function formatCents(cents: number, currency = 'SEK'): string {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function ExpensesListTab() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { data: expenses, isLoading } = useExpenses(statusFilter);
  const submitExpenses = useSubmitExpenses();

  const totalAmount = expenses?.reduce((s, e) => s + e.amount_cents, 0) ?? 0;
  const draftCount = expenses?.filter(e => e.status === 'draft').length ?? 0;
  const drafts = expenses?.filter(e => e.status === 'draft') ?? [];
  const allDraftsSelected = drafts.length > 0 && drafts.every(d => selected.has(d.id));

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllDrafts = () => {
    if (allDraftsSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(drafts.map(d => d.id)));
    }
  };

  const handleSubmit = () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    submitExpenses.mutate(ids, { onSuccess: () => setSelected(new Set()) });
  };

  const selectedAmount = expenses
    ?.filter(e => selected.has(e.id))
    .reduce((s, e) => s + e.amount_cents, 0) ?? 0;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{expenses?.length ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCents(totalAmount)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Drafts Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{draftCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filter + Actions */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="booked">Booked</SelectItem>
            </SelectContent>
          </Select>
          {selected.size > 0 && (
            <Button
              onClick={handleSubmit}
              disabled={submitExpenses.isPending}
              size="sm"
            >
              <Send className="h-4 w-4 mr-1.5" />
              Submit {selected.size} ({formatCents(selectedAmount)})
            </Button>
          )}
        </div>
        <AddExpenseDialog />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  {drafts.length > 0 && (
                    <Checkbox
                      checked={allDraftsSelected}
                      onCheckedChange={toggleAllDrafts}
                      aria-label="Select all drafts"
                    />
                  )}
                </TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">VAT</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    Loading expenses...
                  </TableCell>
                </TableRow>
              ) : !expenses?.length ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Receipt className="h-8 w-8 text-muted-foreground/50" />
                      <p>No expenses yet</p>
                      <p className="text-xs">Add expenses during the month, then submit them all at once</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                expenses.map((expense) => (
                  <TableRow key={expense.id} className={selected.has(expense.id) ? 'bg-primary/5' : ''}>
                    <TableCell>
                      {expense.status === 'draft' && (
                        <Checkbox
                          checked={selected.has(expense.id)}
                          onCheckedChange={() => toggleOne(expense.id)}
                          aria-label={`Select ${expense.description}`}
                        />
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(expense.expense_date), 'yyyy-MM-dd')}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {expense.description}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {CATEGORY_LABELS[expense.category] || expense.category}
                        {expense.is_representation && (
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {expense.vendor || '—'}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCents(expense.amount_cents, expense.currency)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatCents(expense.vat_cents, expense.currency)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={STATUS_COLORS[expense.status] || ''}>
                        {expense.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {expense.receipt_url && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                          <a href={expense.receipt_url} target="_blank" rel="noopener noreferrer">
                            <Receipt className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                      {expense.is_representation && !expense.attendees?.length && (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
