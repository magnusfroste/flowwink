import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";

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
    const input = await req.json() as ProfileSetupInput;
    
    if (!input.type || !['company', 'user'].includes(input.type)) {
      return new Response(JSON.stringify({ error: 'type must be "company" or "user"' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!input.data || typeof input.data !== 'object') {
      return new Response(JSON.stringify({ error: 'data object is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const userId = input.type === 'user' ? (input.user_id || null) : null;

    // Upsert the profile
    const { data, error } = await supabase
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
      profile: data,
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
