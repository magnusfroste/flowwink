import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPageContainer } from "@/components/admin/AdminPageContainer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Search,
  Loader2,
  Building2,
  Users,
  MessageSquare,
  CheckCircle2,
  Target,
  ExternalLink,
} from "lucide-react";

interface ResearchResult {
  success: boolean;
  company: { id?: string; name: string; domain?: string };
  contacts: Array<{ id: string; email: string; name?: string }>;
  hunter_contacts_found: number;
  questions_and_answers: Array<{ question: string; answer: string; relevance_score: number }>;
  company_summary: {
    name?: string;
    industry?: string;
    size_estimate?: string;
    main_offerings?: string[];
    potential_pain_points?: string[];
  };
  error?: string;
}

export default function SalesIntelligencePage() {
  const [companyName, setCompanyName] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [isResearching, setIsResearching] = useState(false);
  const [result, setResult] = useState<ResearchResult | null>(null);

  const handleResearch = async () => {
    if (!companyName.trim()) {
      toast.error("Enter a company name");
      return;
    }

    setIsResearching(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("prospect-research", {
        body: {
          company_name: companyName.trim(),
          ...(companyUrl.trim() ? { company_url: companyUrl.trim() } : {}),
        },
      });

      if (error) throw error;

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      setResult(data as ResearchResult);
      toast.success(`Research complete for ${companyName}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Research failed");
    } finally {
      setIsResearching(false);
    }
  };

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Sales Intelligence"
          description="Research prospects, evaluate fit, and generate introduction letters"
        />

        {/* Research Input */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="h-4 w-4" />
              Prospect Research
            </CardTitle>
            <CardDescription>
              Enter a company name to research using Jina Search, web scraping, and Hunter.io
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

        {/* Results */}
        {result && result.success && (
          <div className="space-y-4">
            {/* Company Summary */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  {result.company_summary.name || result.company.name}
                  {result.company_summary.industry && (
                    <Badge variant="secondary" className="text-xs font-normal">
                      {result.company_summary.industry}
                    </Badge>
                  )}
                </CardTitle>
                {result.company_summary.size_estimate && (
                  <CardDescription>Size: {result.company_summary.size_estimate}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {result.company_summary.main_offerings && result.company_summary.main_offerings.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Main Offerings</p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.company_summary.main_offerings.map((o, i) => (
                        <Badge key={i} variant="outline" className="text-xs font-normal">{o}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {result.company_summary.potential_pain_points && result.company_summary.potential_pain_points.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Potential Pain Points</p>
                    <ul className="text-sm space-y-1">
                      {result.company_summary.potential_pain_points.map((p, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-primary mt-0.5">•</span>
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.company.domain && (
                  <a
                    href={`https://${result.company.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    {result.company.domain}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </CardContent>
            </Card>

            {/* Contacts Found */}
            {result.contacts.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Contacts Found
                    <Badge variant="default" className="text-xs">{result.hunter_contacts_found}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {result.contacts.map((contact) => (
                      <div key={contact.id} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                        <div>
                          <p className="text-sm font-medium">{contact.name || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground">{contact.email}</p>
                        </div>
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Qualifying Questions */}
            {result.questions_and_answers.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Qualifying Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="max-h-[500px]">
                    <div className="space-y-4">
                      {result.questions_and_answers.map((qa, i) => (
                        <div key={i} className="space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium">{qa.question}</p>
                            <Badge
                              variant={qa.relevance_score >= 7 ? "default" : qa.relevance_score >= 4 ? "secondary" : "outline"}
                              className="text-xs shrink-0"
                            >
                              {qa.relevance_score}/10
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{qa.answer}</p>
                          {i < result.questions_and_answers.length - 1 && <Separator />}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </AdminPageContainer>
    </AdminLayout>
  );
}
