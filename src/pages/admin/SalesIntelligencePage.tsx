import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPageContainer } from "@/components/admin/AdminPageContainer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callSkill } from "@/lib/call-skill";
import { toast } from "sonner";
import { Search, Loader2, Target, Sparkles, AlertTriangle } from "lucide-react";
import { ResearchResultCards } from "@/components/admin/sales-intelligence/ResearchResultCards";
import { FitAnalysisCard } from "@/components/admin/sales-intelligence/FitAnalysisCard";
import { SalesProfileSetup } from "@/components/admin/sales-intelligence/SalesProfileSetup";
import { ResearchHistory } from "@/components/admin/sales-intelligence/ResearchHistory";
import { SalesIntelligenceReadiness, useSalesIntelligenceReadiness } from "@/components/admin/sales-intelligence/SalesIntelligenceReadiness";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useProspectFit, loadSavedFit } from "@/hooks/useProspectFit";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ResearchResult, FitAnalysisResult } from "@/components/admin/sales-intelligence/types";

export default function SalesIntelligencePage() {
  const [companyName, setCompanyName] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [isResearching, setIsResearching] = useState(false);
  const { analyze, isAnalyzing } = useProspectFit();
  const [result, setResult] = useState<ResearchResult | null>(null);
  const readiness = useSalesIntelligenceReadiness();
  const [fitResult, setFitResult] = useState<FitAnalysisResult | null>(null);
  // Deep-linkable tabs: the Profile page points sellers straight at their
  // sender profile (?tab=profiles), which is otherwise three clicks deep.
  const [searchParams, setSearchParams] = useSearchParams();
  // Setup lists the module's dependencies (AI provider, ICP, positioning).
  // Both reads behind it are staff-readable today — check-secrets answers
  // presence booleans to any staff role (600a3ccb0) and site_settings SELECT
  // is open — so the old admin-only tab hid a truthful readiness report from
  // the exact role the module is for. Sales was told nothing at all instead of
  // "your ICP is missing". The tab is now shown to everyone the matrix let
  // onto this page; the readiness card itself withholds only the fix-LINK per
  // requirement, and it asks the matrix (not a role list) who can follow it.
  const tab = searchParams.get('tab') ?? 'research';

  const handleResearch = async () => {
    if (!companyName.trim()) {
      toast.error("Enter a company name");
      return;
    }

    setIsResearching(true);
    setResult(null);
    setFitResult(null);

    try {
      const data = await callSkill("prospect_research", {
        company_name: companyName.trim(),
        ...(companyUrl.trim() ? { company_url: companyUrl.trim() } : {}),
      });

      const research = data as unknown as ResearchResult;
      setResult(research);
      toast.success(`Research complete — saved to CRM`);

      // A previous assessment survives the tab: restore it from the company
      // row so re-researching a known prospect doesn't start from amnesia.
      if (research?.company?.id) {
        const saved = await loadSavedFit(research.company.id);
        if (saved) setFitResult(saved);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Research failed");
    } finally {
      setIsResearching(false);
    }
  };

  const handleFitAnalysis = async () => {
    if (!result?.company?.id) {
      toast.error("No company to analyze");
      return;
    }

    try {
      const outcome = await analyze({ company_id: result.company.id });
      setFitResult(outcome.fit);
      if (outcome.aiScored) {
        toast.success(`Fit score: ${outcome.fit.fit_score}/100`);
      } else {
        toast.warning(
          "Scored from data only — connect an AI provider and define your ICP for a real fit assessment.",
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fit analysis failed");
    }
  };

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Sales Intelligence"
          description="Research prospects, evaluate fit, and generate introduction letters"
        />

        <Tabs
          value={tab}
          onValueChange={(v) => setSearchParams(v === 'research' ? {} : { tab: v }, { replace: true })}
          className="space-y-4"
        >
          <TabsList>
            <TabsTrigger value="research">Research</TabsTrigger>
            <TabsTrigger value="profiles">Sales Profile</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="setup">Setup</TabsTrigger>
          </TabsList>

          <TabsContent value="research" className="space-y-4">
            {/* What the scores rest on — said here, before the first score,
                not discovered by clicking Setup. Every fit score is measured
                against the ICP in Business Identity; with no ICP the page
                still "works" and quietly scores from data alone. */}
            {!readiness.isLoading && !readiness.ready && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Fit scores are measured against your Business Identity — and it isn't set up yet</AlertTitle>
                <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>
                    Missing:{' '}
                    {[
                      !readiness.hasAi && 'an AI provider',
                      !readiness.hasIcp && 'an Ideal Customer Profile',
                      !readiness.hasPositioning && 'positioning & services',
                    ].filter(Boolean).join(', ')}
                    . Until then, scores come from data only.
                  </span>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0"
                    onClick={() => setSearchParams({ tab: 'setup' }, { replace: true })}
                  >
                    Open Setup
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {/* Second class of silence: everything REQUIRED is rigged, but the
                enrichment keys are not — research then runs and quietly comes
                back thin (keyless Jina scrape, no decision-maker emails), and
                an admin concludes the module is broken. Magnus hit exactly
                this before Stefan's demo: the Setup tab knew, the Research
                tab said nothing. Said here, before the first search. */}
            {!readiness.isLoading && readiness.ready && (() => {
              const missing = [
                !readiness.integrations?.firecrawl && { key: 'firecrawl', text: 'Firecrawl — website reads fall back to a keyless, rate-limited reader' },
                !readiness.integrations?.hunter && { key: 'hunter', text: 'Hunter — no decision-maker emails will be found' },
                !readiness.integrations?.jina && { key: 'jina', text: 'Jina — no fallback reader for pages Firecrawl cannot reach' },
              ].filter(Boolean) as Array<{ key: string; text: string }>;
              if (missing.length === 0) return null;
              return (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Research will run, but thinner than it could — enrichment keys are missing</AlertTitle>
                  <AlertDescription className="space-y-1">
                    <ul className="list-disc pl-4">
                      {missing.map((m) => <li key={m.key}>{m.text}</li>)}
                    </ul>
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() => setSearchParams({ tab: 'setup' }, { replace: true })}
                    >
                      See what each key adds in Setup
                    </Button>
                  </AlertDescription>
                </Alert>
              );
            })()}

            {/* Research Input */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  Prospect Research
                </CardTitle>
                <CardDescription>
                  Enter a company name to research and save to CRM
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="company-name" className="text-xs font-medium">Company Name *</Label>
                    <Input
                      id="company-name"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Acme Corp"
                      onKeyDown={(e) => e.key === "Enter" && handleResearch()}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="company-url" className="text-xs font-medium">Website (optional)</Label>
                    <Input
                      id="company-url"
                      value={companyUrl}
                      onChange={(e) => setCompanyUrl(e.target.value)}
                      placeholder="https://acme.com"
                    />
                  </div>
                </div>
                <Button
                  onClick={handleResearch}
                  disabled={isResearching || !companyName.trim()}
                  className="gap-2"
                >
                  {isResearching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Target className="h-4 w-4" />
                  )}
                  {isResearching ? "Researching..." : "Research Prospect"}
                </Button>
              </CardContent>
            </Card>

            {/* Research Results */}
            {result && result.success && (
              <>
                <ResearchResultCards result={result} />

                {/* Fit Analysis Action */}
                {!fitResult && (
                  <Card className="border-dashed">
                    <CardContent className="py-6 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Next step: Run Fit Analysis</p>
                        <p className="text-xs text-muted-foreground">
                          Score this prospect against the ICP in your Business Identity, map its problems to your services, and generate an intro letter
                        </p>
                      </div>
                      <Button
                        onClick={handleFitAnalysis}
                        disabled={isAnalyzing}
                        variant="default"
                        className="gap-2"
                      >
                        {isAnalyzing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                        {isAnalyzing ? "Analyzing..." : "Run Fit Analysis"}
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {/* Fit Analysis Results */}
                {fitResult && fitResult.success && (
                  <>
                    <FitAnalysisCard result={fitResult} companyName={result.company?.name} />
                    <div className="flex justify-end">
                      <Button
                        onClick={handleFitAnalysis}
                        disabled={isAnalyzing}
                        variant="outline"
                        size="sm"
                        className="gap-2"
                      >
                        {isAnalyzing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                        {isAnalyzing ? "Analyzing..." : "Re-run Fit Analysis"}
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="profiles" className="space-y-4">
            <SalesProfileSetup />
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <ResearchHistory />
          </TabsContent>

          <TabsContent value="setup" className="space-y-4">
            <SalesIntelligenceReadiness />
          </TabsContent>
        </Tabs>
      </AdminPageContainer>
    </AdminLayout>
  );
}
