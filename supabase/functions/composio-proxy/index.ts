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

    // Route: execute action
    if (action === 'execute') {
      const actionName = params?.action_name;
      if (!actionName) {
        return json({ error: 'action_name required in params' }, 400);
      }

      const res = await fetch(`${COMPOSIO_V2}/actions/${actionName}/execute`, {
        method: 'POST',
        headers: composioHeaders,
        body: JSON.stringify({
          entityId: entity_id || 'default',
          input: params?.input || {},
        }),
      });
      const data = await res.json();
      return json({ result: data });
    }

    // Route: Gmail send
    if (action === 'gmail_send') {
      const { to, subject, body: emailBody, cc, bcc } = params || {};
      if (!to || !subject || !emailBody) {
        return json({ error: 'to, subject, and body required' }, 400);
      }

      const input: Record<string, string> = {
        recipient_email: to,
        subject,
        body: emailBody,
      };
      if (cc) input.cc = cc;
      if (bcc) input.bcc = bcc;

      const res = await fetch(`${COMPOSIO_V2}/actions/GMAIL_SEND_EMAIL/execute`, {
        method: 'POST',
        headers: composioHeaders,
        body: JSON.stringify({ entityId: entity_id || 'default', input }),
      });
      const data = await res.json();
      return json({ result: data });
    }

    // Route: Gmail read
    if (action === 'gmail_read') {
      const query = params?.query || '';
      const maxResults = params?.max_results || 5;

      const res = await fetch(`${COMPOSIO_V2}/actions/GMAIL_FETCH_EMAILS/execute`, {
        method: 'POST',
        headers: composioHeaders,
        body: JSON.stringify({
          entityId: entity_id || 'default',
          input: { query, max_results: maxResults },
        }),
      });
      const data = await res.json();
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

    // Route: initiate connection (get OAuth URL) via v3
    if (action === 'connect_app') {
      const appName = params?.app_name;
      if (!appName) {
        return json({ error: 'app_name required' }, 400);
      }

      // Step 1: Find auth config (integration) for this app
      console.log(`[composio-proxy] Looking up auth configs for app: ${appName}`);
      const acRes = await fetch(`${COMPOSIO_V3}/auth_configs?toolkit=${appName.toLowerCase()}`, {
        headers: composioHeaders,
      });
      const acData = await acRes.json();
      console.log('[composio-proxy] Auth configs response:', JSON.stringify(acData).slice(0, 500));

      const authConfigs = acData?.items || acData || [];
      const authConfig = Array.isArray(authConfigs) ? authConfigs[0] : null;

      if (!authConfig?.id) {
        console.error('[composio-proxy] No auth config found for:', appName);
        return json({
          error: `No auth config found for "${appName}". Create one in Composio dashboard first.`,
          hint: 'Go to app.composio.dev → Your app → Setup auth config',
          raw: acData,
        }, 404);
      }

      console.log(`[composio-proxy] Using auth config ID: ${authConfig.id}`);

      // Step 2: Initiate connection via v3
      const connectBody: Record<string, unknown> = {
        auth_config: { id: authConfig.id },
        connection: {
          user_id: entity_id || 'default',
        },
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
