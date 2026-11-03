import { AlertTriangle, ExternalLink, FileText, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useCvUrl, type Application, type JobPosting } from '@/hooks/useRecruitment';
import { screeningQuestionsOf } from '../../../../supabase/functions/_shared/recruitment/application-intake';

interface Meta {
  screening_answers?: Record<string, string>;
  knockouts?: string[];
  consent?: { given_at?: string; retain_until?: string };
  lang?: string;
}

/**
 * What the candidate sent: the CV, the screening answers (a flagged answer is
 * marked — it never rejected anyone), cover letter and the consent with the
 * date the application must be deleted by.
 */
export function CandidateApplicationCard({ app, job }: { app: Application; job?: Pick<JobPosting, 'meta'> | null }) {
  const meta = (app.meta ?? {}) as Meta;
  const questions = screeningQuestionsOf(job?.meta);
  const answers = meta.screening_answers ?? {};
  const knockouts = new Set(meta.knockouts ?? []);
  const { data: cvUrl } = useCvUrl(app.id, app.resume_url);
  const pasted = (app.parsed_resume as { raw_text?: string } | null)?.raw_text;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" /> Application</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          {cvUrl ? (
            <a href={cvUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              Open CV <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : app.resume_url ? (
            <span className="text-muted-foreground">CV attached (no access to the file)</span>
          ) : pasted ? (
            <span className="text-muted-foreground">CV pasted as text</span>
          ) : (
            <span className="text-muted-foreground">No CV</span>
          )}
          {app.source && <Badge variant="outline">Source: {app.source.replace(/_/g, ' ')}</Badge>}
          {meta.lang && <Badge variant="outline">Language: {meta.lang}</Badge>}
        </div>

        {questions.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Screening</h4>
            <ul className="space-y-1.5">
              {questions.map((q) => {
                const a = answers[q.id];
                const flagged = knockouts.has(q.label);
                return (
                  <li key={q.id} className="flex items-start justify-between gap-4">
                    <span>{q.label}</span>
                    <span className={flagged ? 'flex items-center gap-1 font-medium text-amber-600' : 'text-muted-foreground'}>
                      {flagged && <AlertTriangle className="h-3.5 w-3.5" />}
                      {a ? (q.type === 'yes_no' ? (a === 'yes' ? 'Yes' : 'No') : a) : '—'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {pasted && !cvUrl && (
          <details>
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">CV text</summary>
            <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{pasted}</p>
          </details>
        )}

        {app.cover_letter && (
          <div className="space-y-1">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Why this role</h4>
            <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">{app.cover_letter}</p>
          </div>
        )}

        {meta.consent?.given_at && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Consent given {meta.consent.given_at.slice(0, 10)}{meta.consent.retain_until ? ` · delete by ${meta.consent.retain_until}` : ''}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
