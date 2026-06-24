// newsletter — consolidated newsletter edge function.
//
// One function, routed by the LAST path segment of url.pathname:
//   /newsletter/subscribe → public: subscribe + ?action=confirm|unsubscribe
//   /newsletter/send      → admin:  send a campaign (auth enforced in handler)
//   /newsletter/track     → public: 1x1 GIF open-tracking pixel
//   /newsletter/link      → public: 302 redirect click-tracking
//   /newsletter/gdpr      → public self-service: export/delete
//   /newsletter/export    → admin:  CSV/JSON subscriber export (auth in handler)
//
// Deployed with --no-verify-jwt so the public paths work for anonymous
// visitors; the admin paths (send, export) verify admin auth internally.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { handle as handleSubscribe } from './subscribe.ts';
import { handle as handleSend } from './send.ts';
import { handle as handleTrack } from './track.ts';
import { handle as handleLink } from './link.ts';
import { handle as handleGdpr } from './gdpr.ts';
import { handle as handleExport } from './export.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

serve(async (req) => {
  // Central CORS preflight.
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  // Route by the LAST non-empty path segment (e.g. .../functions/v1/newsletter/subscribe → "subscribe").
  const segments = url.pathname.split("/").filter(Boolean);
  const route = segments[segments.length - 1] ?? "";

  switch (route) {
    case "subscribe":
      return handleSubscribe(req);
    case "send":
      return handleSend(req);
    case "track":
      return handleTrack(req);
    case "link":
      return handleLink(req);
    case "gdpr":
      return handleGdpr(req);
    case "export":
      return handleExport(req);
    default:
      return new Response(
        JSON.stringify({ error: `Unknown newsletter route: ${route}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
  }
});
