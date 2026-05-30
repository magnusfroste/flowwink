import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Target, Mail, ArrowRight, Copy, ExternalLink, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { SendEmailDialog } from "@/components/admin/crm/SendEmailDialog";
import type { FitAnalysisResult } from "./types";

interface FitAnalysisCardProps {
  result: FitAnalysisResult;
  companyName?: string;
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

export function FitAnalysisCard({ result, companyName }: FitAnalysisCardProps) {
  const [emailOpen, setEmailOpen] = useState(false);

  const dm = result.decision_maker;
  const decisionMakerName = [dm?.first_name, dm?.last_name].filter(Boolean).join(" ");
  const decisionMakerMeta = [dm?.email, dm?.position || 'Unknown role'].filter(Boolean).join(' · ');
  const recipientEmail = dm?.email ?? "";
  const leadId = (dm as any)?.id;

  const handleCopyLetter = async () => {
    const text = result.email_subject
      ? `Subject: ${result.email_subject}\n\n${result.introduction_letter}`
      : result.introduction_letter;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Intro letter copied");
    } catch {
      toast.error("Copy failed");
    }
  };

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

          {(result.problem_mapping?.length ?? 0) > 0 && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Problem → Solution Mapping</p>
                <div className="space-y-2">
                  {result.problem_mapping?.map((pm, i) => (
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

          {dm && (
            <>
              <Separator />
              <div className="text-sm">
                <p className="text-xs font-medium text-muted-foreground mb-1">Decision Maker Found</p>
                <p className="font-medium">{decisionMakerName || 'Unnamed contact'}</p>
                <p className="text-xs text-muted-foreground">{decisionMakerMeta}</p>
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

      {/* Next Steps */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Next Steps
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => setEmailOpen(true)}
            disabled={!recipientEmail}
            className="gap-2"
          >
            <Mail className="h-4 w-4" />
            {recipientEmail ? `Send to ${decisionMakerName || recipientEmail}` : "No decision-maker email"}
          </Button>

          {result.introduction_letter && (
            <Button size="sm" variant="outline" onClick={handleCopyLetter} className="gap-2">
              <Copy className="h-4 w-4" />
              Copy letter
            </Button>
          )}

          {leadId && (
            <Button size="sm" variant="outline" asChild className="gap-2">
              <Link to={`/admin/leads/${leadId}`}>
                <ExternalLink className="h-4 w-4" />
                Open lead in CRM
              </Link>
            </Button>
          )}

          <Button size="sm" variant="outline" asChild className="gap-2">
            <Link to="/admin/leads">
              <ExternalLink className="h-4 w-4" />
              View all leads
            </Link>
          </Button>
        </CardContent>
      </Card>

      {recipientEmail && (
        <SendEmailDialog
          open={emailOpen}
          onOpenChange={setEmailOpen}
          recipientEmail={recipientEmail}
          recipientName={decisionMakerName || undefined}
          initialSubject={result.email_subject || ""}
          initialBody={result.introduction_letter || ""}
          leadContext={{
            name: decisionMakerName || undefined,
            email: recipientEmail,
            role: dm?.position ?? undefined,
            company_name: companyName,
          }}
        />
      )}
    </div>
  );
}
