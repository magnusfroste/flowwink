import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Target, Mail, ArrowRight } from "lucide-react";
import type { FitAnalysisResult } from "./types";

interface FitAnalysisCardProps {
  result: FitAnalysisResult;
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 70 ? 'text-green-500' : score >= 40 ? 'text-yellow-500' : 'text-red-500';
  return (
    <div className={`flex items-center gap-1.5 ${color}`}>
      <span className="text-2xl font-bold">{score}</span>
      <span className="text-xs text-muted-foreground">/100</span>
    </div>
  );
}

export function FitAnalysisCard({ result }: FitAnalysisCardProps) {
  return (
    <div className="space-y-4">
      {/* Fit Score */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4" />
            Fit Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <ScoreRing score={result.fit_score} />
            <p className="text-sm text-muted-foreground flex-1">{result.fit_advice}</p>
          </div>

          {result.problem_mapping.length > 0 && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Problem → Solution Mapping</p>
                <div className="space-y-2">
                  {result.problem_mapping.map((pm, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <Badge variant="outline" className="text-xs shrink-0 mt-0.5">
                        {pm.prospect_problem}
                      </Badge>
                      <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0 mt-1" />
                      <span className="text-muted-foreground">{pm.our_solution}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {result.decision_maker && (
            <>
              <Separator />
              <div className="text-sm">
                <p className="text-xs font-medium text-muted-foreground mb-1">Decision Maker Found</p>
                <p className="font-medium">{result.decision_maker.first_name} {result.decision_maker.last_name}</p>
                <p className="text-xs text-muted-foreground">{result.decision_maker.email} · {result.decision_maker.position || 'Unknown role'}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Introduction Letter */}
      {result.introduction_letter && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Introduction Letter
            </CardTitle>
            {result.email_subject && (
              <p className="text-xs text-muted-foreground">
                Subject: <span className="font-medium text-foreground">{result.email_subject}</span>
              </p>
            )}
          </CardHeader>
          <CardContent>
            <div className="bg-muted/50 rounded-lg p-4 text-sm whitespace-pre-wrap leading-relaxed">
              {result.introduction_letter}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
