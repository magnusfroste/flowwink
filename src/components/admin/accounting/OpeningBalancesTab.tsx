import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Upload, Download, Calculator } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAccountingLocale } from '@/hooks/useAccountingLocale';
import { useChartOfAccounts } from '@/hooks/useAccounting';
import { useOpeningBalances, useUpsertOpeningBalance, useDeleteOpeningBalance, OpeningBalance } from '@/hooks/useOpeningBalances';
import { Skeleton } from '@/components/ui/skeleton';

const formatCents = (cents: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 0 }).format(cents / 100);

export function OpeningBalancesTab() {
  const { locale } = useAccountingLocale();
  const currentYear = new Date().getFullYear();
  const [fiscalYear, setFiscalYear] = useState(currentYear);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [amount, setAmount] = useState('');
  const { toast } = useToast();

  const { data: balances, isLoading } = useOpeningBalances(locale, fiscalYear);
  const { data: accounts } = useChartOfAccounts(locale);
  const upsertMutation = useUpsertOpeningBalance();
  const deleteMutation = useDeleteOpeningBalance();

  const handleSave = async () => {
    if (!selectedAccount || !amount) return;

    const account = accounts?.find(a => a.account_code === selectedAccount);
    if (!account) return;

    const amountCents = Math.round(parseFloat(amount) * 100);
    if (isNaN(amountCents)) {
      toast({ title: 'Invalid amount', variant: 'destructive' });
      return;
    }

    upsertMutation.mutate({
      account_code: account.account_code,
      account_name: account.account_name,
      amount_cents: Math.abs(amountCents),
      balance_type: account.normal_balance as 'debit' | 'credit',
      locale,
      fiscal_year: fiscalYear,
    }, {
      onSuccess: () => {
        setDialogOpen(false);
        setSelectedAccount('');
        setAmount('');
      }
    });
  };

  const totalDebit = (balances || [])
    .filter(b => b.balance_type === 'debit')
    .reduce((s, b) => s + b.amount_cents, 0);
  const totalCredit = (balances || [])
    .filter(b => b.balance_type === 'credit')
    .reduce((s, b) => s + b.amount_cents, 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 1;

  // Accounts not yet in opening balances
  const usedCodes = new Set((balances || []).map(b => b.account_code));
  const availableAccounts = (accounts || []).filter(a => !usedCodes.has(a.account_code));

  if (isLoading) {
    return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Select value={String(fiscalYear)} onValueChange={v => setFiscalYear(Number(v))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant={isBalanced ? 'default' : 'destructive'}>
            {isBalanced ? 'Balanced' : 'Unbalanced'}
          </Badge>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Opening Balance</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Opening Balance</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Account</label>
                <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select account..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {availableAccounts.map(a => (
                      <SelectItem key={a.account_code} value={a.account_code}>
                        {a.account_code} — {a.account_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Amount</label>
                <Input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                />
                {selectedAccount && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Will be recorded as {accounts?.find(a => a.account_code === selectedAccount)?.normal_balance || 'debit'}
                  </p>
                )}
              </div>
              <Button onClick={handleSave} disabled={upsertMutation.isPending} className="w-full">
                Save
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Total Debit</div>
            <div className="text-xl font-bold font-mono">{formatCents(totalDebit)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Total Credit</div>
            <div className="text-xl font-bold font-mono">{formatCents(totalCredit)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Difference</div>
            <div className={`text-xl font-bold font-mono ${isBalanced ? 'text-green-600' : 'text-red-600'}`}>
              {formatCents(Math.abs(totalDebit - totalCredit))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* List */}
      {(balances || []).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calculator className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Opening Balances</h3>
            <p className="text-sm text-muted-foreground">
              Add opening balances to carry forward account balances from the previous fiscal year.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {(balances || []).map(ob => (
            <Card key={ob.id}>
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-semibold">{ob.account_code}</span>
                    <span className="text-sm">{ob.account_name}</span>
                    <Badge variant="outline" className="text-xs">
                      {ob.balance_type}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-mono font-semibold">{formatCents(ob.amount_cents)}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(ob.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
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
