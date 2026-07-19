// gmail_inbox_scan — internal skill handler.
//
// Pure Data Sensor: reads Gmail, returns raw email signals for FlowPilot to
// analyze. No AI reasoning — FlowPilot is the brain.
//
// Moved from the standalone `gmail-inbox-scan` edge function (edge-surface
// refactor B1a, wave 2). Two deliberate deltas, both documented for the
// reviewing counterpart:
//
// 1. The function's own agent_activity insert is DROPPED. Through the edge:
//    dispatch every scan produced TWO activity rows (the function's own +
//    agent-execute's); with an internal handler the duplicate would be
//    guaranteed on every call. agent-execute's log carries the same
//    skill_name, so evidence/cadence counting is unaffected.
// 2. The signal-dispatcher emission keeps its HTTP hop (kernel function).
//
// Response objects unchanged: { success: true, signal_count, email,
// scan_period_days, signals } / { success: false, error }.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { HandlerCtx } from './qualify-lead.ts';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

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

async function getValidToken(supabase: SupabaseClient): Promise<{ token: string; config: GmailConfig }> {
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

export async function executeGmailInboxScan(
  supabase: SupabaseClient,
  _args: Record<string, unknown>,
  ctx: HandlerCtx,
): Promise<Record<string, unknown>> {
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

    // Dispatch signal for automations
    if (signals.length > 0) {
      try {
        await fetch(`${ctx.supabaseUrl}/functions/v1/signal-dispatcher`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ctx.serviceKey}`,
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

    return { success: true, ...output };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[InboxScan] Error:', error);
    return { success: false, error: errorMsg };
  }
}
