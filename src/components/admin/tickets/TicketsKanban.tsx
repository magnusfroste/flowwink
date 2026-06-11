import { useState } from 'react';
import {
  DndContext, DragOverlay, closestCorners, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragStartEvent, DragEndEvent, useDroppable,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  type Ticket, type TicketStatus,
  TICKET_PRIORITY_COLORS, TICKET_PRIORITY_LABELS, TICKET_CATEGORY_LABELS,
  useUpdateTicket,
} from '@/hooks/useTickets';
import { usePipelineStages, getStageColor, type PipelineStage } from '@/hooks/usePipelineStages';
import { TicketDetailDrawer } from './TicketDetailDrawer';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface TicketsKanbanProps {
  tickets: Ticket[];
  isLoading: boolean;
}

export function TicketsKanban({ tickets, isLoading }: TicketsKanbanProps) {
  const { data: stages = [], isLoading: stagesLoading } = usePipelineStages('ticket');
  const updateTicket = useUpdateTicket();
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const stageByKey = new Map(stages.map(s => [s.key, s]));
  const stageById = new Map(stages.map(s => [s.id, s]));

  const ticketStageId = (t: Ticket): string | null => {
    const anyT = t as Ticket & { stage_id?: string | null };
    if (anyT.stage_id && stageById.has(anyT.stage_id)) return anyT.stage_id;
    const byKey = stageByKey.get(t.status as string);
    return byKey ? byKey.id : null;
  };

  const byStage: Record<string, Ticket[]> = {};
  for (const s of stages) byStage[s.id] = [];
  for (const t of tickets) {
    const sid = ticketStageId(t);
    if (sid) (byStage[sid] ??= []).push(t);
  }

  const activeTicket = activeId ? tickets.find(t => t.id === activeId) : null;

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const ticket = tickets.find(t => t.id === active.id);
    if (!ticket) return;
    let target = stageById.get(over.id as string);
    if (!target) {
      const t = tickets.find(x => x.id === over.id);
      if (t) {
        const sid = ticketStageId(t);
        if (sid) target = stageById.get(sid);
      }
    }
    if (!target) return;
    const current = ticketStageId(ticket);
    if (current === target.id) return;
    updateTicket.mutate({
      id: ticket.id,
      stage_id: target.id,
      status: target.key as TicketStatus,
    } as Partial<Ticket> & { id: string; stage_id: string });
  };

  if (isLoading || stagesLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="min-w-[280px] flex-1">
            <Skeleton className="h-8 w-32 mb-3" />
            <div className="space-y-2"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(e: DragStartEvent) => setActiveId(e.active.id as string)}
        onDragEnd={handleDragEnd}
      >
        <ScrollArea className="w-full">
          <div className="flex gap-4 pb-4 min-w-max">
            {stages.map((stage, idx) => (
              <TicketColumn
                key={stage.id}
                stage={stage}
                index={idx}
                tickets={byStage[stage.id] ?? []}
                onTicketClick={setSelectedTicket}
              />
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        <DragOverlay>
          {activeTicket && (
            <Card className="shadow-lg ring-2 ring-primary opacity-90 w-[280px]">
              <CardContent className="p-3">
                <p className="text-sm font-medium line-clamp-2">{activeTicket.subject}</p>
              </CardContent>
            </Card>
          )}
        </DragOverlay>
      </DndContext>

      <TicketDetailDrawer
        ticket={selectedTicket}
        open={!!selectedTicket}
        onOpenChange={(open) => !open && setSelectedTicket(null)}
      />
    </>
  );
}

function TicketColumn({
  stage, index, tickets, onTicketClick,
}: {
  stage: PipelineStage; index: number; tickets: Ticket[];
  onTicketClick: (t: Ticket) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div className={cn('w-[300px] flex-shrink-0', stage.fold && 'w-[160px]')}>
      <Card className={cn('flex flex-col h-full', isOver && 'ring-2 ring-primary bg-primary/5')}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Badge className={getStageColor(stage, index)} variant="secondary">{stage.name}</Badge>
            <span className="text-xs font-normal text-muted-foreground">{tickets.length}</span>
          </CardTitle>
        </CardHeader>
        <CardContent ref={setNodeRef} className="flex-1 space-y-2 min-h-[200px] overflow-y-auto">
          <SortableContext items={tickets.map(t => t.id)} strategy={verticalListSortingStrategy}>
            {tickets.map(t => (
              <TicketCardDraggable key={t.id} ticket={t} onClick={() => onTicketClick(t)} />
            ))}
            {tickets.length === 0 && (
              <div className="rounded-lg border border-dashed border-muted-foreground/20 p-6 text-center text-xs text-muted-foreground">
                No tickets
              </div>
            )}
          </SortableContext>
        </CardContent>
      </Card>
    </div>
  );
}

function TicketCardDraggable({ ticket, onClick }: { ticket: Ticket; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ticket.id });
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
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-tight line-clamp-2">{ticket.subject}</p>
          <Badge
            variant="outline"
            className={`text-[10px] shrink-0 ${TICKET_PRIORITY_COLORS[ticket.priority]}`}
          >
            {TICKET_PRIORITY_LABELS[ticket.priority]}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className="text-[10px]">
            {TICKET_CATEGORY_LABELS[ticket.category]}
          </Badge>
          <span>·</span>
          <span>{formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}</span>
        </div>
        {(ticket.contact_name || ticket.contact_email) && (
          <p className="text-xs text-muted-foreground truncate">
            {ticket.contact_name || ticket.contact_email}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
