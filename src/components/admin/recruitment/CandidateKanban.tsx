import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  APPLICATION_STAGES,
  STAGE_LABELS,
  useApplications,
  useMoveApplicationStage,
  type ApplicationStage,
  type Application,
} from '@/hooks/useRecruitment';
import { Star, Mail, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { CandidateMatchOverlay } from './CandidateMatchOverlay';
import { useSelectOnQueryParam } from '@/hooks/useSelectOnQueryParam';

interface Props {
  jobId?: string;
  /** Show the rejected and withdrawn columns too. */
  showClosed?: boolean;
}

/** Whole days since the card last moved. */
function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

const VISIBLE_STAGES: ApplicationStage[] = [
  'applied',
  'screened',
  'interview_scheduled',
  'interviewed',
  'offer_sent',
  'hired',
];

export function CandidateKanban({ jobId, showClosed = false }: Props) {
  const { data, isLoading } = useApplications(jobId);
  const move = useMoveApplicationStage();
  const navigate = useNavigate();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<ApplicationStage | null>(null);
  const [overlayId, setOverlayId] = useState<string | null>(null);
  // ?application=<id> — the review link a new application (and an agent's
  // submit_job_application) answers with opens that candidate.
  useSelectOnQueryParam('application', setOverlayId);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {VISIBLE_STAGES.map((s) => (
          <Skeleton key={s} className="h-64 w-full" />
        ))}
      </div>
    );
  }

  const grouped: Record<ApplicationStage, Application[]> = APPLICATION_STAGES.reduce(
    (acc, s) => ({ ...acc, [s]: [] }),
    {} as Record<ApplicationStage, Application[]>,
  );
  for (const app of data ?? []) grouped[app.stage].push(app as Application);
  const stages: ApplicationStage[] = showClosed ? [...VISIBLE_STAGES, 'rejected', 'withdrawn'] : VISIBLE_STAGES;

  const handleDrop = (stage: ApplicationStage) => {
    if (draggingId) {
      const app = data?.find((a) => a.id === draggingId);
      if (app && app.stage !== stage) {
        move.mutate({ id: draggingId, to_stage: stage });
      }
    }
    setDraggingId(null);
    setOverStage(null);
  };

  return (
    <div className={cn('grid grid-cols-2 gap-3 overflow-x-auto', showClosed ? 'lg:grid-cols-8' : 'lg:grid-cols-6')}>
      {stages.map((stage) => (
        <div
          key={stage}
          onDragOver={(e) => {
            e.preventDefault();
            setOverStage(stage);
          }}
          onDragLeave={() => setOverStage((s) => (s === stage ? null : s))}
          onDrop={() => handleDrop(stage)}
          className={cn(
            'rounded-lg border bg-muted/30 p-2 transition-colors',
            overStage === stage && 'border-primary bg-muted',
          )}
        >
          <div className="mb-2 flex items-center justify-between px-1">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {STAGE_LABELS[stage]}
            </h4>
            <Badge variant="secondary" className="text-xs">
              {grouped[stage].length}
            </Badge>
          </div>
          <div className="space-y-2">
            {grouped[stage].map((app) => (
              <Card
                key={app.id}
                draggable
                onDragStart={() => setDraggingId(app.id)}
                onDragEnd={() => setDraggingId(null)}
                onClick={() => navigate(`/admin/recruitment/candidates/${app.id}`)}
                className={cn(
                  'cursor-pointer transition-opacity hover:border-primary/50 active:cursor-grabbing',
                  draggingId === app.id && 'opacity-50',
                )}
              >
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{app.candidate_name}</p>
                      <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        {app.candidate_email}
                      </p>
                    </div>
                    {app.ai_score != null && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOverlayId(app.id);
                        }}
                        className="shrink-0"
                        title="View match breakdown"
                      >
                        <Badge variant="outline" className="text-xs hover:bg-primary/10 hover:border-primary/40 transition-colors cursor-pointer">
                          <Star className="mr-1 h-3 w-3" />
                          {app.ai_score}
                        </Badge>
                      </button>
                    )}
                  </div>
                  {app.ai_summary && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{app.ai_summary}</p>
                  )}
                  {(() => {
                    const knockouts = ((app.meta as { knockouts?: string[] } | null)?.knockouts ?? []);
                    const days = daysSince(app.updated_at);
                    return (
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        {knockouts.length > 0 && (
                          <span className="flex items-center gap-1 text-amber-600" title={knockouts.join(', ')}>
                            <AlertTriangle className="h-3 w-3" /> {knockouts.length} flagged
                          </span>
                        )}
                        {days != null && <span className={cn(days >= 7 && 'text-amber-600')}>{days === 0 ? 'today' : `${days} d in stage`}</span>}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            ))}
            {grouped[stage].length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">No candidates</p>
            )}
          </div>
        </div>
      ))}
      <CandidateMatchOverlay applicationId={overlayId} onClose={() => setOverlayId(null)} />
    </div>
  );
}
