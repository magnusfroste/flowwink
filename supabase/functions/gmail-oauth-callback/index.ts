// ============================================
// Gmail OAuth Callback Edge Function
// Handles OAuth redirect, exchanges code for tokens
// Stores config in site_settings (key: gmail_integration)
// ============================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceClient } from '../_shared/supabase-clients.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly';

function getRedirectUri(): string {
  const url = Deno.env.get("SUPABASE_URL")!;
  return `${url}/functions/v1/gmail-oauth-callback`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // ============================================
  // GET ?action=authorize → Redirect to Google consent
  // ============================================
  if (req.method === 'GET' && url.searchParams.get('action') === 'authorize') {
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    if (!clientId) {
      return new Response('GOOGLE_CLIENT_ID not configured', { status: 500 });
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: getRedirectUri(),
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state: 'gmail_connect',
    });

    return Response.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`, 302);
  }

  // ============================================
  // GET ?code=...&state=... → Exchange code for tokens
  // ============================================
  if (req.method === 'GET' && url.searchParams.get('code')) {
    const code = url.searchParams.get('code')!;
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      return new Response('Google OAuth not configured', { status: 500 });
    }

    try {
      // Exchange code for tokens
      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: getRedirectUri(),
          grant_type: 'authorization_code',
        }),
      });

      const tokens = await tokenRes.json();

      if (!tokenRes.ok || !tokens.access_token) {
        console.error('[Gmail OAuth] Token exchange failed:', tokens);
        return new Response(`OAuth failed: ${tokens.error_description || tokens.error || 'Unknown'}`, { status: 400 });
      }

      // Get user email for display
      const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const profile = profileRes.ok ? await profileRes.json() : {};

      // Store in site_settings
      const supabase = getSupabase();
      const config = {
        connected: true,
        email: profile.email || '',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: Date.now() + (tokens.expires_in * 1000),
        connected_at: new Date().toISOString(),
        filter_senders: [],
        filter_labels: [],
        max_messages: 20,
        scan_days: 7,
      };

      await supabase.from('site_settings').upsert({
        key: 'gmail_integration',
        value: config,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });

      // Redirect back to admin integrations page
      const siteUrl = Deno.env.get('SITE_URL') || url.origin;
      // Try to redirect to the admin page — use a known path
      return new Response(
        `<html><body><script>window.opener ? window.opener.postMessage('gmail_connected','*') && window.close() : window.location.href='/admin/integrations?gmail=connected';</script><p>Connected! You can close this window.</p></body></html>`,
        { headers: { 'Content-Type': 'text/html' } }
      );
    } catch (e) {
      console.error('[Gmail OAuth] Error:', e);
      return new Response(`Error: ${e instanceof Error ? e.message : 'Unknown'}`, { status: 500 });
    }
  }

  // ============================================
  // POST { action: 'status' | 'disconnect' | 'update_settings' }
  // ============================================
  if (req.method === 'POST') {
    const body = await req.json();

    if (body.action === 'disconnect') {
      const supabase = getSupabase();
      await supabase.from('site_settings').upsert({
        key: 'gmail_integration',
        value: { connected: false },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (body.action === 'status') {
      const supabase = getSupabase();
      const { data } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'gmail_integration')
        .maybeSingle();

      const config = (data?.value as Record<string, unknown>) || {};

      // Get last scan from agent_activity
      const { data: lastScan } = await supabase
        .from('agent_activity')
        .select('output, created_at')
        .eq('skill_name', 'gmail_inbox_scan')
        .eq('status', 'success')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return new Response(
        JSON.stringify({
          connected: !!config.connected,
          email: config.email || null,
          connected_at: config.connected_at || null,
          filter_senders: config.filter_senders || [],
          filter_labels: config.filter_labels || [],
          max_messages: config.max_messages || 20,
          scan_days: config.scan_days || 7,
          last_scan: lastScan ? {
            scanned_at: lastScan.created_at,
            signal_count: (lastScan.output as any)?.signal_count || 0,
            suggested_topics: (lastScan.output as any)?.suggested_topics || [],
          } : null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (body.action === 'update_settings') {
      const supabase = getSupabase();
      const { data: existing } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'gmail_integration')
        .maybeSingle();

      if (!existing) {
        return new Response(JSON.stringify({ error: 'Not connected' }), { 
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      const currentConfig = existing.value as Record<string, unknown>;
      const updated = {
        ...currentConfig,
        filter_senders: body.filter_senders ?? currentConfig.filter_senders,
        filter_labels: body.filter_labels ?? currentConfig.filter_labels,
        max_messages: body.max_messages ?? currentConfig.max_messages,
        scan_days: body.scan_days ?? currentConfig.scan_days,
      };

      await supabase.from('site_settings').upsert({
        key: 'gmail_integration',
        value: updated,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  return new Response('Not found', { status: 404 });
});
