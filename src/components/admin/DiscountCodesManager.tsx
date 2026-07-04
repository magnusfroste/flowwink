import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, Tag, Loader2 } from 'lucide-react';
import { formatPrice } from '@/hooks/useProducts';
import {
  useDiscountCodes,
  useCreateDiscountCode,
  useUpdateDiscountCode,
  useDeleteDiscountCode,
  type DiscountCode,
  type DiscountType,
} from '@/hooks/useDiscountCodes';

interface FormState {
  code: string;
  type: DiscountType;
  value: string;
  currency: string;
  validFrom: string;
  validUntil: string;
  maxUses: string;
  minOrder: string;
}

const EMPTY_FORM: FormState = {
  code: '',
  type: 'percent',
  value: '',
  currency: 'SEK',
  validFrom: '',
  validUntil: '',
  maxUses: '',
  minOrder: '',
};

/** datetime-local input value ↔ ISO string */
function toInputValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function describeValue(dc: DiscountCode): string {
  return dc.type === 'percent'
    ? `${dc.value}% off`
    : `${formatPrice(dc.value, dc.currency || 'SEK')} off`;
}

export function DiscountCodesManager() {
  const { data: codes = [], isLoading } = useDiscountCodes();
  const createCode = useCreateDiscountCode();
  const updateCode = useUpdateDiscountCode();
  const deleteCode = useDeleteDiscountCode();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DiscountCode | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [toDelete, setToDelete] = useState<DiscountCode | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (dc: DiscountCode) => {
    setEditing(dc);
    setForm({
      code: dc.code,
      type: dc.type,
      value: String(dc.type === 'fixed' ? dc.value / 100 : dc.value),
      currency: dc.currency || 'SEK',
      validFrom: toInputValue(dc.valid_from),
      validUntil: toInputValue(dc.valid_until),
      maxUses: dc.max_uses !== null ? String(dc.max_uses) : '',
      minOrder: dc.min_order_cents !== null ? String(dc.min_order_cents / 100) : '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numericValue = Number(form.value);
    if (!form.code.trim() || !Number.isFinite(numericValue) || numericValue <= 0) return;

    const payload = {
      code: form.code.trim(),
      type: form.type,
      // Percent: whole percent. Fixed: entered in major units, stored in cents.
      value: form.type === 'fixed' ? Math.round(numericValue * 100) : Math.round(numericValue),
      currency: form.type === 'fixed' ? form.currency : null,
      valid_from: form.validFrom ? new Date(form.validFrom).toISOString() : null,
      valid_until: form.validUntil ? new Date(form.validUntil).toISOString() : null,
      max_uses: form.maxUses ? Number(form.maxUses) : null,
      min_order_cents: form.minOrder ? Math.round(Number(form.minOrder) * 100) : null,
    };

    const onSuccess = () => setDialogOpen(false);
    if (editing) {
      updateCode.mutate({ id: editing.id, ...payload }, { onSuccess });
    } else {
      createCode.mutate(payload, { onSuccess });
    }
  };

  const isSaving = createCode.isPending || updateCode.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Codes visitors can enter at checkout for a percent or fixed discount.
        </p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          New Code
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : codes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Tag className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No discount codes yet</h3>
            <p className="text-muted-foreground mb-4">
              Create a code to offer discounts at checkout
            </p>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              New Code
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {codes.map((dc) => {
            const expired = dc.valid_until ? new Date(dc.valid_until) < new Date() : false;
            const usedUp = dc.max_uses !== null && dc.use_count >= dc.max_uses;
            return (
              <Card key={dc.id} className={!dc.active ? 'opacity-60' : ''}>
                <CardContent className="flex items-center justify-between py-4 gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-mono font-semibold uppercase">{dc.code}</span>
                      <Badge variant="secondary">{describeValue(dc)}</Badge>
                      {expired && <Badge variant="outline" className="text-destructive">Expired</Badge>}
                      {usedUp && <Badge variant="outline" className="text-destructive">Used up</Badge>}
                      {!dc.active && <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Used {dc.use_count}
                      {dc.max_uses !== null ? ` of ${dc.max_uses}` : ' times'}
                      {dc.min_order_cents !== null &&
                        ` · min order ${formatPrice(dc.min_order_cents, dc.currency || 'SEK')}`}
                      {dc.valid_until &&
                        ` · until ${new Date(dc.valid_until).toLocaleDateString()}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={dc.active}
                      onCheckedChange={(checked) =>
                        updateCode.mutate({ id: dc.id, active: checked })
                      }
                    />
                    <Button variant="ghost" size="icon" onClick={() => openEdit(dc)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setToDelete(dc)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit discount code' : 'New discount code'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Update the code settings. Existing orders are not affected.'
                : 'Visitors enter this code at checkout.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dc-code">Code *</Label>
              <Input
                id="dc-code"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="SUMMER10"
                className="font-mono uppercase"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm((f) => ({ ...f, type: v as DiscountType }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percent off</SelectItem>
                    <SelectItem value="fixed">Fixed amount off</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dc-value">
                  {form.type === 'percent' ? 'Percent (1–100) *' : 'Amount *'}
                </Label>
                <Input
                  id="dc-value"
                  type="number"
                  min="0"
                  step={form.type === 'percent' ? '1' : '0.01'}
                  max={form.type === 'percent' ? '100' : undefined}
                  value={form.value}
                  onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                  required
                />
              </div>
            </div>

            {form.type === 'fixed' && (
              <div className="space-y-2">
                <Label htmlFor="dc-currency">Currency</Label>
                <Input
                  id="dc-currency"
                  value={form.currency}
                  onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
                  placeholder="SEK"
                  maxLength={3}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="dc-from">Valid from</Label>
                <Input
                  id="dc-from"
                  type="datetime-local"
                  value={form.validFrom}
                  onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dc-until">Valid until</Label>
                <Input
                  id="dc-until"
                  type="datetime-local"
                  value={form.validUntil}
                  onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="dc-max">Max uses</Label>
                <Input
                  id="dc-max"
                  type="number"
                  min="1"
                  placeholder="Unlimited"
                  value={form.maxUses}
                  onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dc-min">Min order amount</Label>
                <Input
                  id="dc-min"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="None"
                  value={form.minOrder}
                  onChange={(e) => setForm((f) => ({ ...f, minOrder: e.target.value }))}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editing ? 'Save changes' : 'Create code'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete discount code?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{toDelete?.code}"? Orders that already used
              it keep their discount. Prefer deactivating if the code may return.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (toDelete) deleteCode.mutate(toDelete.id);
                setToDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
