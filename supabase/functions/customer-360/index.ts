// Customer 360 — aggregates EVERYTHING about a person/customer in one call.
// Looks up by lead_id (preferred) or email (fallback for e-com customers without a lead row).
// Returns a unified timeline + counts + KPIs ready for the /admin/customer/:id view.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type TimelineEvent = {
  id: string;
  ts: string;
  kind:
    | "lead_created"
    | "lead_activity"
    | "deal"
    | "order"
    | "invoice"
    | "quote"
    | "ticket"
    | "booking"
    | "subscription"
    | "chat"
    | "webinar"
    | "task";
  title: string;
  subtitle?: string;
  amount?: number;
  status?: string;
  href?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Require authenticated admin user.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: claims, error: authError } = await supabase.auth.getClaims(
    authHeader.replace("Bearer ", ""),
  );
  if (authError || !claims?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Service-role client for cross-table aggregation (bypasses per-table RLS).
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const url = new URL(req.url);
    const leadIdParam = url.searchParams.get("lead_id");
    const emailParam = url.searchParams.get("email")?.toLowerCase().trim();

    if (!leadIdParam && !emailParam) {
      return new Response(
        JSON.stringify({ error: "Provide ?lead_id= or ?email=" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Resolve the lead row (if any) — by id, or by email lookup.
    let lead: any = null;
    if (leadIdParam) {
      const { data } = await admin
        .from("leads")
        .select("*, companies(id, name, domain, industry, size)")
        .eq("id", leadIdParam)
        .maybeSingle();
      lead = data;
    } else if (emailParam) {
      const { data } = await admin
        .from("leads")
        .select("*, companies(id, name, domain, industry, size)")
        .eq("email", emailParam)
        .maybeSingle();
      lead = data;
    }

    const leadId: string | null = lead?.id ?? leadIdParam ?? null;
    const email: string | null = (lead?.email ?? emailParam ?? "").toLowerCase() || null;

    // Helper that runs the same query against lead_id and/or email and merges.
    const fetchByLeadOrEmail = async (
      table: string,
      select: string,
      emailColumn: string | null,
    ) => {
      const queries: Promise<any>[] = [];
      if (leadId) {
        queries.push(admin.from(table).select(select).eq("lead_id", leadId));
      }
      if (email && emailColumn) {
        queries.push(admin.from(table).select(select).eq(emailColumn, email));
      }
      if (queries.length === 0) return [];
      const results = await Promise.all(queries);
      const merged = new Map<string, any>();
      for (const r of results) {
        for (const row of r.data ?? []) {
          merged.set(row.id, row);
        }
      }
      return Array.from(merged.values());
    };

    // Pull every related entity in parallel.
    const [
      deals,
      invoices,
      quotes,
      tickets,
      orders,
      bookings,
      subscriptions,
      activities,
      tasks,
      chats,
      webinars,
    ] = await Promise.all([
      fetchByLeadOrEmail("deals", "id, title, amount, stage, status, created_at, updated_at", null),
      fetchByLeadOrEmail(
        "invoices",
        "id, invoice_number, total, status, issue_date, due_date, created_at",
        "customer_email",
      ),
      fetchByLeadOrEmail(
        "quotes",
        "id, quote_number, total, status, valid_until, created_at",
        "customer_email",
      ),
      fetchByLeadOrEmail(
        "tickets",
        "id, subject, priority, status, created_at, updated_at",
        "contact_email",
      ),
      // orders has no lead_id — only customer_email.
      email
        ? (await admin
            .from("orders")
            .select("id, order_number, total, status, fulfillment_status, created_at")
            .eq("customer_email", email)).data ?? []
        : [],
      email
        ? (await admin
            .from("bookings")
            .select("id, title, start_at, end_at, status, customer_email, created_at")
            .eq("customer_email", email)).data ?? []
        : [],
      email
        ? (await admin
            .from("subscriptions")
            .select("id, plan_name, status, current_period_end, created_at")
            .eq("customer_email", email)).data ?? []
        : [],
      leadId
        ? (await admin
            .from("lead_activities")
            .select("id, kind, summary, payload, created_at")
            .eq("lead_id", leadId)
            .order("created_at", { ascending: false })
            .limit(100)).data ?? []
        : [],
      leadId
        ? (await admin
            .from("crm_tasks")
            .select("id, title, status, due_at, created_at")
            .eq("lead_id", leadId)).data ?? []
        : [],
      email
        ? (await admin
            .from("chat_conversations")
            .select("id, customer_email, scope, created_at, updated_at")
            .eq("customer_email", email)
            .order("created_at", { ascending: false })
            .limit(20)).data ?? []
        : [],
      leadId
        ? (await admin
            .from("webinar_registrations")
            .select("id, webinar_id, status, registered_at")
            .eq("lead_id", leadId)).data ?? []
        : [],
    ]);

    // Build unified timeline.
    const timeline: TimelineEvent[] = [];

    if (lead) {
      timeline.push({
        id: `lead-${lead.id}`,
        ts: lead.created_at,
        kind: "lead_created",
        title: `Lead created — ${lead.source}`,
        subtitle: lead.ai_summary ?? undefined,
        status: lead.status,
        href: `/admin/leads`,
      });
    }
    for (const a of activities) {
      timeline.push({
        id: `act-${a.id}`,
        ts: a.created_at,
        kind: "lead_activity",
        title: a.summary || a.kind,
        subtitle: a.kind,
      });
    }
    for (const d of deals) {
      timeline.push({
        id: `deal-${d.id}`,
        ts: d.created_at,
        kind: "deal",
        title: d.title,
        amount: d.amount,
        status: d.stage || d.status,
        href: `/admin/deals`,
      });
    }
    for (const o of orders) {
      timeline.push({
        id: `order-${o.id}`,
        ts: o.created_at,
        kind: "order",
        title: `Order ${o.order_number || o.id.slice(0, 8)}`,
        amount: o.total,
        status: o.status,
        href: `/admin/orders`,
      });
    }
    for (const i of invoices) {
      timeline.push({
        id: `inv-${i.id}`,
        ts: i.created_at,
        kind: "invoice",
        title: `Invoice ${i.invoice_number || i.id.slice(0, 8)}`,
        amount: i.total,
        status: i.status,
        href: `/admin/invoicing`,
      });
    }
    for (const q of quotes) {
      timeline.push({
        id: `quote-${q.id}`,
        ts: q.created_at,
        kind: "quote",
        title: `Quote ${q.quote_number || q.id.slice(0, 8)}`,
        amount: q.total,
        status: q.status,
        href: `/admin/quotes`,
      });
    }
    for (const t of tickets) {
      timeline.push({
        id: `tic-${t.id}`,
        ts: t.created_at,
        kind: "ticket",
        title: t.subject,
        status: t.status,
        href: `/admin/tickets`,
      });
    }
    for (const b of bookings) {
      timeline.push({
        id: `bk-${b.id}`,
        ts: b.created_at,
        kind: "booking",
        title: b.title || "Booking",
        status: b.status,
        href: `/admin/bookings`,
      });
    }
    for (const s of subscriptions) {
      timeline.push({
        id: `sub-${s.id}`,
        ts: s.created_at,
        kind: "subscription",
        title: s.plan_name || "Subscription",
        status: s.status,
        href: `/admin/subscriptions`,
      });
    }
    for (const c of chats) {
      timeline.push({
        id: `chat-${c.id}`,
        ts: c.created_at,
        kind: "chat",
        title: `Chat conversation (${c.scope || "visitor"})`,
        href: `/admin/chat`,
      });
    }
    for (const w of webinars) {
      timeline.push({
        id: `web-${w.id}`,
        ts: w.registered_at || w.created_at,
        kind: "webinar",
        title: `Webinar registration`,
        status: w.status,
      });
    }
    for (const tk of tasks) {
      timeline.push({
        id: `task-${tk.id}`,
        ts: tk.created_at,
        kind: "task",
        title: tk.title,
        status: tk.status,
      });
    }

    timeline.sort((a, b) => (a.ts < b.ts ? 1 : -1));

    // KPIs.
    const sum = (arr: any[], k: string) =>
      arr.reduce((acc, row) => acc + (Number(row[k]) || 0), 0);
    const kpis = {
      lifetime_value:
        sum(orders, "total") + sum(invoices.filter((i: any) => i.status === "paid"), "total"),
      open_deals_value: sum(
        deals.filter((d: any) => !["won", "lost", "closed"].includes((d.stage || d.status || "").toLowerCase())),
        "amount",
      ),
      open_invoices_value: sum(
        invoices.filter((i: any) => ["sent", "overdue", "draft"].includes(i.status)),
        "total",
      ),
      open_tickets: tickets.filter((t: any) => !["closed", "resolved"].includes(t.status)).length,
      total_orders: orders.length,
      total_invoices: invoices.length,
    };

    return new Response(
      JSON.stringify({
        success: true,
        identity: {
          lead_id: leadId,
          email,
          name: lead?.name ?? null,
          phone: lead?.phone ?? null,
          status: lead?.status ?? null,
          score: lead?.score ?? null,
          source: lead?.source ?? null,
          ai_summary: lead?.ai_summary ?? null,
          company: lead?.companies ?? null,
          created_at: lead?.created_at ?? null,
          converted_at: lead?.converted_at ?? null,
        },
        kpis,
        counts: {
          deals: deals.length,
          orders: orders.length,
          invoices: invoices.length,
          quotes: quotes.length,
          tickets: tickets.length,
          bookings: bookings.length,
          subscriptions: subscriptions.length,
          activities: activities.length,
          chats: chats.length,
          webinars: webinars.length,
          tasks: tasks.length,
        },
        timeline,
        raw: {
          deals,
          orders,
          invoices,
          quotes,
          tickets,
          bookings,
          subscriptions,
          activities,
          chats,
          webinars,
          tasks,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[customer-360] error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
