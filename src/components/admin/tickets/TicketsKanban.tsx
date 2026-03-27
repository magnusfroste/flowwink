import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  type Ticket,
  type TicketStatus,
  TICKET_STATUS_LABELS,
  TICKET_PRIORITY_COLORS,
  TICKET_PRIORITY_LABELS,
  TICKET_CATEGORY_LABELS,
  useUpdateTicket,
} from "@/hooks/useTickets";
import { formatDistanceToNow } from "date-fns";

const KANBAN_COLUMNS: TicketStatus[] = ["new", "open", "in_progress", "waiting", "resolved"];

interface TicketsKanbanProps {
  tickets: Ticket[];
  isLoading: boolean;
}

export function TicketsKanban({ tickets, isLoading }: TicketsKanbanProps) {
  const updateTicket = useUpdateTicket();

  const columns = useMemo(() => {
    return KANBAN_COLUMNS.map((status) => ({
      status,
      label: TICKET_STATUS_LABELS[status],
      tickets: tickets.filter((t) => t.status === status),
    }));
  }, [tickets]);

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {KANBAN_COLUMNS.map((col) => (
          <div key={col} className="min-w-[280px] flex-1">
            <Skeleton className="h-8 w-32 mb-3" />
            <div className="space-y-2">
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <ScrollArea className="w-full">
      <div className="flex gap-4 pb-4 min-w-max">
        {columns.map((col) => (
          <div key={col.status} className="w-[300px] flex-shrink-0">
            <div className="flex items-center gap-2 mb-3 px-1">
              <h3 className="text-sm font-medium text-muted-foreground">{col.label}</h3>
              <Badge variant="secondary" className="text-xs">
                {col.tickets.length}
              </Badge>
            </div>
            <div className="space-y-2">
              {col.tickets.map((ticket) => (
                <TicketCard key={ticket.id} ticket={ticket} />
              ))}
              {col.tickets.length === 0 && (
                <div className="rounded-lg border border-dashed border-muted-foreground/20 p-6 text-center text-xs text-muted-foreground">
                  No tickets
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}

function TicketCard({ ticket }: { ticket: Ticket }) {
  return (
    <Card className="cursor-pointer hover:shadow-sm transition-shadow">
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
