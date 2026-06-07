import { getUserClient } from '../_shared/supabase-clients.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const COMPOSIO_V3 = 'https://backend.composio.dev/api/v3';
const COMPOSIO_V2 = 'https://backend.composio.dev/api/v2';

function normalizeToken(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
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
    const token = authHeader.replace('Bearer ', '');
    const isServiceRole = serviceKey && token === serviceKey;

    if (!isServiceRole) {
      const supabaseClient = getUserClient(authHeader)!;
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser();

      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const composioKey = Deno.env.get('COMPOSIO_API_KEY');
    if (!composioKey) {
      return new Response(JSON.stringify({ error: 'Composio API key not configured' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { action, intent, app, params, entity_id } = body;
    const effectiveUserId = entity_id || 'default';

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

      const account = (res.data?.items || [])[0];
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
      const searchParams = new URLSearchParams();
      if (intent) searchParams.set('useCase', intent);
      if (app) searchParams.set('apps', app);
      searchParams.set('limit', '5');

      const res = await callComposio(`${COMPOSIO_V2}/actions?${searchParams}`, {
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

      const execBody: Record<string, unknown> = { input: params?.input || {} };
      if (accountId) execBody.connected_account_id = accountId;

      const res = await callComposio(`${COMPOSIO_V3}/tools/execute/${actionName}`, {
        method: 'POST',
        headers: composioHeaders,
        body: JSON.stringify(execBody),
      });

      if (!res.ok) {
        return json({ error: extractErrorMessage(res.data, `Failed to execute ${actionName}`), details: res.data }, res.status);
      }

      return json({ result: res.data });
    }

    if (action === 'gmail_send') {
      const { to, subject, body: emailBody, cc, bcc } = params || {};
      if (!to || !subject || !emailBody) {
        return json({ error: 'to, subject, and body required' }, 400);
      }

      const accountId = await getConnectedAccountId('gmail');
      if (!accountId) {
        return json({ error: 'Gmail not connected. Connect Gmail first.' }, 400);
      }

      const input: Record<string, string> = {
        recipient_email: to,
        subject,
        body: emailBody,
      };
      if (cc) input.cc = cc;
      if (bcc) input.bcc = bcc;

      const data = await executeToolV3('GMAIL_SEND_EMAIL', input, accountId);
      console.log('[composio-proxy] Gmail send response:', JSON.stringify(data).slice(0, 500));
      return json({ result: data });
    }

    if (action === 'gmail_read') {
      const accountId = await getConnectedAccountId('gmail');
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

      const res = await callComposio(`${COMPOSIO_V3}/connected_accounts`, {
        method: 'POST',
        headers: composioHeaders,
        body: JSON.stringify(connectBody),
      });

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

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error('[composio-proxy] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
