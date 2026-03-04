import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Building2, Save, Loader2, Plus, X } from "lucide-react";
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
};

export function CompanyProfileCard() {
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState<CompanyProfile>(defaultProfile);
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceDesc, setNewServiceDesc] = useState("");
  const [newIndustry, setNewIndustry] = useState("");
  const [newDifferentiator, setNewDifferentiator] = useState("");

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
    if (data) setProfile(data);
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
                <Badge variant={filledFields >= 4 ? "default" : "outline"} className="text-xs">
                  {filledFields}/5 sections
                </Badge>
              </CardTitle>
              <CardDescription>
                Your business context used by Sales Intelligence for qualifying questions & fit analysis
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
