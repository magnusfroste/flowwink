import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, Linkedin, Sparkles, Star, Briefcase, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useApplication,
  useScoreCandidate,
  useMoveApplicationStage,
  APPLICATION_STAGES,
  STAGE_LABELS,
  type ApplicationStage,
} from '@/hooks/useRecruitment';
import { cn } from '@/lib/utils';

function scoreColor(score: number | null) {
  if (score == null) return 'bg-muted text-muted-foreground';
  if (score >= 80) return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30';
  if (score >= 60) return 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30';
  return 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30';
}

function recommendation(score: number | null): { label: string; tone: string } {
  if (score == null) return { label: 'Not scored', tone: 'bg-muted text-muted-foreground' };
  if (score >= 80) return { label: 'Advance', tone: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' };
  if (score >= 60) return { label: 'Hold for review', tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' };
  return { label: 'Likely reject', tone: 'bg-rose-500/15 text-rose-700 dark:text-rose-400' };
}

export default function CandidatePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useApplication(id);
  const score = useScoreCandidate();
  const move = useMoveApplicationStage();

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-5xl space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container mx-auto max-w-5xl p-6">
        <Button variant="ghost" onClick={() => navigate('/admin/recruitment')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <p className="mt-4 text-muted-foreground">Candidate not found.</p>
      </div>
    );
  }

  const job = (data as any).job_postings;
  const rec = recommendation(data.ai_score);

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/recruitment')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to pipeline
        </Button>
        <Select
          value={data.stage}
          onValueChange={(v) => move.mutate({ id: data.id, to_stage: v as ApplicationStage })}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {APPLICATION_STAGES.map((s) => (
              <SelectItem key={s} value={s}>
                {STAGE_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight">{data.candidate_name}</h1>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" /> {data.candidate_email}
                </span>
                {data.candidate_phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" /> {data.candidate_phone}
                  </span>
                )}
                {data.linkedin_url && (
                  <a
                    href={data.linkedin_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 hover:text-foreground"
                  >
                    <Linkedin className="h-3.5 w-3.5" /> LinkedIn
                  </a>
                )}
              </div>
              {job && (
                <div className="flex items-center gap-2 pt-1 text-sm">
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{job.title}</span>
                  {job.department && <span className="text-muted-foreground">· {job.department}</span>}
                </div>
              )}
            </div>
            <div className="flex flex-col items-start gap-2 md:items-end">
              <Badge variant="outline" className={cn('px-3 py-1 text-base', scoreColor(data.ai_score))}>
                <Star className="mr-1.5 h-4 w-4" />
                {data.ai_score != null ? `${data.ai_score}/100` : 'Not scored'}
              </Badge>
              <Badge className={cn('px-3 py-1', rec.tone)} variant="secondary">
                {rec.label}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI scoring */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" /> AI Evaluation
          </CardTitle>
          <Button
            size="sm"
            onClick={() => score.mutate(data.id)}
            disabled={score.isPending}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {score.isPending ? 'Scoring…' : data.ai_score != null ? 'Re-score candidate' : 'Score candidate'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.ai_summary ? (
            <p className="text-sm leading-relaxed">{data.ai_summary}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No AI evaluation yet. Click "Score candidate" to analyze fit against the role.
            </p>
          )}

          {data.ai_reasoning && (
            <>
              <Separator />
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Reasoning
                </h4>
                <p className="text-sm text-muted-foreground">{data.ai_reasoning}</p>
              </div>
            </>
          )}

          {(data.matching_skills?.length || data.missing_skills?.length) && (
            <>
              <Separator />
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                    Matching skills ({data.matching_skills?.length ?? 0})
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {data.matching_skills?.length ? (
                      data.matching_skills.map((s) => (
                        <Badge key={s} variant="secondary" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                          {s}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">None identified</span>
                    )}
                  </div>
                </div>
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-400">
                    Missing skills ({data.missing_skills?.length ?? 0})
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {data.missing_skills?.length ? (
                      data.missing_skills.map((s) => (
                        <Badge key={s} variant="outline" className="border-rose-500/30 text-rose-700 dark:text-rose-400">
                          {s}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">None identified</span>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Cover letter */}
      {data.cover_letter && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" /> Cover letter
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {data.cover_letter}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
