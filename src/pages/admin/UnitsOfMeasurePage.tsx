import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase as supabaseTyped } from '@/integrations/supabase/client';
// New tables/RPCs not in generated types yet — bypass strict typing.
const supabase = supabaseTyped;
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Category { id: string; name: string }
interface Uom {
  id: string;
  category_id: string;
  name: string;
  code: string | null;
  factor: number;
  is_reference: boolean;
  is_active: boolean;
}

export default function UnitsOfMeasurePage() {
  const qc = useQueryClient();
  const [newCat, setNewCat] = useState('');

  const catsQuery = useQuery({
    queryKey: ['uom-categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('uom_categories').select('id,name').order('name');
      if (error) throw error;
      return data as Category[];
    },
  });

  const uomsQuery = useQuery({
    queryKey: ['uoms'],
    queryFn: async () => {
      const { data, error } = await supabase.from('uoms').select('*').order('name');
      if (error) throw error;
      return data as Uom[];
    },
  });

  const createCat = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('uom_categories').insert({ name: newCat });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewCat('');
      qc.invalidateQueries({ queryKey: ['uom-categories'] });
      toast.success('Category created');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteCat = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('uom_categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['uom-categories'] });
      qc.invalidateQueries({ queryKey: ['uoms'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader title="Units of measure" description="Define categories and units. One reference unit per category; conversion uses factors." />

        <Card className="mb-4">
          <CardContent className="p-3 flex items-end gap-2">
            <div className="space-y-1 flex-1 max-w-xs">
              <label className="text-xs text-muted-foreground">New category</label>
              <Input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="Length, Weight…" className="h-8 text-sm" />
            </div>
            <Button size="sm" disabled={!newCat || createCat.isPending} onClick={() => createCat.mutate()}>
              {createCat.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add category
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {catsQuery.data?.map(cat => (
            <CategoryCard
              key={cat.id}
              category={cat}
              uoms={uomsQuery.data?.filter(u => u.category_id === cat.id) ?? []}
              onDelete={() => deleteCat.mutate(cat.id)}
            />
          ))}
        </div>
      </AdminPageContainer>
    </AdminLayout>
  );
}

function CategoryCard({ category, uoms, onDelete }: { category: Category; uoms: Uom[]; onDelete: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [factor, setFactor] = useState('1');
  const [isRef, setIsRef] = useState(false);

  const createUom = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('uoms').insert({
        category_id: category.id,
        name,
        code: code || null,
        factor: Number(factor),
        is_reference: isRef,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setName(''); setCode(''); setFactor('1'); setIsRef(false);
      qc.invalidateQueries({ queryKey: ['uoms'] });
      toast.success('Unit added');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async (u: { id: string; patch: Partial<Uom> }) => {
      const { error } = await supabase.from('uoms').update(u.patch).eq('id', u.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['uoms'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('uoms').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['uoms'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">{category.name}</CardTitle>
        <Button size="icon" variant="ghost" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {uoms.map(u => (
          <div key={u.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
            <span className="font-medium flex-1 min-w-[120px]">{u.name}</span>
            {u.code && <Badge variant="outline" className="text-xs">{u.code}</Badge>}
            {u.is_reference && <Badge className="text-xs">Reference</Badge>}
            <span className="text-xs text-muted-foreground">× {u.factor}</span>
            <label className="flex items-center gap-1 text-xs">
              <Switch checked={u.is_active} onCheckedChange={v => update.mutate({ id: u.id, patch: { is_active: v } })} /> Active
            </label>
            <Button size="icon" variant="ghost" onClick={() => remove.mutate(u.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        ))}

        <div className="flex flex-wrap items-end gap-2 rounded-md border-dashed border p-2">
          <Input placeholder="Name (Gram)" value={name} onChange={e => setName(e.target.value)} className="h-8 w-32 text-xs" />
          <Input placeholder="Code (g)" value={code} onChange={e => setCode(e.target.value)} className="h-8 w-20 text-xs" />
          <Input type="number" step="0.000001" placeholder="Factor" value={factor} onChange={e => setFactor(e.target.value)} className="h-8 w-24 text-xs" />
          <label className="flex items-center gap-1 text-xs"><Switch checked={isRef} onCheckedChange={setIsRef} /> Reference</label>
          <Button size="sm" disabled={!name || !factor || createUom.isPending} onClick={() => createUom.mutate()}>
            {createUom.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add unit
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
