import { useState, useMemo } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useRegisters, useOpenSession, useTodaySales, useRecentSales,
  useOpenSessionMutation, useCloseSessionMutation, useRecordSale,
  type PosSaleLine,
} from '@/hooks/usePOS';
import { Plus, Trash2, Receipt, Banknote, CreditCard, Smartphone } from 'lucide-react';
import { format } from 'date-fns';

function fmtMoney(cents: number, currency = 'SEK') {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

export default function POSPage() {
  const { data: registers } = useRegisters();
  const [registerId, setRegisterId] = useState<string | undefined>();
  const activeRegister = registers?.find((r) => r.id === registerId) ?? registers?.[0];
  const effectiveRegisterId = registerId ?? activeRegister?.id;

  const { data: openSession } = useOpenSession(effectiveRegisterId);
  const { data: todaySales } = useTodaySales();
  const { data: recent } = useRecentSales(20);

  const openSession$ = useOpenSessionMutation();
  const closeSession$ = useCloseSessionMutation();
  const recordSale$ = useRecordSale();

  // Cart state
  const [lines, setLines] = useState<PosSaleLine[]>([]);
  const [payment, setPayment] = useState('cash');
  const [customerEmail, setCustomerEmail] = useState('');
  const [openingCash, setOpeningCash] = useState('1000');
  const [closingCash, setClosingCash] = useState('');

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + l.unit_price_cents * l.quantity - (l.discount_cents ?? 0), 0),
    [lines],
  );
  const taxRate = activeRegister?.default_tax_rate ?? 25;
  const tax = Math.round(subtotal * (Number(taxRate) / 100));
  const total = subtotal + tax;

  function addLine() {
    setLines([...lines, { product_name: '', quantity: 1, unit_price_cents: 0 }]);
  }
  function updateLine(i: number, patch: Partial<PosSaleLine>) {
    setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeLine(i: number) {
    setLines(lines.filter((_, idx) => idx !== i));
  }
  async function checkout() {
    if (!effectiveRegisterId || lines.length === 0) return;
    await recordSale$.mutateAsync({
      register_id: effectiveRegisterId,
      session_id: openSession?.id,
      lines,
      payment_method: payment,
      customer_email: customerEmail || undefined,
    });
    setLines([]);
    setCustomerEmail('');
  }

  return (
    <AdminLayout>
      <div className="container mx-auto py-8 space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Point of Sale</h1>
            <p className="text-muted-foreground mt-1">
              Counter sales — cash drawer, receipts, end-of-day reconciliation.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {registers && registers.length > 0 && (
              <Select value={effectiveRegisterId} onValueChange={setRegisterId}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Register" /></SelectTrigger>
                <SelectContent>
                  {registers.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {!registers || registers.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-2">
              <Receipt className="h-10 w-10 mx-auto text-muted-foreground" />
              <p>No registers configured yet.</p>
              <p className="text-sm text-muted-foreground">
                Add a row to <code>pos_registers</code> to get started.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="register" className="space-y-4">
            <TabsList>
              <TabsTrigger value="register">Register</TabsTrigger>
              <TabsTrigger value="session">Session</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            {/* Register / sale */}
            <TabsContent value="register" className="space-y-4">
              {!openSession && (
                <Card className="border-amber-500/40 bg-amber-500/5">
                  <CardContent className="py-4 flex items-center justify-between">
                    <div>
                      <div className="font-medium">No open session on this register</div>
                      <div className="text-sm text-muted-foreground">Start a shift to ring up sales.</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number" className="w-32"
                        placeholder="Opening cash"
                        value={openingCash}
                        onChange={(e) => setOpeningCash(e.target.value)}
                      />
                      <Button
                        onClick={() => openSession$.mutate({
                          register_id: effectiveRegisterId!,
                          opening_cash_cents: Math.round(Number(openingCash) * 100),
                        })}
                      >Open session</Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid gap-4 lg:grid-cols-3">
                {/* Cart */}
                <Card className="lg:col-span-2">
                  <CardHeader className="flex-row items-center justify-between">
                    <CardTitle>Cart</CardTitle>
                    <Button size="sm" variant="outline" onClick={addLine}>
                      <Plus className="h-4 w-4 mr-1" /> Add line
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {lines.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-6 text-center">Cart is empty.</p>
                    ) : lines.map((l, i) => (
                      <div key={i} className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-5">
                          <Label className="text-xs">Product</Label>
                          <Input value={l.product_name} onChange={(e) => updateLine(i, { product_name: e.target.value })} />
                        </div>
                        <div className="col-span-2">
                          <Label className="text-xs">Qty</Label>
                          <Input type="number" value={l.quantity} onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })} />
                        </div>
                        <div className="col-span-3">
                          <Label className="text-xs">Unit price</Label>
                          <Input type="number" step="0.01"
                            value={(l.unit_price_cents / 100).toString()}
                            onChange={(e) => updateLine(i, { unit_price_cents: Math.round(Number(e.target.value) * 100) })}
                          />
                        </div>
                        <div className="col-span-2 flex justify-end">
                          <Button size="icon" variant="ghost" onClick={() => removeLine(i)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Totals + payment */}
                <Card>
                  <CardHeader><CardTitle>Total</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between text-sm"><span>Subtotal</span><span>{fmtMoney(subtotal, activeRegister?.currency)}</span></div>
                    <div className="flex justify-between text-sm"><span>Tax ({taxRate}%)</span><span>{fmtMoney(tax, activeRegister?.currency)}</span></div>
                    <div className="flex justify-between text-lg font-bold border-t pt-2"><span>Total</span><span>{fmtMoney(total, activeRegister?.currency)}</span></div>

                    <div className="pt-2">
                      <Label className="text-xs">Payment</Label>
                      <Select value={payment} onValueChange={setPayment}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash"><Banknote className="h-3 w-3 inline mr-2" />Cash</SelectItem>
                          <SelectItem value="card"><CreditCard className="h-3 w-3 inline mr-2" />Card</SelectItem>
                          <SelectItem value="swish"><Smartphone className="h-3 w-3 inline mr-2" />Swish</SelectItem>
                          <SelectItem value="klarna">Klarna</SelectItem>
                          <SelectItem value="gift_card">Gift card</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs">Customer email (optional)</Label>
                      <Input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="customer@example.com" />
                    </div>

                    <Button
                      className="w-full"
                      disabled={!openSession || lines.length === 0 || recordSale$.isPending}
                      onClick={checkout}
                    >
                      {recordSale$.isPending ? 'Processing…' : 'Complete sale'}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Session */}
            <TabsContent value="session" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Today total</div><div className="text-2xl font-bold">{fmtMoney(todaySales?.total_cents ?? 0, todaySales?.currency)}</div></CardContent></Card>
                <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Sales count</div><div className="text-2xl font-bold">{todaySales?.count ?? 0}</div></CardContent></Card>
                <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Open session</div><div className="text-2xl font-bold">{openSession ? '✓' : '—'}</div></CardContent></Card>
              </div>

              {openSession && (
                <Card>
                  <CardHeader><CardTitle>Close session</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-sm">Opened {format(new Date(openSession.opened_at), 'PPp')}</div>
                    <div className="text-sm">Sales so far: {openSession.sales_count} ({fmtMoney(openSession.total_sales_cents)})</div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <Label className="text-xs">Counted cash in drawer</Label>
                        <Input type="number" step="0.01" value={closingCash} onChange={(e) => setClosingCash(e.target.value)} placeholder="0.00" />
                      </div>
                      <Button
                        variant="destructive"
                        disabled={!closingCash || closeSession$.isPending}
                        onClick={() => {
                          closeSession$.mutate({
                            session_id: openSession.id,
                            closing_cash_cents: Math.round(Number(closingCash) * 100),
                          });
                          setClosingCash('');
                        }}
                      >Close session</Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* History */}
            <TabsContent value="history">
              <Card>
                <CardHeader><CardTitle>Recent sales</CardTitle></CardHeader>
                <CardContent>
                  {!recent || recent.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">No sales yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {recent.map((s) => (
                        <div key={s.id} className="flex items-center justify-between border rounded p-3">
                          <div>
                            <div className="font-mono text-sm">{s.receipt_number}</div>
                            <div className="text-xs text-muted-foreground">{format(new Date(s.created_at), 'PPp')}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium">{fmtMoney(s.total_cents, s.currency)}</div>
                            <Badge variant="outline" className="text-xs">{s.payment_method}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AdminLayout>
  );
}
