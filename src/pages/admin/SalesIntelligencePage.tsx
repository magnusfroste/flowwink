import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPageContainer } from "@/components/admin/AdminPageContainer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export default function SalesIntelligencePage() {
  const [companyName, setCompanyName] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [isResearching, setIsResearching] = useState(false);
  const { analyze, isAnalyzing } = useProspectFit();
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [fitResult, setFitResult] = useState<FitAnalysisResult | null>(null);

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

        <Tabs defaultValue="research" className="space-y-4">
          <TabsList>
            <TabsTrigger value="research">Research</TabsTrigger>
            <TabsTrigger value="profiles">Sales Profile</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="setup">Setup</TabsTrigger>
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
