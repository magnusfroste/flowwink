import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Briefcase } from 'lucide-react';
import { DealKanbanCard } from './DealKanbanCard';
import { useUpdateDeal, type Deal, type DealStage } from '@/hooks/useDeals';
import { usePipelineStages, getStageColor, type PipelineStage } from '@/hooks/usePipelineStages';
import { formatPrice } from '@/hooks/useProducts';
import { cn } from '@/lib/utils';

interface DealKanbanProps {
  deals: Deal[];
  isLoading?: boolean;
  onStageChanged?: (deal: Deal, newStage: DealStage) => void;
}

// WIP limits keyed by stage.key. Closed/fold columns are unbounded by default.
const WIP_LIMITS: Record<string, number> = {
  lead: 25,
  prospecting: 20,
  qualified: 15,
  proposal: 10,
  negotiation: 8,
};

interface KanbanColumnProps {
  stage: PipelineStage;
  index: number;
  deals: Deal[];
  totalValue: number;
  startCollapsed: boolean;
}

function KanbanColumn({ stage, index, deals, totalValue, startCollapsed }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const [collapsed, setCollapsed] = useState(startCollapsed);
  const isClosed = stage.is_won || stage.is_lost;
  const limit = WIP_LIMITS[stage.key] ?? 0;
  const overLimit = !isClosed && limit > 0 && deals.length > limit;
  const atLimit = !isClosed && limit > 0 && deals.length === limit;

  return (
    <div className={cn('flex flex-col min-w-[280px] max-w-[320px] flex-1', collapsed && 'max-w-[140px] min-w-[140px]')}>
      <Card className={cn(
        'flex flex-col h-full transition-colors',
        isOver && 'ring-2 ring-primary bg-primary/5',
        overLimit && 'ring-2 ring-destructive/60'
      )}>
        <CardHeader className="pb-2 cursor-pointer" onClick={() => setCollapsed(c => !c)}>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 min-w-0">
              <Badge className={getStageColor(stage, index)} variant="secondary">
                {stage.name}
              </Badge>
              <span className={cn(
                'font-normal text-xs',
                overLimit ? 'text-destructive font-semibold' : 'text-muted-foreground'
              )}>
                {deals.length}{limit > 0 ? ` / ${limit}` : ''}
              </span>
            </CardTitle>
          </div>
          {!collapsed && !isClosed && totalValue > 0 && (
            <p className="text-xs text-muted-foreground">{formatPrice(totalValue)}</p>
          )}
          {!collapsed && overLimit && (
            <p className="text-[11px] text-destructive font-medium">Over WIP limit</p>
          )}
          {!collapsed && atLimit && !overLimit && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">At WIP limit</p>
          )}
        </CardHeader>
        {!collapsed && (
          <CardContent
            ref={setNodeRef}
            className="flex-1 space-y-2 min-h-[200px] overflow-y-auto"
          >
            <SortableContext
              items={deals.map(d => d.id)}
              strategy={verticalListSortingStrategy}
            >
              {deals.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
                  <Briefcase className="h-6 w-6 mb-2 opacity-40" />
                  <p className="text-xs">No deals</p>
                </div>
              ) : (
                deals.map(deal => <DealKanbanCard key={deal.id} deal={deal} />)
              )}
            </SortableContext>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

export function DealKanban({ deals, isLoading, onStageChanged }: DealKanbanProps) {
  const updateDeal = useUpdateDeal();
  const { data: stages = [], isLoading: stagesLoading } = usePipelineStages('deal');
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const activeDeal = activeId ? deals.find(d => d.id === activeId) : null;

  // Map deals to their stage. Prefer stage_id when set, fall back to enum key.
  const stageByKey = new Map(stages.map(s => [s.key, s]));
  const stageById = new Map(stages.map(s => [s.id, s]));

  const dealStageId = (d: Deal): string | null => {
    const anyD = d as Deal & { stage_id?: string | null };
    if (anyD.stage_id && stageById.has(anyD.stage_id)) return anyD.stage_id;
    const byKey = stageByKey.get(d.stage as string);
    return byKey ? byKey.id : null;
  };

  const dealsByStage: Record<string, Deal[]> = {};
  for (const stage of stages) dealsByStage[stage.id] = [];
  for (const d of deals) {
    const sid = dealStageId(d);
    if (sid) (dealsByStage[sid] ??= []).push(d);
  }

  const totals: Record<string, number> = {};
  for (const stage of stages) {
    totals[stage.id] = (dealsByStage[stage.id] ?? []).reduce((s, d) => s + d.value_cents, 0);
  }

  const handleDragStart = (event: DragStartEvent) => setActiveId(event.active.id as string);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const deal = deals.find(d => d.id === active.id);
    if (!deal) return;

    let targetStage: PipelineStage | undefined = stageById.get(over.id as string);
    if (!targetStage) {
      const targetDeal = deals.find(d => d.id === over.id);
      if (targetDeal) {
        const tid = dealStageId(targetDeal);
        if (tid) targetStage = stageById.get(tid);
      }
    }
    if (!targetStage) return;
    const currentSid = dealStageId(deal);
    if (currentSid === targetStage.id) return;

    // Write stage_id; sync_deal_stage trigger keeps the enum column in sync.
    // We also pass `stage` so useUpdateDeal's closed_at + lead-bump logic fires.
    updateDeal.mutate({
      id: deal.id,
      stage_id: targetStage.id,
      stage: targetStage.key as DealStage,
    } as Partial<Deal> & { id: string; stage_id: string });
    onStageChanged?.(deal, targetStage.key as DealStage);
  };

  if (isLoading || stagesLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="min-w-[280px] max-w-[320px] flex-1">
            <Card className="h-[400px]">
              <CardHeader className="pb-2"><Skeleton className="h-6 w-24" /></CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage, idx) => (
          <KanbanColumn
            key={stage.id}
            stage={stage}
            index={idx}
            deals={dealsByStage[stage.id] ?? []}
            totalValue={totals[stage.id] ?? 0}
            startCollapsed={stage.fold}
          />
        ))}
      </div>

      <DragOverlay>
        {activeDeal ? (
          <Card className="shadow-lg ring-2 ring-primary opacity-90 w-[280px]">
            <CardContent className="p-3">
              <p className="font-medium text-sm">
                {activeDeal.lead?.name || activeDeal.lead?.email || 'Unknown contact'}
              </p>
              {activeDeal.lead?.company?.name && (
                <p className="text-xs text-muted-foreground">{activeDeal.lead.company.name}</p>
              )}
              <p className="text-lg font-bold">
                {formatPrice(activeDeal.value_cents, activeDeal.currency)}
              </p>
            </CardContent>
          </Card>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
