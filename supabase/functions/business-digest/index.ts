import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Business Digest
 *
 * Compiles a weekly (or custom period) summary across all platform modules:
 * page views, leads, bookings, orders, blog posts, newsletters, chat conversations.
 *
 * Returns a structured digest with highlights and actionable callouts.
 * Designed to be invoked via the skill engine (agent-execute).
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface DigestRequest {
  period?: "day" | "week" | "month";
  format?: "structured" | "markdown";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body: DigestRequest = await req.json().catch(() => ({}));
    const period = body.period || "week";
    const format = body.format || "markdown";

    const since = new Date();
    switch (period) {
      case "day":
        since.setDate(since.getDate() - 1);
        break;
      case "week":
        since.setDate(since.getDate() - 7);
        break;
      case "month":
        since.setMonth(since.getMonth() - 1);
        break;
    }
    const sinceISO = since.toISOString();

    // ── Parallel data fetches ─────────────────────────────────────────────
    const [
      pageViewsRes,
      leadsRes,
      bookingsRes,
      ordersRes,
      blogPostsRes,
      newslettersRes,
      chatConversationsRes,
      formSubmissionsRes,
      subscribersRes,
    ] = await Promise.all([
      // Page views
      supabase
        .from("page_views")
        .select("page_slug, page_title, device_type, referrer")
        .gte("created_at", sinceISO),

      // Leads
      supabase
        .from("leads")
        .select("id, name, email, source, status, score, ai_summary")
        .gte("created_at", sinceISO)
        .order("score", { ascending: false }),

      // Bookings
      supabase
        .from("bookings")
        .select("id, customer_name, customer_email, status, start_time, service_id")
        .gte("created_at", sinceISO),

      // Orders
      supabase
        .from("orders")
        .select("id, total_cents, currency, status, customer_email")
        .gte("created_at", sinceISO),

      // Blog posts (created or published)
      supabase
        .from("blog_posts")
        .select("id, title, slug, status, published_at")
        .gte("created_at", sinceISO),

      // Newsletters
      supabase
        .from("newsletters")
        .select("id, subject, status, sent_count, open_count, unique_opens, click_count")
        .gte("created_at", sinceISO),

      // Chat conversations
      supabase
        .from("chat_conversations")
        .select("id, title, conversation_status, sentiment_score, customer_email")
        .gte("created_at", sinceISO),

      // Form submissions
      supabase
        .from("form_submissions")
        .select("id, form_name")
        .gte("created_at", sinceISO),

      // New newsletter subscribers
      supabase
        .from("newsletter_subscribers")
        .select("id, email, status")
        .gte("created_at", sinceISO),
    ]);

    // ── Compile metrics ───────────────────────────────────────────────────
    const pageViews = pageViewsRes.data || [];
    const leads = leadsRes.data || [];
    const bookings = bookingsRes.data || [];
    const orders = ordersRes.data || [];
    const blogPosts = blogPostsRes.data || [];
    const newsletters = newslettersRes.data || [];
    const conversations = chatConversationsRes.data || [];
    const formSubs = formSubmissionsRes.data || [];
    const newSubscribers = subscribersRes.data || [];

    // Page view breakdown
    const topPages = Object.entries(
      pageViews.reduce<Record<string, { title: string; count: number }>>((acc, pv) => {
        const slug = pv.page_slug || "unknown";
        if (!acc[slug]) acc[slug] = { title: pv.page_title || slug, count: 0 };
        acc[slug].count++;
        return acc;
      }, {})
    )
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);

    // Device breakdown
    const devices = pageViews.reduce<Record<string, number>>((acc, pv) => {
      const d = pv.device_type || "unknown";
      acc[d] = (acc[d] || 0) + 1;
      return acc;
    }, {});

    // Referrer breakdown (top 5)
    const referrers = Object.entries(
      pageViews.reduce<Record<string, number>>((acc, pv) => {
        const r = pv.referrer || "direct";
        acc[r] = (acc[r] || 0) + 1;
        return acc;
      }, {})
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Order revenue
    const totalRevenueCents = orders
      .filter((o) => o.status !== "cancelled")
      .reduce((sum, o) => sum + (o.total_cents || 0), 0);
    const currency = orders[0]?.currency || "SEK";

    // Lead score highlights
    const hotLeads = leads.filter((l) => (l.score || 0) >= 50);
    const leadsByStatus = leads.reduce<Record<string, number>>((acc, l) => {
      acc[l.status] = (acc[l.status] || 0) + 1;
      return acc;
    }, {});

    // Booking status breakdown
    const bookingsByStatus = bookings.reduce<Record<string, number>>((acc, b) => {
      acc[b.status] = (acc[b.status] || 0) + 1;
      return acc;
    }, {});

    // Chat sentiment
    const avgSentiment =
      conversations.length > 0
        ? conversations.reduce((sum, c) => sum + (c.sentiment_score || 0), 0) / conversations.length
        : null;

    // ── Actionable callouts ───────────────────────────────────────────────
    const callouts: string[] = [];

    if (hotLeads.length > 0) {
      callouts.push(
        `🔥 ${hotLeads.length} hot lead${hotLeads.length > 1 ? "s" : ""} (score ≥50) need${hotLeads.length === 1 ? "s" : ""} follow-up: ${hotLeads.slice(0, 3).map((l) => l.name || l.email).join(", ")}${hotLeads.length > 3 ? ` +${hotLeads.length - 3} more` : ""}`
      );
    }

    if (bookingsByStatus["pending"] > 0) {
      callouts.push(
        `📅 ${bookingsByStatus["pending"]} booking${bookingsByStatus["pending"] > 1 ? "s" : ""} pending confirmation`
      );
    }

    const publishedPosts = blogPosts.filter((p) => p.status === "published");
    const draftPosts = blogPosts.filter((p) => p.status === "draft");
    if (draftPosts.length > 0) {
      callouts.push(
        `✏️ ${draftPosts.length} blog draft${draftPosts.length > 1 ? "s" : ""} waiting to be published`
      );
    }

    if (avgSentiment !== null && avgSentiment < 3) {
      callouts.push(
        `⚠️ Average chat sentiment is low (${avgSentiment.toFixed(1)}/10) — consider reviewing recent conversations`
      );
    }

    if (newSubscribers.length > 0) {
      callouts.push(
        `📬 ${newSubscribers.length} new newsletter subscriber${newSubscribers.length > 1 ? "s" : ""}`
      );
    }

    if (callouts.length === 0) {
      callouts.push("✅ Everything looks good — no urgent items this period.");
    }

    // ── Build digest ──────────────────────────────────────────────────────
    const digest = {
      period,
      since: sinceISO,
      generated_at: new Date().toISOString(),
      summary: {
        total_page_views: pageViews.length,
        new_leads: leads.length,
        hot_leads: hotLeads.length,
        new_bookings: bookings.length,
        new_orders: orders.length,
        revenue: {
          total_cents: totalRevenueCents,
          formatted: `${(totalRevenueCents / 100).toFixed(2)} ${currency}`,
        },
        blog_posts_created: blogPosts.length,
        blog_posts_published: publishedPosts.length,
        newsletters_sent: newsletters.filter((n) => n.status === "sent").length,
        chat_conversations: conversations.length,
        form_submissions: formSubs.length,
        new_subscribers: newSubscribers.length,
      },
      details: {
        top_pages: topPages.map(([slug, info]) => ({ slug, title: info.title, views: info.count })),
        devices,
        top_referrers: referrers.map(([ref, count]) => ({ referrer: ref, count })),
        leads_by_status: leadsByStatus,
        bookings_by_status: bookingsByStatus,
        hot_leads: hotLeads.slice(0, 5).map((l) => ({
          name: l.name,
          email: l.email,
          score: l.score,
          source: l.source,
          summary: l.ai_summary,
        })),
      },
      callouts,
    };

    // ── Format output ─────────────────────────────────────────────────────
    if (format === "markdown") {
      const md = compileMarkdown(digest);
      return new Response(
        JSON.stringify({ ...digest, markdown: md }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(digest), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("business-digest error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ── Markdown formatter ────────────────────────────────────────────────────────

function compileMarkdown(digest: any): string {
  const s = digest.summary;
  const d = digest.details;
  const periodLabel =
    digest.period === "day" ? "Daily" : digest.period === "week" ? "Weekly" : "Monthly";

  let md = `# 📊 ${periodLabel} Business Digest\n\n`;
  md += `*${new Date(digest.since).toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${new Date(digest.generated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}*\n\n`;

  // Highlights
  md += `## Highlights\n\n`;
  md += `| Metric | Count |\n|--------|-------|\n`;
  md += `| Page Views | ${s.total_page_views} |\n`;
  md += `| New Leads | ${s.new_leads} |\n`;
  md += `| Hot Leads (score ≥50) | ${s.hot_leads} |\n`;
  md += `| New Bookings | ${s.new_bookings} |\n`;
  md += `| Orders | ${s.new_orders} |\n`;
  md += `| Revenue | ${s.revenue.formatted} |\n`;
  md += `| Blog Posts Published | ${s.blog_posts_published} |\n`;
  md += `| Chat Conversations | ${s.chat_conversations} |\n`;
  md += `| Form Submissions | ${s.form_submissions} |\n`;
  md += `| New Subscribers | ${s.new_subscribers} |\n\n`;

  // Top pages
  if (d.top_pages.length > 0) {
    md += `## Top Pages\n\n`;
    md += `| Page | Views |\n|------|-------|\n`;
    for (const p of d.top_pages) {
      md += `| ${p.title} (/${p.slug}) | ${p.views} |\n`;
    }
    md += `\n`;
  }

  // Hot leads
  if (d.hot_leads.length > 0) {
    md += `## 🔥 Hot Leads\n\n`;
    for (const l of d.hot_leads) {
      md += `- **${l.name || l.email}** — Score: ${l.score}, Source: ${l.source}`;
      if (l.summary) md += ` — ${l.summary}`;
      md += `\n`;
    }
    md += `\n`;
  }

  // Callouts
  md += `## Action Items\n\n`;
  for (const c of digest.callouts) {
    md += `- ${c}\n`;
  }

  return md;
}
