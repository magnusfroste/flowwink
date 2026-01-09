import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SecretsStatus {
  core: {
    supabase_url: boolean;
    supabase_anon_key: boolean;
    supabase_service_role_key: boolean;
  };
  integrations: {
    resend: boolean;
    stripe: boolean;
    stripe_webhook: boolean;
    unsplash: boolean;
    firecrawl: boolean;
    openai: boolean;
    gemini: boolean;
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify JWT - this function requires authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[check-secrets] No authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the user is an admin
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('[check-secrets] User authentication failed:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleData?.role !== 'admin') {
      console.error('[check-secrets] User is not admin:', user.id);
      return new Response(
        JSON.stringify({ error: 'Forbidden - Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[check-secrets] Checking secrets status for admin:', user.id);

    // Check which secrets are configured (only presence, not values!)
    const status: SecretsStatus = {
      core: {
        supabase_url: !!Deno.env.get('SUPABASE_URL'),
        supabase_anon_key: !!Deno.env.get('SUPABASE_ANON_KEY'),
        supabase_service_role_key: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      },
      integrations: {
        resend: !!Deno.env.get('RESEND_API_KEY'),
        stripe: !!Deno.env.get('STRIPE_SECRET_KEY'),
        stripe_webhook: !!Deno.env.get('STRIPE_WEBHOOK_SECRET'),
        unsplash: !!Deno.env.get('UNSPLASH_ACCESS_KEY'),
        firecrawl: !!Deno.env.get('FIRECRAWL_API_KEY'),
        openai: !!Deno.env.get('OPENAI_API_KEY'),
        gemini: !!Deno.env.get('GEMINI_API_KEY'),
      }
    };

    console.log('[check-secrets] Status:', JSON.stringify(status));

    return new Response(
      JSON.stringify(status),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[check-secrets] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
