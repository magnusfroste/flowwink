import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { FileBarChart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useSubjectReports } from '@/hooks/useReports';

/**
 * "Reports about this" on a company, deal or project page: what an agent
 * published with subject_type + subject_id pointing here. Shows nothing at all
 * when there is none (or the reader's role may read none) — an empty card on
 * every company page would be noise.
 */
export function SubjectReports({ subjectType, subjectId, className }: {
  subjectType: 'company' | 'deal' | 'project' | 'contact';
  subjectId: string | undefined;
  className?: string;
}) {
  const { data: reports = [] } = useSubjectReports(subjectType, subjectId);
  if (reports.length === 0) return null;
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileBarChart className="h-4 w-4" />
          Reports ({reports.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {reports.map((r) => (
          <Link
            key={r.id}
            to={`/admin/reports/${r.slug}`}
            className="block rounded-md border border-border p-2.5 transition-colors hover:bg-accent/60"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium leading-snug">{r.title}</span>
              <Badge variant="outline" className="shrink-0 font-normal">v{r.current_version}</Badge>
            </div>
            {r.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.description}</p>}
            <p className="mt-1 text-[11px] text-muted-foreground">
              {r.category ? `${r.category} · ` : ''}updated {formatDistanceToNow(new Date(r.updated_at), { addSuffix: true })}
            </p>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
