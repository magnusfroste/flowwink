import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type EntityType = 'lead' | 'deal' | 'ticket';

interface Stage {
  id: string;
  entity_type: EntityType;
  key: string;
  name: string;
  sort_order: number;
  probability: number | null;
  is_won: boolean;
  is_lost: boolean;
  fold: boolean;
  is_active: boolean;
}

const TYPES: { value: EntityType; label: string }[] = [
  { value: 'lead', label: 'Leads' },
  { value: 'deal', label: 'Deals' },
  { value: 'ticket', label: 'Tickets' },
];

export default function PipelineStagesPage() {
  const [active, setActive] = useState<EntityType>('lead');

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader title="Pipeline stages" description="Columns that drive CRM kanbans for leads, deals, and tickets." />
        <Tabs value={active} onValueChange={v => setActive(v as EntityType)}>
          <TabsList>
            {TYPES.map(t => (
              <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
            ))}
          </TabsList>
          {TYPES.map(t => (
            <TabsContent key={t.value} value={t.value} className="mt-4">
              <StageList entityType={t.value} />
            </TabsContent>
          ))}
        </Tabs>
      </AdminPageContainer>
    </AdminLayout>
  );
}

function StageList({ entityType }: { entityType: EntityType }) {
  const qc = useQueryClient();
  const [newKey, setNewKey] = useState('');
  const [newName, setNewName] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['pipeline-stages', entityType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('*')
        .eq('entity_type', entityType)
        .order('sort_order');
      if (error) throw error;
      return data as Stage[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('manage_pipeline_stage', {
        p_action: 'create',
        p_entity_type: entityType,
        p_key: newKey,
        p_name: newName,
        p_sort_order: (data?.length ?? 0) * 10 + 10,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewKey('');
      setNewName('');
      qc.invalidateQueries({ queryKey: ['pipeline-stages', entityType] });
      toast.success('Stage created');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async (s: Partial<Stage> & { id: string }) => {
      const { error } = await supabase.rpc('manage_pipeline_stage', {
        p_action: 'update',
        p_stage_id: s.id,
        p_name: s.name ?? null,
        p_sort_order: s.sort_order ?? null,
        p_probability: s.probability ?? null,
        p_is_won: s.is_won ?? null,
        p_is_lost: s.is_lost ?? null,
        p_fold: s.fold ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipeline-stages', entityType] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('manage_pipeline_stage', {
        p_action: 'delete',
        p_stage_id: id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline-stages', entityType] });
      toast.success('Stage deleted');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3 flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Key</label>
            <Input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="qualified" className="h-8 w-36 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Name</label>
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Qualified" className="h-8 w-40 text-sm" />
          </div>
          <Button size="sm" disabled={!newKey || !newName || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add stage
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="space-y-1.5">
          {data?.map(s => (
            <StageRow key={s.id} stage={s} onUpdate={update.mutate} onDelete={() => remove.mutate(s.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function StageRow({
  stage,
  onUpdate,
  onDelete,
}: {
  stage: Stage;
  onUpdate: (s: Partial<Stage> & { id: string }) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(stage.name);
  const [order, setOrder] = useState(String(stage.sort_order));
  const [prob, setProb] = useState(stage.probability?.toString() ?? '');

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
      <span className="text-xs font-mono text-muted-foreground w-24 truncate">{stage.key}</span>
      <Input value={name} onChange={e => setName(e.target.value)} onBlur={() => name !== stage.name && onUpdate({ id: stage.id, name })} className="h-8 w-40 text-sm" />
      <Input type="number" value={order} onChange={e => setOrder(e.target.value)} onBlur={() => Number(order) !== stage.sort_order && onUpdate({ id: stage.id, sort_order: Number(order) })} className="h-8 w-20 text-sm" />
      <Input type="number" placeholder="%" value={prob} onChange={e => setProb(e.target.value)} onBlur={() => onUpdate({ id: stage.id, probability: prob === '' ? null : Number(prob) })} className="h-8 w-20 text-sm" />
      <label className="flex items-center gap-1 text-xs"><Switch checked={stage.is_won} onCheckedChange={v => onUpdate({ id: stage.id, is_won: v })} /> Won</label>
      <label className="flex items-center gap-1 text-xs"><Switch checked={stage.is_lost} onCheckedChange={v => onUpdate({ id: stage.id, is_lost: v })} /> Lost</label>
      <label className="flex items-center gap-1 text-xs"><Switch checked={stage.fold} onCheckedChange={v => onUpdate({ id: stage.id, fold: v })} /> Fold</label>
      <Button size="icon" variant="ghost" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
    </div>
  );
}
