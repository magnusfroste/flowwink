import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { identifier } = await req.json();

    if (!identifier) {
      return new Response(
        JSON.stringify({ success: false, error: "identifier is required (org number or company name)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try Allabolag scrape via Firecrawl if available
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    let profile: Record<string, unknown> = {};
    let source = "allabolag.se";

    if (firecrawlKey) {
      const searchUrl = `https://www.allabolag.se/what/${encodeURIComponent(identifier)}`;
      console.log("Scraping Allabolag:", searchUrl);

      const scrapeResp = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${firecrawlKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: searchUrl,
          formats: ["markdown"],
          onlyMainContent: true,
          waitFor: 2000,
        }),
      });

      if (scrapeResp.ok) {
        const scrapeData = await scrapeResp.json();
        const markdown = scrapeData?.data?.markdown || scrapeData?.markdown || "";

        if (markdown) {
          // Use AI to extract structured data from the Allabolag page
          const aiKey = Deno.env.get("OPENAI_API_KEY");
          const geminiKey = Deno.env.get("GEMINI_API_KEY");

          if (aiKey) {
            const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${aiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "gpt-4o-mini",
                response_format: { type: "json_object" },
                messages: [
                  {
                    role: "system",
                    content: `Extract structured company data from this Swedish business registry page. Return JSON with these fields (leave empty string if not found):
                    legal_name, org_number, founded_year, revenue (in SEK, e.g. "12.5 MSEK"), employees (number as string), 
                    industry, address, financial_health (brief assessment), board_members (array of names).`,
                  },
                  { role: "user", content: markdown.slice(0, 8000) },
                ],
              }),
            });

            if (aiResp.ok) {
              const aiData = await aiResp.json();
              const content = aiData.choices?.[0]?.message?.content;
              if (content) {
                try {
                  profile = JSON.parse(content);
                } catch { /* ignore parse errors */ }
              }
            }
          } else if (geminiKey) {
            const aiResp = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [
                    {
                      parts: [
                        {
                          text: `Extract structured company data from this Swedish business registry page. Return ONLY valid JSON with these fields (leave empty string if not found):
                          legal_name, org_number, founded_year, revenue (in SEK, e.g. "12.5 MSEK"), employees (number as string), 
                          industry, address, financial_health (brief assessment), board_members (array of names).
                          
                          Page content:
                          ${markdown.slice(0, 8000)}`,
                        },
                      ],
                    },
                  ],
                  generationConfig: { responseMimeType: "application/json" },
                }),
              }
            );

            if (aiResp.ok) {
              const aiData = await aiResp.json();
              const text = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                try {
                  profile = JSON.parse(text);
                } catch { /* ignore */ }
              }
            }
          }
        }
      } else {
        console.error("Firecrawl scrape failed:", scrapeResp.status);
      }
    } else {
      console.warn("FIRECRAWL_API_KEY not set — cannot scrape Allabolag");
      return new Response(
        JSON.stringify({ success: false, error: "Web scraping not configured. Add Firecrawl integration to enable public record enrichment." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (Object.keys(profile).length === 0) {
      return new Response(
        JSON.stringify({ success: true, profile: null, source }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Enrichment successful:", Object.keys(profile));

    return new Response(
      JSON.stringify({ success: true, profile, source }),
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
