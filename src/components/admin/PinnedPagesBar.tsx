import { Link, useLocation } from 'react-router-dom';
import { FileText, PinOff } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useIsMobile } from '@/hooks/use-mobile';
import { movePin, usePinnedPages, type PinnedPage } from '@/hooks/usePinnedPages';
import { cn } from '@/lib/utils';

const iconMap = LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>;

/**
 * The header's pinned pages — now in the order the user wants them.
 *
 * Order is the array in profiles.preferences.pinned_pages; dragging just
 * rewrites it through the same optimistic write pin/unpin already uses.
 * Three things keep this from being the slow, flaky drag-and-drop people
 * expect: an 8 px activation distance so a click is still a click (pins are
 * links), no drag at all under the tablet breakpoint where touch-drag fights
 * page scroll (order there comes from the sidebar), and a list that is at
 * most eight items wide, which dnd-kit measures for free.
 */
export function PinnedPagesBar({ userId }: { userId: string | undefined }) {
  const { pins, removePin, reorderPins } = usePinnedPages(userId);
  const isMobile = useIsMobile();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = pins.findIndex((p) => p.href === active.id);
    const to = pins.findIndex((p) => p.href === over.id);
    reorderPins(movePin(pins, from, to));
  };

  if (pins.length === 0) {
    return (
      <span className="text-xs text-muted-foreground/50 ml-1 select-none">
        Pin pages here for quick access
      </span>
    );
  }

  const items = pins.map((pin) => (
    <PinItem key={pin.href} pin={pin} draggable={!isMobile} onRemove={() => removePin(pin.href)} />
  ));

  if (isMobile) return <>{items}</>;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={pins.map((p) => p.href)} strategy={horizontalListSortingStrategy}>
        {items}
      </SortableContext>
    </DndContext>
  );
}

function PinItem({ pin, draggable, onRemove }: { pin: PinnedPage; draggable: boolean; onRemove: () => void }) {
  const location = useLocation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: pin.href,
    disabled: !draggable,
  });
  const Icon = iconMap[pin.icon] ?? FileText;
  // dnd-kit hands out role="button" for a sortable; a pin IS a link and
  // screen readers should keep hearing it as one.
  const { role: _sortableRole, ...a11y } = attributes;
  const isActive =
    location.pathname === pin.href ||
    (pin.href !== '/admin' && location.pathname.startsWith(pin.href));

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          ref={setNodeRef}
          to={pin.href}
          style={{ transform: CSS.Transform.toString(transform), transition }}
          {...a11y}
          {...listeners}
          // A drag that ended over the same spot still counts as a click for
          // the pointer sensor; a real drag (past the 8 px threshold) does not
          // — but the link's own navigation must be stopped while dragging.
          onClick={(e) => { if (isDragging) e.preventDefault(); }}
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors touch-none',
            draggable && 'cursor-grab active:cursor-grabbing',
            isDragging && 'opacity-60 shadow-md bg-background z-10',
            isActive
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted',
          )}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden sm:inline">{pin.name}</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="flex items-center gap-2">
        {pin.name}
        <button
          onClick={(e) => { e.preventDefault(); onRemove(); }}
          className="text-muted-foreground hover:text-destructive"
          aria-label={`Unpin ${pin.name}`}
        >
          <PinOff className="h-3 w-3" />
        </button>
      </TooltipContent>
    </Tooltip>
  );
}
