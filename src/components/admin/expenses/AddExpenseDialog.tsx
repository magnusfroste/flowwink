import { useRef, useState, useEffect } from 'react';
import { useCreateExpense } from '@/hooks/useExpenses';
import { useActiveExpenseRates } from '@/hooks/useExpenseRates';
import { supabase } from '@/integrations/supabase/client';
import { callSkill } from '@/lib/call-skill';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Trash2, ScanLine, Loader2, Car, MapPin } from 'lucide-react';
import { FunctionsHttpError } from '@supabase/supabase-js';

const CATEGORIES = [
  { value: 'travel', label: 'Travel' },
  { value: 'meals', label: 'Meals' },
  { value: 'office', label: 'Office' },
  { value: 'software', label: 'Software' },
  { value: 'representation', label: 'Representation' },
  { value: 'other', label: 'Other' },
];

interface Attendee {
  name: string;
  company: string;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK_SIZE = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

type Mode = 'receipt' | 'mileage' | 'per_diem';

export function AddExpenseDialog({ open: controlledOpen, onOpenChange }: { open?: boolean; onOpenChange?: (o: boolean) => void } = {}) {
  const createExpense = useCreateExpense();
  const { data: mileageRates } = useActiveExpenseRates('mileage');
  const { data: perDiemRates } = useActiveExpenseRates('per_diem');

  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (v: boolean) => { if (onOpenChange) onOpenChange(v); if (controlledOpen === undefined) setInternalOpen(v); };
  const [mode, setMode] = useState<Mode>('receipt');

  // Shared
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState('SEK');

  // Receipt mode
  const [totalCents, setTotalCents] = useState(0);
  const [vatRate, setVatRate] = useState('25');
  const [vatOverrideCents, setVatOverrideCents] = useState<number | null>(null);
  const [category, setCategory] = useState('other');
  const [vendor, setVendor] = useState('');
  const [isRepresentation, setIsRepresentation] = useState(false);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [scanning, setScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mileage / Per-diem
  const [rateCode, setRateCode] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');

  // Auto-select default rate when mode switches
  useEffect(() => {
    if (mode === 'mileage' && !rateCode && mileageRates?.length) {
      setRateCode(mileageRates[0].code);
    }
    if (mode === 'per_diem' && !rateCode && perDiemRates?.length) {
      setRateCode(perDiemRates[0].code);
    }
    if (mode === 'receipt') setRateCode('');
  }, [mode, mileageRates, perDiemRates, rateCode]);

  async function handleScanFile(file: File) {
    setScanning(true);
    try {
      const buf = await file.arrayBuffer();
      const file_base64 = arrayBufferToBase64(buf);
      const data = await callSkill('extract_receipt', ({ file_base64, mime_type: file.type, filename: file.name }) as Record<string, unknown>) as { ok?: boolean; error?: string; data?: Record<string, any> } | null;
      if (!data?.ok) throw new Error(data?.error || 'Extraction failed');

      const r: Record<string, any> = data.data || {};

      if (r.expense_date) setDate(r.expense_date);
      if (r.description) setDescription(r.description);
      if (r.vendor) setVendor(r.vendor);
      if (r.currency) setCurrency(r.currency);
      if (typeof r.total_cents === 'number') setTotalCents(r.total_cents);
      if (typeof r.vat_cents === 'number') setVatOverrideCents(r.vat_cents);
      if (r.vat_rate != null) setVatRate(String(r.vat_rate));
      if (r.category && CATEGORIES.some((c) => c.value === r.category)) {
        setCategory(r.category);
        if (r.category === 'representation') {
          setIsRepresentation(true);
          if (attendees.length === 0) setAttendees([{ name: '', company: '' }]);
        }
      }
      toast.success('Receipt scanned — review the fields and save.');
    } catch (e: any) {
      if (e instanceof FunctionsHttpError) {
        try {
          const body = await e.context.json();
          toast.error(body?.error || e.message || 'Could not read receipt');
        } catch {
          toast.error(e.message || 'Could not read receipt');
        }
      } else {
        toast.error(e?.message || 'Could not read receipt');
      }
    } finally {
      setScanning(false);
    }
  }

  const totalNum = totalCents / 100;
  const computedVatNum = vatOverrideCents !== null
    ? vatOverrideCents / 100
    : totalNum - totalNum / (1 + parseFloat(vatRate) / 100);
  const netAmount = totalNum - computedVatNum;

  // Rate-based auto-compute (mileage & per_diem are tax-free schablon → no VAT)
  const activeRateList = mode === 'mileage' ? mileageRates : mode === 'per_diem' ? perDiemRates : undefined;
  const activeRate = activeRateList?.find((r) => r.code === rateCode);
  const qtyNum = parseFloat(quantity);
  const rateComputedCents =
    activeRate && !isNaN(qtyNum) && qtyNum >= 0
      ? Math.round((activeRate.rate_cents * qtyNum) / 1) // rate is in cents per unit
      : 0;

  function reset() {
    setMode('receipt');
    setDate(new Date().toISOString().slice(0, 10));
    setDescription('');
    setTotalCents(0);
    setVatRate('25');
    setVatOverrideCents(null);
    setCategory('other');
    setVendor('');
    setCurrency('SEK');
    setIsRepresentation(false);
    setAttendees([]);
    setRateCode('');
    setQuantity('');
  }

  function addAttendee() {
    setAttendees((prev) => [...prev, { name: '', company: '' }]);
  }
  function updateAttendee(index: number, field: keyof Attendee, value: string) {
    setAttendees((prev) => prev.map((a, i) => (i === index ? { ...a, [field]: value } : a)));
  }
  function removeAttendee(index: number) {
    setAttendees((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (mode === 'receipt') {
      const amountCents = Math.round(netAmount * 100);
      const vatCents = Math.round(computedVatNum * 100);
      await createExpense.mutateAsync({
        expense_date: date,
        description,
        amount_cents: amountCents,
        vat_cents: vatCents,
        currency,
        category,
        vendor: vendor || undefined,
        is_representation: isRepresentation,
        attendees: isRepresentation ? attendees : undefined,
      } as any);
    } else {
      if (!activeRate || rateComputedCents <= 0) return;
      // Tax-free schablon: no VAT, category = travel, description auto-filled if empty
      const autoDescription =
        description ||
        `${activeRate.label} — ${qtyNum} ${activeRate.unit}${qtyNum === 1 ? '' : 's'}`;
      await createExpense.mutateAsync({
        expense_date: date,
        description: autoDescription,
        amount_cents: rateComputedCents,
        vat_cents: 0,
        currency: activeRate.currency,
        category: 'travel',
        account_code: activeRate.account_code || undefined,
        vendor: undefined,
        is_representation: false,
        // extra fields recorded on the expenses row
        rate_code: activeRate.code,
        quantity: qtyNum,
        unit: activeRate.unit,
      } as any);
    }
    reset();
    setOpen(false);
  }

  const canSubmitReceipt = description.trim() && totalCents > 0;
  const canSubmitRate = !!activeRate && !isNaN(qtyNum) && qtyNum > 0;
  const canSubmit = mode === 'receipt' ? canSubmitReceipt : canSubmitRate;
  const needsAttendees =
    mode === 'receipt' && isRepresentation && attendees.filter((a) => a.name.trim()).length === 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          Add Expense
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Expense</DialogTitle>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="receipt">
              <ScanLine className="h-3.5 w-3.5 mr-1.5" /> Receipt
            </TabsTrigger>
            <TabsTrigger value="mileage">
              <Car className="h-3.5 w-3.5 mr-1.5" /> Mileage
            </TabsTrigger>
            <TabsTrigger value="per_diem">
              <MapPin className="h-3.5 w-3.5 mr-1.5" /> Per diem
            </TabsTrigger>
          </TabsList>

          {/* ---------- RECEIPT TAB ---------- */}
          <TabsContent value="receipt" className="space-y-4 mt-4">
            <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 flex items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground leading-snug">
                Have a receipt? Scan it and we'll fill in the fields for you to review.
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleScanFile(f);
                  e.target.value = '';
                }}
              />
              <Button
                type="button" variant="outline" size="sm"
                disabled={scanning}
                onClick={() => fileInputRef.current?.click()}
              >
                {scanning ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ScanLine className="h-4 w-4 mr-1.5" />}
                {scanning ? 'Reading…' : 'Scan Receipt'}
              </Button>
            </div>

            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="exp-date">Date</Label>
                  <Input id="exp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={category} onValueChange={(v) => {
                    setCategory(v);
                    setIsRepresentation(v === 'representation');
                    if (v === 'representation' && attendees.length === 0) addAttendee();
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="exp-desc">Description</Label>
                <Input id="exp-desc" placeholder="Lunch with client, taxi to airport…" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="exp-vendor">Vendor</Label>
                <Input id="exp-vendor" placeholder="Restaurant name, airline…" value={vendor} onChange={(e) => setVendor(e.target.value)} />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="exp-total">Total (incl. VAT)</Label>
                  <MoneyInput id="exp-total" value={totalCents} onChange={setTotalCents} step="0.01" currency={currency} />
                </div>
                <div className="space-y-1.5">
                  <Label>VAT Rate</Label>
                  <Select value={vatRate} onValueChange={(v) => { setVatRate(v); setVatOverrideCents(null); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">25%</SelectItem>
                      <SelectItem value="12">12%</SelectItem>
                      <SelectItem value="6">6%</SelectItem>
                      <SelectItem value="0">0%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Currency</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SEK">SEK</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                      <SelectItem value="NOK">NOK</SelectItem>
                      <SelectItem value="DKK">DKK</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {totalNum > 0 && (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="space-y-1.5">
                    <Label htmlFor="exp-vat-override" className="text-xs text-muted-foreground">VAT override (optional)</Label>
                    <MoneyInput
                      id="exp-vat-override"
                      value={vatOverrideCents ?? 0}
                      onChange={(c) => setVatOverrideCents(c === 0 ? null : c)}
                      step="0.01"
                      placeholder={computedVatNum.toFixed(2)}
                      currency={currency}
                    />
                  </div>
                  <div className="flex flex-col justify-end text-muted-foreground text-xs space-y-0.5 pb-2 tabular-nums">
                    <span>Net: {netAmount.toFixed(2)} {currency}</span>
                    <span>VAT: {computedVatNum.toFixed(2)} {currency}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 pt-1">
                <Switch id="exp-rep" checked={isRepresentation} onCheckedChange={(v) => {
                  setIsRepresentation(v);
                  if (v && attendees.length === 0) addAttendee();
                }} />
                <Label htmlFor="exp-rep" className="cursor-pointer">Representation (requires attendees)</Label>
              </div>

              {isRepresentation && (
                <div className="space-y-2 rounded-md border border-border p-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Attendees</Label>
                    <Button type="button" variant="ghost" size="sm" onClick={addAttendee}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add
                    </Button>
                  </div>
                  {attendees.map((a, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                      <Input placeholder="Name" value={a.name} onChange={(e) => updateAttendee(i, 'name', e.target.value)} />
                      <Input placeholder="Company" value={a.company} onChange={(e) => updateAttendee(i, 'company', e.target.value)} />
                      <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => removeAttendee(i)}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                  {needsAttendees && (
                    <p className="text-xs text-destructive">At least one attendee is required for representation expenses</p>
                  )}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ---------- MILEAGE / PER-DIEM TABS (shared UI) ---------- */}
          {(['mileage', 'per_diem'] as Mode[]).map((m) => (
            <TabsContent key={m} value={m} className="space-y-4 mt-4">
              <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground leading-snug">
                Amount is computed automatically from the active {m === 'mileage' ? 'mileage' : 'per-diem'} rate table.
                Schablon amounts are tax-free — no VAT is posted.
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Rate</Label>
                  <Select value={rateCode} onValueChange={setRateCode}>
                    <SelectTrigger><SelectValue placeholder="Select rate…" /></SelectTrigger>
                    <SelectContent>
                      {(m === 'mileage' ? mileageRates : perDiemRates)?.map((r) => (
                        <SelectItem key={r.id} value={r.code}>
                          {r.label} — {(r.rate_cents / 100).toFixed(2)} {r.currency}/{r.unit}
                        </SelectItem>
                      )) ?? null}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>
                    Quantity {activeRate ? `(${activeRate.unit}${qtyNum === 1 ? '' : 's'})` : ''}
                  </Label>
                  <Input
                    type="number" step="0.01" min="0"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder={m === 'mileage' ? '3.5' : '2'}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Computed amount</Label>
                  <div className="h-10 px-3 rounded-md border border-input bg-muted/40 flex items-center text-sm tabular-nums">
                    {activeRate && rateComputedCents > 0
                      ? `${(rateComputedCents / 100).toFixed(2)} ${activeRate.currency}`
                      : '—'}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Description (optional)</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    m === 'mileage'
                      ? 'Kund X, Stockholm–Uppsala tur & retur'
                      : 'Tjänsteresa Göteborg 12–13 maj'
                  }
                />
              </div>

              {activeRate?.account_code && (
                <p className="text-xs text-muted-foreground">
                  Will book to account <strong>{activeRate.account_code}</strong> (from the rate table).
                </p>
              )}
            </TabsContent>
          ))}
        </Tabs>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || needsAttendees || createExpense.isPending}
          >
            {createExpense.isPending ? 'Saving…' : 'Save Expense'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
