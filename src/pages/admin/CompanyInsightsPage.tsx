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
import { Building2, Save, Loader2, Plus, X, Globe, Sparkles, TrendingUp, Users, History, ShieldCheck, Info, Hash, MousePointerClick, Quote } from "lucide-react";
import {
  useCompanyInsights,
  type CompanyProfile,
  type ServiceItem,
  type PrimaryCta,
  type ProofPoint,
  type Testimonial,
} from "@/hooks/useCompanyInsights";

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
      // A page needs both halves of the ask: a number to stand on and
      // somewhere to send the reader. Absent, they read as gaps here rather
      // than getting invented downstream.
      (p?.proof_points || []).length > 0,
      !!p?.primary_cta?.label,
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
              <h1 className="font-serif text-2xl font-bold text-foreground">Business Identity</h1>
              <p className="text-sm text-muted-foreground">
                Central identity used across Sales, Chat, SEO, FlowPilot, and external agents
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={filledCount >= 5 ? "default" : "outline"}>
              {filledCount}/9 sections
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
                  {/* tagline and business_purpose were written by agents (update_company_profile
                      shallow-merges any key) and read by every prompt long before they had a
                      field here — load-bearing, invisible, uncorrectable. Now editable. */}
                  <Field label="Tagline" value={p.tagline} onChange={v => update("tagline", v)} placeholder="One line under the name — the shortest true sentence about you" />
                  <Field label="Industry" value={p.industry} onChange={v => update("industry", v)} placeholder="Digital Agency, SaaS..." />
                  <Field label="Domain" value={p.domain} onChange={v => update("domain", v)} placeholder="yourcompany.com" />
                  <FieldArea label="About Us" value={p.about_us} onChange={v => update("about_us", v)} placeholder="Brief company description..." rows={3} />
                  <FieldArea label="Business Purpose" value={p.business_purpose} onChange={v => update("business_purpose", v)} placeholder="Why the company exists — the reason behind the offering, not the offering itself." rows={2} />
                  <FieldArea label="Value Proposition" value={p.value_proposition} onChange={v => update("value_proposition", v)} placeholder="What unique value do you deliver?" rows={2} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Services & Offerings</CardTitle>
                  <CardDescription>What you provide to clients</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <NamedItemEditor
                    label="Services"
                    items={p.services || []}
                    onChange={v => update("services", v)}
                    namePlaceholder="Service name"
                    descPlaceholder="Description"
                  />
                  <FieldArea label="Delivered Value" value={p.delivered_value} onChange={v => update("delivered_value", v)} placeholder="Measurable outcomes you deliver — keep the figures themselves in Proof points below." rows={2} />
                  {/* A label alone is half a features block: the generator would have
                      to write the description itself. Both halves live here. */}
                  <NamedItemEditor
                    label="Key Differentiators"
                    hint="A label and what it means — a features block needs both, or the generator writes the second half itself."
                    items={p.differentiators || []}
                    onChange={v => update("differentiators", v)}
                    namePlaceholder="Differentiator"
                    descPlaceholder="What it means for the customer"
                  />
                </CardContent>
              </Card>

              {/* Numbers as numbers. delivered_value is prose; a stats block needs
                  {value, label} pairs, and a model asked to parse metrics out of a
                  sentence is a model one step from inventing them. */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Hash className="h-4 w-4" /> Proof points
                  </CardTitle>
                  <CardDescription>
                    The figures you stand behind, held as figures. Everything generated may quote these — and nothing else — as numbers.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ProofPointEditor points={p.proof_points || []} onChange={v => update("proof_points", v)} />
                </CardContent>
              </Card>

              {/* Nothing in the profile said what the visitor should DO. A landing
                  page without an ask is not a landing page. */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MousePointerClick className="h-4 w-4" /> Primary call to action
                  </CardTitle>
                  <CardDescription>
                    The one thing a visitor should do. Generated pages end here.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Field
                    label="Button label"
                    value={p.primary_cta?.label || ""}
                    onChange={v => update("primary_cta", ctaWith(p.primary_cta, { label: v }))}
                    placeholder="Book a scoping call"
                  />
                  <Field
                    label="Destination"
                    value={p.primary_cta?.destination || ""}
                    onChange={v => update("primary_cta", ctaWith(p.primary_cta, { destination: v }))}
                    placeholder="/kontakt · https://cal.com/… · mailto:sales@…"
                  />
                  <FieldArea
                    label="What it is for"
                    value={p.primary_cta?.intent || ""}
                    onChange={v => update("primary_cta", ctaWith(p.primary_cta, { intent: v }))}
                    placeholder="A 30-minute scoping call — no preparation needed, we bring the questions."
                    rows={2}
                  />
                  {!p.primary_cta?.label && (
                    <p className="text-xs text-muted-foreground">
                      Without a label there is no CTA to render — generated pages will end without an ask.
                    </p>
                  )}
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
                  {/* One blob renders as a paragraph. A testimonial block needs the
                      quote AND who said it — an unattributed quote is honest, a
                      guessed attribution is a fabricated reference. */}
                  <TestimonialEditor items={p.client_testimonials || []} onChange={v => update("client_testimonials", v)} />
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

              {/* Editorial rules — not facts about the company but rules about
                  how every outward AI surface may speak for it. Injected into
                  the always-on identity block; the stance overrides briefs. */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Editorial rules</CardTitle>
                  <CardDescription>
                    How every AI surface speaks for this company — chat, campaigns, letters. Rules, not facts.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FieldArea
                    label="Claim stance — HOW claims are made"
                    value={p.claim_stance}
                    onChange={v => update("claim_stance", v)}
                    placeholder={'e.g. "We describe what our services do, precisely enough for the customer and their advisers to assess. We never interpret what regulations require of a specific organization, and never imply that buying us makes anyone compliant."'}
                    rows={4}
                  />
                  <FieldArea
                    label="Answered by a person, not here"
                    value={p.boundaries}
                    onChange={v => update("boundaries", v)}
                    placeholder={'Topics the site, chat and generated copy must route to a human — e.g. network routes, ownership, named competitors. Legitimate questions, wrong channel: say so and point to contact.'}
                    rows={4}
                  />
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
                      placeholder="Company name, registration number, or domain"
                      className="h-9"
                      onKeyDown={e => e.key === "Enter" && handleEnrichPublic()}
                    />
                    <Button variant="outline" size="sm" className="h-9 gap-1.5 shrink-0" onClick={handleEnrichPublic} disabled={isEnriching || !enrichId.trim()}>
                      {isEnriching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      Lookup
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Searches the web for revenue, employees, registration data and more.</p>
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

        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-xs text-muted-foreground">
            {isDirty ? "You have unsaved changes" : "All changes saved"}
          </p>
          <Button onClick={handleSave} disabled={isSaving || !isDirty} className="gap-1.5">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Business Identity
          </Button>
        </div>
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

function FieldArea({ label, value, onChange, placeholder, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {/* The field grows to fit its content ([field-sizing:content], with rows
          as the floor and resize-y as the manual override) — a curated profile
          must never hide its own last line behind a scroll edge. The reader is
          reviewing text, not peeking at it. */}
      <Textarea
        value={value || ""}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="[field-sizing:content] max-h-96 resize-y leading-relaxed"
      />
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

function NamedItemEditor({
  label,
  hint,
  items,
  onChange,
  namePlaceholder,
  descPlaceholder,
}: {
  label: string;
  hint?: string;
  items: ServiceItem[];
  onChange: (v: ServiceItem[]) => void;
  namePlaceholder: string;
  descPlaceholder: string;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const add = () => {
    if (!name.trim()) return;
    onChange([...items, { id: crypto.randomUUID(), name: name.trim(), description: desc.trim() }]);
    setName("");
    setDesc("");
  };
  const remove = (id: string) => onChange(items.filter(s => s.id !== id));
  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium">{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {items.length > 0 && (
        <div className="space-y-1.5">
          {items.map((s) => (
            <div key={s.id} className="flex items-start gap-2 p-2 rounded-md bg-muted/50">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{s.name}</p>
                {s.description
                  ? <p className="text-xs text-muted-foreground">{s.description}</p>
                  : <p className="text-xs text-muted-foreground/70 italic">No description — a generated page will have to do without one</p>}
              </div>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => remove(s.id)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input value={name} onChange={e => setName(e.target.value)} placeholder={namePlaceholder} className="h-8 text-sm flex-1" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder={descPlaceholder} className="h-8 text-sm flex-1" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Button variant="outline" size="sm" className="h-8 px-2 shrink-0" onClick={add}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** A CTA is stored as one object, so each field edits a copy of the whole. */
function ctaWith(current: PrimaryCta | null, patch: Partial<PrimaryCta>): PrimaryCta | null {
  const next: PrimaryCta = {
    label: current?.label || "",
    destination: current?.destination || "",
    intent: current?.intent || "",
    ...patch,
  };
  // All three empty means no CTA at all — store null rather than a blank button.
  return next.label || next.destination || next.intent ? next : null;
}

function ProofPointEditor({ points, onChange }: { points: ProofPoint[]; onChange: (v: ProofPoint[]) => void }) {
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [context, setContext] = useState("");
  const add = () => {
    if (!value.trim() || !label.trim()) return;
    onChange([...points, { id: crypto.randomUUID(), value: value.trim(), label: label.trim(), context: context.trim() }]);
    setValue("");
    setLabel("");
    setContext("");
  };
  const remove = (id: string) => onChange(points.filter(pp => pp.id !== id));
  return (
    <div className="space-y-2">
      {points.length > 0 && (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {points.map((pp) => (
            <div key={pp.id} className="flex items-start gap-2 p-2 rounded-md bg-muted/50">
              <div className="flex-1 min-w-0">
                <p className="text-lg font-semibold leading-tight tabular-nums">{pp.value}</p>
                <p className="text-xs font-medium">{pp.label}</p>
                {pp.context && <p className="text-xs text-muted-foreground">{pp.context}</p>}
              </div>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => remove(pp.id)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input value={value} onChange={e => setValue(e.target.value)} placeholder="412 km" className="h-8 text-sm w-28 shrink-0 tabular-nums" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="kanalisation byggd" className="h-8 text-sm flex-1" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Input value={context} onChange={e => setContext(e.target.value)} placeholder="Context (optional)" className="h-8 text-sm flex-1" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Button variant="outline" size="sm" className="h-8 px-2 shrink-0" onClick={add} disabled={!value.trim() || !label.trim()}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        The figure goes in the first box exactly as it should be printed — unit and all. The second says what it counts.
      </p>
    </div>
  );
}

function TestimonialEditor({ items, onChange }: { items: Testimonial[]; onChange: (v: Testimonial[]) => void }) {
  const [quote, setQuote] = useState("");
  const [author, setAuthor] = useState("");
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const add = () => {
    if (!quote.trim()) return;
    onChange([...items, { id: crypto.randomUUID(), quote: quote.trim(), author: author.trim(), role: role.trim(), company: company.trim() }]);
    setQuote("");
    setAuthor("");
    setRole("");
    setCompany("");
  };
  const remove = (id: string) => onChange(items.filter(t => t.id !== id));
  const attribution = (t: Testimonial) => [t.author, t.role, t.company].filter(Boolean).join(", ");
  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium">Client Testimonials</Label>
      {items.length > 0 && (
        <div className="space-y-1.5">
          {items.map((t) => (
            <div key={t.id} className="flex items-start gap-2 p-2 rounded-md bg-muted/50">
              <Quote className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-sm">{t.quote}</p>
                {attribution(t)
                  ? <p className="text-xs text-muted-foreground">— {attribution(t)}</p>
                  : <p className="text-xs text-muted-foreground/70 italic">Unattributed — it will render without a name, never with a guessed one</p>}
              </div>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => remove(t.id)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <Textarea
        value={quote}
        onChange={e => setQuote(e.target.value)}
        placeholder="The quote, exactly as they said it"
        rows={2}
        className="[field-sizing:content] max-h-96 resize-y text-sm leading-relaxed"
      />
      <div className="flex gap-2">
        <Input value={author} onChange={e => setAuthor(e.target.value)} placeholder="Name" className="h-8 text-sm flex-1" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Input value={role} onChange={e => setRole(e.target.value)} placeholder="Role" className="h-8 text-sm flex-1" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Input value={company} onChange={e => setCompany(e.target.value)} placeholder="Company" className="h-8 text-sm flex-1" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Button variant="outline" size="sm" className="h-8 px-2 shrink-0" onClick={add} disabled={!quote.trim()}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
