import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const COMPOSIO_BASE = 'https://backend.composio.dev/api/v2';

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

    // Route: search tools by intent
    if (action === 'search_tools') {
      const searchParams = new URLSearchParams();
      if (intent) searchParams.set('useCase', intent);
      if (app) searchParams.set('apps', app);
      searchParams.set('limit', '5');

      const res = await fetch(`${COMPOSIO_BASE}/actions?${searchParams}`, {
        headers: composioHeaders,
      });
      const data = await res.json();

      return new Response(JSON.stringify({ result: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Route: execute action (generic or skill-specific)
    if (action === 'execute') {
      const actionName = params?.action_name;
      if (!actionName) {
        return new Response(JSON.stringify({ error: 'action_name required in params' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const res = await fetch(`${COMPOSIO_BASE}/actions/${actionName}/execute`, {
        method: 'POST',
        headers: composioHeaders,
        body: JSON.stringify({
          entityId: entity_id || 'default',
          input: params?.input || {},
        }),
      });
      const data = await res.json();

      return new Response(JSON.stringify({ result: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Route: Gmail send (skill shortcut)
    if (action === 'gmail_send') {
      const { to, subject, body: emailBody, cc, bcc } = params || {};
      if (!to || !subject || !emailBody) {
        return new Response(JSON.stringify({ error: 'to, subject, and body required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const input: Record<string, string> = {
        recipient_email: to,
        subject,
        body: emailBody,
      };
      if (cc) input.cc = cc;
      if (bcc) input.bcc = bcc;

      const res = await fetch(`${COMPOSIO_BASE}/actions/GMAIL_SEND_EMAIL/execute`, {
        method: 'POST',
        headers: composioHeaders,
        body: JSON.stringify({
          entityId: entity_id || 'default',
          input,
        }),
      });
      const data = await res.json();

      return new Response(JSON.stringify({ result: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Route: Gmail read (skill shortcut)
    if (action === 'gmail_read') {
      const query = params?.query || '';
      const maxResults = params?.max_results || 5;

      const res = await fetch(`${COMPOSIO_BASE}/actions/GMAIL_FETCH_EMAILS/execute`, {
        method: 'POST',
        headers: composioHeaders,
        body: JSON.stringify({
          entityId: entity_id || 'default',
          input: { query, max_results: maxResults },
        }),
      });
      const data = await res.json();

      return new Response(JSON.stringify({ result: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Route: list connected apps
    if (action === 'list_apps') {
      const res = await fetch(`${COMPOSIO_BASE}/connectedAccounts?user_uuid=${entity_id || 'default'}`, {
        headers: composioHeaders,
      });
      const data = await res.json();

      return new Response(JSON.stringify({ result: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Route: initiate connection (get OAuth URL)
    if (action === 'connect_app') {
      const appName = params?.app_name;
      if (!appName) {
        return new Response(JSON.stringify({ error: 'app_name required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const res = await fetch(`${COMPOSIO_BASE}/connectedAccounts`, {
        method: 'POST',
        headers: composioHeaders,
        body: JSON.stringify({
          integrationId: appName,
          entityId: entity_id || 'default',
          redirectUri: params?.redirect_uri || undefined,
        }),
      });
      const data = await res.json();

      return new Response(JSON.stringify({ result: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[composio-proxy] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
