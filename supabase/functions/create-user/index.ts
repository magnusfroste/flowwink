import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAnonClient, getServiceClient, getUserClient } from '../_shared/supabase-clients.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Create admin client
    const supabaseAdmin = getServiceClient();

    // Create client with user's JWT to verify admin role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization');
    }

    const supabaseClient = getUserClient(authHeader)!;

    // Get current user
    const { data: { user: caller }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !caller) {
      console.error('Auth error:', userError);
      throw new Error('Could not verify user');
    }

    // Check if caller is admin using the has_role function
    const { data: isAdmin, error: roleError } = await supabaseAdmin
      .rpc('has_role', { _user_id: caller.id, _role: 'admin' });

    if (roleError) {
      console.error('Role check error:', roleError);
      throw new Error('Could not verify admin role');
    }

    if (!isAdmin) {
      throw new Error('Only administrators can create users');
    }

    // Parse request body
    const { email, password, full_name, role } = await req.json();

    // Validate input
    if (!email || !password || !role) {
      throw new Error('Email, password and role are required');
    }

    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    const validRoles = [
      'writer', 'approver', 'admin', 'customer', 'employee', 'sales', 'hr',
      'accounting', 'support', 'warehouse', 'marketing', 'purchasing', 'projects',
    ];
    if (!validRoles.includes(role)) {
      throw new Error(`Invalid role: ${role}`);
    }

    console.log(`Creating user: ${email} with role: ${role}`);

    // Create user with admin API (email_confirm: true skips verification).
    // signup_type is passed so handle_new_user() (which fails CLOSED to
    // 'customer' for absent metadata) does not seed a role we then have to
    // fight. We still reconcile below so the stored role set is exactly the
    // one the admin picked.
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || email },
      // The role request rides in app_metadata: only the service role can write
      // it, so handle_new_user() can trust it. user_metadata is the caller's own.
      app_metadata: { signup_type: role === 'admin' ? 'admin' : 'customer' },
    });

    if (createError) {
      console.error('Create user error:', createError);
      if (createError.message.includes('already been registered')) {
        throw new Error('That email address is already registered');
      }
      throw new Error(`Could not create user: ${createError.message}`);
    }

    console.log(`User created with ID: ${newUser.user.id}`);

    // Reconcile: exactly the requested role, nothing the signup trigger seeded.
    const { error: roleInsertError } = await supabaseAdmin
      .from('user_roles')
      .upsert({ user_id: newUser.user.id, role }, { onConflict: 'user_id,role' });

    if (roleInsertError) {
      console.error('Role insert error:', roleInsertError);
      // Don't throw - user is created, just log the issue
    }

    const { error: rolePruneError } = await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', newUser.user.id)
      .neq('role', role);

    if (rolePruneError) {
      console.error('Role prune error:', rolePruneError);
    }


    // Log the action for GDPR compliance
    const { error: auditError } = await supabaseAdmin
      .from('audit_logs')
      .insert({
        action: 'create_user',
        entity_type: 'user',
        entity_id: newUser.user.id,
        user_id: caller.id,
        metadata: { 
          created_email: email,
          assigned_role: role 
        }
      });

    if (auditError) {
      console.error('Audit log error:', auditError);
    }

    console.log(`User ${email} created successfully with role ${role}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        user: { 
          id: newUser.user.id, 
          email: newUser.user.email 
        } 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('Error in create-user:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
