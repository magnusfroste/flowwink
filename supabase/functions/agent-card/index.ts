import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Load external-facing skills from the database
    const { data: skills } = await supabase
      .from('agent_skills')
      .select('name, description, category')
      .eq('enabled', true)
      .in('scope', ['external', 'both']);

    const a2aSkills = (skills || []).map((s: any, i: number) => ({
      id: s.name,
      name: s.name,
      description: s.description || s.name,
      tags: [s.category || 'general'],
    }));

    // Load identity from agent_memory for a richer card
    const { data: identity } = await supabase
      .from('agent_memory')
      .select('value')
      .eq('key', 'identity')
      .maybeSingle();

    const id = identity?.value as any;

    const card = {
      protocolVersion: '0.3.0',
      version: '1.0.0',
      name: id?.name || 'FlowPilot',
      description: id?.role || 'Autonomous CMS operator for FlowWink',
      url: `${supabaseUrl}/functions/v1/a2a-ingest`,
      capabilities: {
        streaming: false,
        pushNotifications: false,
        stateTransitionHistory: false,
      },
      skills: a2aSkills,
      defaultInputModes: ['text'],
      defaultOutputModes: ['text'],
      securitySchemes: {
        bearer: {
          type: 'http',
          scheme: 'bearer',
        },
      },
      security: [{ bearer: [] }],
      supportsAuthenticatedExtendedCard: false,
    };

    return new Response(JSON.stringify(card, null, 2), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (err: any) {
    console.error('Agent card error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
