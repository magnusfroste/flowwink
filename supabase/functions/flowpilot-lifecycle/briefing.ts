import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { filterRecipients } from "../_shared/email-allowlist.ts";
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { enrichCronHealth, type CronHealthReport } from "../_shared/cron/health.ts";

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

// Moved VERBATIM from supabase/functions/flowpilot-briefing/index.ts (edge-surface B5).
export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

      const supabase = getServiceClient();

  try {
    // ─── Idempotency guard ──────────────────────────────────────────
    // Multiple triggers (pg_cron, agent_automations, manual, MCP) can all
    // fire the briefing on the same UTC day. Without a guard we get 2-4
    // duplicate rows per day. If a daily_digest already exists for today,
    // short-circuit unless caller passes { force: true }.
    let force = false;
    try {
      const body = req.method === "POST" ? await req.clone().json().catch(() => ({})) : {};
      force = body?.force === true;
    } catch (_) { /* no body */ }

    if (!force) {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const { data: existing } = await supabase
        .from("flowpilot_briefings")
        .select("id, created_at, title")
        .eq("type", "daily_digest")
        .gte("created_at", todayStart.toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        console.log(`[briefing] Skipped — already generated today (${existing.id} @ ${existing.created_at})`);
        return new Response(
          JSON.stringify({ skipped: true, reason: "already_generated_today", briefing: existing }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }
    }

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
      dunningActive,
      dunningRecovered,
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

      // Agent activity (all shells: flowpilot autonomous, mcp agents, cron, chat/user)
      supabase.from("agent_activity").select("agent, skill_name, status, created_at")
        .gte("created_at", yesterday.toISOString())
        .order("created_at", { ascending: false })
        .limit(100),

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

      // Dunning — failed payment recovery sequences
      supabase.from("dunning_sequences")
        .select("id, status, current_step, mrr_at_risk_cents, currency, next_action_at, subscriptions:subscription_id(customer_email, customer_name)")
        .eq("status", "active")
        .order("mrr_at_risk_cents", { ascending: false })
        .limit(10),

      // Recovered dunning in last 7 days (success metric)
      supabase.from("dunning_sequences")
        .select("mrr_at_risk_cents", { count: "exact" })
        .eq("status", "recovered")
        .gte("recovered_at", weekAgo.toISOString()),
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

    // ─── Check whether FlowPilot module is enabled ─────────────────
    // When disabled, the briefing must be presented as FlowWink (no
    // FlowPilot mentions, no autonomous-actions wording).
    const { data: modulesRow } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "modules")
      .maybeSingle();
    const fpEnabled = (modulesRow?.value as any)?.flowpilot?.enabled === true;
    const productName = fpEnabled ? "FlowPilot" : "FlowWink";

    // Activity summary — split per shell so we don't conflate human
    // FlowChat / external MCP / cron with FlowPilot's autonomous loop.
    const actions = agentActivity.data || [];
    const successActions = actions.filter((a: any) => a.status === "success").length;
    const failedActions = actions.filter((a: any) => a.status === "failed").length;
    const skillsUsed = [...new Set(actions.map((a: any) => a.skill_name).filter(Boolean))];

    // Per-shell counts (defensive: rows missing `agent` are treated as 'flowpilot'
    // for backward compatibility with older rows).
    const countByShell = (shell: string) =>
      actions.filter((a: any) => (a.agent ?? "flowpilot") === shell).length;
    const fpAutonomousActions = countByShell("flowpilot");
    const mcpActions = countByShell("mcp");
    const cronActions = countByShell("cron");
    const humanActions = countByShell("chat") + countByShell("user");

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

    // 2. Activity — only mention FlowPilot when the module is enabled.
    if (fpEnabled) {
      sections.push({
        title: "🤖 FlowPilot Activity (24h)",
        type: "activity",
        items: [
          { label: "Autonomous actions", value: fpAutonomousActions },
          { label: "Successful", value: actions.filter((a: any) => (a.agent ?? "flowpilot") === "flowpilot" && a.status === "success").length },
          { label: "Failed", value: actions.filter((a: any) => (a.agent ?? "flowpilot") === "flowpilot" && a.status === "failed").length },
          { label: "Skills used", value: skillsUsed.join(", ") || "none" },
        ],
      });
    } else if (actions.length > 0) {
      // FlowPilot off — show a neutral shell breakdown so admins still
      // see who/what is touching the system. With the autonomous loop
      // off, any rows tagged 'flowpilot' must have originated from
      // human-driven calls (FlowChat / agent-execute), so we fold them
      // into "You" rather than show a misleading FlowPilot row.
      sections.push({
        title: "⚙️ Skill Activity (24h)",
        type: "activity",
        items: [
          { label: "You (FlowChat)", value: humanActions + fpAutonomousActions },
          { label: "External agents (MCP)", value: mcpActions },
          { label: "Platform (cron)", value: cronActions },
          { label: "Failed", value: failedActions },
        ],
      });
    }

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

    // 5. Dunning — recurring revenue at risk
    const activeDunning = dunningActive.data ?? [];
    const dunningMrrAtRisk = activeDunning.reduce((s: number, d: any) => s + (d.mrr_at_risk_cents || 0), 0);
    const recoveredMrr = (dunningRecovered.data ?? []).reduce((s: number, d: any) => s + (d.mrr_at_risk_cents || 0), 0);
    if (activeDunning.length > 0 || (dunningRecovered.count ?? 0) > 0) {
      sections.push({
        title: "💸 Recurring Revenue (Dunning)",
        type: "dunning",
        items: [
          { label: "Customers in dunning", value: activeDunning.length },
          { label: "MRR at risk", value: dunningMrrAtRisk / 100, format: "currency" },
          { label: "Recovered (7d)", value: dunningRecovered.count ?? 0 },
          { label: "Recovered MRR (7d)", value: recoveredMrr / 100, format: "currency" },
        ],
      });
    }

    // 6. Scheduled-job health — THE ops channel for drift findings (River
    // incident, Magnus 2026-08-28: ops warnings go to the Daily Briefing +
    // /admin/system Observability, never to River). Evidence-based only: each
    // listed job carries pg_cron's own verdict from cron.job_run_details
    // (failed run / never ran / foreign host). Non-fatal — a briefing without
    // this section is better than no briefing.
    let cronRedJobs: Array<{ jobname: string; reasons: string[]; last_status: string | null; last_run: string | null }> = [];
    try {
      const { data: cronRaw, error: cronErr } = await supabase.rpc("cron_health_report");
      if (!cronErr && cronRaw && (cronRaw as any).cron_available) {
        const enriched = enrichCronHealth(cronRaw as CronHealthReport);
        cronRedJobs = enriched.jobs.filter((j) => j.red);
        if (cronRedJobs.length > 0) {
          sections.push({
            title: "⚙️ Scheduled Jobs",
            type: "cron_health",
            items: cronRedJobs.slice(0, 8).map((j) => ({
              label: j.jobname,
              value: j.reasons.join("; "),
              evidence: { last_status: j.last_status, last_run: j.last_run, source: "cron.job_run_details" },
            })),
          });
        }
      }
    } catch (cronCatch: any) {
      console.warn("[briefing] cron-health section skipped (non-fatal):", cronCatch?.message);
    }

    const actionItems: any[] = [];

    if (cronRedJobs.length > 0) {
      actionItems.push({
        priority: "high",
        text: `${cronRedJobs.length} scheduled job${cronRedJobs.length > 1 ? "s" : ""} unhealthy (per job_run_details) — check Observability`,
        link: "/admin/system",
      });
    }

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
        text: `${failedActions} skill execution${failedActions > 1 ? "s" : ""} failed — check Activities`,
        link: "/admin/activities",
      });
    }

    if (trafficTrend < -20) {
      actionItems.push({
        priority: "medium",
        text: `Traffic down ${Math.abs(trafficTrend)}% vs last week — consider new content`,
        link: "/admin/analytics",
      });
    }

    if (activeDunning.length > 0) {
      const highValue = activeDunning.filter((d: any) => (d.mrr_at_risk_cents || 0) >= 50000).length;
      actionItems.push({
        priority: highValue > 0 ? "high" : "medium",
        text: `${activeDunning.length} subscription${activeDunning.length > 1 ? "s" : ""} in dunning · ${(dunningMrrAtRisk / 100).toFixed(0)} MRR at risk${highValue > 0 ? ` · ${highValue} high-value` : ""}`,
        link: "/admin/subscriptions/dunning",
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
    if (fpEnabled && fpAutonomousActions > 0) {
      summaryParts.push(`FlowPilot completed ${fpAutonomousActions} action${fpAutonomousActions > 1 ? "s" : ""}`);
    }
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
      dunning_active: activeDunning.length,
      dunning_mrr_at_risk: dunningMrrAtRisk,
      dunning_recovered_7d: dunningRecovered.count ?? 0,
      dunning_recovered_mrr_7d: recoveredMrr,
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

    // ─── Post briefing to admin FlowChat ───────────────────────────
    // The daily briefing is a platform SaaS automation, not FlowPilot's
    // "voice". It runs regardless of whether the FlowPilot operator
    // module is enabled, and is posted as a system message (source='system')
    // into the admin's today-session conversation. Visitor chat is unaffected
    // because conversations are scoped to user_id with RLS.
    try {
      const { data: adminRoleRow } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin")
        .limit(1)
        .maybeSingle();

      const adminUserId = adminRoleRow?.user_id ?? null;

      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const todayLabel = todayStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });

      let conversationId: string | null = null;

      if (adminUserId) {
        // Look for an existing "Daily Briefing — <today>" conversation for this admin.
        // Match by title prefix so we update today's briefing in place instead of
        // creating a new conversation every cron run.
        const { data: todaySession } = await supabase
          .from("chat_conversations")
          .select("id")
          .eq("scope", "internal")
          .eq("user_id", adminUserId)
          .eq("title", `Daily Briefing — ${todayLabel}`)
          .gte("created_at", todayStart.toISOString())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (todaySession) conversationId = todaySession.id;
      }

      if (!conversationId) {
        const { data: newConv } = await supabase
          .from("chat_conversations")
          .insert({
            title: `Daily Briefing — ${todayLabel}`,
            conversation_status: "active",
            priority: "normal",
            user_id: adminUserId,
            scope: "internal",
            session_id: crypto.randomUUID(),
          })
          .select("id")
          .single();
        conversationId = newConv?.id ?? null;
      }

      if (conversationId) {
        const healthEmoji = healthScore >= 75 ? "🟢" : healthScore >= 50 ? "🟡" : "🔴";
        const lines: string[] = [
          `☀️ **Daily briefing**`,
          ``,
          `${healthEmoji} **Health Score: ${healthScore}/100**`,
        ];
        if (trafficToday > 0) lines.push(`• ${trafficToday} visitors today (${trafficTrend >= 0 ? "+" : ""}${trafficTrend}% vs last week)`);
        if (newLeadsToday > 0) lines.push(`• ${newLeadsToday} new lead${newLeadsToday > 1 ? "s" : ""} captured`);
        if (publishedThisWeek > 0) lines.push(`• ${publishedThisWeek} post${publishedThisWeek > 1 ? "s" : ""} published this week`);
        if (fpEnabled && fpAutonomousActions > 0) lines.push(`• FlowPilot completed ${fpAutonomousActions} action${fpAutonomousActions > 1 ? "s" : ""}`);

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
          source: "system",
          action_payload: actionPayload,
        });

        console.log(`[briefing] System message posted to "Daily Briefing — ${todayLabel}" (${conversationId})`);
      }
    } catch (chatErr: any) {
      console.error("[briefing] Failed to post chat message:", chatErr.message);
    }



    // ─── Mail the briefing — through email-send, like every other send ───
    //
    // This used to POST Resend's /emails endpoint directly (the literal URL is
    // deliberately absent here — a guardrail crawls the tree for it). It
    // worked, and that was the problem: it was the fourth rail to walk around
    // the router, and it left no row in `outbound_communications`. The cost stayed hidden
    // until check_integrations began using that table as its evidence that a
    // Resend key can send (a sending-only key is refused by GET /domains, so a
    // delivered mail is the only honest proof). The briefing went out every
    // morning and logged nothing, the sensor found no evidence, fell through to
    // /domains, got 401 — and optic's FlowChat reported the mail integration as
    // broken while it was delivering this very briefing to the owner's inbox.
    // The warning looked like a false alarm and was a true symptom: the post
    // leaves no trace.
    //
    // Going through email-send buys the whole rail, not just the log: provider
    // choice and fallback (Resend → SMTP → Composio, so an SMTP-only instance
    // gets its briefing too — the old Resend-key gate silently skipped those),
    // the suppression list, RFC 8058 one-click unsubscribe, and exactly one
    // outbound_communications row per send. The branded shell is a no-op here:
    // buildBriefingEmail returns a complete document and `isFullDocument`
    // passes those through untouched, so the mail looks exactly as before.
    let emailed = false;
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
        // Resolve site origin (env → site_settings.general). No Lovable fallback (self-hosted).
        let siteOrigin = Deno.env.get('PUBLIC_SITE_URL') || '';
        if (!siteOrigin) {
          const { data: gs } = await supabase.from('site_settings')
            .select('value').eq('key', 'general').maybeSingle();
          const v = (gs?.value as any) || {};
          siteOrigin = v.siteUrl || v.site_url || v.public_url || v.publicUrl || '';
        }
        siteOrigin = (siteOrigin || '').replace(/\/$/, '');

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
          productName,
          dashboardUrl: `${siteOrigin}/admin`,
        });


        // Prefer the sender configured in /admin/integrations (Resend panel);
        // fall back to the verified flowwink.com domain. Passed as
        // `fromOverride` so the briefing keeps the exact From line it had —
        // email-send's own resolution would otherwise pick the same address by
        // a different route, and "the same by accident" is not the same.
        let configuredFrom = "";
        try {
          const { data: intg } = await supabase
            .from("site_settings")
            .select("value")
            .eq("key", "integrations")
            .maybeSingle();
          const cfg = (intg?.value as any)?.resend?.config?.emailConfig ?? {};
          const name = (cfg.fromName || "").toString().trim();
          const email = (cfg.fromEmail || "").toString().trim();
          if (email) configuredFrom = name ? `${name} <${email}>` : email;
        } catch (_) { /* fall through to default */ }

        const fromAddress = configuredFrom || (fpEnabled
          ? "FlowPilot <flowpilot@flowwink.com>"
          : "FlowWink <briefing@flowwink.com>");

        // The allowlist is applied HERE and again inside email-send. That is
        // deliberate, not leftover: this call must never be able to hand the
        // router a recipient list the guard has not seen, whatever happens to
        // the hop in between. Both applications read the same setting, so the
        // second one can only ever narrow what the first one allowed.
        const gate = await filterRecipients(supabase, adminEmails);
        if (gate.allowed.length === 0) {
          console.warn(`[briefing] all ${adminEmails.length} recipient(s) withheld by the email allowlist — briefing saved, not mailed`);
          throw new Error(gate.error ?? `Blocked by email allowlist: ${gate.blocked.map((b) => b.address).join(", ")}`);
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
        const sendRes = await fetch(`${supabaseUrl}/functions/v1/email-send`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: gate.allowed,
            subject: `${healthEmoji} ${title} — Health ${healthScore}/100`,
            html: emailHtml,
            fromOverride: fromAddress,
            // A machine-written digest signs itself in its own footer; a
            // seller's personal signature underneath it would be a lie.
            skip_signature: true,
            // These three are what make the row answer "what did we send, to
            // whom, and why" instead of just "a mail happened".
            source: "daily_briefing",
            related_entity_type: "flowpilot_briefing",
            related_entity_id: briefing.id,
          }),
        });
        const sendJson: any = await sendRes.json().catch(() => ({}));

        if (sendRes.ok && sendJson?.success === true && sendJson?.simulated !== true) {
          emailed = true;
          await supabase
            .from("flowpilot_briefings")
            .update({ emailed_at: new Date().toISOString() })
            .eq("id", briefing.id);
          console.log(`[briefing] Email sent via ${sendJson?.provider ?? "unknown"} to ${gate.allowed.join(", ")}`);
        } else if (sendJson?.blocked_by_allowlist) {
          // email-send answers a fully blocked send with 422 — withheld, not broken.
          console.warn("[briefing] withheld by the email allowlist — briefing saved, not mailed");
        } else if (sendJson?.simulated === true) {
          // No provider configured at all. email-send logged what would have
          // gone out; stamping emailed_at here would tell the operator the
          // briefing was mailed when nothing left the building.
          console.warn("[briefing] no email provider configured — send logged as simulated, briefing not mailed");
        } else {
          console.error(`[briefing] email-send failed (HTTP ${sendRes.status}): ${sendJson?.error ?? "unknown error"}`);
        }
      } else {
        console.log("[briefing] No admin emails found, skipping email");
      }
    } catch (emailErr: any) {
      console.error("[briefing] Email send failed:", emailErr.message);
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
}

// ─── Email template builder ───────────────────────────────────────────
function buildBriefingEmail(data: {
  title: string;
  summary: string;
  healthScore: number;
  healthEmoji: string;
  sections: any[];
  actionItems: any[];
  metrics: any;
  productName?: string;
  dashboardUrl?: string;
}) {
  const { title, summary, healthScore, healthEmoji, sections, actionItems, metrics } = data;
  const productName = data.productName ?? "FlowPilot";
  const dashboardUrl = data.dashboardUrl ?? "/admin";
  const footerLine = productName === "FlowPilot"
    ? "Sent by FlowPilot · Your autonomous business co-pilot"
    : "Sent by FlowWink · Your business operating system";


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
          <div style="font-size:13px;color:#9ca3af;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">${productName}</div>
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
          <a href="${dashboardUrl}" style="display:inline-block;padding:12px 32px;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">Open Dashboard →</a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 24px;text-align:center;background:#f9fafb;border-top:1px solid #f3f4f6;">
          <div style="font-size:11px;color:#9ca3af;">${footerLine}</div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
