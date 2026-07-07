import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFiscalYear } from './FiscalYearContext';
import { useAccountingLocale } from '@/hooks/useAccountingLocale';
import { useAccountingPreferences } from '@/hooks/useSiteSettings';
import { useChartOfAccounts } from '@/hooks/useAccounting';
import { useOpeningBalances, useUpsertOpeningBalance, useDeleteOpeningBalance } from '@/hooks/useOpeningBalances';
import { Skeleton } from '@/components/ui/skeleton';
import { AccountingTabHeader } from './AccountingTabHeader';

export function OpeningBalancesTab() {
  const { locale } = useAccountingLocale();
  const { year: fiscalYear, setYear: setFiscalYear } = useFiscalYear();
  const currentYear = new Date().getFullYear();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [amount, setAmount] = useState('');
  const { toast } = useToast();

  const { data: balances, isLoading } = useOpeningBalances(locale, fiscalYear);
  const { data: accounts } = useChartOfAccounts(locale);
  const { data: prefs } = useAccountingPreferences();
  const upsertMutation = useUpsertOpeningBalance();
  const deleteMutation = useDeleteOpeningBalance();

  const fmt = (cents: number) => {
    const decimals = prefs?.decimals ?? 2;
    const decSep = prefs?.decimalSeparator ?? ',';
    const thouSep = prefs?.thousandsSeparator ?? ' ';
    const neg = cents < 0;
    const n = Math.abs(cents) / 100;
    const [intPart, decPart] = n.toFixed(decimals).split('.');
    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thouSep);
    const body = decimals > 0 ? `${grouped}${decSep}${decPart}` : grouped;
    return neg ? `\u2212${body}` : body;
  };

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

  const rows = [...(balances || [])].sort((a, b) => a.account_code.localeCompare(b.account_code));
  const totalDebit = rows.filter(b => b.balance_type === 'debit').reduce((s, b) => s + b.amount_cents, 0);
  const totalCredit = rows.filter(b => b.balance_type === 'credit').reduce((s, b) => s + b.amount_cents, 0);
  const diff = totalDebit - totalCredit;
  const isBalanced = Math.abs(diff) < 1;

  const usedCodes = new Set(rows.map(b => b.account_code));
  const availableAccounts = (accounts || []).filter(a => !usedCodes.has(a.account_code));

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Carry-forward balances at the start of the fiscal year — the foundation of every balance-sheet report.
      </p>

      <div className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-center gap-4 px-6 py-4 border-b">
          <Select value={String(fiscalYear)} onValueChange={v => setFiscalYear(Number(v))}>
            <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant={isBalanced ? 'secondary' : 'destructive'} className="font-normal">
            {isBalanced ? 'Balanced' : `Off by ${fmt(Math.abs(diff))}`}
          </Badge>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="ml-auto">
                <Plus className="h-4 w-4 mr-1" /> Add opening balance
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add opening balance</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Account</label>
                  <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                    <SelectTrigger><SelectValue placeholder="Select account…" /></SelectTrigger>
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
                      Will be recorded on the {accounts?.find(a => a.account_code === selectedAccount)?.normal_balance || 'debit'} side.
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

        {isLoading ? (
          <div className="p-6 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <h3 className="text-sm font-medium mb-1">No opening balances for {fiscalYear}</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Add opening balances to carry account values forward from the previous fiscal year.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-6 px-6 py-2 text-xs text-muted-foreground border-b">
              <div>Account</div>
              <div className="text-right w-28">Debit</div>
              <div className="text-right w-28">Credit</div>
              <div className="w-8"></div>
            </div>
            {rows.map(ob => (
              <div
                key={ob.id}
                className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-6 px-6 py-2 text-sm border-b border-border/40 last:border-b-0 hover:bg-muted/30"
              >
                <div className="flex items-baseline gap-3 min-w-0">
                  <span className="font-mono font-semibold">{ob.account_code}</span>
                  <span className="text-muted-foreground truncate">{ob.account_name}</span>
                </div>
                <div className={`text-right font-mono tabular-nums w-28 ${ob.balance_type !== 'debit' ? 'text-muted-foreground/40' : ''}`}>
                  {ob.balance_type === 'debit' ? fmt(ob.amount_cents) : '\u2014'}
                </div>
                <div className={`text-right font-mono tabular-nums w-28 ${ob.balance_type !== 'credit' ? 'text-muted-foreground/40' : ''}`}>
                  {ob.balance_type === 'credit' ? fmt(ob.amount_cents) : '\u2014'}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => deleteMutation.mutate(ob.id)}
                  disabled={deleteMutation.isPending}
                  aria-label="Delete opening balance"
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-6 px-6 py-3 border-t font-semibold text-sm">
              <div>Total</div>
              <div className="text-right font-mono tabular-nums w-28">{fmt(totalDebit)}</div>
              <div className="text-right font-mono tabular-nums w-28">{fmt(totalCredit)}</div>
              <div className="w-8"></div>
            </div>
            {!isBalanced && (
              <div className="px-6 py-2 border-t bg-destructive/5 text-xs text-destructive">
                Debit and credit differ by {fmt(Math.abs(diff))}. Opening balances must net to zero before the fiscal year opens.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
