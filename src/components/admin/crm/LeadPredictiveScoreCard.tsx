import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TrendingUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Factor {
  factor: string;
  value?: string;
  direction?: 'positive' | 'negative' | 'neutral';
  likelihood_ratio?: number;
  detail?: string;
}

interface Prediction {
  win_probability_pct: number;
  model: string;
  training_won: number;
  training_lost: number;
  factors: Factor[];
}

/**
 * Predictive lead scoring (crm parity: scoring predictive half).
 * Same backend as the predict_lead_score skill — win probability from
 * historical closed outcomes, with per-factor explanation.
 */
export function LeadPredictiveScoreCard({ leadId }: { leadId: string }) {
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const queryClient = useQueryClient();

  const predict = useMutation({
    mutationFn: async (apply: boolean) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.rpc('predict_lead_score' as any, {
        p_lead_id: leadId,
        p_apply: apply,
      });
      if (error) throw error;
      return data as unknown as Prediction & { applied_to_score: boolean };
    },
    onSuccess: (data, apply) => {
      setPrediction(data);
      if (apply) {
        queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
        queryClient.invalidateQueries({ queryKey: ['leads'] });
        toast.success(`Score updated to ${Math.round(data.win_probability_pct)}`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Predictive score
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {prediction ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{Math.round(prediction.win_probability_pct)}%</span>
              <span className="text-xs text-muted-foreground">win probability</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Model: {prediction.model} ({prediction.training_won} won / {prediction.training_lost} lost in history)
            </p>
            <div className="flex flex-wrap gap-1">
              {prediction.factors?.filter((f) => f.direction && f.direction !== 'neutral').map((f) => (
                <Badge
                  key={f.factor}
                  variant={f.direction === 'positive' ? 'default' : 'destructive'}
                  className="text-xs"
                >
                  {f.factor}: {f.value}
                </Badge>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={predict.isPending}
              onClick={() => predict.mutate(true)}
            >
              Apply to lead score
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={predict.isPending}
            onClick={() => predict.mutate(false)}
          >
            {predict.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Predict win probability
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
