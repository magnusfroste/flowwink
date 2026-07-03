import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowDownLeft, ArrowUpRight, Bot, FileText, User } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { Link } from 'react-router-dom';
import { useLeadCommunications } from '@/hooks/useLeadCommunications';
import { useOpenQuotesByLead } from '@/hooks/useQuotesByLead';
import { CommunicationDetailDialog, type Comm } from '@/components/admin/communications/CommunicationDetailDialog';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  sent: 'default',
  received: 'secondary',
  simulated: 'outline',
  failed: 'destructive',
  skipped: 'outline',
};

// Titthål principle: every entry must say WHO acted — the agent, a human,
// or the counterpart (inbound). Derived from source/metadata, no schema change.
type Actor = { kind: 'agent' | 'human' | 'system' | 'inbound'; label: string };

const AGENT_SOURCE = /^(agent|automation|flowpilot)|^send_email_to_lead$/;
const HUMAN_SOURCE = /^(send-contact-email|lead-compose)$/;

function deriveActor(comm: Comm): Actor {
  if (comm.direction === 'inbound') {
    return { kind: 'inbound', label: comm.sender ?? 'Inbound' };
  }
  const source = (comm.source ?? '').toLowerCase();
  const sentBy = comm.metadata?.tags?.sent_by ?? comm.metadata?.sent_by;
  if (AGENT_SOURCE.test(source)) return { kind: 'agent', label: 'Agent' };
  if (sentBy || HUMAN_SOURCE.test(source)) {
    return { kind: 'human', label: sentBy ? `Manual · ${sentBy}` : 'Manual' };
  }
  return { kind: 'system', label: 'System' };
}

function ActorBadge({ actor }: { actor: Actor }) {
  if (actor.kind === 'agent') {
    return (
      <Badge variant="secondary" className="gap-1 text-[10px] h-5 bg-primary/10 text-primary border-primary/20">
        <Bot className="h-3 w-3" />Agent
      </Badge>
    );
  }
  if (actor.kind === 'human') {
    return (
      <Badge variant="secondary" className="gap-1 text-[10px] h-5 max-w-52 truncate">
        <User className="h-3 w-3 shrink-0" />{actor.label}
      </Badge>
    );
  }
  if (actor.kind === 'inbound') {
    return (
      <Badge variant="outline" className="text-[10px] h-5 max-w-52 truncate font-mono">
        {actor.label}
      </Badge>
    );
  }
  return <Badge variant="outline" className="text-[10px] h-5">System</Badge>;
}

function snippet(comm: Comm): string {
  const text = comm.body_text ?? comm.body_html?.replace(/<[^>]+>/g, ' ') ?? '';
  return text.replace(/\s+/g, ' ').trim().slice(0, 160);
}

export function LeadCommunicationsCard({ leadId }: { leadId: string }) {
  const { data: comms = [], isLoading } = useLeadCommunications(leadId);
  const { data: quotes = [] } = useOpenQuotesByLead(leadId);
  const [selected, setSelected] = useState<Comm | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Communication</CardTitle>
        <CardDescription>
          Emails linked to this contact — what happened and who did it
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {quotes.length > 0 && (
          <div className="rounded-md border bg-muted/40 p-3 space-y-2">
            <div className="text-xs uppercase text-muted-foreground flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Open quotes
            </div>
            {quotes.map((q) => (
              <div key={q.id} className="flex items-center justify-between gap-2 text-sm">
                <Link to="/admin/quotes" className="font-mono text-xs hover:underline">
                  {q.quote_number}
                </Link>
                <span className="truncate flex-1 text-muted-foreground text-xs">{q.title ?? ''}</span>
                <span className="font-mono text-xs">
                  {new Intl.NumberFormat('sv-SE', { style: 'currency', currency: q.currency || 'SEK' }).format(q.total_cents / 100)}
                </span>
                <Badge variant="outline" className="text-[10px] h-5">{q.status}</Badge>
                {q.valid_until && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    valid until {format(new Date(q.valid_until), 'PP')}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {isLoading && <p className="text-sm text-muted-foreground py-2">Loading…</p>}
        {!isLoading && comms.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">
            No emails linked to this contact yet.
          </p>
        )}

        <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
          {comms.map((comm) => {
            const isInbound = comm.direction === 'inbound';
            const actor = deriveActor(comm);
            const text = snippet(comm);
            return (
              <button
                key={comm.id}
                type="button"
                onClick={() => setSelected(comm)}
                className="w-full text-left flex gap-3 rounded-md p-2 -mx-2 hover:bg-muted/60 transition-colors"
              >
                <div className="flex-shrink-0 mt-1">
                  <div className="h-8 w-8 rounded-full flex items-center justify-center bg-muted">
                    {isInbound
                      ? <ArrowDownLeft className="h-4 w-4 text-emerald-600" aria-label="Inbound" />
                      : <ArrowUpRight className="h-4 w-4 text-blue-600" aria-label="Outbound" />}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{comm.subject ?? '(no subject)'}</span>
                    <ActorBadge actor={actor} />
                    <Badge variant={STATUS_VARIANT[comm.status] ?? 'outline'} className="text-[10px] h-5">
                      {comm.status}
                    </Badge>
                  </div>
                  {text && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{text}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(comm.created_at), { addSuffix: true })}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>

      <CommunicationDetailDialog comm={selected} onOpenChange={(v) => !v && setSelected(null)} />
    </Card>
  );
}
