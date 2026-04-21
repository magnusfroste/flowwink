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
import { Star, Mail } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface Props {
  jobId?: string;
}

const VISIBLE_STAGES: ApplicationStage[] = [
  'applied',
  'screened',
  'interview_scheduled',
  'interviewed',
  'offer_sent',
  'hired',
];

export function CandidateKanban({ jobId }: Props) {
  const { data, isLoading } = useApplications(jobId);
  const move = useMoveApplicationStage();
  const navigate = useNavigate();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<ApplicationStage | null>(null);

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
    <div className="grid grid-cols-2 gap-3 overflow-x-auto lg:grid-cols-6">
      {VISIBLE_STAGES.map((stage) => (
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
                      <Badge variant="outline" className="shrink-0 text-xs">
                        <Star className="mr-1 h-3 w-3" />
                        {app.ai_score}
                      </Badge>
                    )}
                  </div>
                  {app.ai_summary && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{app.ai_summary}</p>
                  )}
                </CardContent>
              </Card>
            ))}
            {grouped[stage].length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">No candidates</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
