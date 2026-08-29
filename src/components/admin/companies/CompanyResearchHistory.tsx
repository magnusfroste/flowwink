/**
 * What the research actually found — on the record it was about.
 *
 * prospect_research and prospect_fit_analysis have been writing to `activities`
 * (entity_type 'company') all along: the distilled summary, offerings, pain
 * points, sources — and from the fit pass a score, an advice paragraph, the
 * decision maker and a problem↔solution mapping. On Vinge that came to a fit of
 * 86/100 and a named CFO at 99% confidence. None of it was rendered anywhere:
 * the company page read only `web_summary` (Magnus, 2026-08-29).
 *
 * So this is not new intelligence — it is the intelligence the platform already
 * paid for, finally shown. Which is also why it renders defensively: these rows
 * were written by earlier versions of the handlers and by agents, so every
 * field is treated as possibly absent rather than assumed.
 */
import { useCompanyResearch } from '@/hooks/useEntityActivities';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Target, User, Link2, Microscope } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { LinkifiedText } from '@/components/ui/linkified-text';

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

export function CompanyResearchHistory({ companyId }: { companyId: string }) {
  const { data: rows = [], isLoading } = useCompanyResearch(companyId);

  if (isLoading) return null;
  if (rows.length === 0) return null;

  const latestFit = rows.find((r) => r.activity_type === 'fit_analysis');
  const fit = (latestFit?.metadata ?? {}) as Record<string, unknown>;
  const score = typeof fit.fit_score === 'number' ? fit.fit_score : null;
  const advice = str(fit.fit_advice);
  const dm = (fit.decision_maker ?? null) as Record<string, unknown> | null;
  const mapping = Array.isArray(fit.problem_mapping)
    ? (fit.problem_mapping as Array<Record<string, unknown>>)
    : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Microscope className="h-4 w-4" />
          Research & fit
        </CardTitle>
        <CardDescription>
          What prospecting found about this company — {rows.length} run{rows.length === 1 ? '' : 's'}, most recent first.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {latestFit && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <Target className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Fit</span>
              {score !== null && (
                <Badge variant={score >= 70 ? 'default' : 'outline'} className="font-mono">{score}/100</Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(latestFit.created_at), { addSuffix: true })}
              </span>
            </div>

            {advice && <p className="text-sm leading-relaxed whitespace-pre-wrap">{advice}</p>}

            {dm && str(dm.email) && (
              <div className="flex items-start gap-2 text-sm">
                <User className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <span className="font-medium">
                    {[str(dm.first_name), str(dm.last_name)].filter(Boolean).join(' ') || str(dm.email)}
                  </span>
                  {str(dm.position) && <span className="text-muted-foreground"> · {str(dm.position)}</span>}
                  <div className="text-xs text-muted-foreground">{str(dm.email)}</div>
                </div>
              </div>
            )}

            {mapping.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Their problem → what we do about it</p>
                {mapping.slice(0, 4).map((m, i) => (
                  <div key={i} className="rounded-md border bg-background p-2 text-xs space-y-1">
                    <p className="text-muted-foreground">{str(m.prospect_problem)}</p>
                    <p>{str(m.our_solution)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="space-y-3">
          {rows.map((r) => {
            const meta = (r.metadata ?? {}) as Record<string, unknown>;
            const offerings = list(meta.main_offerings);
            const pains = list(meta.potential_pain_points);
            const sources = Array.isArray(meta.sources) ? (meta.sources as Array<Record<string, unknown>>) : [];
            const contacts = typeof meta.contacts_found === 'number' ? meta.contacts_found : null;
            return (
              <div key={r.id} className="border-l-2 border-muted pl-3 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {r.activity_type === 'fit_analysis' ? 'Fit analysis' : 'Research'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                  </span>
                  {contacts !== null && (
                    <Badge variant="outline" className="text-[10px]">{contacts} contacts found</Badge>
                  )}
                </div>

                {r.body && r.body !== 'Se metadata för hela bedömningen.' && (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                    <LinkifiedText text={r.body} />
                  </p>
                )}

                {offerings.length > 0 && (
                  <p className="text-xs"><span className="text-muted-foreground">Offering: </span>{offerings.slice(0, 4).join(' · ')}</p>
                )}
                {pains.length > 0 && (
                  <p className="text-xs"><span className="text-muted-foreground">Likely pain: </span>{pains.slice(0, 4).join(' · ')}</p>
                )}

                {sources.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-0.5">
                    {sources.slice(0, 4).map((s, i) => (
                      <a
                        key={i}
                        href={str(s.url)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                      >
                        <Link2 className="h-3 w-3" />
                        {str(s.title) || str(s.url)}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
