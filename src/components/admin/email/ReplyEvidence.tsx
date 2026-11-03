import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ReplyEvidenceData } from '@/lib/reply-evidence-view';

const FROM_LABEL: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  knowledge: { label: 'Answered from knowledge', variant: 'default' },
  live_data: { label: 'Answered from live data', variant: 'default' },
  model_only: { label: 'No source — model only', variant: 'outline' },
};

/**
 * Why FlowPilot answered an email as it did — the evidence draft-email-reply
 * keeps on the draft and on the sent row (metadata.evidence, built by
 * _shared/email/reply-evidence.ts). An email reply gets no thumbs up; this is
 * how a person judges it afterwards: what was asked, what the answer rested
 * on, which knowledge was switched on, what happened to it and why.
 */
export function ReplyEvidence({ evidence }: { evidence: ReplyEvidenceData }) {
  const from = FROM_LABEL[evidence.answered_from ?? ''] ?? null;
  return (
    <details className="group text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-muted-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
        <span>Why this answer</span>
        {from && <Badge variant={from.variant} className="text-[10px] font-normal">{from.label}</Badge>}
        {evidence.sent_by === 'person' && (
          <Badge variant="secondary" className="text-[10px] font-normal">
            {evidence.edited ? 'Edited and sent by a person' : 'Sent by a person'}
          </Badge>
        )}
      </summary>
      <div className="mt-2 space-y-1.5 pl-4 border-l">
        {evidence.why && <p className="text-foreground">{evidence.why}</p>}
        {evidence.sources && evidence.sources.length > 0 && (
          <ul className="space-y-0.5">
            {evidence.sources.map((s) => (
              <li key={`${s.table}:${s.id}`} className="text-muted-foreground">
                {s.url ? <Link to={s.url} className="text-primary hover:underline">{s.title}</Link> : s.title}
                <span className="ml-1 opacity-70">({s.table.replace(/_/g, ' ')})</span>
              </li>
            ))}
          </ul>
        )}
        {evidence.knowledge && (
          <p className="text-muted-foreground">
            Knowledge allowed: KB {evidence.knowledge.kb ? 'on' : 'off'} · pages {evidence.knowledge.pages ? 'on' : 'off'} · general knowledge {evidence.knowledge.general ? 'on' : 'off'} —{' '}
            <Link to="/admin/chat?tab=knowledge" className="text-primary hover:underline">Chat settings</Link>, the same dials for chat and email.
          </p>
        )}
        {evidence.question && <p className="text-muted-foreground">Question: “{evidence.question}”</p>}
      </div>
    </details>
  );
}
