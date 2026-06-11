import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase as supabaseTyped } from '@/integrations/supabase/client';
// New tables/RPCs not in generated types yet — bypass strict typing.
const supabase = supabaseTyped;
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  productId: string;
}

interface Variant {
  id: string;
  sku: string | null;
  barcode: string | null;
  price_delta_cents: number;
  stock_quantity: number | null;
  is_active: boolean;
  values: { attribute: string; value: string }[];
}

interface AttributeDraft {
  name: string;
  values: string[];
  input: string;
}

export function ProductVariantsPanel({ productId }: Props) {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<AttributeDraft[]>([
    { name: '', values: [], input: '' },
  ]);

  const variantsQuery = useQuery({
    queryKey: ['product-variants', productId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('manage_product_variant', {
        p_action: 'list',
        p_product_id: productId,
      });
      if (error) throw error;
      return ((data as { variants: Variant[] } | null)?.variants ?? []) as Variant[];
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      const attrs = drafts
        .filter(d => d.name.trim() && d.values.length)
        .map(d => ({ name: d.name.trim(), values: d.values }));
      if (!attrs.length) throw new Error('Add at least one attribute with values');
      const { data, error } = await supabase.rpc('manage_product_variant', {
        p_action: 'generate',
        p_product_id: productId,
        p_attributes: attrs,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Variants generated');
      qc.invalidateQueries({ queryKey: ['product-variants', productId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async (v: { id: string; patch: Partial<Variant> }) => {
      const { error } = await supabase.rpc('manage_product_variant', {
        p_action: 'update',
        p_variant_id: v.id,
        p_sku: v.patch.sku ?? null,
        p_price_delta_cents: v.patch.price_delta_cents ?? null,
        p_stock_quantity: v.patch.stock_quantity ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Saved');
      qc.invalidateQueries({ queryKey: ['product-variants', productId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deactivate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('manage_product_variant', {
        p_action: 'deactivate',
        p_variant_id: id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Deactivated');
      qc.invalidateQueries({ queryKey: ['product-variants', productId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateDraft = (i: number, patch: Partial<AttributeDraft>) =>
    setDrafts(d => d.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  const addValue = (i: number) => {
    const d = drafts[i];
    const v = d.input.trim();
    if (!v) return;
    if (d.values.includes(v)) return;
    updateDraft(i, { values: [...d.values, v], input: '' });
  };

  const removeValue = (i: number, v: string) =>
    updateDraft(i, { values: drafts[i].values.filter(x => x !== v) });

  return (
    <div className="space-y-4">
      {/* Attribute picker + generator */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Attributes</Label>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setDrafts(d => [...d, { name: '', values: [], input: '' }])}
            >
              <Plus className="h-3.5 w-3.5" /> Attribute
            </Button>
          </div>

          {drafts.map((d, i) => (
            <div key={i} className="space-y-2 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Name (e.g. Size, Color)"
                  value={d.name}
                  onChange={e => updateDraft(i, { name: e.target.value })}
                  className="h-8 text-sm"
                />
                {drafts.length > 1 && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => setDrafts(drafts.filter((_, idx) => idx !== i))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {d.values.map(v => (
                  <Badge key={v} variant="secondary" className="gap-1">
                    {v}
                    <button
                      type="button"
                      onClick={() => removeValue(i, v)}
                      className="ml-0.5 opacity-60 hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <Input
                  placeholder="Add value, press Enter"
                  value={d.input}
                  onChange={e => updateDraft(i, { input: e.target.value })}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addValue(i);
                    }
                  }}
                  className="h-7 w-44 text-xs"
                />
              </div>
            </div>
          ))}

          <Button
            type="button"
            size="sm"
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
            className="gap-2"
          >
            {generate.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Generate variants
          </Button>
        </CardContent>
      </Card>

      {/* Variant list */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Variants</Label>
        {variantsQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        ) : !variantsQuery.data?.length ? (
          <p className="text-xs text-muted-foreground">No variants yet. Add attributes and generate.</p>
        ) : (
          <div className="space-y-1.5">
            {variantsQuery.data.map(v => (
              <VariantRow
                key={v.id}
                variant={v}
                onSave={patch => update.mutate({ id: v.id, patch })}
                onDeactivate={() => deactivate.mutate(v.id)}
                saving={update.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function VariantRow({
  variant,
  onSave,
  onDeactivate,
  saving,
}: {
  variant: Variant;
  onSave: (p: Partial<Variant>) => void;
  onDeactivate: () => void;
  saving: boolean;
}) {
  const [sku, setSku] = useState(variant.sku ?? '');
  const [delta, setDelta] = useState(String(variant.price_delta_cents / 100));
  const [stock, setStock] = useState(variant.stock_quantity?.toString() ?? '');
  const dirty =
    sku !== (variant.sku ?? '') ||
    Number(delta) * 100 !== variant.price_delta_cents ||
    (stock === '' ? variant.stock_quantity !== null : Number(stock) !== variant.stock_quantity);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
      <div className="flex-1 min-w-[140px]">
        <div className="flex flex-wrap gap-1">
          {variant.values.map((v, i) => (
            <Badge key={i} variant="outline" className="text-xs font-normal">
              {v.attribute}: {v.value}
            </Badge>
          ))}
        </div>
      </div>
      <Input
        placeholder="SKU"
        value={sku}
        onChange={e => setSku(e.target.value)}
        className="h-8 w-32 text-xs"
      />
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">Δ</span>
        <Input
          type="number"
          step="0.01"
          value={delta}
          onChange={e => setDelta(e.target.value)}
          className="h-8 w-20 text-xs"
        />
      </div>
      <Input
        type="number"
        placeholder="Stock"
        value={stock}
        onChange={e => setStock(e.target.value)}
        className="h-8 w-20 text-xs"
      />
      <Switch checked={variant.is_active} disabled />
      <Button
        type="button"
        size="sm"
        variant={dirty ? 'default' : 'ghost'}
        disabled={!dirty || saving}
        onClick={() =>
          onSave({
            sku: sku || null,
            price_delta_cents: Math.round(Number(delta) * 100),
            stock_quantity: stock === '' ? null : Number(stock),
          })
        }
      >
        Save
      </Button>
      {variant.is_active && (
        <Button type="button" size="icon" variant="ghost" onClick={onDeactivate}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
