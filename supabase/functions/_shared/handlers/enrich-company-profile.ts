// ============================================
// Enrich Company Profile — Pure Data Sensor
// Searches public web for company data, returns raw results.
// FlowPilot interprets the data — no AI extraction here.
// ============================================


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Moved VERBATIM from supabase/functions/enrich-company-profile/index.ts (edge-surface B1b).
// Kept as a Request→Response handler; agent-execute adapts args↔Request via
// callResponseHandler — zero body changes.
export async function handler(req: Request): Promise<Response> {
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

    // Delegate to web-search edge function so admin-configured provider
    // priority (SearXNG / Firecrawl / Jina) is respected automatically.
    const searchQuery = `"${identifier}" company revenue employees founded`;
    console.log("Searching public records via web-search (priority-aware):", searchQuery);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const searchResp = await fetch(`${supabaseUrl}/functions/v1/web-search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: searchQuery, limit: 3 }),
    });

    if (!searchResp.ok) {
      console.error("web-search failed:", searchResp.status);
      return new Response(
        JSON.stringify({ success: true, raw_results: [], source: "web_search" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const searchData = await searchResp.json();
    const results = searchData?.results || [];
    console.log(`Search provider used: ${searchData?.provider}`);

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
}
