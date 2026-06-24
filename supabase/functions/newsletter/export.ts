import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceClient } from '../_shared/supabase-clients.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export async function handle(req: Request): Promise<Response> {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
            const supabase = getServiceClient();

    // Verify auth — admin only. This function is deployed --no-verify-jwt, so
    // the admin check MUST be enforced here.
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: userData, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: hasAdmin } = await supabase.rpc("has_role", {
      _user_id: userData.user.id, _role: "admin",
    });

    if (!hasAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const format = url.searchParams.get("format") || "csv";

    console.log(`[newsletter-export] Exporting subscribers as ${format}`);

    // Fetch all subscribers
    const { data: subscribers, error: subError } = await supabase
      .from("newsletter_subscribers")
      .select("id, email, name, status, created_at, confirmed_at, unsubscribed_at")
      .order("created_at", { ascending: false });

    if (subError) {
      console.error("[newsletter-export] Error fetching subscribers:", subError);
      return new Response(JSON.stringify({ error: "Failed to fetch subscribers" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (format === "json") {
      // Return JSON format
      return new Response(JSON.stringify({
        exported_at: new Date().toISOString(),
        total_count: subscribers?.length || 0,
        subscribers: subscribers || [],
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="subscribers_${new Date().toISOString().split('T')[0]}.json"`,
        },
      });
    }

    // CSV format
    const csvHeaders = ["id", "email", "name", "status", "created_at", "confirmed_at", "unsubscribed_at"];
    const csvRows = [csvHeaders.join(",")];

    for (const sub of subscribers || []) {
      const row = [
        sub.id,
        `"${(sub.email || '').replace(/"/g, '""')}"`,
        `"${(sub.name || '').replace(/"/g, '""')}"`,
        sub.status,
        sub.created_at,
        sub.confirmed_at || '',
        sub.unsubscribed_at || '',
      ];
      csvRows.push(row.join(","));
    }

    const csvContent = csvRows.join("\n");

    console.log(`[newsletter-export] Exported ${subscribers?.length || 0} subscribers`);

    return new Response(csvContent, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="subscribers_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error: any) {
    console.error("[newsletter-export] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
