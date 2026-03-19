import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

export interface CompanyProfile {
  company_name: string;
  about_us: string;
  services: Record<string, string>;
  delivered_value: string;
  clients: string;
  client_testimonials: string;
  target_industries: string[];
  differentiators: string[];
  value_proposition: string;
  icp: string;
  competitors: string;
  pricing_notes: string;
  industry: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  // Financial fields (enriched from public sources)
  org_number: string;
  revenue: string;
  employees: string;
  board_members: string[];
  financial_health: string;
  founded_year: string;
  legal_name: string;
  // Enrichment metadata
  enrichment_log: EnrichmentEntry[];
  domain: string;
}

export interface EnrichmentEntry {
  source: string;
  timestamp: string;
  fields_updated: string[];
}

export const defaultProfile: CompanyProfile = {
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
  org_number: "",
  revenue: "",
  employees: "",
  board_members: [],
  financial_health: "",
  founded_year: "",
  legal_name: "",
  enrichment_log: [],
  domain: "",
};

const QUERY_KEY = ["site-settings", "company_profile"];

export function useCompanyInsights() {
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "company_profile")
        .maybeSingle();
      if (error) throw error;
      return { ...defaultProfile, ...(data?.value as unknown as Partial<CompanyProfile>) } as CompanyProfile;
    },
    staleTime: 1000 * 60 * 5,
  });

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
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Company profile saved");
    },
    onError: (err) => {
      toast.error(`Failed to save: ${err instanceof Error ? err.message : "Unknown error"}`);
    },
  });

  const enrichFromWebsite = async (url: string, currentProfile: CompanyProfile): Promise<CompanyProfile | null> => {
    try {
      const { data, error } = await supabase.functions.invoke("migrate-page", {
        body: { url: url.trim() },
      });
      if (error) throw error;
      if (!data?.companyProfile) {
        toast.info("No company data could be extracted from this page");
        return null;
      }

      const extracted = data.companyProfile as Record<string, unknown>;
      const merged = { ...currentProfile };
      const fieldsUpdated: string[] = [];

      for (const [key, val] of Object.entries(extracted)) {
        const currentVal = (currentProfile as unknown as Record<string, unknown>)[key];
        if (val && String(val).trim() && (!currentVal || !String(currentVal).trim())) {
          (merged as unknown as Record<string, unknown>)[key] = val;
          fieldsUpdated.push(key);
        }
      }

      merged.enrichment_log = [
        ...(merged.enrichment_log || []),
        { source: `Website: ${url}`, timestamp: new Date().toISOString(), fields_updated: fieldsUpdated },
      ];

      toast.success(`Extracted ${fieldsUpdated.length} fields — review and save`);
      return merged;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enrichment failed");
      return null;
    }
  };

  const enrichFromPublicSources = async (identifier: string, currentProfile: CompanyProfile): Promise<CompanyProfile | null> => {
    try {
      const { data, error } = await supabase.functions.invoke("enrich-company-profile", {
        body: { identifier: identifier.trim() },
      });
      if (error) throw error;
      if (!data?.profile) {
        toast.info("No public data found for this identifier");
        return null;
      }

      const extracted = data.profile as Record<string, unknown>;
      const merged = { ...currentProfile };
      const fieldsUpdated: string[] = [];

      for (const [key, val] of Object.entries(extracted)) {
        const currentVal = (currentProfile as unknown as Record<string, unknown>)[key];
        if (val && String(val).trim() && (!currentVal || !String(currentVal).trim())) {
          (merged as unknown as Record<string, unknown>)[key] = val;
          fieldsUpdated.push(key);
        }
      }

      merged.enrichment_log = [
        ...(merged.enrichment_log || []),
        { source: data.source || "Public records", timestamp: new Date().toISOString(), fields_updated: fieldsUpdated },
      ];

      toast.success(`Enriched ${fieldsUpdated.length} fields from public sources`);
      return merged;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enrichment failed");
      return null;
    }
  };

  return {
    profile: profile || defaultProfile,
    isLoading,
    save: saveMutation.mutate,
    isSaving: saveMutation.isPending,
    enrichFromWebsite,
    enrichFromPublicSources,
  };
}
