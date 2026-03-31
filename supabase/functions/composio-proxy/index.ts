import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const COMPOSIO_V3 = 'https://backend.composio.dev/api/v3';
const COMPOSIO_V2 = 'https://backend.composio.dev/api/v2';
const COMPOSIO_V1 = 'https://backend.composio.dev/api/v1';

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

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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

    const composioHeaders = {
      'Content-Type': 'application/json',
      'x-api-key': composioKey,
    };

    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    // Route: search tools by intent
    if (action === 'search_tools') {
      const searchParams = new URLSearchParams();
      if (intent) searchParams.set('useCase', intent);
      if (app) searchParams.set('apps', app);
      searchParams.set('limit', '5');

      const res = await fetch(`${COMPOSIO_V2}/actions?${searchParams}`, {
        headers: composioHeaders,
      });
      const data = await res.json();
      return json({ result: data });
    }

    // Route: execute action (v3)
    if (action === 'execute') {
      const actionName = params?.action_name;
      if (!actionName) {
        return json({ error: 'action_name required in params' }, 400);
      }

      const toolkit = params?.toolkit || actionName.split('_')[0]?.toLowerCase();
      const accountId = await getConnectedAccountId(toolkit);

      const execBody: Record<string, unknown> = { input: params?.input || {} };
      if (accountId) execBody.connected_account_id = accountId;

      const res = await fetch(`${COMPOSIO_V3}/tools/execute/${actionName}`, {
        method: 'POST',
        headers: composioHeaders,
        body: JSON.stringify(execBody),
      });
      const data = await res.json();
      return json({ result: data });
    }

    // Helper: find active connected account for a toolkit
    async function getConnectedAccountId(toolkit: string): Promise<string | null> {
      const res = await fetch(`${COMPOSIO_V3}/connected_accounts?user_id=${entity_id || 'default'}&status=ACTIVE&toolkit=${toolkit}`, {
        headers: composioHeaders,
      });
      const data = await res.json();
      const account = (data?.items || [])[0];
      return account?.id || null;
    }

    // Helper: execute a tool via v3
    async function executeToolV3(toolSlug: string, args: Record<string, unknown>, connectedAccountId: string, userId = 'default') {
      const res = await fetch(`${COMPOSIO_V3}/tools/execute/${toolSlug}`, {
        method: 'POST',
        headers: composioHeaders,
        body: JSON.stringify({
          connected_account_id: connectedAccountId,
          user_id: userId,
          arguments: args,
        }),
      });
      const data = await res.json();
      // Normalise: if Composio returns an error object, surface it cleanly
      if (data?.error) {
        const msg = data.error?.message || data.error?.suggested_fix || JSON.stringify(data.error);
        return { success: false, error: msg };
      }
      return data;
    }

    // Route: Gmail send
    if (action === 'gmail_send') {
      const { to, subject, body: emailBody, cc, bcc } = params || {};
      if (!to || !subject || !emailBody) {
        return json({ error: 'to, subject, and body required' }, 400);
      }

      const accountId = await getConnectedAccountId('gmail');
      if (!accountId) {
        return json({ error: 'Gmail not connected. Connect Gmail first.' }, 400);
      }

      console.log(`[composio-proxy] Gmail send via v3, account: ${accountId}`);

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

    // Route: Gmail read
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

    // Route: list connected apps (v3)
    if (action === 'list_apps') {
      const res = await fetch(`${COMPOSIO_V3}/connected_accounts?user_id=${entity_id || 'default'}&status=ACTIVE`, {
        headers: composioHeaders,
      });
      const data = await res.json();
      console.log('[composio-proxy] list_apps response:', JSON.stringify(data).slice(0, 500));
      // v3 returns { items: [...] }
      return json({ result: data?.items || data });
    }

    // Route: initiate connection (get OAuth URL)
    if (action === 'connect_app') {
      const appName = params?.app_name;
      if (!appName) {
        return json({ error: 'app_name required' }, 400);
      }

      // Step 1: Find integration via v1 (reliable app name filtering)
      console.log(`[composio-proxy] Looking up v1 integration for: ${appName}`);
      const intRes = await fetch(`${COMPOSIO_V1}/integrations?appName=${appName.toUpperCase()}`, {
        headers: composioHeaders,
      });
      const intData = await intRes.json();
      console.log('[composio-proxy] v1 integrations:', JSON.stringify(intData).slice(0, 500));

      const integrations = intData?.items || intData || [];
      const integration = Array.isArray(integrations) ? integrations[0] : null;

      if (!integration?.id) {
        return json({
          error: `No integration found for "${appName}". Set it up in Composio dashboard.`,
          raw: intData,
        }, 404);
      }

      // Step 2: Find matching v3 auth_config by the v1 integration UUID
      // The v1 integration.id maps to v3 auth_config.uuid (deprecated field)
      console.log(`[composio-proxy] Looking up v3 auth_config for integration UUID: ${integration.id}`);
      const acRes = await fetch(`${COMPOSIO_V3}/auth_configs`, {
        headers: composioHeaders,
      });
      const acData = await acRes.json();
      const authConfigs = acData?.items || [];
      
      // Match by deprecated.uuid or by name containing the app name
      const matchedConfig = Array.isArray(authConfigs) 
        ? authConfigs.find((ac: any) => 
            ac.uuid === integration.id || 
            ac.deprecated?.uuid === integration.id ||
            (ac.name || '').toLowerCase().includes(appName.toLowerCase())
          )
        : null;

      if (!matchedConfig?.id) {
        console.error('[composio-proxy] No matching v3 auth_config. Available:', 
          JSON.stringify(authConfigs.map((a: any) => ({ id: a.id, name: a.name, uuid: a.uuid })))
        );
        return json({
          error: `No auth config found for "${appName}".`,
          available: authConfigs.map((a: any) => ({ id: a.id, name: a.name })),
        }, 404);
      }

      console.log(`[composio-proxy] Matched auth_config: ${matchedConfig.id} (${matchedConfig.name})`);

      // Step 3: Initiate connection via v3
      const connectBody: Record<string, unknown> = {
        auth_config: { id: matchedConfig.id },
        connection: { user_id: entity_id || 'default' },
      };
      if (params?.redirect_uri) {
        connectBody.redirect_uri = params.redirect_uri;
      }

      console.log('[composio-proxy] Initiating v3 connection:', JSON.stringify(connectBody));
      const res = await fetch(`${COMPOSIO_V3}/connected_accounts`, {
        method: 'POST',
        headers: composioHeaders,
        body: JSON.stringify(connectBody),
      });
      const data = await res.json();
      console.log('[composio-proxy] Connection response:', JSON.stringify(data).slice(0, 500));

      return json({ result: data });
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
