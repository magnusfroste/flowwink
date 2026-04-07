import { useState } from 'react';
import { useCreateExpense } from '@/hooks/useExpenses';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2 } from 'lucide-react';

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

export function AddExpenseDialog() {
  const createExpense = useCreateExpense();
  const [open, setOpen] = useState(false);

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [total, setTotal] = useState('');
  const [vatRate, setVatRate] = useState('25');
  const [vatOverride, setVatOverride] = useState('');
  const [category, setCategory] = useState('other');
  const [vendor, setVendor] = useState('');
  const [currency, setCurrency] = useState('SEK');
  const [isRepresentation, setIsRepresentation] = useState(false);
  const [attendees, setAttendees] = useState<Attendee[]>([]);

  const totalNum = parseFloat(total || '0');
  const computedVat = vatOverride
    ? parseFloat(vatOverride)
    : totalNum - totalNum / (1 + parseFloat(vatRate) / 100);
  const netAmount = totalNum - computedVat;

  function reset() {
    setDate(new Date().toISOString().slice(0, 10));
    setDescription('');
    setTotal('');
    setVatRate('25');
    setVatOverride('');
    setCategory('other');
    setVendor('');
    setCurrency('SEK');
    setIsRepresentation(false);
    setAttendees([]);
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
    const amountCents = Math.round(netAmount * 100);
    const vatCents = Math.round(computedVat * 100);

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

    reset();
    setOpen(false);
  }

  const canSubmit = description.trim() && total && parseFloat(total) > 0;
  const needsAttendees = isRepresentation && attendees.filter((a) => a.name.trim()).length === 0;

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

        <div className="grid gap-4 py-2">
          {/* Date + Category */}
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

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="exp-desc">Description</Label>
            <Input id="exp-desc" placeholder="Lunch with client, taxi to airport…" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          {/* Vendor */}
          <div className="space-y-1.5">
            <Label htmlFor="exp-vendor">Vendor</Label>
            <Input id="exp-vendor" placeholder="Restaurant name, airline…" value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </div>

          {/* Total + VAT rate + Currency */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="exp-total">Total (incl. VAT)</Label>
              <Input id="exp-total" type="number" step="0.01" min="0" placeholder="0.00" value={total} onChange={(e) => setTotal(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>VAT Rate</Label>
              <Select value={vatRate} onValueChange={(v) => { setVatRate(v); setVatOverride(''); }}>
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

          {/* VAT override + summary */}
          {totalNum > 0 && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="space-y-1.5">
                <Label htmlFor="exp-vat-override" className="text-xs text-muted-foreground">VAT override (optional)</Label>
                <Input id="exp-vat-override" type="number" step="0.01" min="0" placeholder={computedVat.toFixed(2)} value={vatOverride} onChange={(e) => setVatOverride(e.target.value)} />
              </div>
              <div className="flex flex-col justify-end text-muted-foreground text-xs space-y-0.5 pb-2">
                <span>Net: {netAmount.toFixed(2)} {currency}</span>
                <span>VAT: {computedVat.toFixed(2)} {currency}</span>
              </div>
            </div>
          )}

          {/* Representation toggle */}
          <div className="flex items-center gap-3 pt-1">
            <Switch id="exp-rep" checked={isRepresentation} onCheckedChange={(v) => {
              setIsRepresentation(v);
              if (v && attendees.length === 0) addAttendee();
            }} />
            <Label htmlFor="exp-rep" className="cursor-pointer">Representation (requires attendees)</Label>
          </div>

          {/* Attendees */}
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
