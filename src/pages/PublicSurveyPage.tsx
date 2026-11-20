import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle2, AlertCircle, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUiText } from '@/lib/ui-text';

interface SurveyQuestion {
  id: string;
  type: string;
  label: string;
  required?: boolean;
  options?: string[];
  show_if?: { id: string; equals?: unknown; gte?: number; lte?: number };
}

interface SurveyData {
  success: boolean;
  send_id?: string;
  campaign?: { name: string; email_intro: string };
  template?: {
    kind: 'nps' | 'csat' | 'ces' | 'custom' | 'quiz';
    name: string;
    questions: SurveyQuestion[];
  };
  recipient_name?: string;
  error?: string;
}

export default function PublicSurveyPage() {
  const t = useUiText();
  const { token } = useParams<{ token: string }>();
  const [search] = useSearchParams();
  const presetScore = search.get('score');

  const [data, setData] = useState<SurveyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState<number | null>(presetScore ? Number(presetScore) : null);
  const [comment, setComment] = useState('');
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data: result, error } = await supabase.rpc('get_survey_by_token' as never, { _token: token } as never);
      if (error) setData({ success: false, error: error.message });
      else setData(result as unknown as SurveyData);
      setLoading(false);
    })();
  }, [token]);

  const questionVisible = (q: SurveyQuestion): boolean => {
    if (!q.show_if) return true;
    const src = q.show_if.id === 'score' ? score : answers[q.show_if.id];
    if (q.show_if.equals !== undefined) return src === q.show_if.equals;
    if (q.show_if.gte !== undefined && typeof src === 'number') return src >= q.show_if.gte;
    if (q.show_if.lte !== undefined && typeof src === 'number') return src <= q.show_if.lte;
    return true;
  };

  const submit = async () => {
    if (!token) return;
    setSubmitting(true);
    const merged = { ...answers, ...(comment ? { comment } : {}), ...(score !== null ? { score } : {}) };
    const { data: result, error } = await supabase.rpc('submit_survey_response' as never, {
      _token: token,
      _score: score,
      _comment: comment || null,
      _answers: merged,
    } as never);
    setSubmitting(false);
    const r = result as unknown as { success: boolean; error?: string };
    if (error || !r?.success) {
      setData({ success: false, error: r?.error || 'failed' });
    } else {
      setSubmitted(true);
    }
  };


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data?.success || submitted) {
    const isError = !data?.success;
    const message = submitted
      ? t('survey.thanks', 'Thanks — your feedback was recorded.')
      : data?.error === 'already_responded'
        ? t('survey.already', 'This survey has already been submitted. Thank you!')
        : data?.error === 'expired'
          ? t('survey.expired', 'This survey link has expired.')
          : data?.error === 'failed'
            ? t('survey.failed', 'Your answer could not be saved. Please try again.')
            : t('survey.unavailable', 'We could not load this survey.');

    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-3">
            {isError && !submitted ? (
              <AlertCircle className="h-12 w-12 text-amber-500 mx-auto" />
            ) : (
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
            )}
            <p className="text-base">{message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const kind = data.template?.kind ?? 'nps';
  // Only nps/csat get the dedicated score widget above. Every other kind (quiz,
  // ces, custom) must fall through to the generic question list below, otherwise
  // its first question renders as a label with no input.
  const scoreWidgetKind = kind === 'nps' || kind === 'csat';
  const primary = scoreWidgetKind
    ? (data.template?.questions?.find(q => q.id === 'score') ?? data.template?.questions?.[0])
    : undefined;
  const followUp = data.template?.questions?.find(q => q.id === 'comment');

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="max-w-xl w-full">
        <CardHeader>
          <CardTitle>{data.campaign?.name}</CardTitle>
          {data.campaign?.email_intro && <CardDescription>{data.campaign.email_intro}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-6">
          {primary && (
            <div className="space-y-3">
              <p className="font-medium">{primary.label}</p>

              {kind === 'nps' && (
                <>
                  <div className="grid grid-cols-11 gap-1.5">
                    {Array.from({ length: 11 }, (_, n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setScore(n)}
                        className={cn(
                          'aspect-square rounded-md border text-sm font-semibold transition-colors',
                          score === n
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background hover:bg-muted border-border',
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t('survey.notLikely', 'Not at all likely')}</span>
                    <span>{t('survey.veryLikely', 'Extremely likely')}</span>
                  </div>
                </>
              )}

              {kind === 'csat' && (
                <div className="flex gap-2 justify-center">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setScore(n)}
                      className="p-1"
                      aria-label={`${n} star${n === 1 ? '' : 's'}`}
                    >
                      <Star
                        className={cn(
                          'h-10 w-10 transition-colors',
                          score !== null && n <= score
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-muted-foreground/40',
                        )}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {followUp && (
            <div className="space-y-2">
              <p className="text-sm font-medium">{followUp.label}</p>
              <Textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                rows={4}
                placeholder={t('survey.optional', 'Optional')}
                className="resize-none"
              />
            </div>
          )}

          {/* Extended questions (choice / boolean / text / number / rating) with optional skip-logic */}
          {(data.template?.questions ?? [])
            .filter(q => q.id !== primary?.id && q.id !== followUp?.id && questionVisible(q))
            .map(q => (
              <div key={q.id} className="space-y-2">
                <p className="text-sm font-medium">
                  {q.label}
                  {q.required && <span className="text-rose-500 ml-1">*</span>}
                </p>
                {(q.type === 'choice' || q.type === 'single_choice') && (
                  <div className="flex flex-wrap gap-2">
                    {(q.options ?? []).map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setAnswers(a => ({ ...a, [q.id]: opt }))}
                        className={cn(
                          'px-3 py-1.5 rounded-md border text-sm transition-colors',
                          answers[q.id] === opt
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background hover:bg-muted border-border',
                        )}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
                {q.type === 'boolean' && (
                  <div className="flex gap-2">
                    {[['Yes', true], ['No', false]].map(([label, val]) => (
                      <button
                        key={String(val)}
                        type="button"
                        onClick={() => setAnswers(a => ({ ...a, [q.id]: val }))}
                        className={cn(
                          'flex-1 px-3 py-2 rounded-md border text-sm transition-colors',
                          answers[q.id] === val
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background hover:bg-muted border-border',
                        )}
                      >
                        {label as string}
                      </button>
                    ))}
                  </div>
                )}
                {(q.type === 'text' || q.type === 'comment') && (
                  <Textarea
                    rows={3}
                    value={String(answers[q.id] ?? '')}
                    onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                    className="resize-none"
                  />
                )}
                {q.type === 'number' && (
                  <input
                    type="number"
                    value={String(answers[q.id] ?? '')}
                    onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value === '' ? null : Number(e.target.value) }))}
                    className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
                  />
                )}
                {q.type === 'rating' && (
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setAnswers(a => ({ ...a, [q.id]: n }))}
                        className="p-1"
                        aria-label={`${n} star${n === 1 ? '' : 's'}`}
                      >
                        <Star
                          className={cn(
                            'h-6 w-6 transition-colors',
                            typeof answers[q.id] === 'number' && n <= (answers[q.id] as number)
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-muted-foreground/40',
                          )}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

          <Button
            onClick={submit}
            disabled={submitting || (primary && score === null && (kind === 'nps' || kind === 'csat' || kind === 'ces'))}
            className="w-full"
          >
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {t('survey.submit', 'Submit feedback')}
          </Button>

        </CardContent>
      </Card>
    </div>
  );
}
