import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const COMPOSIO_V1 = 'https://backend.composio.dev/api/v1';
const COMPOSIO_V2 = 'https://backend.composio.dev/api/v2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
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

    // Route: list connected apps
    if (action === 'list_apps') {
      const res = await fetch(`${COMPOSIO_V1}/connectedAccounts?user_uuid=${entity_id || 'default'}&showActiveOnly=true`, {
        headers: composioHeaders,
      });
      const data = await res.json();
      console.log('[composio-proxy] list_apps response:', JSON.stringify(data).slice(0, 500));
      return json({ result: data });
    }

    // Route: initiate connection (get OAuth URL)
    if (action === 'connect_app') {
      const appName = params?.app_name;
      if (!appName) {
        return json({ error: 'app_name required' }, 400);
      }

      // Step 1: Look up integration ID for this app
      console.log(`[composio-proxy] Looking up integration for app: ${appName}`);
      const intRes = await fetch(`${COMPOSIO_V1}/integrations?appName=${appName.toUpperCase()}`, {
        headers: composioHeaders,
      });
      const intData = await intRes.json();
      console.log('[composio-proxy] Integrations lookup:', JSON.stringify(intData).slice(0, 500));

      // Get first integration or use the items array
      const integrations = intData?.items || intData || [];
      const integration = Array.isArray(integrations) ? integrations[0] : null;
      
      if (!integration?.id) {
        console.error('[composio-proxy] No integration found for:', appName);
        return json({ 
          error: `No integration found for "${appName}". Set up the integration in Composio dashboard first.`,
          hint: 'Go to app.composio.dev → Integrations → Add the app',
          raw: intData,
        }, 404);
      }

      console.log(`[composio-proxy] Using integration ID: ${integration.id}`);

      // Step 2: Initiate connection with the integration ID
      const connectBody = {
        integrationId: integration.id,
        entityId: entity_id || 'default',
        ...(params?.redirect_uri ? { redirectUri: params.redirect_uri } : {}),
      };
      console.log('[composio-proxy] Initiating connection:', JSON.stringify(connectBody));

      const res = await fetch(`${COMPOSIO_V1}/connectedAccounts`, {
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
