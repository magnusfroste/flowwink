import { useState, useMemo } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Building2, Save, Loader2, Plus, X, Globe, Sparkles, TrendingUp, Users, History, ShieldCheck, Info } from "lucide-react";
import { useCompanyInsights, type CompanyProfile, type ServiceItem } from "@/hooks/useCompanyInsights";

export default function CompanyInsightsPage() {
  const { profile, isLoading, save, isSaving, enrichFromWebsite, enrichFromPublicSources } = useCompanyInsights();
  const [local, setLocal] = useState<CompanyProfile | null>(null);
  const [enrichUrl, setEnrichUrl] = useState("");
  const [enrichId, setEnrichId] = useState("");
  const [isEnriching, setIsEnriching] = useState(false);

  // Use local state once user starts editing, otherwise use fetched profile
  const p = local || profile;

  const isDirty = local !== null;

  const update = (field: keyof CompanyProfile, value: unknown) => {
    setLocal(prev => ({ ...(prev || profile), [field]: value } as CompanyProfile));
  };

  const handleSave = () => {
    if (!p.company_name?.trim()) {
      // Allow save but warn
      // toast.warning("Consider adding a company name");
    }
    save(p);
    setLocal(null);
  };

  const handleEnrichWeb = async () => {
    if (!enrichUrl.trim()) return;
    setIsEnriching(true);
    const result = await enrichFromWebsite(enrichUrl, p);
    if (result) setLocal(result);
    setIsEnriching(false);
  };

  const handleEnrichPublic = async () => {
    if (!enrichId.trim()) return;
    setIsEnriching(true);
    const result = await enrichFromPublicSources(enrichId, p);
    if (result) setLocal(result);
    setIsEnriching(false);
  };

  const filledCount = useMemo(() => {
    return [
      p?.company_name,
      p?.about_us,
      (p?.services || []).length > 0,
      p?.value_proposition,
      p?.icp,
      p?.industry,
      p?.org_number,
    ].filter(Boolean).length;
  }, [p]);

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Business Identity</h1>
              <p className="text-sm text-muted-foreground">
                Central identity used across Sales, Chat, SEO, and FlowAgent
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={filledCount >= 5 ? "default" : "outline"}>
              {filledCount}/7 sections
            </Badge>
            <Button onClick={handleSave} disabled={isSaving || !isDirty} className="gap-1.5">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </div>
        </div>

        <Tabs defaultValue="identity" className="space-y-4">
          <TabsList>
            <TabsTrigger value="identity" className="gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> Identity
            </TabsTrigger>
            <TabsTrigger value="market" className="gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" /> Market
            </TabsTrigger>
            <TabsTrigger value="financials" className="gap-1.5">
              <Users className="h-3.5 w-3.5" /> Financials
            </TabsTrigger>
            <TabsTrigger value="enrichment" className="gap-1.5">
              <History className="h-3.5 w-3.5" /> Enrichment
            </TabsTrigger>
          </TabsList>

          {/* Identity Tab */}
          <TabsContent value="identity">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Core Identity</CardTitle>
                  <CardDescription>Who you are and what you do</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Field label="Company Name" value={p.company_name} onChange={v => update("company_name", v)} placeholder="Acme AB" />
                  <Field label="Industry" value={p.industry} onChange={v => update("industry", v)} placeholder="Digital Agency, SaaS..." />
                  <Field label="Domain" value={p.domain} onChange={v => update("domain", v)} placeholder="yourcompany.com" />
                  <FieldArea label="About Us" value={p.about_us} onChange={v => update("about_us", v)} placeholder="Brief company description..." rows={3} />
                  <FieldArea label="Value Proposition" value={p.value_proposition} onChange={v => update("value_proposition", v)} placeholder="What unique value do you deliver?" rows={2} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Services & Offerings</CardTitle>
                  <CardDescription>What you provide to clients</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ServiceEditor services={p.services || []} onChange={v => update("services", v)} />
                  <FieldArea label="Delivered Value" value={p.delivered_value} onChange={v => update("delivered_value", v)} placeholder="Measurable outcomes you deliver..." rows={2} />
                  <TagEditor label="Key Differentiators" tags={p.differentiators || []} onChange={v => update("differentiators", v)} placeholder="Add differentiator..." />
                </CardContent>
              </Card>

              <Card className="md:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Contact & References</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Email" value={p.contact_email} onChange={v => update("contact_email", v)} placeholder="info@company.com" />
                    <Field label="Phone" value={p.contact_phone} onChange={v => update("contact_phone", v)} placeholder="+46 8 123 45 67" />
                    <Field label="Address" value={p.address} onChange={v => update("address", v)} placeholder="Street, City" />
                  </div>
                  <Field label="Notable Clients" value={p.clients} onChange={v => update("clients", v)} placeholder="Volvo, IKEA, Spotify..." />
                  <FieldArea label="Client Testimonials" value={p.client_testimonials} onChange={v => update("client_testimonials", v)} placeholder="Short quotes from happy clients..." rows={2} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Market Tab */}
          <TabsContent value="market">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Market Positioning</CardTitle>
                  <CardDescription>Your place in the competitive landscape</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FieldArea label="Ideal Customer Profile" value={p.icp} onChange={v => update("icp", v)} placeholder="Describe your ideal customer..." rows={3} />
                  <TagEditor label="Target Industries" tags={p.target_industries || []} onChange={v => update("target_industries", v)} placeholder="Add industry..." />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Competitive Intelligence</CardTitle>
                  <CardDescription>Competitors and pricing strategy</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Field label="Competitors" value={p.competitors} onChange={v => update("competitors", v)} placeholder="Competitor A, Competitor B..." />
                  <FieldArea label="Pricing Strategy" value={p.pricing_notes} onChange={v => update("pricing_notes", v)} placeholder="Pricing model, ranges, or strategy notes..." rows={3} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Financials Tab */}
          <TabsContent value="financials">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Company Registration</CardTitle>
                  <CardDescription>Legal and registration details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Field label="Legal Name" value={p.legal_name} onChange={v => update("legal_name", v)} placeholder="Acme Consulting AB" />
                  <Field label="Org Number" value={p.org_number} onChange={v => update("org_number", v)} placeholder="556XXX-XXXX" />
                  <Field label="Founded Year" value={p.founded_year} onChange={v => update("founded_year", v)} placeholder="2015" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Financial Overview</CardTitle>
                  <CardDescription>Revenue, employees, and financial health</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Field label="Revenue" value={p.revenue} onChange={v => update("revenue", v)} placeholder="10 MSEK" />
                  <Field label="Employees" value={p.employees} onChange={v => update("employees", v)} placeholder="25" />
                  <FieldArea label="Financial Health" value={p.financial_health} onChange={v => update("financial_health", v)} placeholder="Summary of financial standing..." rows={2} />
                  <TagEditor label="Board Members" tags={p.board_members || []} onChange={v => update("board_members", v)} placeholder="Add board member..." />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Enrichment Tab */}
          <TabsContent value="enrichment">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Defensive enrichment notice */}
              <div className="md:col-span-2">
                <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <ShieldCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Safe enrichment — existing data is never overwritten</p>
                    <p className="text-xs text-muted-foreground">
                      Enrichment only fills empty fields. If a field already has data, it stays unchanged.
                      You can always review the changes before saving.
                    </p>
                  </div>
                </div>
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Globe className="h-4 w-4" /> Enrich from Website
                  </CardTitle>
                  <CardDescription>AI extracts company data from your website</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      value={enrichUrl}
                      onChange={e => setEnrichUrl(e.target.value)}
                      placeholder="https://yourcompany.com"
                      className="h-9"
                      onKeyDown={e => e.key === "Enter" && handleEnrichWeb()}
                    />
                    <Button variant="outline" size="sm" className="h-9 gap-1.5 shrink-0" onClick={handleEnrichWeb} disabled={isEnriching || !enrichUrl.trim()}>
                      {isEnriching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      Enrich
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" /> Public Records
                  </CardTitle>
                  <CardDescription>Search public records for financial data</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      value={enrichId}
                      onChange={e => setEnrichId(e.target.value)}
                      placeholder="Org number or company name"
                      className="h-9"
                      onKeyDown={e => e.key === "Enter" && handleEnrichPublic()}
                    />
                    <Button variant="outline" size="sm" className="h-9 gap-1.5 shrink-0" onClick={handleEnrichPublic} disabled={isEnriching || !enrichId.trim()}>
                      {isEnriching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      Lookup
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Search Swedish public company records for financial data.</p>
                </CardContent>
              </Card>

              <Card className="md:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <History className="h-4 w-4" /> Enrichment History
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(p.enrichment_log || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No enrichment actions yet</p>
                  ) : (
                    <div className="space-y-2">
                      {[...(p.enrichment_log || [])].reverse().map((entry, i) => (
                        <div key={i} className="flex items-start justify-between p-3 rounded-lg bg-muted/50 text-sm">
                          <div>
                            <p className="font-medium">{entry.source}</p>
                            <p className="text-xs text-muted-foreground">
                              {entry.fields_updated.length === 0
                                ? "No new fields — all data already present"
                                : `${entry.fields_updated.length} fields updated: ${entry.fields_updated.join(", ")}`
                              }
                            </p>
                          </div>
                          <Badge variant="outline" className="text-xs shrink-0">
                            {new Date(entry.timestamp).toLocaleDateString()}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

// --- Reusable form primitives ---

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      <Input value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="h-9" />
    </div>
  );
}

function FieldArea({ label, value, onChange, placeholder, rows = 2 }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      <Textarea value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} />
    </div>
  );
}

function TagEditor({ label, tags, onChange, placeholder }: { label: string; tags: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState("");
  const add = () => {
    if (!input.trim()) return;
    onChange([...(tags || []), input.trim()]);
    setInput("");
  };
  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium">{label}</Label>
      {(tags || []).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t, i) => (
            <Badge key={i} variant="secondary" className="gap-1 text-xs">
              {t}
              <button onClick={() => onChange(tags.filter((_, j) => j !== i))} className="ml-0.5 hover:text-destructive">
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input value={input} onChange={e => setInput(e.target.value)} placeholder={placeholder} className="h-8 text-sm" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Button variant="outline" size="sm" className="h-8 px-2" onClick={add}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function ServiceEditor({ services, onChange }: { services: ServiceItem[]; onChange: (v: ServiceItem[]) => void }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const add = () => {
    if (!name.trim()) return;
    onChange([...services, { id: crypto.randomUUID(), name: name.trim(), description: desc.trim() }]);
    setName("");
    setDesc("");
  };
  const remove = (id: string) => {
    onChange(services.filter(s => s.id !== id));
  };
  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium">Services</Label>
      {services.length > 0 && (
        <div className="space-y-1.5">
          {services.map((s) => (
            <div key={s.id} className="flex items-start gap-2 p-2 rounded-md bg-muted/50">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{s.name}</p>
                {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
              </div>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => remove(s.id)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Service name" className="h-8 text-sm flex-1" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description" className="h-8 text-sm flex-1" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Button variant="outline" size="sm" className="h-8 px-2 shrink-0" onClick={add}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
