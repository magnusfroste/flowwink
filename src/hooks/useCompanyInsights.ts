import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

export interface ServiceItem {
  id: string;
  name: string;
  description: string;
}

export interface CompanyProfile {
  company_name: string;
  about_us: string;
  services: ServiceItem[];
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
  domain: string;
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
}

export interface EnrichmentEntry {
  source: string;
  timestamp: string;
  fields_updated: string[];
}

export const defaultProfile: CompanyProfile = {
  company_name: "",
  about_us: "",
  services: [],
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
  domain: "",
  org_number: "",
  revenue: "",
  employees: "",
  board_members: [],
  financial_health: "",
  founded_year: "",
  legal_name: "",
  enrichment_log: [],
};

const QUERY_KEY = ["site-settings", "company_profile"];

/**
 * Normalize legacy services format.
 * Old format: Record<string, string> → New format: ServiceItem[]
 */
function normalizeServices(raw: unknown): ServiceItem[] {
  if (Array.isArray(raw)) return raw as ServiceItem[];
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return Object.entries(raw as Record<string, string>).map(([name, description]) => ({
      id: crypto.randomUUID(),
      name,
      description: description || "",
    }));
  }
  return [];
}

/**
 * Merge enrichment data into current profile.
 * DEFENSIVE: Only fills EMPTY fields — never overwrites existing data.
 * Returns the merged profile and list of fields that were updated.
 */
function mergeEnrichment(
  current: CompanyProfile,
  extracted: Record<string, unknown>,
): { merged: CompanyProfile; fieldsUpdated: string[] } {
  const merged = { ...current };
  const fieldsUpdated: string[] = [];

  for (const [key, val] of Object.entries(extracted)) {
    if (key === "enrichment_log" || key === "services") continue;
    const currentVal = (current as unknown as Record<string, unknown>)[key];

    // Skip if the extracted value is empty
    if (!val || !String(val).trim()) continue;

    // Skip if current field already has data (DEFENSIVE — never overwrite)
    if (currentVal && String(currentVal).trim()) continue;

    (merged as unknown as Record<string, unknown>)[key] = val;
    fieldsUpdated.push(key);
  }

  return { merged, fieldsUpdated };
}

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
      const raw = { ...defaultProfile, ...(data?.value as unknown as Partial<CompanyProfile>) };
      // Normalize legacy services format
      raw.services = normalizeServices(raw.services);
      return raw as CompanyProfile;
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
      const { merged, fieldsUpdated } = mergeEnrichment(currentProfile, extracted);

      merged.enrichment_log = [
        ...(merged.enrichment_log || []),
        { source: `Website: ${url}`, timestamp: new Date().toISOString(), fields_updated: fieldsUpdated },
      ];

      if (fieldsUpdated.length === 0) {
        toast.info("All fields already populated — nothing new to add");
      } else {
        toast.success(`Extracted ${fieldsUpdated.length} new fields — review and save`);
      }
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
      const { merged, fieldsUpdated } = mergeEnrichment(currentProfile, extracted);

      merged.enrichment_log = [
        ...(merged.enrichment_log || []),
        { source: data.source || "Public records", timestamp: new Date().toISOString(), fields_updated: fieldsUpdated },
      ];

      if (fieldsUpdated.length === 0) {
        toast.info("All fields already populated — nothing new to add");
      } else {
        toast.success(`Enriched ${fieldsUpdated.length} new fields from public sources`);
      }
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
