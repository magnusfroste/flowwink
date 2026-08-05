import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPageContainer } from "@/components/admin/AdminPageContainer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { callSkill } from "@/lib/call-skill";
import { toast } from "sonner";
import { Search, Loader2, Target, Sparkles } from "lucide-react";
import { ResearchResultCards } from "@/components/admin/sales-intelligence/ResearchResultCards";
import { FitAnalysisCard } from "@/components/admin/sales-intelligence/FitAnalysisCard";
import { SalesProfileSetup } from "@/components/admin/sales-intelligence/SalesProfileSetup";
import { ResearchHistory } from "@/components/admin/sales-intelligence/ResearchHistory";
import { SalesIntelligenceReadiness } from "@/components/admin/sales-intelligence/SalesIntelligenceReadiness";
import { useProspectFit } from "@/hooks/useProspectFit";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ResearchResult, FitAnalysisResult } from "@/components/admin/sales-intelligence/types";


function normalizeFitAnalysisResult(payload: Record<string, any>): FitAnalysisResult {
  if (typeof payload.fit_score === "number") {
    return {
      success: true,
      fit_score: payload.fit_score,
      fit_advice: payload.fit_advice ?? "Fit analysis completed.",
      problem_mapping: Array.isArray(payload.problem_mapping) ? payload.problem_mapping : [],
      introduction_letter: payload.introduction_letter ?? "",
      email_subject: payload.email_subject ?? "",
      decision_maker: payload.decision_maker ?? null,
      leads_updated: typeof payload.leads_updated === "number" ? payload.leads_updated : 0,
    };
  }

  const completeness = payload.data_completeness ?? {};
  const signalCount = [
    completeness.has_website,
    completeness.has_domain,
    completeness.has_industry,
    completeness.has_size,
    completeness.is_enriched,
  ].filter(Boolean).length;
  const fitScore = Math.round((signalCount / 5) * 100);
  const missingSignals = [
    !completeness.has_industry ? "industry" : null,
    !completeness.has_size ? "company size" : null,
    !completeness.has_website ? "website" : null,
    !completeness.has_domain ? "domain" : null,
  ].filter(Boolean);

  const companyName = payload.company?.name ?? "this prospect";
  const leadCount = Number(completeness.lead_count ?? 0);
  const dealCount = Number(completeness.deal_count ?? 0);
  const fitAdvice = missingSignals.length > 0
    ? `Snapshot ready for ${companyName}. Data coverage is partial — add ${missingSignals.join(", ")} to sharpen the fit assessment.`
    : `Snapshot ready for ${companyName}. Core company signals are present and the prospect is ready for manual qualification.`;

  return {
    success: true,
    fit_score: fitScore,
    fit_advice: `${fitAdvice} CRM context: ${leadCount} related lead${leadCount === 1 ? "" : "s"}, ${dealCount} related deal${dealCount === 1 ? "" : "s"}.`,
    problem_mapping: [],
    introduction_letter: "",
    email_subject: "",
    decision_maker: null,
    leads_updated: 0,
  };
}

export default function SalesIntelligencePage() {
  const [companyName, setCompanyName] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [isResearching, setIsResearching] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [fitResult, setFitResult] = useState<FitAnalysisResult | null>(null);
  const { analyzeFit } = useProspectFit();


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

      setResult(data as unknown as ResearchResult);
      toast.success(`Research complete — saved to CRM`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Research failed");
    } finally {
      setIsResearching(false);
    }
  };

  // Fit scoring goes through FlowPilot (which calls the prospect_fit_analysis
  // skill for prospect data + our ICP from Business Identity). If the reasoning
  // layer is unavailable, fall back to the raw skill payload as a data snapshot.
  const handleFitAnalysis = async () => {
    if (!result?.company?.id) {
      toast.error("No company to analyze");
      return;
    }

    setIsAnalyzing(true);

    try {
      const scored = await analyzeFit({ company_id: result.company.id });
      setFitResult(scored);
      toast.success(`Fit score: ${scored.fit_score}/100`);
    } catch {
      try {
        const data = await callSkill("prospect_fit_analysis", { company_id: result.company.id });
        const normalized = normalizeFitAnalysisResult((data ?? {}) as Record<string, any>);
        setFitResult(normalized);
        toast.warning("Scored from data coverage only — FlowPilot reasoning unavailable");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fit analysis failed");
      }
    } finally {
      setIsAnalyzing(false);
    }
  };


  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Sales Intelligence"
          description="Research prospects, evaluate fit, and generate introduction letters"
        />

        <Tabs defaultValue="research" className="space-y-4">
          <TabsList>
            <TabsTrigger value="research">Research</TabsTrigger>
            <TabsTrigger value="profiles">Sales Profile</TabsTrigger>
            <TabsTrigger value="setup">Setup</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>



          <TabsContent value="research" className="space-y-4">
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
                          Score this prospect, map problems to your services, and generate an intro letter
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
                  <FitAnalysisCard result={fitResult} companyName={result.company?.name} />
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="profiles" className="space-y-4">
            <SalesProfileSetup />
          </TabsContent>

          <TabsContent value="setup" className="space-y-4">
            <SalesIntelligenceReadiness />
          </TabsContent>


          <TabsContent value="history" className="space-y-4">
            <ResearchHistory />
          </TabsContent>
        </Tabs>
      </AdminPageContainer>
    </AdminLayout>
  );
}
