import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Building2, Save, Loader2, Plus, X, Globe, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

interface CompanyProfile {
  company_name: string;
  about_us: string;
  services: Record<string, string>;
  delivered_value: string;
  clients: string;
  client_testimonials: string;
  target_industries: string[];
  differentiators: string[];
  // Sales-specific fields
  value_proposition: string;
  icp: string;
  competitors: string;
  pricing_notes: string;
  industry: string;
  // Contact info (may be auto-extracted)
  contact_email: string;
  contact_phone: string;
  address: string;
}

const defaultProfile: CompanyProfile = {
  company_name: "",
  about_us: "",
  services: {},
  delivered_value: "",
  clients: "",
  client_testimonials: "",
  target_industries: [],
  differentiators: [],
  value_proposition: "",
  icp: "",
  competitors: "",
  pricing_notes: "",
  industry: "",
  contact_email: "",
  contact_phone: "",
  address: "",
};

export function CompanyProfileCard() {
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState<CompanyProfile>(defaultProfile);
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceDesc, setNewServiceDesc] = useState("");
  const [newIndustry, setNewIndustry] = useState("");
  const [newDifferentiator, setNewDifferentiator] = useState("");
  const [enrichUrl, setEnrichUrl] = useState("");
  const [isEnriching, setIsEnriching] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["site-settings", "company_profile"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "company_profile")
        .maybeSingle();
      if (error) throw error;
      return (data?.value as unknown as CompanyProfile) || defaultProfile;
    },
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (data) setProfile({ ...defaultProfile, ...data });
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (p: CompanyProfile) => {
      const { data: existing } = await supabase
        .from("site_settings")
        .select("id")
        .eq("key", "company_profile")
        .maybeSingle();

      const jsonValue = p as unknown as Json;

      if (existing) {
        const { error } = await supabase
          .from("site_settings")
          .update({ value: jsonValue, updated_at: new Date().toISOString() })
          .eq("key", "company_profile");
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("site_settings")
          .insert({ key: "company_profile", value: jsonValue });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site-settings", "company_profile"] });
      toast.success("Company profile saved");
    },
    onError: (err) => {
      toast.error(`Failed to save: ${err instanceof Error ? err.message : "Unknown error"}`);
    },
  });

  const handleEnrich = async () => {
    if (!enrichUrl.trim()) return;
    setIsEnriching(true);
    try {
      const { data, error } = await supabase.functions.invoke("migrate-page", {
        body: { url: enrichUrl.trim() },
      });
      if (error) throw error;
      if (data?.companyProfile) {
        const extracted = data.companyProfile as Record<string, unknown>;
        setProfile(prev => {
          const merged = { ...prev };
          for (const [key, val] of Object.entries(extracted)) {
            const currentVal = (prev as unknown as Record<string, unknown>)[key];
            if (val && String(val).trim() && (!currentVal || !String(currentVal).trim())) {
              (merged as Record<string, unknown>)[key] = val;
            }
          }
          return merged;
        });
        toast.success("Company data extracted — review and save");
      } else {
        toast.info("No company data could be extracted from this page");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enrichment failed");
    } finally {
      setIsEnriching(false);
    }
  };

  const update = (field: keyof CompanyProfile, value: any) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const addService = () => {
    if (!newServiceName.trim()) return;
    update("services", { ...profile.services, [newServiceName.trim()]: newServiceDesc.trim() });
    setNewServiceName("");
    setNewServiceDesc("");
  };

  const removeService = (name: string) => {
    const next = { ...profile.services };
    delete next[name];
    update("services", next);
  };

  const addTag = (field: "target_industries" | "differentiators", value: string, setter: (v: string) => void) => {
    if (!value.trim()) return;
    update(field, [...(profile[field] || []), value.trim()]);
    setter("");
  };

  const removeTag = (field: "target_industries" | "differentiators", index: number) => {
    update(field, (profile[field] || []).filter((_, i) => i !== index));
  };

  const filledFields = [
    profile.company_name,
    profile.about_us,
    Object.keys(profile.services).length > 0,
    profile.delivered_value,
    profile.target_industries.length > 0,
    profile.value_proposition,
    profile.icp,
  ].filter(Boolean).length;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-8 bg-muted rounded" />
            <div className="h-20 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="md:col-span-2">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                Company Profile
                <Badge variant={filledFields >= 5 ? "default" : "outline"} className="text-xs">
                  {filledFields}/7 sections
                </Badge>
              </CardTitle>
              <CardDescription>
                Unified business context used by Sales Intelligence, Chat AI, and FlowAgent
              </CardDescription>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => saveMutation.mutate(profile)}
            disabled={saveMutation.isPending}
            className="gap-1.5"
          >
            {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Enrich from Website */}
        <div className="p-3 rounded-lg border border-dashed bg-muted/30 space-y-2">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5" />
            Enrich from Website
          </Label>
          <div className="flex gap-2">
            <Input
              value={enrichUrl}
              onChange={(e) => setEnrichUrl(e.target.value)}
              placeholder="https://yourcompany.com"
              className="h-8 text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleEnrich()}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 shrink-0"
              onClick={handleEnrich}
              disabled={isEnriching || !enrichUrl.trim()}
            >
              {isEnriching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Enrich
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            AI will extract company data from your website. Existing fields won't be overwritten.
          </p>
        </div>

        {/* Company Name */}
        <div className="space-y-1.5">
          <Label htmlFor="cp-name" className="text-xs font-medium">Company Name</Label>
          <Input
            id="cp-name"
            value={profile.company_name}
            onChange={(e) => update("company_name", e.target.value)}
            placeholder="Acme Consulting AB"
            className="h-9"
          />
        </div>

        {/* Industry */}
        <div className="space-y-1.5">
          <Label htmlFor="cp-industry" className="text-xs font-medium">Industry</Label>
          <Input
            id="cp-industry"
            value={profile.industry}
            onChange={(e) => update("industry", e.target.value)}
            placeholder="Digital Agency, SaaS, Consulting..."
            className="h-9"
          />
        </div>

        {/* About Us */}
        <div className="space-y-1.5">
          <Label htmlFor="cp-about" className="text-xs font-medium">About Us</Label>
          <Textarea
            id="cp-about"
            value={profile.about_us}
            onChange={(e) => update("about_us", e.target.value)}
            placeholder="Brief description of your company, mission, and what you do..."
            rows={3}
          />
        </div>

        {/* Value Proposition */}
        <div className="space-y-1.5">
          <Label htmlFor="cp-vp" className="text-xs font-medium">Value Proposition</Label>
          <Textarea
            id="cp-vp"
            value={profile.value_proposition}
            onChange={(e) => update("value_proposition", e.target.value)}
            placeholder="What unique value do you deliver to clients?"
            rows={2}
          />
        </div>

        {/* ICP */}
        <div className="space-y-1.5">
          <Label htmlFor="cp-icp" className="text-xs font-medium">Ideal Customer Profile</Label>
          <Textarea
            id="cp-icp"
            value={profile.icp}
            onChange={(e) => update("icp", e.target.value)}
            placeholder="Describe your ideal customer: size, industry, challenges..."
            rows={2}
          />
        </div>

        {/* Services */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">Services</Label>
          {Object.entries(profile.services).length > 0 && (
            <div className="space-y-1.5">
              {Object.entries(profile.services).map(([name, desc]) => (
                <div key={name} className="flex items-start gap-2 p-2 rounded-md bg-muted/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{name}</p>
                    {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => removeService(name)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={newServiceName}
              onChange={(e) => setNewServiceName(e.target.value)}
              placeholder="Service name"
              className="h-8 text-sm flex-1"
              onKeyDown={(e) => e.key === "Enter" && addService()}
            />
            <Input
              value={newServiceDesc}
              onChange={(e) => setNewServiceDesc(e.target.value)}
              placeholder="Brief description"
              className="h-8 text-sm flex-1"
              onKeyDown={(e) => e.key === "Enter" && addService()}
            />
            <Button variant="outline" size="sm" className="h-8 px-2 shrink-0" onClick={addService}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Delivered Value */}
        <div className="space-y-1.5">
          <Label htmlFor="cp-value" className="text-xs font-medium">Delivered Value</Label>
          <Textarea
            id="cp-value"
            value={profile.delivered_value}
            onChange={(e) => update("delivered_value", e.target.value)}
            placeholder="What measurable outcomes do you deliver? E.g. '30% increase in lead conversion'..."
            rows={2}
          />
        </div>

        {/* Competitors */}
        <div className="space-y-1.5">
          <Label htmlFor="cp-competitors" className="text-xs font-medium">Competitors</Label>
          <Input
            id="cp-competitors"
            value={profile.competitors}
            onChange={(e) => update("competitors", e.target.value)}
            placeholder="Competitor A, Competitor B..."
            className="h-9"
          />
        </div>

        {/* Pricing Notes */}
        <div className="space-y-1.5">
          <Label htmlFor="cp-pricing" className="text-xs font-medium">Pricing Strategy</Label>
          <Textarea
            id="cp-pricing"
            value={profile.pricing_notes}
            onChange={(e) => update("pricing_notes", e.target.value)}
            placeholder="Pricing model, ranges, or strategy notes..."
            rows={2}
          />
        </div>

        {/* Clients */}
        <div className="space-y-1.5">
          <Label htmlFor="cp-clients" className="text-xs font-medium">Notable Clients</Label>
          <Input
            id="cp-clients"
            value={profile.clients}
            onChange={(e) => update("clients", e.target.value)}
            placeholder="Volvo, IKEA, Spotify..."
            className="h-9"
          />
        </div>

        {/* Client Testimonials */}
        <div className="space-y-1.5">
          <Label htmlFor="cp-testimonials" className="text-xs font-medium">Client Testimonials</Label>
          <Textarea
            id="cp-testimonials"
            value={profile.client_testimonials}
            onChange={(e) => update("client_testimonials", e.target.value)}
            placeholder="Short quotes from happy clients..."
            rows={2}
          />
        </div>

        {/* Contact Info */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="cp-email" className="text-xs font-medium">Contact Email</Label>
            <Input
              id="cp-email"
              value={profile.contact_email}
              onChange={(e) => update("contact_email", e.target.value)}
              placeholder="info@company.com"
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-phone" className="text-xs font-medium">Contact Phone</Label>
            <Input
              id="cp-phone"
              value={profile.contact_phone}
              onChange={(e) => update("contact_phone", e.target.value)}
              placeholder="+46 8 123 45 67"
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-address" className="text-xs font-medium">Address</Label>
            <Input
              id="cp-address"
              value={profile.address}
              onChange={(e) => update("address", e.target.value)}
              placeholder="Street, City"
              className="h-9"
            />
          </div>
        </div>

        {/* Target Industries */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">Target Industries</Label>
          <div className="flex flex-wrap gap-1.5">
            {(profile.target_industries || []).map((ind, i) => (
              <Badge key={i} variant="secondary" className="gap-1 text-xs">
                {ind}
                <button onClick={() => removeTag("target_industries", i)} className="ml-0.5 hover:text-destructive">
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newIndustry}
              onChange={(e) => setNewIndustry(e.target.value)}
              placeholder="Add industry..."
              className="h-8 text-sm"
              onKeyDown={(e) => e.key === "Enter" && addTag("target_industries", newIndustry, setNewIndustry)}
            />
            <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => addTag("target_industries", newIndustry, setNewIndustry)}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Differentiators */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">Key Differentiators</Label>
          <div className="flex flex-wrap gap-1.5">
            {(profile.differentiators || []).map((diff, i) => (
              <Badge key={i} variant="secondary" className="gap-1 text-xs">
                {diff}
                <button onClick={() => removeTag("differentiators", i)} className="ml-0.5 hover:text-destructive">
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newDifferentiator}
              onChange={(e) => setNewDifferentiator(e.target.value)}
              placeholder="Add differentiator..."
              className="h-8 text-sm"
              onKeyDown={(e) => e.key === "Enter" && addTag("differentiators", newDifferentiator, setNewDifferentiator)}
            />
            <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => addTag("differentiators", newDifferentiator, setNewDifferentiator)}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
