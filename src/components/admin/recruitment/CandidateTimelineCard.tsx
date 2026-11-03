import { History } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { STAGE_LABELS, useStageHistory } from '@/hooks/useRecruitment';

/** Every move through the pipeline — the trigger logs it, whoever moved the card (a person or an agent). */
export function CandidateTimelineCard({ applicationId }: { applicationId: string }) {
  const { data: history = [] } = useStageHistory(applicationId);
  const { formatDateTime } = usePlatformFormat();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4" /> Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No moves yet.</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex items-start justify-between gap-4">
                <span>
                  {h.from_stage ? `${STAGE_LABELS[h.from_stage]} → ` : ''}<strong>{STAGE_LABELS[h.to_stage]}</strong>
                  {h.comment && <span className="block text-xs text-muted-foreground">{h.comment}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(h.created_at)}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
