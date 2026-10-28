/**
 * Contract billing schedule + payment-reminder policy.
 * Reuses the invoicing tables via generate_contract_invoice() and the
 * email-send edge function for reminders (contract-billing-cron does the work).
 */
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Play, Save, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  useUpdateContractBilling,
  useGenerateContractInvoiceNow,
  useContractInvoices,
  useContractInvoiceReminders,
  useTriggerContractBillingCron,
} from '@/hooks/useContractsParity';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { businessToday } from '@/lib/platform-fallbacks';

interface ContractLike {
  id: string;
  status: string;
  currency: string;
  billing_enabled?: boolean;
  billing_amount_cents?: number | null;
  billing_interval?: 'week' | 'month' | 'quarter' | 'year' | null;
  billing_interval_count?: number;
  billing_next_date?: string | null;
  billing_tax_rate?: number;
  billing_due_in_days?: number;
  billing_reminder_offsets?: number[];
  billing_reminders_enabled?: boolean;
}

export function ContractBillingPanel({ contract }: { contract: ContractLike }) {
  const { formatCurrency, formatDateTime } = usePlatformFormat();
  const formatMoney = (cents: number, currency: string) => formatCurrency(cents, currency);
  const update = useUpdateContractBilling();
  const genNow = useGenerateContractInvoiceNow();
  const sweep = useTriggerContractBillingCron();
  const { data: invoices = [] } = useContractInvoices(contract.id);
  const { data: reminders = [] } = useContractInvoiceReminders(contract.id);

  const [enabled, setEnabled] = useState(!!contract.billing_enabled);
  const [amount, setAmount] = useState(String((contract.billing_amount_cents ?? 0) / 100));
  const [interval, setInterval] = useState(contract.billing_interval ?? 'month');
  const [intervalCount, setIntervalCount] = useState(contract.billing_interval_count ?? 1);
  const [nextDate, setNextDate] = useState(contract.billing_next_date ?? '');
  const [taxRate, setTaxRate] = useState(String(contract.billing_tax_rate ?? 0.25));
  const [dueDays, setDueDays] = useState(contract.billing_due_in_days ?? 30);
  const [remindersOn, setRemindersOn] = useState(contract.billing_reminders_enabled ?? true);
  const [offsetsStr, setOffsetsStr] = useState((contract.billing_reminder_offsets ?? [-3, 7, 14]).join(', '));

  // Sync when parent re-fetches the contract.
  useEffect(() => {
    setEnabled(!!contract.billing_enabled);
    setAmount(String((contract.billing_amount_cents ?? 0) / 100));
    setInterval(contract.billing_interval ?? 'month');
    setIntervalCount(contract.billing_interval_count ?? 1);
    setNextDate(contract.billing_next_date ?? '');
    setTaxRate(String(contract.billing_tax_rate ?? 0.25));
    setDueDays(contract.billing_due_in_days ?? 30);
    setRemindersOn(contract.billing_reminders_enabled ?? true);
    setOffsetsStr((contract.billing_reminder_offsets ?? [-3, 7, 14]).join(', '));
  }, [contract.id]);

  const parseOffsets = (): number[] =>
    offsetsStr
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));

  const handleSave = async () => {
    await update.mutateAsync({
      contract_id: contract.id,
      patch: {
        billing_enabled: enabled,
        billing_amount_cents: Math.round(Number(amount) * 100) || 0,
        billing_interval: interval as any,
        billing_interval_count: Number(intervalCount) || 1,
        billing_next_date: nextDate || null,
        billing_tax_rate: Number(taxRate) || 0,
        billing_due_in_days: Number(dueDays) || 30,
        billing_reminders_enabled: remindersOn,
        billing_reminder_offsets: parseOffsets(),
      },
    });
  };

  const canGenerate =
    contract.status === 'active' &&
    enabled &&
    Number(amount) > 0 &&
    !!nextDate &&
    nextDate <= businessToday();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Billing schedule</CardTitle>
            {contract.status !== 'active' && (
              <Badge variant="outline" className="text-xs">
                Contract must be active to auto-invoice
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch id="billing-enabled" checked={enabled} onCheckedChange={setEnabled} />
            <Label htmlFor="billing-enabled">Auto-invoice from this contract</Label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Amount ({contract.currency})</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Interval</Label>
              <Select value={interval ?? 'month'} onValueChange={(v) => setInterval(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Weekly</SelectItem>
                  <SelectItem value="month">Monthly</SelectItem>
                  <SelectItem value="quarter">Quarterly</SelectItem>
                  <SelectItem value="year">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Every N intervals</Label>
              <Input
                type="number"
                min={1}
                value={intervalCount}
                onChange={(e) => setIntervalCount(Number(e.target.value) || 1)}
              />
            </div>
            <div>
              <Label className="text-xs">Next invoice date</Label>
              <Input type="date" value={nextDate ?? ''} onChange={(e) => setNextDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Tax rate (0.25 = 25%)</Label>
              <Input type="number" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Payment terms (days)</Label>
              <Input type="number" min={0} value={dueDays} onChange={(e) => setDueDays(Number(e.target.value) || 30)} />
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center gap-3">
              <Switch id="reminders-enabled" checked={remindersOn} onCheckedChange={setRemindersOn} />
              <Label htmlFor="reminders-enabled">Send payment reminders</Label>
            </div>
            <div>
              <Label className="text-xs">
                Reminder offsets (days relative to due date; negative = before, positive = after)
              </Label>
              <Input
                value={offsetsStr}
                onChange={(e) => setOffsetsStr(e.target.value)}
                placeholder="-3, 7, 14"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Parsed: {parseOffsets().join(', ') || '(none)'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={handleSave} disabled={update.isPending}>
              <Save className="h-4 w-4 mr-1" /> Save schedule
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => genNow.mutate(contract.id)}
              disabled={!canGenerate || genNow.isPending}
              title={canGenerate ? 'Generate invoice now' : 'Requires active contract, amount, and a due next-invoice date'}
            >
              <Zap className="h-4 w-4 mr-1" /> Generate invoice now
            </Button>
            <Button size="sm" variant="ghost" onClick={() => sweep.mutate()} disabled={sweep.isPending}>
              <Play className="h-4 w-4 mr-1" /> Run billing sweep
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Generated invoices */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Generated invoices ({invoices.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices generated yet.</p>
          ) : (
            invoices.map((inv) => {
              const paid = (inv.paid_amount_cents ?? 0) >= inv.total_cents;
              return (
                <div key={inv.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                  <div>
                    <div className="font-medium">{inv.invoice_number}</div>
                    <div className="text-xs text-muted-foreground">
                      Issued {inv.issue_date ?? '—'}
                      {inv.due_date && ` · Due ${inv.due_date}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{formatMoney(inv.total_cents, inv.currency)}</div>
                    <Badge
                      variant="outline"
                      className={
                        paid
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : inv.status === 'overdue'
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                            : 'bg-muted text-muted-foreground'
                      }
                    >
                      {paid ? 'paid' : inv.status}
                    </Badge>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Reminders log */}
      {reminders.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Reminders sent ({reminders.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {reminders.map((r) => (
              <div key={r.id} className="text-xs flex items-center justify-between border-b py-1 last:border-0">
                <span>
                  {r.recipient ?? '—'} · offset {r.offset_days > 0 ? `+${r.offset_days}` : r.offset_days}d
                </span>
                <span className="text-muted-foreground">{formatDateTime(r.sent_at)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
