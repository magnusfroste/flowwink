// Public customer-signup endpoint.
//
// Purpose: let end-customers (e-commerce buyers, booking guests, etc.) create
// an account even when staff signup is globally disabled (`auth.disable_signup`).
//
// Policy: `site_settings.customer_portal.{enabled, allowSelfSignup, requireEmailVerification}`
// is the single source of truth. If either flag is off, signup is rejected with 403.
//
// Why service-role: when self-hosters turn off `auth.disable_signup` to prevent
// staff from registering, `supabase.auth.signUp()` from the browser is blocked
// too. This function bypasses that via admin.createUser, but only after
// verifying the customer-portal policy allows it.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface SignupInput {
  email: string;
  password: string;
  fullName?: string;
}

const DEFAULTS = {
  enabled: true,
  allowSelfSignup: true,
  requireEmailVerification: true,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json() as SignupInput;
    const email = (body.email || '').trim().toLowerCase();
    const password = body.password || '';
    const fullName = (body.fullName || '').trim() || email.split('@')[0];

    if (!email || !email.includes('@')) {
      return json({ error: 'Valid email required' }, 400);
    }
    if (password.length < 6) {
      return json({ error: 'Password must be at least 6 characters' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Load customer-portal policy
    const { data: settingRow } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'customer_portal')
      .maybeSingle();

    const policy = { ...DEFAULTS, ...((settingRow?.value ?? {}) as Record<string, unknown>) };

    if (!policy.enabled || !policy.allowSelfSignup) {
      return json({ error: 'Customer signup is currently disabled' }, 403);
    }

    const origin = req.headers.get('origin') ?? '';
    const redirectTo = origin ? `${origin}/account` : undefined;

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: !policy.requireEmailVerification,
      user_metadata: {
        full_name: fullName,
        signup_type: 'customer',
      },
    });

    if (error) {
      const msg = error.message?.includes('already')
        ? 'An account with this email already exists'
        : (error.message || 'Could not create account');
      return json({ error: msg }, 400);
    }

    // Assign customer role
    if (data.user) {
      await supabase
        .from('user_roles')
        .insert({ user_id: data.user.id, role: 'customer' })
        // ignore duplicates
        .then((res) => res);

      // Send confirmation email if verification required
      if (policy.requireEmailVerification && redirectTo) {
        await supabase.auth.admin.generateLink({
          type: 'signup',
          email,
          password,
          options: { redirectTo },
        }).catch(() => {/* best-effort */});
      }
    }

    return json({
      success: true,
      requires_verification: !!policy.requireEmailVerification,
      user_id: data.user?.id ?? null,
    }, 200);
  } catch (err) {
    console.error('[customer-signup] error:', err);
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
