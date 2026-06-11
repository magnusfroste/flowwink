/**
 * LeadKanban — drag-drop board for contacts, columns sourced from
 * pipeline_stages where entity_type='lead'. Drops set leads.stage_id; the
 * sync_lead_stage trigger keeps the legacy leads.status enum in lockstep.
 */
import { useState } from 'react';
import {
  DndContext, DragOverlay, closestCorners, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragStartEvent, DragEndEvent, useDroppable,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Users } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { usePipelineStages, getStageColor, type PipelineStage } from '@/hooks/usePipelineStages';
import type { LeadWithCompany } from '@/hooks/useLeads';

interface Props {
  leads: LeadWithCompany[];
  isLoading?: boolean;
  onLeadClick?: (id: string) => void;
}

export function LeadKanban({ leads, isLoading, onLeadClick }: Props) {
  const { data: stages = [], isLoading: stagesLoading } = usePipelineStages('lead');
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const stageByKey = new Map(stages.map(s => [s.key, s]));
  const stageById = new Map(stages.map(s => [s.id, s]));

  const leadStageId = (l: LeadWithCompany): string | null => {
    const anyL = l as LeadWithCompany & { stage_id?: string | null };
    if (anyL.stage_id && stageById.has(anyL.stage_id)) return anyL.stage_id;
    const byKey = stageByKey.get(l.status as string);
    return byKey ? byKey.id : null;
  };

  const updateStage = useMutation({
    mutationFn: async (input: { id: string; stage_id: string; status: string }) => {
      const { error } = await supabase
        .from('leads')
        .update({ stage_id: input.stage_id, status: input.status as never })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['leadStats'] });
    },
    onError: (e: Error) => toast.error(`Failed to update stage: ${e.message}`),
  });

  const byStage: Record<string, LeadWithCompany[]> = {};
  for (const s of stages) byStage[s.id] = [];
  for (const l of leads) {
    const sid = leadStageId(l);
    if (sid) (byStage[sid] ??= []).push(l);
  }

  const activeLead = activeId ? leads.find(l => l.id === activeId) : null;

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const lead = leads.find(l => l.id === active.id);
    if (!lead) return;
    let target = stageById.get(over.id as string);
    if (!target) {
      const t = leads.find(l => l.id === over.id);
      if (t) {
        const sid = leadStageId(t);
        if (sid) target = stageById.get(sid);
      }
    }
    if (!target) return;
    const current = leadStageId(lead);
    if (current === target.id) return;
    updateStage.mutate({ id: lead.id, stage_id: target.id, status: target.key });
  };

  if (isLoading || stagesLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="min-w-[260px] flex-1">
            <Skeleton className="h-[300px]" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={(e: DragStartEvent) => setActiveId(e.active.id as string)}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage, idx) => (
          <LeadColumn
            key={stage.id}
            stage={stage}
            index={idx}
            leads={byStage[stage.id] ?? []}
            onLeadClick={onLeadClick}
          />
        ))}
      </div>
      <DragOverlay>
        {activeLead && (
          <Card className="shadow-lg ring-2 ring-primary opacity-90 w-[260px]">
            <CardContent className="p-3">
              <p className="font-medium text-sm">{activeLead.name || activeLead.email}</p>
              {activeLead.companies?.name && (
                <p className="text-xs text-muted-foreground">{activeLead.companies.name}</p>
              )}
            </CardContent>
          </Card>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function LeadColumn({
  stage, index, leads, onLeadClick,
}: { stage: PipelineStage; index: number; leads: LeadWithCompany[]; onLeadClick?: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div className={cn('flex flex-col min-w-[260px] max-w-[300px] flex-1', stage.fold && 'max-w-[140px] min-w-[140px]')}>
      <Card className={cn('flex flex-col h-full', isOver && 'ring-2 ring-primary bg-primary/5')}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Badge className={getStageColor(stage, index)} variant="secondary">{stage.name}</Badge>
            <span className="text-xs font-normal text-muted-foreground">{leads.length}</span>
          </CardTitle>
        </CardHeader>
        <CardContent ref={setNodeRef} className="flex-1 space-y-2 min-h-[200px] overflow-y-auto">
          <SortableContext items={leads.map(l => l.id)} strategy={verticalListSortingStrategy}>
            {leads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Users className="h-6 w-6 mb-2 opacity-40" />
                <p className="text-xs">No contacts</p>
              </div>
            ) : (
              leads.map(l => <LeadCardDraggable key={l.id} lead={l} onClick={() => onLeadClick?.(l.id)} />)
            )}
          </SortableContext>
        </CardContent>
      </Card>
    </div>
  );
}

function LeadCardDraggable({ lead, onClick }: { lead: LeadWithCompany; onClick?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lead.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="cursor-grab active:cursor-grabbing hover:shadow-sm transition-shadow"
    >
      <CardContent className="p-3 space-y-1">
        <p className="text-sm font-medium truncate">{lead.name || lead.email}</p>
        {lead.companies?.name && (
          <p className="text-xs text-muted-foreground truncate">{lead.companies.name}</p>
        )}
        {lead.score != null && (
          <p className="text-xs text-muted-foreground">Score {lead.score}</p>
        )}
      </CardContent>
    </Card>
  );
}
