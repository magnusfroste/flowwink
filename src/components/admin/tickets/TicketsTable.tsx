import { useState, useEffect, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type Ticket,
  type TicketStatus,
  TICKET_STATUS_LABELS,
  TICKET_STATUS_COLORS,
  TICKET_PRIORITY_LABELS,
  TICKET_PRIORITY_COLORS,
  TICKET_CATEGORY_LABELS,
  useUpdateTicket,
} from "@/hooks/useTickets";
import { TicketDetailDrawer } from "./TicketDetailDrawer";
import { TicketSlaBadge } from "./TicketSlaBadge";
import { useTicketSlaMap } from "@/hooks/useTicketSla";
import { formatDistanceToNow } from "date-fns";
import { useTicketAssignees, assigneeLabel } from "@/hooks/useTicketAssignees";
import { useTicketTeams } from "@/hooks/useTicketTeams";

interface TicketsTableProps {
  tickets: Ticket[];
  isLoading: boolean;
  /** Optional ticket id to auto-open (deep link from SLA Monitor). */
  autoOpenTicketId?: string | null;
}

const BULK_STATUSES: TicketStatus[] = ['new', 'open', 'in_progress', 'waiting', 'resolved', 'closed'];

export function TicketsTable({ tickets, isLoading, autoOpenTicketId }: TicketsTableProps) {
  // The drawer's ticket is LOOKED UP from the fresh list by id — never held
  // as a copy. A held copy froze at open time, so an assignee change wrote to
  // the DB, the list refetched, and the drawer still showed the old value:
  // the update looked like it didn't stick (optic, 2026-08-11).
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { data: assignees = [] } = useTicketAssignees();
  const { data: teams = [] } = useTicketTeams();
  const updateTicket = useUpdateTicket();
  const slaMap = useTicketSlaMap(tickets);
  const assigneeById = useMemo(
    () => new Map(assignees.map((a) => [a.id, a])),
    [assignees]
  );

  // Deep link: open the drawer when an id is passed in from outside.
  useEffect(() => {
    if (!autoOpenTicketId) return;
    const found = tickets.find((t) => t.id === autoOpenTicketId);
    if (found) setSelectedTicketId(found.id);
  }, [autoOpenTicketId, tickets]);

  const allSelected = tickets.length > 0 && selectedIds.length === tickets.length;

  const toggleAll = () =>
    setSelectedIds(allSelected ? [] : tickets.map((t) => t.id));

  const toggleOne = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const applyBulk = async (updates: Partial<Ticket>) => {
    for (const id of selectedIds) {
      await updateTicket.mutateAsync({ id, ...updates });
    }
    setSelectedIds([]);
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="text-muted-foreground">No tickets yet</p>
      </div>
    );
  }

  return (
    <>
      {selectedIds.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">{selectedIds.length} selected</span>

          <Select onValueChange={(v) => applyBulk({ status: v as TicketStatus })}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="Set status" />
            </SelectTrigger>
            <SelectContent>
              {BULK_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{TICKET_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select onValueChange={(v) => applyBulk({ assigned_to: v === '__none' ? null : v })}>
            <SelectTrigger className="h-8 w-[170px] text-xs">
              <SelectValue placeholder="Assign to" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Unassigned</SelectItem>
              {assignees.map((a) => (
                <SelectItem key={a.id} value={a.id}>{assigneeLabel(a)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select onValueChange={(v) => applyBulk({ team_id: v === '__none' ? null : v })}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="Set team" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">No team</SelectItem>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
            Clear
          </Button>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all tickets"
                />
              </TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>SLA</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Requester</TableHead>
              <TableHead>Assigned to</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.map((ticket) => (
              <TableRow
                key={ticket.id}
                className="cursor-pointer"
                onClick={() => setSelectedTicketId(ticket.id)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.includes(ticket.id)}
                    onCheckedChange={() => toggleOne(ticket.id)}
                    aria-label={`Select ticket ${ticket.subject}`}
                  />
                </TableCell>
                <TableCell className="font-medium max-w-[300px] truncate">
                  {ticket.subject}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-[10px] capitalize">
                    {ticket.source || 'manual'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-xs ${TICKET_STATUS_COLORS[ticket.status]}`}>
                    {TICKET_STATUS_LABELS[ticket.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-xs ${TICKET_PRIORITY_COLORS[ticket.priority]}`}>
                    {TICKET_PRIORITY_LABELS[ticket.priority]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <TicketSlaBadge status={slaMap.get(ticket.id)} />
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {TICKET_CATEGORY_LABELS[ticket.category]}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1 max-w-[180px]">
                    {(ticket.tags ?? []).slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                    ))}
                    {(ticket.tags?.length ?? 0) > 3 && (
                      <Badge variant="outline" className="text-[10px]">+{ticket.tags.length - 3}</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground truncate max-w-[200px]">
                  {ticket.contact_name || ticket.contact_email || '—'}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground truncate max-w-[160px]">
                  {ticket.assigned_to
                    ? assigneeLabel(assigneeById.get(ticket.assigned_to))
                    : '—'}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
                </TableCell>
              </TableRow>
            ))}

          </TableBody>
        </Table>
      </div>

      <TicketDetailDrawer
        ticket={tickets.find((t) => t.id === selectedTicketId) ?? null}
        open={!!selectedTicketId}
        onOpenChange={(open) => !open && setSelectedTicketId(null)}
      />
    </>
  );
}
