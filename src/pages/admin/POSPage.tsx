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
  useOpenSessionMutation, useCloseSession, useRecordSale,
  usePosProducts,
  type PosSaleLine, type PosPayment, type PosProduct,
} from '@/hooks/usePOS';
import { Plus, Trash2, Receipt, Banknote, CreditCard, Smartphone, Search, X } from 'lucide-react';
import { format } from 'date-fns';

function fmtMoney(cents: number, currency = 'SEK') {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

const PAYMENT_METHODS: Array<{ value: PosPayment['method']; label: string; icon?: React.ReactNode }> = [
  { value: 'cash', label: 'Cash', icon: <Banknote className="h-3 w-3" /> },
  { value: 'card', label: 'Card', icon: <CreditCard className="h-3 w-3" /> },
  { value: 'swish', label: 'Swish', icon: <Smartphone className="h-3 w-3" /> },
  { value: 'klarna', label: 'Klarna' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'gift_card', label: 'Gift card' },
  { value: 'other', label: 'Other' },
];

export default function POSPage() {
  const { data: registers } = useRegisters();
  const [registerId, setRegisterId] = useState<string | undefined>();
  const activeRegister = registers?.find((r) => r.id === registerId) ?? registers?.[0];
  const effectiveRegisterId = registerId ?? activeRegister?.id;

  const { data: openSession } = useOpenSession(effectiveRegisterId);
  const { data: todaySales } = useTodaySales();
  const { data: recent } = useRecentSales(20);

  const openSession$ = useOpenSessionMutation();
  const closeSession$ = useCloseSession();
  const recordSale$ = useRecordSale();

  // Cart + payments state
  const [lines, setLines] = useState<PosSaleLine[]>([]);
  const [payments, setPayments] = useState<PosPayment[]>([]);
  const [customerEmail, setCustomerEmail] = useState('');
  const [openingCash, setOpeningCash] = useState('1000');
  const [closingCash, setClosingCash] = useState('');

  // Product picker
  const [search, setSearch] = useState('');
  const { data: products } = usePosProducts(search);

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + l.unit_price_cents * l.quantity - (l.discount_cents ?? 0), 0),
    [lines],
  );
  const taxRate = activeRegister?.default_tax_rate ?? 25;
  const tax = Math.round(subtotal * (Number(taxRate) / 100));
  const total = subtotal + tax;
  const paid = useMemo(() => payments.reduce((s, p) => s + (p.amount_cents || 0), 0), [payments]);
  const remaining = total - paid;

  function addLineFromProduct(p: PosProduct) {
    const existingIdx = lines.findIndex((l) => l.product_id === p.id);
    if (existingIdx >= 0) {
      setLines(lines.map((l, i) => i === existingIdx ? { ...l, quantity: l.quantity + 1 } : l));
    } else {
      setLines([...lines, {
        product_id: p.id,
        product_name: p.name,
        quantity: 1,
        unit_price_cents: p.price_cents,
      }]);
    }
    setSearch('');
  }
  function addBlankLine() {
    setLines([...lines, { product_name: '', quantity: 1, unit_price_cents: 0 }]);
  }
  function updateLine(i: number, patch: Partial<PosSaleLine>) {
    setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeLine(i: number) {
    setLines(lines.filter((_, idx) => idx !== i));
  }

  function addPayment(method: PosPayment['method']) {
    const fillAmount = Math.max(remaining, 0);
    setPayments([...payments, { method, amount_cents: fillAmount }]);
  }
  function updatePayment(i: number, patch: Partial<PosPayment>) {
    setPayments(payments.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }
  function removePayment(i: number) {
    setPayments(payments.filter((_, idx) => idx !== i));
  }

  async function checkout() {
    if (!effectiveRegisterId || !openSession || lines.length === 0 || payments.length === 0) return;
    await recordSale$.mutateAsync({
      register_id: effectiveRegisterId,
      session_id: openSession.id,
      lines,
      payments,
      customer_email: customerEmail || undefined,
    });
    setLines([]);
    setPayments([]);
    setCustomerEmail('');
    setSearch('');
  }

  const canCheckout = !!openSession && lines.length > 0 && payments.length > 0 && paid >= total;

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
                {/* Left: product picker + cart */}
                <div className="lg:col-span-2 space-y-4">
                  {/* Product picker */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Catalog</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="relative">
                        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          className="pl-9"
                          placeholder="Search by name or scan barcode…"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          autoFocus
                        />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-64 overflow-y-auto">
                        {(products ?? []).map((p) => (
                          <button
                            key={p.id}
                            onClick={() => addLineFromProduct(p)}
                            className="text-left border rounded-lg p-2 hover:bg-accent transition-colors"
                          >
                            <div className="text-sm font-medium truncate">{p.name}</div>
                            <div className="text-xs text-muted-foreground">{fmtMoney(p.price_cents, p.currency)}</div>
                            {p.stock_quantity !== null && (
                              <div className="text-[10px] text-muted-foreground mt-0.5">Stock: {p.stock_quantity}</div>
                            )}
                          </button>
                        ))}
                        {products && products.length === 0 && (
                          <div className="col-span-full text-xs text-muted-foreground py-4 text-center">
                            No products. Mark products as <code>available_in_pos</code> to show here.
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Cart */}
                  <Card>
                    <CardHeader className="flex-row items-center justify-between">
                      <CardTitle className="text-base">Cart</CardTitle>
                      <Button size="sm" variant="outline" onClick={addBlankLine}>
                        <Plus className="h-4 w-4 mr-1" /> Custom line
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
                </div>

                {/* Right: totals + split tender */}
                <Card>
                  <CardHeader><CardTitle>Total</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between text-sm"><span>Subtotal</span><span>{fmtMoney(subtotal, activeRegister?.currency)}</span></div>
                    <div className="flex justify-between text-sm"><span>Tax ({taxRate}%)</span><span>{fmtMoney(tax, activeRegister?.currency)}</span></div>
                    <div className="flex justify-between text-lg font-bold border-t pt-2"><span>Total</span><span>{fmtMoney(total, activeRegister?.currency)}</span></div>

                    {/* Split tender */}
                    <div className="border-t pt-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Payments (split tender)</Label>
                        <Select onValueChange={(v) => addPayment(v as PosPayment['method'])}>
                          <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue placeholder="+ Add" /></SelectTrigger>
                          <SelectContent>
                            {PAYMENT_METHODS.map((m) => (
                              <SelectItem key={m.value} value={m.value}>
                                <span className="inline-flex items-center gap-2">{m.icon}{m.label}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {payments.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">Add at least one payment method.</p>
                      ) : payments.map((p, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs capitalize w-20 justify-center">{p.method}</Badge>
                          <Input
                            type="number" step="0.01" className="h-8 text-sm"
                            value={(p.amount_cents / 100).toString()}
                            onChange={(e) => updatePayment(i, { amount_cents: Math.round(Number(e.target.value) * 100) })}
                          />
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removePayment(i)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}

                      {payments.length > 0 && (
                        <div className="flex justify-between text-xs pt-1">
                          <span className="text-muted-foreground">Paid</span>
                          <span className={paid >= total ? 'text-green-600 font-medium' : 'text-amber-600 font-medium'}>
                            {fmtMoney(paid, activeRegister?.currency)}
                          </span>
                        </div>
                      )}
                      {payments.length > 0 && remaining !== 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{remaining > 0 ? 'Remaining' : 'Change'}</span>
                          <span className="font-medium">{fmtMoney(Math.abs(remaining), activeRegister?.currency)}</span>
                        </div>
                      )}
                    </div>

                    <div>
                      <Label className="text-xs">Customer email (optional)</Label>
                      <Input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="customer@example.com" />
                    </div>

                    <Button
                      className="w-full"
                      disabled={!canCheckout || recordSale$.isPending}
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
                  <CardHeader><CardTitle>Close session (Z-report)</CardTitle></CardHeader>
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
                    <p className="text-xs text-muted-foreground">
                      Closing the session aggregates all sales by payment method and posts a single batched journal entry.
                    </p>
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
