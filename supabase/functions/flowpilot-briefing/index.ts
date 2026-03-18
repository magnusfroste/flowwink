import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * FlowPilot Morning Briefing
 * 
 * Compiles a daily business health digest from all platform data.
 * Called by cron (8 AM daily) or manually from the dashboard.
 * Saves to flowpilot_briefings table for in-app display.
 * Future: sends email via Resend when email domain is configured.
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
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const prevWeek = new Date(now);
    prevWeek.setDate(prevWeek.getDate() - 14);

    // ─── Parallel data collection ───────────────────────────────────
    const [
      viewsToday, viewsWeek, viewsPrevWeek,
      leadsToday, leadsWeek,
      postsPublished, postsDraft,
      subscribersTotal, subscribersNew,
      ordersWeek, ordersPrevWeek,
      bookingsWeek,
      agentActivity,
      objectivesActive,
      chatConversations,
      proposals,
    ] = await Promise.all([
      // Traffic
      supabase.from("page_views").select("id", { count: "exact", head: true })
        .gte("created_at", yesterday.toISOString()),
      supabase.from("page_views").select("id", { count: "exact", head: true })
        .gte("created_at", weekAgo.toISOString()),
      supabase.from("page_views").select("id", { count: "exact", head: true })
        .gte("created_at", prevWeek.toISOString())
        .lt("created_at", weekAgo.toISOString()),
      
      // Leads
      supabase.from("leads").select("id, name, email, source, score, status", { count: "exact" })
        .gte("created_at", yesterday.toISOString()),
      supabase.from("leads").select("id", { count: "exact", head: true })
        .gte("created_at", weekAgo.toISOString()),

      // Content
      supabase.from("blog_posts").select("id, title", { count: "exact" })
        .eq("status", "published")
        .gte("published_at", weekAgo.toISOString()),
      supabase.from("blog_posts").select("id", { count: "exact", head: true })
        .eq("status", "draft"),

      // Subscribers
      supabase.from("newsletter_subscribers").select("id", { count: "exact", head: true })
        .eq("status", "confirmed"),
      supabase.from("newsletter_subscribers").select("id", { count: "exact", head: true })
        .eq("status", "confirmed")
        .gte("confirmed_at", weekAgo.toISOString()),

      // Revenue
      supabase.from("orders").select("total_cents, currency", { count: "exact" })
        .gte("created_at", weekAgo.toISOString())
        .eq("status", "completed"),
      supabase.from("orders").select("total_cents", { count: "exact" })
        .gte("created_at", prevWeek.toISOString())
        .lt("created_at", weekAgo.toISOString())
        .eq("status", "completed"),

      // Bookings
      supabase.from("bookings").select("id", { count: "exact", head: true })
        .gte("created_at", weekAgo.toISOString())
        .neq("status", "cancelled"),

      // FlowPilot activity
      supabase.from("agent_activity").select("skill_name, status, created_at")
        .gte("created_at", yesterday.toISOString())
        .order("created_at", { ascending: false })
        .limit(20),

      // Objectives
      supabase.from("agent_objectives").select("id, goal, status, progress")
        .eq("status", "active"),

      // Chat conversations
      supabase.from("chat_conversations").select("id", { count: "exact", head: true })
        .gte("created_at", weekAgo.toISOString()),

      // Content proposals
      supabase.from("content_proposals").select("id, topic, status")
        .in("status", ["draft", "ready"])
        .limit(5),
    ]);

    // ─── Compute metrics ────────────────────────────────────────────
    const trafficToday = viewsToday.count ?? 0;
    const trafficWeek = viewsWeek.count ?? 0;
    const trafficPrevWeek = viewsPrevWeek.count ?? 0;
    const trafficTrend = trafficPrevWeek > 0
      ? Math.round(((trafficWeek - trafficPrevWeek) / trafficPrevWeek) * 100)
      : trafficWeek > 0 ? 100 : 0;

    const newLeadsToday = leadsToday.count ?? 0;
    const newLeadsWeek = leadsWeek.count ?? 0;

    const revenueWeek = (ordersWeek.data || []).reduce((sum: number, o: any) => sum + (o.total_cents || 0), 0);
    const revenuePrevWeek = (ordersPrevWeek.data || []).reduce((sum: number, o: any) => sum + (o.total_cents || 0), 0);
    const revenueTrend = revenuePrevWeek > 0
      ? Math.round(((revenueWeek - revenuePrevWeek) / revenuePrevWeek) * 100)
      : revenueWeek > 0 ? 100 : 0;

    const publishedThisWeek = postsPublished.count ?? 0;
    const draftsReady = postsDraft.count ?? 0;
    const totalSubscribers = subscribersTotal.count ?? 0;
    const newSubscribers = subscribersNew.count ?? 0;
    const bookingsCount = bookingsWeek.count ?? 0;
    const chatCount = chatConversations.count ?? 0;

    // FlowPilot actions summary
    const actions = agentActivity.data || [];
    const successActions = actions.filter((a: any) => a.status === "success").length;
    const failedActions = actions.filter((a: any) => a.status === "failed").length;
    const skillsUsed = [...new Set(actions.map((a: any) => a.skill_name).filter(Boolean))];

    // Active objectives progress
    const objectives = (objectivesActive.data || []).map((o: any) => {
      const plan = o.progress?.plan;
      const completion = plan?.steps
        ? Math.round((plan.steps.filter((s: any) => s.status === "done").length / plan.total_steps) * 100)
        : 0;
      return { goal: o.goal, completion };
    });

    // ─── Build sections ─────────────────────────────────────────────
    const sections = [];

    // 1. Business Pulse
    sections.push({
      title: "📊 Business Pulse",
      type: "metrics",
      items: [
        { label: "Page Views (24h)", value: trafficToday, trend: null },
        { label: "Page Views (7d)", value: trafficWeek, trend: trafficTrend, unit: "%" },
        { label: "New Leads (24h)", value: newLeadsToday, trend: null },
        { label: "New Leads (7d)", value: newLeadsWeek, trend: null },
        { label: "Revenue (7d)", value: revenueWeek / 100, trend: revenueTrend, unit: "%", format: "currency" },
        { label: "Bookings (7d)", value: bookingsCount, trend: null },
        { label: "Chat Conversations (7d)", value: chatCount, trend: null },
        { label: "Subscribers", value: totalSubscribers, trend: newSubscribers > 0 ? `+${newSubscribers}` : null },
      ],
    });

    // 2. FlowPilot Activity
    sections.push({
      title: "🤖 FlowPilot Activity (24h)",
      type: "activity",
      items: [
        { label: "Actions executed", value: actions.length },
        { label: "Successful", value: successActions },
        { label: "Failed", value: failedActions },
        { label: "Skills used", value: skillsUsed.join(", ") || "none" },
      ],
    });

    // 3. Objective Progress
    if (objectives.length > 0) {
      sections.push({
        title: "🎯 Objective Progress",
        type: "objectives",
        items: objectives.map((o: any) => ({
          label: o.goal,
          value: `${o.completion}%`,
        })),
      });
    }

    // 4. Content Pipeline
    sections.push({
      title: "✍️ Content Pipeline",
      type: "content",
      items: [
        { label: "Published this week", value: publishedThisWeek },
        { label: "Drafts ready for review", value: draftsReady },
        { label: "Proposals pending", value: proposals.data?.length ?? 0 },
      ],
    });

    // ─── Build action items ─────────────────────────────────────────
    const actionItems: any[] = [];

    if (newLeadsToday > 0) {
      const hotLeads = (leadsToday.data || []).filter((l: any) => (l.score || 0) >= 20);
      if (hotLeads.length > 0) {
        actionItems.push({
          priority: "high",
          text: `${hotLeads.length} hot lead${hotLeads.length > 1 ? "s" : ""} captured — review and follow up`,
          link: "/admin/contacts",
        });
      }
    }

    if (draftsReady > 0) {
      actionItems.push({
        priority: "medium",
        text: `${draftsReady} blog draft${draftsReady > 1 ? "s" : ""} ready for review`,
        link: "/admin/blog",
      });
    }

    if (failedActions > 0) {
      actionItems.push({
        priority: "high",
        text: `${failedActions} FlowPilot action${failedActions > 1 ? "s" : ""} failed — check Skill Hub`,
        link: "/admin/skills",
      });
    }

    if (trafficTrend < -20) {
      actionItems.push({
        priority: "medium",
        text: `Traffic down ${Math.abs(trafficTrend)}% vs last week — consider new content`,
        link: "/admin/analytics",
      });
    }

    const pendingProposals = (proposals.data || []).filter((p: any) => p.status === "ready");
    if (pendingProposals.length > 0) {
      actionItems.push({
        priority: "low",
        text: `${pendingProposals.length} content proposal${pendingProposals.length > 1 ? "s" : ""} ready to publish`,
        link: "/admin/campaigns",
      });
    }

    // ─── Build summary ──────────────────────────────────────────────
    const summaryParts: string[] = [];
    if (trafficToday > 0) summaryParts.push(`${trafficToday} visitors today`);
    if (newLeadsToday > 0) summaryParts.push(`${newLeadsToday} new lead${newLeadsToday > 1 ? "s" : ""}`);
    if (successActions > 0) summaryParts.push(`FlowPilot completed ${successActions} action${successActions > 1 ? "s" : ""}`);
    if (publishedThisWeek > 0) summaryParts.push(`${publishedThisWeek} post${publishedThisWeek > 1 ? "s" : ""} published this week`);

    const summary = summaryParts.length > 0
      ? summaryParts.join(" · ")
      : "Quiet day — no significant activity to report.";

    const title = `Daily Briefing — ${now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}`;

    // ─── Compute health score (0-100) ───────────────────────────────
    let healthScore = 50; // base
    if (trafficWeek > 50) healthScore += 10;
    if (trafficTrend > 0) healthScore += 5;
    if (newLeadsWeek > 0) healthScore += 10;
    if (publishedThisWeek > 0) healthScore += 10;
    if (totalSubscribers > 10) healthScore += 5;
    if (failedActions > 2) healthScore -= 10;
    if (trafficTrend < -20) healthScore -= 10;
    if (objectives.some((o: any) => o.completion > 50)) healthScore += 10;
    healthScore = Math.max(0, Math.min(100, healthScore));

    const metrics = {
      health_score: healthScore,
      traffic_today: trafficToday,
      traffic_week: trafficWeek,
      traffic_trend: trafficTrend,
      leads_today: newLeadsToday,
      leads_week: newLeadsWeek,
      revenue_week: revenueWeek,
      revenue_trend: revenueTrend,
      subscribers: totalSubscribers,
      bookings_week: bookingsCount,
      content_published: publishedThisWeek,
      content_drafts: draftsReady,
      flowpilot_actions: actions.length,
      flowpilot_success_rate: actions.length > 0 ? Math.round((successActions / actions.length) * 100) : 0,
    };

    // ─── Save briefing ──────────────────────────────────────────────
    const { data: briefing, error } = await supabase
      .from("flowpilot_briefings")
      .insert({
        type: "daily_digest",
        title,
        summary,
        sections,
        metrics,
        action_items: actionItems,
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`[briefing] Created: ${title} | Health: ${healthScore} | Actions: ${actionItems.length}`);

    // ─── Inject proactive chat message into today's FlowPilot session ──
    try {
      // Find the first admin user to associate the conversation with
      const { data: adminRoleRow } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin")
        .limit(1)
        .maybeSingle();

      const adminUserId = adminRoleRow?.user_id ?? null;

      // Find or create today's FlowPilot session — matching the same pattern
      // used by useAgentOperate.getOrCreateConversation() on the frontend
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const todayLabel = todayStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });

      let conversationId: string | null = null;

      // Look for existing today session (same query shape as the frontend hook)
      if (adminUserId) {
        const { data: todaySession } = await supabase
          .from("chat_conversations")
          .select("id")
          .eq("conversation_status", "active")
          .is("session_id", null)
          .eq("user_id", adminUserId)
          .gte("created_at", todayStart.toISOString())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (todaySession) {
          conversationId = todaySession.id;
        }
      }

      // If no today-session exists, create one with the correct format
      if (!conversationId) {
        const { data: newConv } = await supabase
          .from("chat_conversations")
          .insert({
            title: `Session — ${todayLabel}`,
            conversation_status: "active",
            priority: "normal",
            user_id: adminUserId,
          })
          .select("id")
          .single();
        conversationId = newConv?.id ?? null;
      }

      if (conversationId) {
        // Build a markdown briefing message
        const healthEmoji = healthScore >= 75 ? "🟢" : healthScore >= 50 ? "🟡" : "🔴";
        const lines: string[] = [
          `☀️ **Good morning!** Here's your daily briefing:`,
          ``,
          `${healthEmoji} **Health Score: ${healthScore}/100**`,
        ];
        if (trafficToday > 0) lines.push(`• ${trafficToday} visitors today (${trafficTrend >= 0 ? "+" : ""}${trafficTrend}% vs last week)`);
        if (newLeadsToday > 0) lines.push(`• ${newLeadsToday} new lead${newLeadsToday > 1 ? "s" : ""} captured`);
        if (publishedThisWeek > 0) lines.push(`• ${publishedThisWeek} post${publishedThisWeek > 1 ? "s" : ""} published this week`);
        if (successActions > 0) lines.push(`• FlowPilot completed ${successActions} action${successActions > 1 ? "s" : ""}`);
        lines.push(``);
        lines.push(`Anything you'd like me to focus on today?`);

        const chatContent = lines.join("\n");

        const actionPayload = {
          type: "briefing",
          title,
          healthScore,
          metrics: [
            { label: "Visitors", value: trafficToday },
            { label: "Leads", value: newLeadsToday },
            { label: "Traffic", value: `${trafficTrend >= 0 ? "+" : ""}${trafficTrend}%` },
          ],
          actions: actionItems.slice(0, 3).map((item: any) => ({
            label: item.text.length > 40 ? item.text.substring(0, 40) + "…" : item.text,
            link: item.link,
            variant: item.priority === "high" ? "default" : "outline",
          })),
        };

        await supabase.from("chat_messages").insert({
          conversation_id: conversationId,
          role: "assistant",
          content: chatContent,
          source: "proactive",
          action_payload: actionPayload,
        });

        console.log(`[briefing] Proactive message injected into "Session — ${todayLabel}" (${conversationId})`);
      }
    } catch (chatErr: any) {
      console.error("[briefing] Failed to inject chat message:", chatErr.message);
    }

    // ─── Send email via Resend ──────────────────────────────────────
    let emailed = false;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (RESEND_API_KEY) {
      try {
        // Get admin user IDs, then their emails
        const { data: adminRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");

        const adminIds = (adminRoles || []).map((r: any) => r.user_id).filter(Boolean);
        let adminEmails: string[] = [];
        if (adminIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("email")
            .in("id", adminIds);
          adminEmails = (profiles || []).map((p: any) => p.email).filter(Boolean);
        }

        if (adminEmails.length > 0) {
          // Build email HTML
          const healthEmoji = healthScore >= 75 ? "🟢" : healthScore >= 50 ? "🟡" : "🔴";
          const emailHtml = buildBriefingEmail({
            title,
            summary,
            healthScore,
            healthEmoji,
            sections,
            actionItems,
            metrics,
          });

          const resendRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "FlowPilot <flowpilot@news.flowwink.com>",
              to: adminEmails,
              subject: `${healthEmoji} ${title} — Health ${healthScore}/100`,
              html: emailHtml,
            }),
          });

          if (resendRes.ok) {
            emailed = true;
            await supabase
              .from("flowpilot_briefings")
              .update({ emailed_at: new Date().toISOString() })
              .eq("id", briefing.id);
            console.log(`[briefing] Email sent to ${adminEmails.join(", ")}`);
          } else {
            const err = await resendRes.text();
            console.error(`[briefing] Resend error: ${err}`);
          }
        } else {
          console.log("[briefing] No admin emails found, skipping email");
        }
      } catch (emailErr: any) {
        console.error("[briefing] Email send failed:", emailErr.message);
      }
    }

    return new Response(
      JSON.stringify({
        status: "ok",
        briefing_id: briefing.id,
        health_score: healthScore,
        summary,
        emailed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[briefing] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ─── Email template builder ───────────────────────────────────────────
function buildBriefingEmail(data: {
  title: string;
  summary: string;
  healthScore: number;
  healthEmoji: string;
  sections: any[];
  actionItems: any[];
  metrics: any;
}) {
  const { title, summary, healthScore, healthEmoji, sections, actionItems, metrics } = data;

  const priorityColors: Record<string, string> = {
    high: "#ef4444",
    medium: "#f59e0b",
    low: "#6b7280",
  };

  const actionItemsHtml = actionItems.length > 0
    ? actionItems.map((item: any) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${priorityColors[item.priority] || "#6b7280"};margin-right:8px;"></span>
            ${item.text}
          </td>
        </tr>
      `).join("")
    : '<tr><td style="padding:12px;color:#9ca3af;">No action items — everything looks good! ✨</td></tr>';

  const metricsGrid = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      <tr>
        <td style="padding:8px;text-align:center;background:#f9fafb;border-radius:8px;">
          <div style="font-size:24px;font-weight:700;color:#111827;">${metrics.traffic_today}</div>
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;">Visitors Today</div>
        </td>
        <td style="width:8px;"></td>
        <td style="padding:8px;text-align:center;background:#f9fafb;border-radius:8px;">
          <div style="font-size:24px;font-weight:700;color:#111827;">${metrics.leads_today}</div>
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;">New Leads</div>
        </td>
        <td style="width:8px;"></td>
        <td style="padding:8px;text-align:center;background:#f9fafb;border-radius:8px;">
          <div style="font-size:24px;font-weight:700;color:#111827;">$${(metrics.revenue_week / 100).toFixed(0)}</div>
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;">Revenue (7d)</div>
        </td>
        <td style="width:8px;"></td>
        <td style="padding:8px;text-align:center;background:#f9fafb;border-radius:8px;">
          <div style="font-size:24px;font-weight:700;color:#111827;">${metrics.flowpilot_success_rate}%</div>
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;">AI Success</div>
        </td>
      </tr>
    </table>
  `;

  const trendArrow = (val: number) =>
    val > 0 ? `<span style="color:#22c55e;">↑${val}%</span>` :
    val < 0 ? `<span style="color:#ef4444;">↓${Math.abs(val)}%</span>` :
    `<span style="color:#9ca3af;">—</span>`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#111827,#1f2937);padding:32px 24px;text-align:center;">
          <div style="font-size:13px;color:#9ca3af;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">FlowPilot</div>
          <div style="font-size:22px;font-weight:700;color:#ffffff;">${title}</div>
        </td></tr>

        <!-- Health Score -->
        <tr><td style="padding:24px;text-align:center;border-bottom:1px solid #f3f4f6;">
          <div style="font-size:48px;font-weight:800;color:#111827;">${healthEmoji} ${healthScore}</div>
          <div style="font-size:13px;color:#6b7280;">Business Health Score</div>
          <div style="margin-top:8px;font-size:14px;color:#374151;">${summary}</div>
        </td></tr>

        <!-- Key Metrics -->
        <tr><td style="padding:20px 24px;">
          <div style="font-size:14px;font-weight:600;color:#111827;margin-bottom:8px;">📊 Key Metrics</div>
          ${metricsGrid}
          <table width="100%" style="font-size:13px;color:#374151;">
            <tr><td style="padding:4px 0;">Traffic trend (7d)</td><td style="text-align:right;">${trendArrow(metrics.traffic_trend)}</td></tr>
            <tr><td style="padding:4px 0;">Revenue trend (7d)</td><td style="text-align:right;">${trendArrow(metrics.revenue_trend)}</td></tr>
            <tr><td style="padding:4px 0;">Subscribers</td><td style="text-align:right;font-weight:600;">${metrics.subscribers}</td></tr>
            <tr><td style="padding:4px 0;">Bookings (7d)</td><td style="text-align:right;font-weight:600;">${metrics.bookings_week}</td></tr>
            <tr><td style="padding:4px 0;">Content published</td><td style="text-align:right;font-weight:600;">${metrics.content_published}</td></tr>
          </table>
        </td></tr>

        <!-- Action Items -->
        <tr><td style="padding:20px 24px;border-top:1px solid #f3f4f6;">
          <div style="font-size:14px;font-weight:600;color:#111827;margin-bottom:8px;">🎯 Action Items</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#374151;">
            ${actionItemsHtml}
          </table>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding:20px 24px;text-align:center;border-top:1px solid #f3f4f6;">
          <a href="https://flowwink.lovable.app/admin" style="display:inline-block;padding:12px 32px;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">Open Dashboard →</a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 24px;text-align:center;background:#f9fafb;border-top:1px solid #f3f4f6;">
          <div style="font-size:11px;color:#9ca3af;">Sent by FlowPilot · Your autonomous business co-pilot</div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
