// ============================================
// Gmail Inbox Scan — Pure Data Sensor
// Reads Gmail, returns raw email signals for FlowPilot to analyze.
// No AI reasoning — FlowPilot is the brain.
// ============================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

interface GmailConfig {
  connected: boolean;
  email: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  filter_senders: string[];
  filter_labels: string[];
  max_messages: number;
  scan_days: number;
}

interface EmailSignal {
  from: string;
  subject: string;
  snippet: string;
  date: string;
  labels: string[];
}

// ============================================
// Token Management
// ============================================

async function getValidToken(supabase: ReturnType<typeof getSupabase>): Promise<{ token: string; config: GmailConfig }> {
  const { data } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', 'gmail_integration')
    .maybeSingle();

  if (!data) throw new Error('Gmail not connected');

  const config = data.value as unknown as GmailConfig;
  if (!config.connected || !config.refresh_token) throw new Error('Gmail not connected');

  // Refresh if expired (5 min buffer)
  if (Date.now() > config.expires_at - 300000) {
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    if (!clientId || !clientSecret) throw new Error('Google OAuth not configured');

    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: config.refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      }),
    });

    const tokens = await res.json();
    if (!res.ok) throw new Error(`Token refresh failed: ${tokens.error}`);

    config.access_token = tokens.access_token;
    config.expires_at = Date.now() + (tokens.expires_in * 1000);

    await supabase.from('site_settings').upsert({
      key: 'gmail_integration',
      value: config as any,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
  }

  return { token: config.access_token, config };
}

// ============================================
// Gmail API — Raw Data Fetch
// ============================================

async function fetchRecentEmails(token: string, config: GmailConfig): Promise<EmailSignal[]> {
  const daysAgo = new Date(Date.now() - config.scan_days * 24 * 60 * 60 * 1000);
  const afterDate = `${daysAgo.getFullYear()}/${daysAgo.getMonth() + 1}/${daysAgo.getDate()}`;

  let query = `after:${afterDate}`;
  if (config.filter_senders.length > 0) {
    const fromQuery = config.filter_senders.map(s => `from:${s}`).join(' OR ');
    query += ` (${fromQuery})`;
  }

  const listRes = await fetch(
    `${GMAIL_API}/messages?maxResults=${config.max_messages}&q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!listRes.ok) {
    const err = await listRes.text();
    throw new Error(`Gmail list failed [${listRes.status}]: ${err}`);
  }

  const listData = await listRes.json();
  const messages = listData.messages || [];
  const signals: EmailSignal[] = [];

  for (const msg of messages.slice(0, config.max_messages)) {
    try {
      const msgRes = await fetch(
        `${GMAIL_API}/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!msgRes.ok) continue;
      const msgData = await msgRes.json();

      const headers = msgData.payload?.headers || [];
      const getHeader = (name: string) => headers.find((h: any) => h.name === name)?.value || '';

      signals.push({
        from: getHeader('From'),
        subject: getHeader('Subject'),
        snippet: msgData.snippet || '',
        date: getHeader('Date'),
        labels: msgData.labelIds || [],
      });
    } catch (e) {
      console.error(`[InboxScan] Failed to fetch message ${msg.id}:`, e);
    }
  }

  return signals;
}

// ============================================
// Main Handler — Returns raw signals, no AI
// ============================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabase = getSupabase();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const { token, config } = await getValidToken(supabase);
    const signals = await fetchRecentEmails(token, config);

    const output = {
      signal_count: signals.length,
      email: config.email,
      scan_period_days: config.scan_days,
      signals: signals.map(s => ({
        from: s.from,
        subject: s.subject,
        snippet: s.snippet,
        date: s.date,
        labels: s.labels,
      })),
    };

    // Log to agent_activity
    await supabase.from('agent_activity').insert({
      agent: 'flowpilot',
      skill_name: 'gmail_inbox_scan',
      status: 'success',
      input: { source: 'gmail', scan_days: config.scan_days, max_messages: config.max_messages },
      output,
      duration_ms: Date.now() - startTime,
    });

    // Dispatch signal for automations
    if (signals.length > 0) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/signal-dispatcher`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            signal: 'gmail_inbox_scanned',
            data: {
              signal_count: signals.length,
              email: config.email,
            },
            context: {
              entity_type: 'gmail',
              entity_id: config.email,
            },
          }),
        });
      } catch (e) {
        console.error('[InboxScan] Signal dispatch failed:', e);
      }
    }

    return new Response(
      JSON.stringify({ success: true, ...output }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[InboxScan] Error:', error);

    await supabase.from('agent_activity').insert({
      agent: 'flowpilot',
      skill_name: 'gmail_inbox_scan',
      status: 'error',
      error_message: errorMsg,
      duration_ms: Date.now() - startTime,
    });

    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
