import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type EntityType = 'lead' | 'deal' | 'ticket';

interface Stage {
  id: string;
  key: string;
  name: string;
  sort_order: number;
  is_won: boolean;
  is_lost: boolean;
}

interface Record {
  id: string;
  stage_id: string | null;
  title: string;
  subtitle?: string | null;
}

const CONFIG: Record<EntityType, { table: 'leads' | 'deals' | 'tickets'; titleCol: string; subtitleCol?: string; link: (id: string) => string }> = {
  lead: { table: 'leads', titleCol: 'name', subtitleCol: 'email', link: id => `/admin/leads/${id}` },
  deal: { table: 'deals', titleCol: 'title', subtitleCol: 'value_cents', link: id => `/admin/deals/${id}` },
  ticket: { table: 'tickets', titleCol: 'subject', subtitleCol: 'priority', link: id => `/admin/tickets` },
};

export default function PipelinesPage() {
  return (
    <AdminLayout>
      <AdminPageContainer>
        <div className="flex items-center justify-between mb-4">
          <AdminPageHeader title="Pipelines" description="Kanban boards driven by configurable stages." />
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/pipelines/stages"><Settings className="h-3.5 w-3.5" /> Manage stages</Link>
          </Button>
        </div>
        <Tabs defaultValue="lead">
          <TabsList>
            <TabsTrigger value="lead">Leads</TabsTrigger>
            <TabsTrigger value="deal">Deals</TabsTrigger>
            <TabsTrigger value="ticket">Tickets</TabsTrigger>
          </TabsList>
          <TabsContent value="lead" className="mt-4"><Board entityType="lead" /></TabsContent>
          <TabsContent value="deal" className="mt-4"><Board entityType="deal" /></TabsContent>
          <TabsContent value="ticket" className="mt-4"><Board entityType="ticket" /></TabsContent>
        </Tabs>
      </AdminPageContainer>
    </AdminLayout>
  );
}

function Board({ entityType }: { entityType: EntityType }) {
  const qc = useQueryClient();
  const cfg = CONFIG[entityType];

  const stagesQuery = useQuery({
    queryKey: ['pipeline-stages', entityType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('id,key,name,sort_order,is_won,is_lost')
        .eq('entity_type', entityType)
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data as Stage[];
    },
  });

  const recordsQuery = useQuery({
    queryKey: ['pipeline-records', entityType],
    queryFn: async () => {
      const cols = ['id', 'stage_id', cfg.titleCol, cfg.subtitleCol].filter(Boolean).join(',');
      const { data, error } = await supabase.from(cfg.table).select(cols).limit(500);
      if (error) throw error;
      return (data as any[]).map(r => ({
        id: r.id,
        stage_id: r.stage_id,
        title: r[cfg.titleCol] ?? '(untitled)',
        subtitle: cfg.subtitleCol ? String(r[cfg.subtitleCol] ?? '') : null,
      })) as Record[];
    },
  });

  const move = useMutation({
    mutationFn: async (input: { id: string; stage_id: string }) => {
      const { error } = await supabase.from(cfg.table).update({ stage_id: input.stage_id }).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipeline-records', entityType] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const grouped = useMemo(() => {
    const out: Record[][] = (stagesQuery.data ?? []).map(() => []);
    const idx = new Map((stagesQuery.data ?? []).map((s, i) => [s.id, i]));
    (recordsQuery.data ?? []).forEach(r => {
      if (r.stage_id && idx.has(r.stage_id)) out[idx.get(r.stage_id)!].push(r);
    });
    return out;
  }, [stagesQuery.data, recordsQuery.data]);

  if (stagesQuery.isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[400px] min-w-[260px] flex-1" />)}
      </div>
    );
  }
  if (!stagesQuery.data?.length) {
    return <p className="text-sm text-muted-foreground">No stages configured. <Link className="underline" to="/admin/pipelines/stages">Add some</Link>.</p>;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragEnd={(e: DragEndEvent) => {
        const id = e.active.id as string;
        const overId = e.over?.id as string | undefined;
        if (!overId) return;
        const rec = recordsQuery.data?.find(r => r.id === id);
        if (!rec || rec.stage_id === overId) return;
        move.mutate({ id, stage_id: overId });
      }}
    >
      <div className="flex gap-3 overflow-x-auto pb-2">
        {stagesQuery.data.map((stage, i) => (
          <Column key={stage.id} stage={stage} records={grouped[i]} link={cfg.link} />
        ))}
      </div>
    </DndContext>
  );
}

function Column({ stage, records, link }: { stage: Stage; records: Record[]; link: (id: string) => string }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div className="flex flex-col min-w-[260px] max-w-[300px] flex-1">
      <Card className={cn('flex flex-col h-full', isOver && 'ring-2 ring-primary bg-primary/5')}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Badge variant={stage.is_won ? 'default' : stage.is_lost ? 'destructive' : 'secondary'}>{stage.name}</Badge>
            <span className="font-normal text-muted-foreground">{records.length}</span>
          </CardTitle>
        </CardHeader>
        <CardContent ref={setNodeRef} className="flex-1 space-y-1.5 min-h-[200px]">
          {records.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">No items</p>
          ) : records.map(r => <Item key={r.id} record={r} link={link(r.id)} />)}
        </CardContent>
      </Card>
    </div>
  );
}

function Item({ record, link }: { record: Record; link: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: record.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn('rounded-md border bg-card p-2 cursor-grab active:cursor-grabbing', isDragging && 'opacity-50')}
    >
      <Link to={link} className="text-sm font-medium hover:underline block truncate">{record.title}</Link>
      {record.subtitle && <p className="text-xs text-muted-foreground truncate">{record.subtitle}</p>}
    </div>
  );
}
