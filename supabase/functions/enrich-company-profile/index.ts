import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

    // Use Firecrawl search to find financial/company data from any public source
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
        JSON.stringify({ success: true, profile: null, source: "web_search" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const searchData = await searchResp.json();
    const results = searchData?.data || searchData?.results || [];

    // Combine content from top results
    const combinedContent = results
      .map((r: any) => `## ${r.title || r.url}\n${r.markdown || r.description || ""}`)
      .join("\n\n---\n\n")
      .slice(0, 12000);

    if (!combinedContent.trim()) {
      return new Response(
        JSON.stringify({ success: true, profile: null, source: "web_search" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use AI to extract structured financial/company data
    const aiKey = Deno.env.get("OPENAI_API_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    const extractionPrompt = `Extract structured company data from these search results. Return JSON with these fields (use empty string if not found):
- legal_name: Official registered company name
- org_number: Company registration/organization number (any country format)
- founded_year: Year the company was founded
- revenue: Annual revenue with currency (e.g. "€2.5M", "$12M", "45 MSEK")
- employees: Number of employees as string
- industry: Primary industry/sector
- address: Registered or main office address
- financial_health: Brief assessment based on available data
- board_members: Array of key people/board member names (empty array if not found)

Be market-agnostic — extract data regardless of country or currency format.
Only return the JSON object, no other text.`;

    let profile: Record<string, unknown> = {};
    const sources = results.map((r: any) => r.url).filter(Boolean);

    if (aiKey) {
      const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${aiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: extractionPrompt },
            { role: "user", content: `Company identifier: "${identifier}"\n\nSearch results:\n${combinedContent}` },
          ],
        }),
      });

      if (aiResp.ok) {
        const aiData = await aiResp.json();
        const content = aiData.choices?.[0]?.message?.content;
        if (content) {
          try { profile = JSON.parse(content); } catch { /* ignore */ }
        }
      }
    } else if (geminiKey) {
      const aiResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${extractionPrompt}\n\nCompany identifier: "${identifier}"\n\nSearch results:\n${combinedContent}` }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        }
      );

      if (aiResp.ok) {
        const aiData = await aiResp.json();
        const text = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          try { profile = JSON.parse(text); } catch { /* ignore */ }
        }
      }
    }

    if (Object.keys(profile).length === 0) {
      return new Response(
        JSON.stringify({ success: true, profile: null, source: "web_search" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Enrichment successful:", Object.keys(profile));

    return new Response(
      JSON.stringify({ success: true, profile, source: "Public web search", sources }),
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
