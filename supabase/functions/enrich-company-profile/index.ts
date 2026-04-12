// ============================================
// Enrich Company Profile — Pure Data Sensor
// Searches public web for company data, returns raw results.
// FlowPilot interprets the data — no AI extraction here.
// ============================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { identifier } = await req.json();

    if (!identifier) {
      return new Response(
        JSON.stringify({ success: false, error: "identifier is required (company name, registration number, or domain)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Web search not configured. Add Firecrawl integration to enable public record enrichment." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Search public web for company data
    const searchQuery = `"${identifier}" company revenue employees founded`;
    console.log("Searching public records for:", searchQuery);

    const searchResp = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${firecrawlKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: searchQuery,
        limit: 3,
        scrapeOptions: { formats: ["markdown"] },
      }),
    });

    if (!searchResp.ok) {
      console.error("Firecrawl search failed:", searchResp.status);
      return new Response(
        JSON.stringify({ success: true, raw_results: [], source: "web_search" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const searchData = await searchResp.json();
    const results = searchData?.data || searchData?.results || [];

    // Return raw search results — FlowPilot does the interpretation
    const rawResults = results.map((r: any) => ({
      url: r.url || null,
      title: r.title || null,
      description: r.description || null,
      content: (r.markdown || r.description || "").slice(0, 4000),
    }));

    const sources = results.map((r: any) => r.url).filter(Boolean);

    console.log("Enrichment search complete:", rawResults.length, "results");

    return new Response(
      JSON.stringify({
        success: true,
        identifier,
        raw_results: rawResults,
        source: "Public web search",
        sources,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Enrichment error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
