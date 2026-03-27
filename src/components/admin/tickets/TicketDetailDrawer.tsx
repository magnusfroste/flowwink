import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type Ticket,
  type TicketStatus,
  type TicketPriority,
  TICKET_STATUS_LABELS,
  TICKET_STATUS_COLORS,
  TICKET_PRIORITY_LABELS,
  TICKET_PRIORITY_COLORS,
  TICKET_CATEGORY_LABELS,
  useUpdateTicket,
  useTicketComments,
  useAddTicketComment,
} from "@/hooks/useTickets";
import { formatDistanceToNow, format } from "date-fns";
import { MessageSquare, Send, Building2, User, Mail, Clock, Tag } from "lucide-react";

interface TicketDetailDrawerProps {
  ticket: Ticket | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TicketDetailDrawer({ ticket, open, onOpenChange }: TicketDetailDrawerProps) {
  const updateTicket = useUpdateTicket();
  const { data: comments = [] } = useTicketComments(ticket?.id);
  const addComment = useAddTicketComment();
  const [newComment, setNewComment] = useState("");

  if (!ticket) return null;

  const handleStatusChange = (status: TicketStatus) => {
    const updates: Partial<Ticket> & { id: string } = { id: ticket.id, status };
    if (status === "resolved") updates.resolved_at = new Date().toISOString();
    if (status === "closed") updates.closed_at = new Date().toISOString();
    updateTicket.mutate(updates);
  };

  const handlePriorityChange = (priority: TicketPriority) => {
    updateTicket.mutate({ id: ticket.id, priority });
  };

  const handleAddComment = () => {
    if (!newComment.trim()) return;
    addComment.mutate(
      { ticket_id: ticket.id, content: newComment.trim() },
      { onSuccess: () => setNewComment("") }
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[520px] p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4">
          <SheetTitle className="text-left text-base leading-tight pr-4">
            {ticket.subject}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 px-6">
          {/* Status & Priority Controls */}
          <div className="flex gap-3 mb-4">
            <Select value={ticket.status} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(TICKET_STATUS_LABELS) as [TicketStatus, string][]).map(
                  ([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
            <Select value={ticket.priority} onValueChange={handlePriorityChange}>
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(TICKET_PRIORITY_LABELS) as [TicketPriority, string][]).map(
                  ([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Meta Info */}
          <div className="space-y-2 text-sm mb-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Tag className="h-3.5 w-3.5" />
              <span>{TICKET_CATEGORY_LABELS[ticket.category]}</span>
            </div>
            {ticket.contact_name && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="h-3.5 w-3.5" />
                <span>{ticket.contact_name}</span>
              </div>
            )}
            {ticket.contact_email && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                <span>{ticket.contact_email}</span>
              </div>
            )}
            {ticket.company && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" />
                <span>{ticket.company.name}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>{format(new Date(ticket.created_at), "PPp")}</span>
            </div>
          </div>

          {/* Description */}
          {ticket.description && (
            <>
              <Separator className="my-4" />
              <div className="text-sm whitespace-pre-wrap text-foreground/90">
                {ticket.description}
              </div>
            </>
          )}

          {/* Comments */}
          <Separator className="my-4" />
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">Comments ({comments.length})</h4>
          </div>

          <div className="space-y-3 mb-4">
            {comments.map((c) => (
              <div
                key={c.id}
                className={`rounded-lg p-3 text-sm ${
                  c.is_internal
                    ? "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"
                    : "bg-muted"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-xs">
                    {c.author_name || "Agent"}
                    {c.is_internal && (
                      <Badge variant="outline" className="ml-2 text-[10px]">Internal</Badge>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </span>
                </div>
                <p className="whitespace-pre-wrap">{c.content}</p>
              </div>
            ))}
            {comments.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No comments yet</p>
            )}
          </div>
        </ScrollArea>

        {/* Comment Input */}
        <div className="border-t p-4 space-y-2">
          <Textarea
            placeholder="Add a comment..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            rows={2}
            className="text-sm resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAddComment();
            }}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleAddComment}
              disabled={!newComment.trim() || addComment.isPending}
            >
              <Send className="h-3.5 w-3.5 mr-1" />
              Send
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
