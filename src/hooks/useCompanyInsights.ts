import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { callSkill } from '@/lib/call-skill';
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";
import {
  isBlankValue,
  normalizeCompanyProfileShapes,
  type NamedItem,
  type PrimaryCta,
  type ProofPoint,
  type Testimonial,
} from "@/lib/company-profile-shapes";

export type { NamedItem, PrimaryCta, ProofPoint, Testimonial };

/** Services (and now differentiators) — a label WITH its explanation. */
export type ServiceItem = NamedItem;

export interface CompanyProfile {
  company_name: string;
  /** One line under the company name — the shortest true sentence about it. */
  tagline: string;
  about_us: string;
  /** Why the company exists, in its own words. Written by agents long before it had an editor. */
  business_purpose: string;
  services: ServiceItem[];
  /** Prose about outcomes. The NUMBERS in it belong in proof_points, not here. */
  delivered_value: string;
  /** Numbers held as numbers — what a `stats` block renders without parsing prose. */
  proof_points: ProofPoint[];
  clients: string;
  client_testimonials: Testimonial[];
  target_industries: string[];
  /** Label + description, so a `features` block has both halves without inventing one. */
  differentiators: ServiceItem[];
  /** What the visitor should DO. Without it, a generated page has no ask. */
  primary_cta: PrimaryCta | null;
  value_proposition: string;
  icp: string;
  /** How claims are made — a writing RULE injected into every outward AI surface; it overrides campaign briefs. */
  claim_stance: string;
  /** Topics this channel routes to a person instead of answering (legitimate questions, wrong channel). */
  boundaries: string;
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
  // The register fields agents and enrichment write via update_company_profile's
  // shallow merge. Stored and read by prompts long before they had an editor —
  // load-bearing, invisible, uncorrectable (the tagline class). Now editable.
  ceo: string;
  website: string;
  linkedin: string;
  tagline_en: string;
  city: string;
  postal_code: string;
  country: string;
  legal_form: string;
  vat_number: string;
  share_capital: string;
  /** Registration date at the companies office (YYYY-MM-DD). */
  registered: string;
  /** When the current company name was adopted (YYYY-MM-DD). */
  name_adopted: string;
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
  tagline: "",
  about_us: "",
  business_purpose: "",
  services: [],
  delivered_value: "",
  proof_points: [],
  clients: "",
  client_testimonials: [],
  target_industries: [],
  differentiators: [],
  primary_cta: null,
  value_proposition: "",
  icp: "",
  claim_stance: "",
  boundaries: "",
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
  ceo: "",
  website: "",
  linkedin: "",
  tagline_en: "",
  city: "",
  postal_code: "",
  country: "",
  legal_form: "",
  vat_number: "",
  share_capital: "",
  registered: "",
  name_adopted: "",
  enrichment_log: [],
};

const QUERY_KEY = ["site-settings", "company_profile"];

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

  // Coerce the extractor's shapes BEFORE comparing — an enricher that returns
  // differentiators as strings must not write strings into a structured field.
  const incoming = normalizeCompanyProfileShapes(extracted);

  for (const [key, val] of Object.entries(incoming)) {
    if (key === "enrichment_log" || key === "services") continue;
    const currentVal = (current as unknown as Record<string, unknown>)[key];

    // Skip if the extracted value is empty (blank string, empty list, empty object)
    if (isBlankValue(val)) continue;

    // Skip if current field already has data (DEFENSIVE — never overwrite)
    if (!isBlankValue(currentVal)) continue;

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
      const stored = (data?.value ?? {}) as Record<string, unknown>;
      // Read-side migration: services (legacy Record), differentiators (legacy
      // string[]), client_testimonials (legacy single blob) and primary_cta all
      // arrive in whatever shape the writer used — the editor only ever sees the
      // canonical one. Nothing is written back until the user saves.
      const raw = { ...defaultProfile, ...normalizeCompanyProfileShapes(stored) };
      return raw as unknown as CompanyProfile;
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
      const data = await callSkill('enrich_company_profile', ({ identifier: identifier.trim() }) as Record<string, unknown>);
      
      const rawResults = data?.raw_results as Array<{ url?: string; title?: string; content?: string }> | undefined;
      if (!rawResults || rawResults.length === 0) {
        toast.info("No public data found for this identifier");
        return null;
      }

      // Deterministic extraction from raw search results (no AI — just pattern matching)
      const combinedText = rawResults.map(r => `${r.title || ''} ${r.content || ''}`).join('\n');
      const extracted: Record<string, unknown> = {};

      // Extract org number patterns (Swedish: XXXXXX-XXXX, generic: digits with dashes)
      const orgMatch = combinedText.match(/(\d{6}-\d{4})/);
      if (orgMatch) extracted.org_number = orgMatch[1];

      // Extract employee count
      const empMatch = combinedText.match(/(\d[\d\s]*)\s*(?:employees|anställda|medarbetare)/i);
      if (empMatch) extracted.employees = empMatch[1].replace(/\s/g, '');

      // Extract founded year
      const foundedMatch = combinedText.match(/(?:founded|grundat|grundades|established)\s*(?:in\s*)?(\d{4})/i);
      if (foundedMatch) extracted.founded_year = foundedMatch[1];

      // Extract industry from title/context
      const industryMatch = combinedText.match(/(?:industry|bransch)[:\s]+([^\n,.]+)/i);
      if (industryMatch) extracted.industry = industryMatch[1].trim();

      if (Object.keys(extracted).length === 0) {
        toast.info("Found search results but couldn't extract structured data. Try enriching from website instead.");
        return null;
      }

      const { merged, fieldsUpdated } = mergeEnrichment(currentProfile, extracted);

      merged.enrichment_log = [
        ...(merged.enrichment_log || []),
        { source: String((data as any)?.source || "Public records"), timestamp: new Date().toISOString(), fields_updated: fieldsUpdated },
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
