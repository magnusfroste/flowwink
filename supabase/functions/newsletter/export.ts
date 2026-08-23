import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { readAllRows } from '../_shared/read-all-rows.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-chat-session, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  // Without this a browser caller cannot read them at all, and the count would
  // travel only as far as the network tab.
  "Access-Control-Expose-Headers": "x-subscriber-count, x-export-complete",
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
    const { data: hasAdmin } = await supabase.rpc("can_access_module", {
      _user_id: userData.user.id, _module_id: "newsletter",
    });

    if (!hasAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden — requires the \"newsletter\" module (Users → Role Permissions)" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const format = url.searchParams.get("format") || "csv";

    console.log(`[newsletter-export] Exporting subscribers as ${format}`);

    // Every subscriber, paginated. An export's entire claim is completeness —
    // it is downloaded to be imported somewhere else, or kept as the record of
    // who was on the list — so the whole population genuinely IS the question
    // and the third cure is the right one here.
    //
    // The old read had no `.limit()` and no pagination: PostgREST cut it off at
    // 1000 rows in silence and the file said `total_count: 1000`, which is a
    // number, not a warning. A list of 2400 exported as a plausible-looking
    // 1000-row CSV that nothing downstream could question.
    //
    // Ordered by `id` rather than by `created_at`: created_at is not unique, and
    // an unstable sort key makes rows drift across page boundaries — which in an
    // export means silently dropped and duplicated subscribers. The display
    // ordering is restored below, after every row is in hand.
    const { rows: fetched, error: subError, truncated } = await readAllRows<{
      id: string; email: string | null; name: string | null; status: string;
      created_at: string; confirmed_at: string | null; unsubscribed_at: string | null;
    }>(supabase, "newsletter_subscribers", {
      columns: "id, email, name, status, created_at, confirmed_at, unsubscribed_at",
      orderBy: "id",
      pageSize: 1000,
      maxPages: 500,
    });

    if (subError) {
      console.error("[newsletter-export] Error fetching subscribers:", subError);
      return new Response(JSON.stringify({ error: "Failed to fetch subscribers" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // A partial export is worse than no export: it is indistinguishable from a
    // complete one once it has left the building. Refuse rather than hand over a
    // file that quietly ends early.
    if (truncated) {
      console.error("[newsletter-export] subscriber list exceeded the page ceiling — refusing to emit a partial file");
      return new Response(JSON.stringify({
        error: "Subscriber list is larger than this export can read in one pass. " +
          "No file was produced — a truncated export cannot be told apart from a complete one.",
      }), {
        status: 507,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const subscribers = fetched.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));

    // The count travels WITH the file, on both formats. A CSV cannot carry a
    // footer without stopping being a CSV, so the header is where a caller
    // (or a script) can check that the rows it parsed are the rows we sent.
    const countHeaders = {
      "X-Subscriber-Count": String(subscribers.length),
      "X-Export-Complete": "true",
    };

    if (format === "json") {
      // Return JSON format
      return new Response(JSON.stringify({
        exported_at: new Date().toISOString(),
        total_count: subscribers.length,
        complete: true,
        subscribers,
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          ...countHeaders,
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="subscribers_${new Date().toISOString().split('T')[0]}.json"`,
        },
      });
    }

    // CSV format
    const csvHeaders = ["id", "email", "name", "status", "created_at", "confirmed_at", "unsubscribed_at"];
    const csvRows = [csvHeaders.join(",")];

    for (const sub of subscribers) {
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

    console.log(`[newsletter-export] Exported ${subscribers.length} subscribers`);

    return new Response(csvContent, {
      status: 200,
      headers: {
        ...corsHeaders,
        ...countHeaders,
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
