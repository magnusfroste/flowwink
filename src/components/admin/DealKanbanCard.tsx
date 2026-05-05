import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, GripVertical, Building2, Package } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { formatPrice } from '@/hooks/useProducts';
import type { Deal } from '@/hooks/useDeals';
import { cn } from '@/lib/utils';
import { NextActivityBadge } from './deals/NextActivityBadge';
import { useOverdueActivityIndex } from '@/hooks/useOverdueActivityIndex';

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

  const contactName = deal.lead?.name || deal.lead?.email || 'Unknown contact';
  const companyName = deal.lead?.company?.name;
  const productName = deal.product?.name;

  const { data: overdue } = useOverdueActivityIndex();
  const hasOverdue = overdue?.dealIds.has(deal.id) ?? false;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative overflow-hidden',
        isDragging && 'opacity-50 shadow-lg ring-2 ring-primary',
        hasOverdue && 'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-destructive'
      )}
      {...attributes}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate" title={contactName}>
              {contactName}
            </p>
            {companyName && (
              <p className="text-xs text-muted-foreground truncate flex items-center gap-1" title={companyName}>
                <Building2 className="h-3 w-3 shrink-0" />
                {companyName}
              </p>
            )}
            <p className="text-lg font-bold mt-1">
              {formatPrice(deal.value_cents, deal.currency)}
            </p>
          </div>
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing touch-none p-1 -m-1 text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Drag deal"
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        </div>

        {productName && (
          <p className="text-xs text-muted-foreground truncate flex items-center gap-1" title={productName}>
            <Package className="h-3 w-3 shrink-0" />
            {productName}
          </p>
        )}

        <NextActivityBadge dealId={deal.id} />

        <Link
          to={`/admin/deals/${deal.id}`}
          className="text-xs text-primary hover:underline inline-block"
        >
          Open deal →
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
