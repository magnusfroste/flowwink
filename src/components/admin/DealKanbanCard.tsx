import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, GripVertical } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { formatPrice } from '@/hooks/useProducts';
import type { Deal } from '@/hooks/useDeals';
import { cn } from '@/lib/utils';

interface DealKanbanCardProps {
  deal: Deal;
}

export function DealKanbanCard({ deal }: DealKanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: deal.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        'cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-50 shadow-lg ring-2 ring-primary'
      )}
      {...attributes}
      {...listeners}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">
              {deal.product?.name || 'Custom deal'}
            </p>
            <p className="text-lg font-bold">
              {formatPrice(deal.value_cents, deal.currency)}
            </p>
          </div>
          <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
        </div>
        
        <Link 
          to={`/admin/leads/${deal.lead_id}`}
          className="text-xs text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          View Lead →
        </Link>

        {deal.expected_close && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {format(new Date(deal.expected_close), 'MMM d, yyyy')}
          </div>
        )}

        {deal.notes && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {deal.notes}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
