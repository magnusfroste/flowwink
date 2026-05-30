import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient, resolveCaller } from '../_shared/supabase-clients.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ProfileSetupInput {
  type: 'company' | 'user';
  data: Record<string, unknown>;
  user_id?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const raw = await req.json() as Record<string, unknown>;

    const type = raw.type as 'company' | 'user' | undefined;
    if (!type || !['company', 'user'].includes(type)) {
      return new Response(JSON.stringify({ error: 'type must be "company" or "user"' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Tolerant arg-mapping: accept either { type, data: {...} } or a flat
    // { type, icp, value_proposition, ... } payload from MCP/FlowChat callers.
    let data: Record<string, unknown>;
    if (raw.data && typeof raw.data === 'object') {
      data = raw.data as Record<string, unknown>;
    } else {
      const { type: _t, user_id: _u, data: _d, ...rest } = raw;
      data = rest as Record<string, unknown>;
    }

    if (!data || Object.keys(data).length === 0) {
      return new Response(JSON.stringify({ error: 'profile fields are required (either as `data` object or flat properties)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization');
    const caller = authHeader ? await resolveCaller(authHeader) : null;
    if (type === 'user' && caller?.error) {
      return new Response(JSON.stringify({ error: 'Authentication required for user profile' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const input: ProfileSetupInput = {
      type,
      data,
      user_id: type === 'user'
        ? caller?.user?.id
        : (raw.user_id as string | undefined),
    };
    const supabase = getServiceClient();

    const userId = input.type === 'user' ? (input.user_id || null) : null;

    // Upsert the profile
    const { data: profile, error } = await supabase
      .from('sales_intelligence_profiles')
      .upsert(
        {
          type: input.type,
          user_id: userId,
          data: input.data,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'type,user_id' }
      )
      .select()
      .single();

    if (error) {
      console.error('[sales-profile-setup] Upsert error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[sales-profile-setup] Profile saved:', input.type, userId);

    return new Response(JSON.stringify({
      success: true,
      profile,
      message: `${input.type} profile saved successfully`,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[sales-profile-setup] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
