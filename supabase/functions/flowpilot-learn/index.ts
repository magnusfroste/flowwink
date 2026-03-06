import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * FlowPilot Learn
 *
 * Analyzes real usage data (page views, chat feedback, lead conversions)
 * and distills insights into agent_memory so FlowPilot can adapt.
 *
 * Designed to run on a schedule (daily or with heartbeat).
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const insights: Record<string, unknown> = {};

    // 1. Top pages by views
    const { data: pageViews } = await supabase
      .from("page_views")
      .select("page_slug, page_title")
      .gte("created_at", weekAgo);

    if (pageViews?.length) {
      const slugCounts: Record<string, { count: number; title: string }> = {};
      for (const pv of pageViews) {
        if (!slugCounts[pv.page_slug]) {
          slugCounts[pv.page_slug] = { count: 0, title: pv.page_title || pv.page_slug };
        }
        slugCounts[pv.page_slug].count++;
      }
      const sorted = Object.entries(slugCounts)
        .sort(([, a], [, b]) => b.count - a.count)
        .slice(0, 10);

      insights.top_pages = sorted.map(([slug, { count, title }]) => ({
        slug,
        title,
        views: count,
      }));
      insights.total_page_views = pageViews.length;
    }

    // 2. Chat feedback sentiment
    const { data: feedback } = await supabase
      .from("chat_feedback")
      .select("rating")
      .gte("created_at", weekAgo);

    if (feedback?.length) {
      const positive = feedback.filter((f) => f.rating === "positive").length;
      const negative = feedback.filter((f) => f.rating === "negative").length;
      insights.chat_satisfaction = {
        total: feedback.length,
        positive,
        negative,
        rate: Math.round((positive / feedback.length) * 100),
      };
    }

    // 3. Lead conversion funnel
    const { data: leads } = await supabase
      .from("leads")
      .select("status, source")
      .gte("created_at", weekAgo);

    if (leads?.length) {
      const statusCounts: Record<string, number> = {};
      const sourceCounts: Record<string, number> = {};
      for (const lead of leads) {
        statusCounts[lead.status] = (statusCounts[lead.status] || 0) + 1;
        sourceCounts[lead.source] = (sourceCounts[lead.source] || 0) + 1;
      }
      insights.lead_funnel = {
        total_new: leads.length,
        by_status: statusCounts,
        top_sources: Object.entries(sourceCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([source, count]) => ({ source, count })),
      };
    }

    // 4. Top referrers
    const { data: referrerViews } = await supabase
      .from("page_views")
      .select("referrer")
      .gte("created_at", weekAgo)
      .not("referrer", "is", null);

    if (referrerViews?.length) {
      const refCounts: Record<string, number> = {};
      for (const pv of referrerViews) {
        if (pv.referrer) {
          try {
            const host = new URL(pv.referrer).hostname;
            refCounts[host] = (refCounts[host] || 0) + 1;
          } catch {
            // skip invalid URLs
          }
        }
      }
      insights.top_referrers = Object.entries(refCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([domain, count]) => ({ domain, count }));
    }

    // 5. Store insights as agent memory
    const memoryKey = "site_usage_insights";
    const memoryValue = {
      ...insights,
      period: "7d",
      generated_at: now.toISOString(),
    };

    // Upsert — update if exists, insert if not
    const { data: existing } = await supabase
      .from("agent_memory")
      .select("id")
      .eq("key", memoryKey)
      .limit(1);

    if (existing?.length) {
      await supabase
        .from("agent_memory")
        .update({
          value: memoryValue,
          updated_at: now.toISOString(),
        })
        .eq("id", existing[0].id);
    } else {
      await supabase.from("agent_memory").insert({
        key: memoryKey,
        value: memoryValue,
        category: "context",
        created_by: "flowpilot",
      });
    }

    // 6. Generate actionable learnings
    const learnings: string[] = [];

    if (insights.chat_satisfaction) {
      const sat = insights.chat_satisfaction as any;
      if (sat.rate < 70) {
        learnings.push(`Chat satisfaction is ${sat.rate}% — consider improving KB articles on common questions.`);
      }
    }

    if (insights.top_pages) {
      const topPage = (insights.top_pages as any[])[0];
      if (topPage) {
        learnings.push(`Most visited page: "${topPage.title}" (${topPage.views} views). Ensure it's optimized.`);
      }
    }

    if (insights.lead_funnel) {
      const funnel = insights.lead_funnel as any;
      if (funnel.total_new === 0) {
        learnings.push("No new leads this week. Consider adding more forms or CTAs.");
      }
    }

    // Store learnings as a separate memory
    if (learnings.length > 0) {
      const learningKey = "weekly_learnings";
      const { data: existingLearning } = await supabase
        .from("agent_memory")
        .select("id")
        .eq("key", learningKey)
        .limit(1);

      const learningValue = {
        learnings,
        generated_at: now.toISOString(),
      };

      if (existingLearning?.length) {
        await supabase
          .from("agent_memory")
          .update({ value: learningValue, updated_at: now.toISOString() })
          .eq("id", existingLearning[0].id);
      } else {
        await supabase.from("agent_memory").insert({
          key: learningKey,
          value: learningValue,
          category: "context",
          created_by: "flowpilot",
        });
      }
    }

    console.log(`[learn] Generated ${Object.keys(insights).length} insight categories, ${learnings.length} learnings`);

    return new Response(
      JSON.stringify({
        ok: true,
        insights_categories: Object.keys(insights),
        learnings_count: learnings.length,
        learnings,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[learn] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
