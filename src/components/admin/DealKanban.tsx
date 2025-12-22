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
  DragOverEvent,
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
import { useUpdateDeal, getDealStageInfo, type Deal, type DealStage } from '@/hooks/useDeals';
import { formatPrice } from '@/hooks/useProducts';
import { cn } from '@/lib/utils';

interface DealKanbanProps {
  deals: Deal[];
  isLoading?: boolean;
}

const STAGES: DealStage[] = ['proposal', 'negotiation', 'closed_won', 'closed_lost'];

interface KanbanColumnProps {
  stage: DealStage;
  deals: Deal[];
  totalValue: number;
}

function KanbanColumn({ stage, deals, totalValue }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const stageInfo = getDealStageInfo(stage);
  const isActive = stage === 'proposal' || stage === 'negotiation';

  return (
    <div className="flex flex-col min-w-[280px] max-w-[320px] flex-1">
      <Card className={cn(
        'flex flex-col h-full transition-colors',
        isOver && 'ring-2 ring-primary bg-primary/5'
      )}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Badge className={stageInfo.color} variant="secondary">
                {stageInfo.label}
              </Badge>
              <span className="text-muted-foreground font-normal">
                {deals.length}
              </span>
            </CardTitle>
          </div>
          {isActive && totalValue > 0 && (
            <p className="text-xs text-muted-foreground">
              {formatPrice(totalValue)}
            </p>
          )}
        </CardHeader>
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
              deals.map(deal => (
                <DealKanbanCard key={deal.id} deal={deal} />
              ))
            )}
          </SortableContext>
        </CardContent>
      </Card>
    </div>
  );
}

export function DealKanban({ deals, isLoading }: DealKanbanProps) {
  const updateDeal = useUpdateDeal();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const activeDeal = activeId ? deals.find(d => d.id === activeId) : null;

  // Group deals by stage
  const dealsByStage = STAGES.reduce((acc, stage) => {
    acc[stage] = deals.filter(d => d.stage === stage);
    return acc;
  }, {} as Record<DealStage, Deal[]>);

  // Calculate totals per stage
  const valueTotals = STAGES.reduce((acc, stage) => {
    acc[stage] = dealsByStage[stage].reduce((sum, d) => sum + d.value_cents, 0);
    return acc;
  }, {} as Record<DealStage, number>);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const dealId = active.id as string;
    const deal = deals.find(d => d.id === dealId);
    if (!deal) return;

    // Determine target stage
    let targetStage: DealStage | null = null;

    // Check if dropped on a column (stage)
    if (STAGES.includes(over.id as DealStage)) {
      targetStage = over.id as DealStage;
    } else {
      // Dropped on another deal - find that deal's stage
      const targetDeal = deals.find(d => d.id === over.id);
      if (targetDeal) {
        targetStage = targetDeal.stage;
      }
    }

    // Update if stage changed
    if (targetStage && targetStage !== deal.stage) {
      updateDeal.mutate({ id: dealId, stage: targetStage });
    }
  };

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map(stage => (
          <div key={stage} className="min-w-[280px] max-w-[320px] flex-1">
            <Card className="h-[400px]">
              <CardHeader className="pb-2">
                <Skeleton className="h-6 w-24" />
              </CardHeader>
              <CardContent className="space-y-2">
                {[1, 2].map(i => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
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
        {STAGES.map(stage => (
          <KanbanColumn
            key={stage}
            stage={stage}
            deals={dealsByStage[stage]}
            totalValue={valueTotals[stage]}
          />
        ))}
      </div>

      <DragOverlay>
        {activeDeal ? (
          <Card className="shadow-lg ring-2 ring-primary opacity-90 w-[280px]">
            <CardContent className="p-3">
              <p className="font-medium text-sm">
                {activeDeal.product?.name || 'Custom deal'}
              </p>
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
