// =============================================================================
// setup-flowpilot — DEPRECATED (kept for backward compatibility)
//
// As of 2026-04, FlowPilot is fully self-contained as a module:
//   - Schema/DDL → owned by platform migrations (supabase/migrations/)
//   - Skills → seeded by bootstrapModule('flowpilot') from src/lib/modules/flowpilot-module.ts
//   - Soul/identity/agents-rules/tool_policy/objectives → seedData() in flowpilot-module.ts
//   - Automations → declared in flowpilot-module.ts → automations[]
//
// This function now serves only as a no-op success endpoint for older clients
// (template installers, legacy admin UI buttons) that still POST here.
//
// To init FlowPilot: toggle the FlowPilot module ON in /admin/modules.
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('[setup-flowpilot] Called — function is deprecated; FlowPilot init is now owned by the module system.');

  return new Response(
    JSON.stringify({
      success: true,
      deprecated: true,
      message:
        'setup-flowpilot is deprecated. FlowPilot is now self-contained as a module — toggle it ON in /admin/modules to seed soul, skills, automations and starter objectives.',
      next_steps: [
        'Open /admin/modules',
        'Enable the FlowPilot module',
        'bootstrapModule(\"flowpilot\") will seed everything automatically',
      ],
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
