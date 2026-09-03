import { getUserClient, getServiceClient } from '../_shared/supabase-clients.ts';
import { ingestGmailMessage } from '../_shared/email/ingest-gmail.ts';


async function logComposioOutbound(row: {
  channel: string;
  recipient: string;
  subject?: string | null;
  body_text?: string | null;
  body_html?: string | null;
  /** Gmail thread the message belongs to — what the inbox thread view groups on. */
  thread_id?: string | null;
  in_reply_to?: string | null;
  status: string;
  direction?: 'inbound' | 'outbound';
  related_entity_type?: string | null;
  related_entity_id?: string | null;
  source?: string | null;
  error_message?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    const supabase = getServiceClient();
    await supabase.from('outbound_communications').insert({
      channel: row.channel,
      status: row.status,
      direction: row.direction ?? 'outbound',
      provider: 'composio',
      simulated: false,
      recipient: row.recipient,
      subject: row.subject ?? null,
      body_text: row.body_text ?? null,
      body_html: row.body_html ?? null,
      thread_id: row.thread_id ?? null,
      in_reply_to: row.in_reply_to ?? null,
      source: row.source ?? 'composio-proxy',
      related_entity_type: row.related_entity_type ?? null,
      related_entity_id: row.related_entity_id ?? null,
      error_message: row.error_message ?? null,
      metadata: row.metadata ?? {},
      sent_at: row.status === 'sent' ? new Date().toISOString() : null,
    });
  } catch (e) {
    console.error('[composio-proxy] failed to log outbound_communications:', e);
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-chat-session, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const COMPOSIO_V3 = 'https://backend.composio.dev/api/v3';
const COMPOSIO_V31 = 'https://backend.composio.dev/api/v3.1';
const COMPOSIO_V2 = 'https://backend.composio.dev/api/v2';

function normalizeToken(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function sanitizeSecret(value: string | undefined | null): string {
  return String(value || '').trim().replace(/^['\"]|['\"]$/g, '');
}

function getSecretFingerprint(value: string): { prefix: string; suffix: string; length: number } | null {
  if (!value) return null;
  return {
    prefix: value.slice(0, 8),
    suffix: value.slice(-4),
    length: value.length,
  };
}

function extractErrorMessage(data: any, fallback = 'Unknown Composio error'): string {
  if (!data) return fallback;
  if (typeof data?.error === 'string') return data.error;
  if (typeof data?.message === 'string') return data.message;
  if (typeof data?.error?.message === 'string') return data.error.message;
  if (typeof data?.error?.suggested_fix === 'string') return data.error.suggested_fix;
  if (typeof data?.details?.message === 'string') return data.details.message;
  return fallback;
}

function getRedirectUrl(data: any): string | null {
  return data?.redirect_url
    || data?.redirect_uri
    || data?.redirectUrl
    || data?.url
    || data?.data?.redirect_url
    || data?.data?.redirect_uri
    || data?.connectionData?.val?.redirectUrl
    || data?.connection_data?.redirect_url
    || null;
}

function getAuthConfigLabels(config: any): string[] {
  const values = [
    config?.name,
    config?.slug,
    config?.toolkit?.slug,
    config?.toolkit_slug,
    config?.appName,
    config?.app_name,
    config?.app?.name,
    config?.service,
    config?.integration?.name,
    config?.integration?.appName,
    config?.deprecated?.appName,
  ];

  return values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map(normalizeToken)
    .filter(Boolean);
}

function getConnectedAccountStatus(account: any): string {
  return String(
    account?.status
      || account?.data?.status
      || account?.state?.val?.status
      || '',
  ).toUpperCase();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const token = authHeader.replace('Bearer ', '');
    const isServiceRole = serviceKey && token === serviceKey;
    // pg_cron calls this with the anon key (the DB has no service key). That
    // caller is restricted to the gmail_reconcile poll below and gets counts only.
    const isCronCaller = !isServiceRole && !!anonKey && token === anonKey;

    if (!isServiceRole && !isCronCaller) {
      const supabaseClient = getUserClient(authHeader)!;
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser();

      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }


    const composioKey = sanitizeSecret(Deno.env.get('COMPOSIO_API_KEY'));
    if (!composioKey) {
      return new Response(JSON.stringify({ error: 'Composio API key not configured' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { action, intent, app, params, entity_id } = body;
    const effectiveUserId = entity_id || 'default';

    if (isCronCaller && action !== 'gmail_reconcile') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }


    // Composio v3 rejects requests with multiple auth modes (error 10401).
    // Use only x-api-key — that's the v3 standard. Sending Authorization: Bearer
    // alongside causes "Multiple authentication modes were provided".
    const composioHeaders = {
      'Content-Type': 'application/json',
      'x-api-key': composioKey,
    };

    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    const readResponse = async (res: Response) => {
      const text = await res.text();
      if (!text) return null;

      try {
        return JSON.parse(text);
      } catch {
        return { raw: text };
      }
    };

    const callComposio = async (url: string, init?: RequestInit) => {
      const res = await fetch(url, init);
      const data = await readResponse(res);
      return { ok: res.ok, status: res.status, statusText: res.statusText, data };
    };

    async function getConnectedAccountId(toolkit: string): Promise<string | null> {
      const res = await callComposio(`${COMPOSIO_V3}/connected_accounts?user_id=${encodeURIComponent(effectiveUserId)}&status=ACTIVE&toolkit=${encodeURIComponent(toolkit)}`, {
        headers: composioHeaders,
      });

      if (!res.ok) {
        console.log('[composio-proxy] connected_accounts lookup failed:', JSON.stringify(res.data).slice(0, 500));
        return null;
      }

      // Composio can ignore the status filter and return an INITIATED account
      // before an existing ACTIVE one. Never authorize a tool with the first
      // item blindly: verify both status and toolkit locally.
      const items = Array.isArray(res.data?.items) ? res.data.items : [];
      const normalizedToolkit = normalizeToken(toolkit);
      const account = items.find((candidate: any) => {
        const labels = getAuthConfigLabels(candidate);
        return getConnectedAccountStatus(candidate) === 'ACTIVE'
          && labels.some((label) => label.includes(normalizedToolkit));
      });
      return account?.id || null;
    }

    async function executeToolV3(toolSlug: string, args: Record<string, unknown>, connectedAccountId: string, userId = effectiveUserId) {
      const res = await callComposio(`${COMPOSIO_V3}/tools/execute/${toolSlug}`, {
        method: 'POST',
        headers: composioHeaders,
        body: JSON.stringify({
          connected_account_id: connectedAccountId,
          user_id: userId,
          arguments: args,
        }),
      });

      if (!res.ok || res.data?.error) {
        const msg = extractErrorMessage(res.data, `Composio tool execution failed (${res.status})`);
        return { success: false, error: msg, details: res.data };
      }

      return res.data;
    }

    if (action === 'search_tools') {
      // v2 /actions is retired ("This endpoint is no longer available.
      // Please upgrade to v3 APIs") — discovered live 2026-08-14 while
      // verifying the LinkedIn rail. v3 /tools takes the same idea:
      // free-text search + toolkit filter.
      const searchParams = new URLSearchParams();
      if (intent) searchParams.set('search', intent);
      if (app) searchParams.set('toolkit_slug', String(app).toLowerCase());
      searchParams.set('limit', '5');

      const res = await callComposio(`${COMPOSIO_V3}/tools?${searchParams}`, {
        headers: composioHeaders,
      });

      if (!res.ok) {
        return json({ error: extractErrorMessage(res.data, `Failed to search Composio tools (${res.status})`), details: res.data }, res.status);
      }

      return json({ result: res.data });
    }

    if (action === 'execute') {
      const actionName = params?.action_name;
      if (!actionName) {
        return json({ error: 'action_name required in params' }, 400);
      }

      const toolkit = params?.toolkit || actionName.split('_')[0]?.toLowerCase();
      const accountId = await getConnectedAccountId(toolkit);

      const execBody: Record<string, unknown> = {
        arguments: params?.input || params?.arguments || {},
        user_id: effectiveUserId,
      };
      if (accountId) execBody.connected_account_id = accountId;

      const res = await callComposio(`${COMPOSIO_V3}/tools/execute/${actionName}`, {
        method: 'POST',
        headers: composioHeaders,
        body: JSON.stringify(execBody),
      });

      if (!res.ok) {
        return json({ error: extractErrorMessage(res.data, `Failed to execute ${actionName}`), details: res.data }, res.status);
      }

      // Log outbound email when generic execute sends Gmail
      if (actionName === 'GMAIL_SEND_EMAIL') {
        const input = params?.input || {};
        const to = input.recipient_email || input.to || '';
        const subject = input.subject || '';
        const body = input.body || input.body_text || input.message || '';
        const cc = input.cc || null;
        const bcc = input.bcc || null;
        const success = res.data?.successful === true || res.data?.success === true || res.data?.data?.response_data?.labelIds?.includes?.('SENT');

        await logComposioOutbound({
          channel: 'email',
          recipient: to,
          subject,
          body_text: body,
          status: success ? 'sent' : 'failed',
          error_message: success ? null : extractErrorMessage(res.data, 'Gmail send failed'),
          metadata: {
            tool: 'GMAIL_SEND_EMAIL',
            via: 'generic_execute',
            entity_id: effectiveUserId,
            cc,
            bcc,
            gmail_message_id: res.data?.data?.response_data?.id ?? null,
            thread_id: res.data?.data?.response_data?.threadId ?? null,
            log_id: res.data?.log_id ?? null,
          },
        });
      }

      return json({ result: res.data });
    }

    if (action === 'gmail_send') {
      const { to, subject, body: emailBody, cc, bcc, in_reply_to, references, thread_id, is_html, extra_headers, account_id: explicitAccountId } = params || {};
      if (!to || !subject || !emailBody) {
        return json({ error: 'to, subject, and body required' }, 400);
      }

      // Entity binding and source come from the caller (e.g. email-send) so the
      // outbound row is linked to the right CRM record and email_threads can
      // resolve replies by thread.
      const { related_entity_type, related_entity_id, source, tags } = body || {};

      const accountId = explicitAccountId || await getConnectedAccountId('gmail');
      if (!accountId) {
        return json({ error: 'Gmail not connected. Connect Gmail first.' }, 400);
      }

      // email-send joins its recipient list with ", " — and Gmail's action takes
      // ONE address in recipient_email, the rest in extra_recipients. Passed
      // joined, Composio answers "Invalid email format passed: a, b" and the
      // daily briefing to two addresses failed every morning on Resta
      // (2026-08-29 → 09-03) while single-recipient mail went through.
      const toList = String(to).split(/[,;]/).map((x) => x.trim()).filter(Boolean);
      const input: Record<string, unknown> = {
        recipient_email: toList[0] ?? to,
        ...(toList.length > 1 ? { extra_recipients: toList.slice(1) } : {}),
        subject,
        body: emailBody,
        // Composio rejects an HTML body outright unless is_html is set, with an
        // error the caller only sees after the send has already failed. Callers
        // pass rendered HTML far more often than not, so default by inspecting
        // the body rather than making every call site remember a flag whose
        // omission is fatal. An explicit is_html always wins.
        is_html: typeof is_html === 'boolean' ? is_html : /<[a-z][\s\S]*>/i.test(String(emailBody ?? '')),
      };
      if (cc) input.cc = cc;
      if (bcc) input.bcc = bcc;
      // Composio GMAIL_SEND_EMAIL accepts extra_headers + thread_id. Threading
      // headers and caller-supplied ones (e.g. email-send's RFC 8058
      // List-Unsubscribe pair) merge into the same map.
      const mergedHeaders: Record<string, string> = {
        ...((extra_headers && typeof extra_headers === 'object') ? extra_headers as Record<string, string> : {}),
        ...(in_reply_to ? { 'In-Reply-To': in_reply_to, ...(references ? { References: references } : {}) } : {}),
      };
      if (Object.keys(mergedHeaders).length) input.extra_headers = mergedHeaders;
      if (thread_id) input.thread_id = thread_id;

      const data = await executeToolV3('GMAIL_SEND_EMAIL', input as Record<string, string>, accountId);
      console.log('[composio-proxy] Gmail send response:', JSON.stringify(data).slice(0, 500));

      const success = data?.successful === true || data?.success === true || data?.data?.response_data?.labelIds?.includes?.('SENT');
      await logComposioOutbound({
        channel: 'email',
        recipient: to,
        subject,
        // An HTML send is stored as HTML, so the thread view renders it as
        // such instead of showing the tags as text.
        body_text: is_html ? null : emailBody,
        body_html: is_html ? emailBody : null,
        // The reply joins its thread: Gmail's thread id (echoed back by the
        // send when we did not know it) plus the header it answers.
        thread_id: thread_id ?? data?.data?.response_data?.threadId ?? null,
        in_reply_to: in_reply_to ?? null,
        status: success ? 'sent' : 'failed',
        direction: 'outbound',
        related_entity_type: related_entity_type ?? null,
        related_entity_id: related_entity_id ?? null,
        source: source ?? null,
        error_message: success ? null : extractErrorMessage(data, 'Gmail send failed'),
        metadata: {
          tool: 'GMAIL_SEND_EMAIL',
          entity_id: effectiveUserId,
          connected_account_id: accountId,
          cc: cc ?? null,
          bcc: bcc ?? null,
          in_reply_to: in_reply_to ?? null,
          thread_id: thread_id ?? null,
          tags: tags ?? {},
          gmail_message_id: data?.data?.response_data?.id ?? null,
          response_thread_id: data?.data?.response_data?.threadId ?? null,
          log_id: data?.log_id ?? null,
        },
      });

      return json({ result: data });
    }

    if (action === 'gmail_read') {
      const accountId = params?.account_id || await getConnectedAccountId('gmail');
      if (!accountId) {
        return json({ error: 'Gmail not connected. Connect Gmail first.' }, 400);
      }

      const data = await executeToolV3('GMAIL_FETCH_EMAILS', {
        query: params?.query || '',
        max_results: params?.max_results || 5,
      }, accountId);
      console.log('[composio-proxy] Gmail read response:', JSON.stringify(data).slice(0, 300));
      return json({ result: data });
    }

    if (action === 'gmail_reconcile') {
      // Polling fallback for the webhook: Composio's push delivery arrives in
      // bursts (observed gaps of minutes → 12h). This pulls recent inbox mail
      // and runs the exact same ingest path as composio-webhook, deduped on
      // gmail_message_id, so it can run every few minutes without side effects.
      // A cron caller authenticates with the ANON key, which ships inside the
      // frontend bundle — so every parameter it sends is attacker-controlled.
      // Withholding message content from the response is not enough on its own:
      // a caller-chosen `query` turns the remaining count into a search oracle
      // over the company mailbox. Ask for "from:swedbank", read the number, ask
      // again. Each call also spends a real Composio request, and nothing here
      // rate-limits it.
      //
      // So the poll's shape is pinned server-side for that caller. Cron has no
      // reason to choose — it runs one fixed sweep — and a service-role caller,
      // which holds a secret, keeps the parameters it needs for backfills.
      const trusted = !isCronCaller;

      const accountId = (trusted && params?.account_id) || await getConnectedAccountId('gmail');
      if (!accountId) return json({ error: 'Gmail not connected.' }, 400);

      const maxResults = trusted ? Math.min(Number(params?.max_results) || 15, 50) : 15;
      const query = (trusted && params?.query) || 'in:inbox newer_than:1d';

      const data = await executeToolV3('GMAIL_FETCH_EMAILS', {
        query,
        max_results: maxResults,
      }, accountId);

      if (data?.success === false) {
        return json({ error: data.error || 'GMAIL_FETCH_EMAILS failed', details: data.details }, 502);
      }

      const payload = data?.data?.response_data || data?.data || data;
      const messages: any[] = payload?.messages || payload?.data?.messages || [];
      const supabase = getServiceClient();

      const results: Array<Record<string, unknown>> = [];
      for (const msg of messages) {
        const messageId = msg?.messageId || msg?.message_id || msg?.id;
        if (!messageId) continue;
        const res = await ingestGmailMessage(supabase, {
          messageId,
          threadId: msg?.threadId || msg?.thread_id || null,
          connectedAccountId: accountId,
          // GMAIL_FETCH_EMAILS returns expanded payloads; ingest falls back to
          // gmail_get only when headers are missing.
          fullMessage: msg?.payload || msg?.messageText ? msg : undefined,
          source: 'gmail-reconcile',
        });
        // The id last, not first: IngestResult carries its own message_id and a
        // spread would win, so the explicit one was dead. That mattered only on
        // the failure path — which returns message_id: '' — meaning the response
        // could not say WHICH message failed, the one thing a caller reads it for.
        results.push({ ...res, message_id: messageId });
      }

      const ingested = results.filter((r) => r.ok && !r.skipped).length;
      console.log(`[composio-proxy] gmail_reconcile: ${messages.length} fetched, ${ingested} new`);
      return json({
        result: isCronCaller
          ? { fetched: messages.length, ingested }
          : { fetched: messages.length, ingested, results },
      });
    }




    if (action === 'gmail_get') {
      // Fetch one message by id (used by composio-webhook to fully expand a push notification).
      const messageId = params?.message_id;
      if (!messageId) return json({ error: 'message_id required' }, 400);
      const accountId = params?.account_id || await getConnectedAccountId('gmail');
      if (!accountId) return json({ error: 'Gmail not connected.' }, 400);

      // GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID is the Composio v3 action slug.
      const data = await executeToolV3('GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID', {
        message_id: messageId,
        format: 'full',
      }, accountId);
      return json({ result: data });
    }

    if (action === 'gmail_watch') {
      // Register a Gmail Watch on the connected account.
      // Composio v3 wraps Gmail's users.watch with the GMAIL_WATCH_USER action.
      const accountId = params?.account_id || await getConnectedAccountId('gmail');
      if (!accountId) return json({ error: 'Gmail not connected.' }, 400);

      const data = await executeToolV3('GMAIL_WATCH_USER', {
        // Defaults to INBOX. Override via params.label_ids / params.topic_name.
        label_ids: params?.label_ids || ['INBOX'],
        ...(params?.topic_name ? { topic_name: params.topic_name } : {}),
      }, accountId);
      return json({ result: data });
    }

    if (action === 'enable_trigger') {
      // Enable / upsert a Composio trigger instance so Composio starts pushing
      // events to our project-wide webhook URL (configured in Composio dashboard).
      // For Gmail inbound: trigger_slug = 'GMAIL_NEW_GMAIL_MESSAGE'.
      const triggerSlug = params?.trigger_slug;
      if (!triggerSlug) return json({ error: 'trigger_slug required' }, 400);

      const accountId = params?.account_id || await getConnectedAccountId(params?.toolkit || 'gmail');
      if (!accountId) return json({ error: 'No connected account found for toolkit.' }, 400);

      const triggerConfig = params?.trigger_config || {
        // Sensible defaults for GMAIL_NEW_GMAIL_MESSAGE.
        labelIds: 'INBOX',
        userId: 'me',
        interval: 60,
      };

      const upsertBody = {
        connected_account_id: accountId,
        user_id: effectiveUserId,
        trigger_config: triggerConfig,
      };

      // v3 trigger_instances upsert endpoint.
      let res = await callComposio(`${COMPOSIO_V3}/trigger_instances/${triggerSlug}/upsert`, {
        method: 'POST',
        headers: composioHeaders,
        body: JSON.stringify(upsertBody),
      });

      // Fallback to the alternate plural form some Composio versions expose.
      if (!res.ok && res.status === 404) {
        res = await callComposio(`${COMPOSIO_V3}/triggers_instances/${triggerSlug}/upsert`, {
          method: 'POST',
          headers: composioHeaders,
          body: JSON.stringify(upsertBody),
        });
      }

      console.log('[composio-proxy] enable_trigger response:', res.status, JSON.stringify(res.data).slice(0, 500));

      if (!res.ok) {
        return json({
          error: extractErrorMessage(res.data, `Failed to enable trigger ${triggerSlug} (${res.status})`),
          details: res.data,
        }, res.status);
      }
      return json({ result: res.data });
    }

    if (action === 'list_triggers') {
      // Inspect active trigger instances for the current user.
      const res = await callComposio(`${COMPOSIO_V3}/trigger_instances?user_id=${encodeURIComponent(effectiveUserId)}`, {
        headers: composioHeaders,
      });
      if (!res.ok) {
        return json({ error: extractErrorMessage(res.data, `Failed to list triggers (${res.status})`), details: res.data }, res.status);
      }
      return json({ result: res.data?.items || res.data });
    }

    if (action === 'list_webhook_subscriptions') {
      const res = await callComposio(`${COMPOSIO_V31}/webhook_subscriptions`, {
        headers: composioHeaders,
      });
      if (!res.ok) {
        return json({ error: extractErrorMessage(res.data, `Failed to list webhook subscriptions (${res.status})`), details: res.data }, res.status);
      }
      return json({ result: res.data?.items || res.data });
    }

    if (action === 'ensure_webhook_subscription') {
      const webhookUrl = params?.webhook_url || `${Deno.env.get('SUPABASE_URL')}/functions/v1/composio-webhook`;
      const enabledEvents = params?.enabled_events || ['composio.trigger.message', 'composio.connected_account.expired'];

      const existingRes = await callComposio(`${COMPOSIO_V31}/webhook_subscriptions`, {
        headers: composioHeaders,
      });
      if (!existingRes.ok) {
        return json({ error: extractErrorMessage(existingRes.data, `Failed to inspect webhook subscriptions (${existingRes.status})`), details: existingRes.data }, existingRes.status);
      }

      const subscriptions = Array.isArray(existingRes.data?.items) ? existingRes.data.items : Array.isArray(existingRes.data) ? existingRes.data : [];
      const existing = subscriptions.find((sub: any) => sub?.webhook_url === webhookUrl || sub?.url === webhookUrl);

      if (existing?.id) {
        const patchRes = await callComposio(`${COMPOSIO_V31}/webhook_subscriptions/${existing.id}`, {
          method: 'PATCH',
          headers: composioHeaders,
          body: JSON.stringify({ webhook_url: webhookUrl, enabled_events: enabledEvents }),
        });
        if (!patchRes.ok) {
          return json({ error: extractErrorMessage(patchRes.data, `Failed to update webhook subscription (${patchRes.status})`), details: patchRes.data }, patchRes.status);
        }
        return json({ result: patchRes.data, action: 'updated' });
      }

      const createRes = await callComposio(`${COMPOSIO_V31}/webhook_subscriptions`, {
        method: 'POST',
        headers: composioHeaders,
        body: JSON.stringify({ webhook_url: webhookUrl, enabled_events: enabledEvents }),
      });
      if (!createRes.ok) {
        return json({ error: extractErrorMessage(createRes.data, `Failed to create webhook subscription (${createRes.status})`), details: createRes.data }, createRes.status);
      }
      return json({ result: createRes.data, action: 'created' });
    }

    if (action === 'list_apps') {
      const res = await callComposio(`${COMPOSIO_V3}/connected_accounts?user_id=${encodeURIComponent(effectiveUserId)}&status=ACTIVE`, {
        headers: composioHeaders,
      });
      console.log('[composio-proxy] list_apps response:', JSON.stringify(res.data).slice(0, 500));

      if (!res.ok) {
        return json({ error: extractErrorMessage(res.data, `Failed to list connected apps (${res.status})`), details: res.data }, res.status);
      }

      return json({ result: res.data?.items || res.data });
    }

    if (action === 'diagnose') {
      const authConfigsRes = await callComposio(`${COMPOSIO_V3}/auth_configs`, {
        headers: composioHeaders,
      });
      const connectedAppsRes = await callComposio(`${COMPOSIO_V3}/connected_accounts?user_id=${encodeURIComponent(effectiveUserId)}&status=ACTIVE`, {
        headers: composioHeaders,
      });

      const authConfigs = Array.isArray(authConfigsRes.data?.items) ? authConfigsRes.data.items : [];
      const gmailConfig = authConfigs.find((config: any) =>
        getAuthConfigLabels(config).some((label) => label.includes('gmail') || label.includes('google_mail'))
      );

      return json({
        result: {
          api_key_configured: true,
          api_key_fingerprint: getSecretFingerprint(composioKey),
          api_key_valid: authConfigsRes.ok || connectedAppsRes.ok,
          auth_configs_ok: authConfigsRes.ok,
          auth_configs_count: authConfigs.length,
          gmail_auth_config_found: Boolean(gmailConfig),
          gmail_auth_config: gmailConfig ? {
            id: gmailConfig.id,
            name: gmailConfig.name || gmailConfig.appName || gmailConfig.slug || 'Unnamed config',
          } : null,
          connected_accounts_ok: connectedAppsRes.ok,
          connected_accounts_count: Array.isArray(connectedAppsRes.data?.items) ? connectedAppsRes.data.items.length : 0,
          errors: [
            !authConfigsRes.ok ? extractErrorMessage(authConfigsRes.data, `auth_configs failed (${authConfigsRes.status})`) : null,
            !connectedAppsRes.ok ? extractErrorMessage(connectedAppsRes.data, `connected_accounts failed (${connectedAppsRes.status})`) : null,
          ].filter(Boolean),
        },
      });
    }

    if (action === 'connect_app') {
      const appName = params?.app_name;
      if (!appName) {
        return json({ error: 'app_name required' }, 400);
      }

      const normalizedAppName = normalizeToken(appName);
      const authConfigRes = await callComposio(`${COMPOSIO_V3}/auth_configs`, {
        headers: composioHeaders,
      });

      console.log('[composio-proxy] auth_configs response:', JSON.stringify(authConfigRes.data).slice(0, 500));

      if (!authConfigRes.ok) {
        return json({
          error: extractErrorMessage(authConfigRes.data, `Failed to load auth configs (${authConfigRes.status})`),
          details: authConfigRes.data,
        }, authConfigRes.status);
      }

      const authConfigs = Array.isArray(authConfigRes.data?.items) ? authConfigRes.data.items : [];
      const matchedConfig = authConfigs.find((config: any) => {
        const labels = getAuthConfigLabels(config);
        return labels.some((label) =>
          label === normalizedAppName ||
          label.includes(normalizedAppName) ||
          normalizedAppName.includes(label)
        );
      });

      if (!matchedConfig?.id) {
        return json({
          error: `No auth config found for "${appName}".`,
          available_auth_configs: authConfigs.slice(0, 20).map((config: any) => ({
            id: config.id,
            name: config.name || config.appName || config.slug || 'Unnamed config',
          })),
        }, 404);
      }

      // Composio refuses to re-authorize when a prior account for the same
      // user_id + auth_config is stuck in a non-ACTIVE state (INITIALIZING,
      // INITIATED, EXPIRED, FAILED). Purge those first so link starts fresh.
      let purgedAny = false;
      try {
        const staleRes = await callComposio(
          `${COMPOSIO_V3}/connected_accounts?user_id=${encodeURIComponent(effectiveUserId)}&auth_config_ids=${encodeURIComponent(matchedConfig.id)}`,
          { headers: composioHeaders },
        );
        const staleItems = Array.isArray(staleRes.data?.items) ? staleRes.data.items : [];
        for (const acc of staleItems) {
          const status = getConnectedAccountStatus(acc);
          // A young non-ACTIVE account may be an OAuth IN FLIGHT: purging it
          // here made the user's callback land on a deleted account
          // ("Connected account ca_… not found" on Composio's own completion
          // page — LinkedIn, 2026-08-14, two clicks 20 min apart). Only sweep
          // accounts old enough that their popup is certainly dead; the
          // 422-triggered force-purge below stays unconditional — there
          // Composio itself has refused the state.
          const ageMs = Date.now() - new Date(acc?.created_at ?? 0).getTime();
          const midFlight = Number.isFinite(ageMs) && ageMs < 15 * 60 * 1000;
          if (status && status !== 'ACTIVE' && acc?.id && !midFlight) {
            console.log(`[composio-proxy] Purging stale ${status} account ${acc.id}`);
            await callComposio(`${COMPOSIO_V3}/connected_accounts/${encodeURIComponent(acc.id)}`, {
              method: 'DELETE',
              headers: composioHeaders,
            });
            purgedAny = true;
          } else if (status && status !== 'ACTIVE' && midFlight) {
            console.log(`[composio-proxy] Leaving young ${status} account ${acc?.id} (possible OAuth in flight)`);
          }
        }
      } catch (e) {
        console.warn('[composio-proxy] stale-account purge failed (continuing):', (e as Error).message);
      }
      // Composio deletes are eventually consistent — give them a beat so the
      // next /link call does not see the just-purged INITIALIZING account.
      if (purgedAny) {
        await new Promise((r) => setTimeout(r, 800));
      }

      const connectBody: Record<string, unknown> = {
        auth_config_id: matchedConfig.id,
        auth_config: { id: matchedConfig.id },
        user_id: effectiveUserId,
        connection: { user_id: effectiveUserId },
      };

      if (params?.redirect_uri) {
        connectBody.redirect_uri = params.redirect_uri;
      }

      console.log('[composio-proxy] Initiating v3 connection:', JSON.stringify(connectBody));

      // Composio deprecated POST /connected_accounts for Composio-managed OAuth.
      // New endpoint is POST /connected_accounts/link.
      let res = await callComposio(`${COMPOSIO_V3}/connected_accounts/link`, {
        method: 'POST',
        headers: composioHeaders,
        body: JSON.stringify(connectBody),
      });

      // Fallback to legacy endpoint for self-managed auth configs that still accept it.
      if (!res.ok && res.status === 404) {
        res = await callComposio(`${COMPOSIO_V3}/connected_accounts`, {
          method: 'POST',
          headers: composioHeaders,
          body: JSON.stringify(connectBody),
        });
      }

      // If Composio still sees a lingering non-ACTIVE account (422
      // TOOL_AUTH_BadConnectedAccountState), force-purge everything on this
      // user_id + auth_config once more and retry.
      const stillBusy = !res.ok && res.status === 422 &&
        JSON.stringify(res.data || '').includes('BadConnectedAccountState');
      if (stillBusy) {
        console.log('[composio-proxy] Link hit BadConnectedAccountState — force-purge + retry');
        try {
          const again = await callComposio(
            `${COMPOSIO_V3}/connected_accounts?user_id=${encodeURIComponent(effectiveUserId)}&auth_config_ids=${encodeURIComponent(matchedConfig.id)}`,
            { headers: composioHeaders },
          );
          const items = Array.isArray(again.data?.items) ? again.data.items : [];
          for (const acc of items) {
            if (acc?.id && getConnectedAccountStatus(acc) !== 'ACTIVE') {
              await callComposio(`${COMPOSIO_V3}/connected_accounts/${encodeURIComponent(acc.id)}`, {
                method: 'DELETE',
                headers: composioHeaders,
              });
            }
          }
        } catch (_e) { /* ignore */ }
        await new Promise((r) => setTimeout(r, 1500));
        res = await callComposio(`${COMPOSIO_V3}/connected_accounts/link`, {
          method: 'POST',
          headers: composioHeaders,
          body: JSON.stringify(connectBody),
        });
      }

      console.log('[composio-proxy] Connection response:', JSON.stringify(res.data).slice(0, 500));

      if (!res.ok) {
        return json({
          error: extractErrorMessage(res.data, `Failed to initiate ${appName} connection (${res.status})`),
          details: res.data,
        }, res.status);
      }

      return json({
        result: {
          ...res.data,
          redirect_url: getRedirectUrl(res.data),
        },
      });
    }

    if (action === 'disconnect_account') {
      const accountId = params?.account_id;
      const toolkit = params?.toolkit;

      if (!accountId && !toolkit) {
        return json({ error: 'account_id or toolkit required' }, 400);
      }

      let targetAccountId = accountId;

      // Resolve by toolkit (e.g. 'gmail') if no explicit account id.
      if (!targetAccountId && toolkit) {
        const listRes = await callComposio(`${COMPOSIO_V3}/connected_accounts?user_id=${encodeURIComponent(effectiveUserId)}&status=ACTIVE&toolkit=${encodeURIComponent(toolkit)}`, {
          headers: composioHeaders,
        });
        const items = Array.isArray(listRes.data?.items) ? listRes.data.items : [];
        const match = items.find((a: any) => {
          const labels = getAuthConfigLabels(a).join('_');
          return labels.includes(toolkit);
        }) || items[0];
        targetAccountId = match?.id;
      }

      if (!targetAccountId) {
        return json({ error: `No active connected account found${toolkit ? ` for toolkit ${toolkit}` : ''}` }, 404);
      }

      const res = await callComposio(`${COMPOSIO_V3}/connected_accounts/${encodeURIComponent(targetAccountId)}`, {
        method: 'DELETE',
        headers: composioHeaders,
      });

      if (!res.ok) {
        return json({
          error: extractErrorMessage(res.data, `Failed to disconnect account (${res.status})`),
          details: res.data,
        }, res.status);
      }

      return json({ result: { disconnected: true, account_id: targetAccountId } });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error('[composio-proxy] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
