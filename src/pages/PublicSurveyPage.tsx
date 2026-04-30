import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle2, AlertCircle, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SurveyData {
  success: boolean;
  send_id?: string;
  campaign?: { name: string; email_intro: string };
  template?: {
    kind: 'nps' | 'csat' | 'ces' | 'custom';
    name: string;
    questions: Array<{ id: string; type: string; label: string; required?: boolean }>;
  };
  recipient_name?: string;
  error?: string;
}

export default function PublicSurveyPage() {
  const { token } = useParams<{ token: string }>();
  const [search] = useSearchParams();
  const presetScore = search.get('score');

  const [data, setData] = useState<SurveyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState<number | null>(presetScore ? Number(presetScore) : null);
  const [comment, setComment] = useState('');
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

  const submit = async () => {
    if (!token || score === null) return;
    setSubmitting(true);
    const { data: result, error } = await supabase.rpc('submit_survey_response' as never, {
      _token: token,
      _score: score,
      _comment: comment || null,
    } as never);
    setSubmitting(false);
    const r = result as unknown as { success: boolean; error?: string };
    if (error || !r?.success) {
      setData({ success: false, error: error?.message || r?.error || 'Failed to submit' });
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
      ? 'Thanks — your feedback was recorded.'
      : data?.error === 'already_responded'
        ? 'This survey has already been submitted. Thank you!'
        : data?.error === 'expired'
          ? 'This survey link has expired.'
          : 'We could not load this survey.';

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
  const primary = data.template?.questions?.find(q => q.id === 'score') ?? data.template?.questions?.[0];
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
                    <span>Not at all likely</span>
                    <span>Extremely likely</span>
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
                placeholder="Optional"
                className="resize-none"
              />
            </div>
          )}

          <Button onClick={submit} disabled={score === null || submitting} className="w-full">
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Submit feedback
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
