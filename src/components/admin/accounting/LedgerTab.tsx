import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BookOpen, Search } from 'lucide-react';
import { useAccountBalances } from '@/hooks/useAccounting';
import { Skeleton } from '@/components/ui/skeleton';

const formatCents = (cents: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 0 }).format(cents / 100);

const typeColors: Record<string, string> = {
  asset: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  liability: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  equity: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  income: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  expense: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
};

export function LedgerTab() {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const { data: balances, isLoading } = useAccountBalances();

  const filtered = (balances || []).filter((b) => {
    const matchesSearch =
      !search ||
      b.account_code.includes(search) ||
      b.account_name.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === 'all' || b.account_type === filterType;
    return matchesSearch && matchesType;
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search account..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="asset">Assets</SelectItem>
            <SelectItem value="liability">Liabilities</SelectItem>
            <SelectItem value="equity">Equity</SelectItem>
            <SelectItem value="income">Income</SelectItem>
            <SelectItem value="expense">Expenses</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No accounts with activity</h3>
            <p className="text-sm text-muted-foreground">
              Post journal entries to see account balances here
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((account) => (
            <Card key={account.account_code}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold">
                          {account.account_code}
                        </span>
                        <span className="font-medium">{account.account_name}</span>
                        {account.account_type && (
                          <Badge className={typeColors[account.account_type] || ''}>
                            {account.account_type}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-6 text-sm text-right">
                    <div>
                      <div className="text-xs text-muted-foreground">Debit</div>
                      <div className="font-mono">{formatCents(account.debit_total)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Credit</div>
                      <div className="font-mono">{formatCents(account.credit_total)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Balance</div>
                      <div
                        className={`font-mono font-semibold ${
                          account.balance >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {formatCents(Math.abs(account.balance))}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
