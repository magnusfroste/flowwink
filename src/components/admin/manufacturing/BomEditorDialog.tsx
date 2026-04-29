import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { Plus, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useProducts } from '@/hooks/useProducts';
import {
  useCreateBom,
  useUpdateBomHeader,
  useReplaceBomLines,
  useBomLines,
  type BomHeader,
  type CreateBomLineInput,
} from '@/hooks/useManufacturing';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided → edit mode. When undefined → create mode. */
  bom?: BomHeader;
}

interface DraftLine extends CreateBomLineInput {
  /** Local-only key for React reconciliation. */
  key: string;
}

const lineSchema = z.object({
  component_product_id: z.string().uuid({ message: 'Pick a component' }),
  quantity: z.number().positive({ message: 'Quantity must be > 0' }),
  unit: z.string().max(20).optional(),
  scrap_pct: z.number().min(0).max(100).optional(),
});

const headerSchema = z.object({
  product_id: z.string().uuid({ message: 'Pick a finished product' }),
  version: z.string().trim().max(50).optional(),
  quantity_produced: z.number().positive({ message: 'Must be > 0' }),
  routing_notes: z.string().max(1000).optional(),
  activate: z.boolean(),
});

function newDraftLine(): DraftLine {
  return {
    key: crypto.randomUUID(),
    component_product_id: '',
    quantity: 1,
  };
}

export function BomEditorDialog({ open, onOpenChange, bom }: Props) {
  const isEdit = !!bom;
  const { toast } = useToast();
  const { data: products = [], isLoading: productsLoading } = useProducts();
  const { data: existingLines, isLoading: linesLoading } = useBomLines(bom?.id);

  const createBom = useCreateBom();
  const updateHeader = useUpdateBomHeader();
  const replaceLines = useReplaceBomLines();

  const [productId, setProductId] = useState('');
  const [version, setVersion] = useState('');
  const [quantityProduced, setQuantityProduced] = useState<number>(1);
  const [routingNotes, setRoutingNotes] = useState('');
  const [activate, setActivate] = useState(true);
  const [lines, setLines] = useState<DraftLine[]>([newDraftLine()]);
  const [errors, setErrors] = useState<string[]>([]);

  // Reset / hydrate when dialog opens or bom changes.
  useEffect(() => {
    if (!open) return;
    setErrors([]);
    if (bom) {
      setProductId(bom.product_id);
      setVersion(bom.version ?? '');
      setQuantityProduced(Number(bom.quantity_produced) || 1);
      setRoutingNotes(bom.routing_notes ?? '');
      setActivate(bom.is_active);
    } else {
      setProductId('');
      setVersion('');
      setQuantityProduced(1);
      setRoutingNotes('');
      setActivate(true);
      setLines([newDraftLine()]);
    }
  }, [open, bom]);

  // Hydrate lines once they load (edit mode).
  useEffect(() => {
    if (!isEdit || !existingLines) return;
    if (existingLines.length === 0) {
      setLines([newDraftLine()]);
      return;
    }
    setLines(
      existingLines.map((l) => ({
        key: l.id,
        component_product_id: l.component_product_id,
        quantity: Number(l.quantity),
        unit: l.unit ?? undefined,
        scrap_pct: l.scrap_pct === null ? undefined : Number(l.scrap_pct),
      })),
    );
  }, [isEdit, existingLines]);

  const productOptions = useMemo(
    () => products.filter((p) => p.is_active).map((p) => ({ id: p.id, label: p.name })),
    [products],
  );

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, newDraftLine()]);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.key !== key)));
  }

  function validate(): { ok: true; lines: CreateBomLineInput[] } | { ok: false; errors: string[] } {
    const issues: string[] = [];
    const headerParse = headerSchema.safeParse({
      product_id: productId,
      version: version || undefined,
      quantity_produced: quantityProduced,
      routing_notes: routingNotes || undefined,
      activate,
    });
    if (!headerParse.success) {
      issues.push(...headerParse.error.issues.map((i) => i.message));
    }

    const seen = new Set<string>();
    const cleanLines: CreateBomLineInput[] = [];
    lines.forEach((l, idx) => {
      const parse = lineSchema.safeParse({
        component_product_id: l.component_product_id,
        quantity: Number(l.quantity),
        unit: l.unit || undefined,
        scrap_pct: l.scrap_pct === undefined ? undefined : Number(l.scrap_pct),
      });
      if (!parse.success) {
        issues.push(`Line ${idx + 1}: ${parse.error.issues.map((i) => i.message).join(', ')}`);
        return;
      }
      if (parse.data.component_product_id === productId) {
        issues.push(`Line ${idx + 1}: a component cannot be the finished product itself.`);
        return;
      }
      if (seen.has(parse.data.component_product_id)) {
        issues.push(`Line ${idx + 1}: duplicate component.`);
        return;
      }
      seen.add(parse.data.component_product_id);
      cleanLines.push({
        component_product_id: parse.data.component_product_id,
        quantity: parse.data.quantity,
        unit: parse.data.unit,
        scrap_pct: parse.data.scrap_pct,
        position: idx,
      });
    });

    if (cleanLines.length === 0 && issues.length === 0) {
      issues.push('Add at least one component.');
    }

    if (issues.length > 0) return { ok: false, errors: issues };
    return { ok: true, lines: cleanLines };
  }

  async function handleSave() {
    const result = validate();
    if (result.ok === false) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);

    try {
      if (isEdit && bom) {
        await updateHeader.mutateAsync({
          id: bom.id,
          version: version || bom.version,
          quantity_produced: quantityProduced,
          routing_notes: routingNotes || null,
        });
        await replaceLines.mutateAsync({ bomId: bom.id, lines: result.lines });
      } else {
        await createBom.mutateAsync({
          p_product_id: productId,
          p_lines: result.lines,
          p_version: version || undefined,
          p_quantity_produced: quantityProduced,
          p_routing_notes: routingNotes || undefined,
          p_activate: activate,
        });
      }
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }

  const isLoading = productsLoading || (isEdit && linesLoading);
  const isSaving = createBom.isPending || updateHeader.isPending || replaceLines.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Bill of Materials' : 'Create Bill of Materials'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update version, output quantity, routing notes or replace the component list.'
              : 'Define a new BOM version for a finished product. Components and quantities are required.'}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="bom-product">Finished product *</Label>
                <Select
                  value={productId}
                  onValueChange={setProductId}
                  disabled={isEdit}
                >
                  <SelectTrigger id="bom-product">
                    <SelectValue placeholder="Pick a product to manufacture" />
                  </SelectTrigger>
                  <SelectContent>
                    {productOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isEdit && (
                  <p className="text-xs text-muted-foreground">
                    Finished product is locked. Create a new BOM to change it.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="bom-version">Version</Label>
                <Input
                  id="bom-version"
                  value={version}
                  placeholder="v1, 2026-Q1, …"
                  onChange={(e) => setVersion(e.target.value)}
                  maxLength={50}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bom-qty">Quantity produced per run *</Label>
                <Input
                  id="bom-qty"
                  type="number"
                  min={0.0001}
                  step="any"
                  value={quantityProduced}
                  onChange={(e) => setQuantityProduced(Number(e.target.value))}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="bom-notes">Routing notes</Label>
                <Textarea
                  id="bom-notes"
                  rows={2}
                  value={routingNotes}
                  onChange={(e) => setRoutingNotes(e.target.value)}
                  placeholder="Assembly steps, tooling, references…"
                  maxLength={1000}
                />
              </div>

              {!isEdit && (
                <div className="flex items-center justify-between rounded-md border p-3 md:col-span-2">
                  <div>
                    <Label htmlFor="bom-activate" className="text-sm">Set as active version</Label>
                    <p className="text-xs text-muted-foreground">
                      Other versions for the same product will be deactivated.
                    </p>
                  </div>
                  <Switch id="bom-activate" checked={activate} onCheckedChange={setActivate} />
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Components</h3>
                <Button type="button" size="sm" variant="outline" onClick={addLine}>
                  <Plus className="mr-1 h-4 w-4" /> Add component
                </Button>
              </div>

              <div className="space-y-2">
                {lines.map((line, idx) => (
                  <div
                    key={line.key}
                    className="grid gap-2 rounded-md border p-3 md:grid-cols-[1fr_110px_90px_90px_auto] md:items-end"
                  >
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Component {idx + 1} *</Label>
                      <Select
                        value={line.component_product_id}
                        onValueChange={(v) => updateLine(line.key, { component_product_id: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Pick a component product" />
                        </SelectTrigger>
                        <SelectContent>
                          {productOptions
                            .filter((p) => p.id !== productId)
                            .map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Qty *</Label>
                      <Input
                        type="number"
                        min={0.0001}
                        step="any"
                        value={line.quantity}
                        onChange={(e) => updateLine(line.key, { quantity: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Unit</Label>
                      <Input
                        value={line.unit ?? ''}
                        placeholder="pcs"
                        maxLength={20}
                        onChange={(e) => updateLine(line.key, { unit: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Scrap %</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="any"
                        value={line.scrap_pct ?? ''}
                        onChange={(e) =>
                          updateLine(line.key, {
                            scrap_pct: e.target.value === '' ? undefined : Number(e.target.value),
                          })
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLine(line.key)}
                      disabled={lines.length === 1}
                      aria-label={`Remove component ${idx + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {errors.length > 0 && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                <ul className="list-disc pl-5 space-y-1">
                  {errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving ? 'Saving…' : isEdit ? 'Save changes' : 'Create BOM'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
