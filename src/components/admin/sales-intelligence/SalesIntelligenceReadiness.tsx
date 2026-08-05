import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Check, AlertTriangle, Plug } from "lucide-react";
import { useModuleReadiness } from "@/hooks/useModuleReadiness";
import { useCompanyInsights } from "@/hooks/useCompanyInsights";

/**
 * What Sales Intelligence depends on, made visible.
 *
 * - AI provider (required): the fit reasoning runs through FlowPilot.
 * - Business Identity (required for real scoring): the ICP lives in
 *   site_settings.company_profile — Sales Intelligence never keeps its own copy.
 * - Hunter (optional): contact discovery. Without it, research returns website
 *   analysis only.
 * - Firecrawl / Jina (optional): web search + scraping quality.
 */
const INTEGRATION_LABELS: Record<string, string> = {
  hunter: "Hunter.io — contact discovery",
  firecrawl: "Firecrawl — web scraping",
  jina: "Jina — web search",
  openai: "OpenAI",
  gemini: "Gemini",
};

function Row({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      {ok ? (
        <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      ) : (
        <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      )}
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {hint && !ok && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

export function SalesIntelligenceReadiness() {
  const readiness = useModuleReadiness("salesIntelligence");
  const { profile } = useCompanyInsights();

  const hasIcp = !!profile?.icp?.trim();
  const hasPositioning = !!profile?.value_proposition?.trim() || (profile?.differentiators?.length ?? 0) > 0;
  const activeOptional = new Set(readiness.activeOptional);

  const allGood = !readiness.missingAI && hasIcp;

  return (
    <Card className={allGood ? undefined : "border-amber-500/40"}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Plug className="h-4 w-4" />
          Module dependencies
          {allGood ? (
            <Badge variant="secondary" className="ml-1">Ready</Badge>
          ) : (
            <Badge variant="outline" className="ml-1">Needs setup</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Required</p>
          <Row
            ok={!readiness.missingAI}
            label="AI provider active (OpenAI, Gemini or local)"
            hint="Fit scoring and outreach drafting run through FlowPilot — configure a provider under Integrations."
          />
          <Row
            ok={hasIcp}
            label="Ideal Customer Profile defined in Business Identity"
            hint="The ICP is the yardstick for fit scoring. Without it the score is a guess."
          />
          <Row
            ok={hasPositioning}
            label="Value proposition / differentiators defined"
            hint="Used to map prospect problems to what we actually sell."
          />
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Optional integrations</p>
          {(["hunter", "firecrawl", "jina"] as const).map((key) => (
            <Row
              key={key}
              ok={activeOptional.has(key)}
              label={INTEGRATION_LABELS[key]}
              hint={
                key === "hunter"
                  ? "Without Hunter, research returns website analysis only — no contacts."
                  : "Improves the quality of search and website content used in research."
              }
            />
          ))}
        </div>

        {(!hasIcp || !hasPositioning) && (
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link to="/admin/company-insights">
              <Building2 className="h-4 w-4" />
              Open Business Identity
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
