import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Create client with user's JWT to verify admin role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Ingen auktorisering');
    }

    const supabaseClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Get current user
    const { data: { user: caller }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !caller) {
      console.error('Auth error:', userError);
      throw new Error('Kunde inte verifiera användare');
    }

    // Check if caller is admin using the has_role function
    const { data: isAdmin, error: roleError } = await supabaseAdmin
      .rpc('has_role', { _user_id: caller.id, _role: 'admin' });

    if (roleError) {
      console.error('Role check error:', roleError);
      throw new Error('Kunde inte verifiera admin-roll');
    }

    if (!isAdmin) {
      throw new Error('Endast administratörer kan skapa användare');
    }

    // Parse request body
    const { email, password, full_name, role } = await req.json();

    // Validate input
    if (!email || !password || !role) {
      throw new Error('E-post, lösenord och roll krävs');
    }

    if (password.length < 8) {
      throw new Error('Lösenordet måste vara minst 8 tecken');
    }

    const validRoles = ['writer', 'approver', 'admin'];
    if (!validRoles.includes(role)) {
      throw new Error('Ogiltig roll');
    }

    console.log(`Creating user: ${email} with role: ${role}`);

    // Create user with admin API (email_confirm: true skips verification)
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || email }
    });

    if (createError) {
      console.error('Create user error:', createError);
      if (createError.message.includes('already been registered')) {
        throw new Error('E-postadressen är redan registrerad');
      }
      throw new Error(`Kunde inte skapa användare: ${createError.message}`);
    }

    console.log(`User created with ID: ${newUser.user.id}`);

    // Update user role (the trigger creates default 'writer' role, so we update if different)
    if (role !== 'writer') {
      const { error: roleUpdateError } = await supabaseAdmin
        .from('user_roles')
        .update({ role })
        .eq('user_id', newUser.user.id);

      if (roleUpdateError) {
        console.error('Role update error:', roleUpdateError);
        // Don't throw - user is created, just log the issue
      }
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
    const errorMessage = error instanceof Error ? error.message : 'Ett oväntat fel uppstod';
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
