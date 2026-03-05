import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExecuteRequest {
  skill_id?: string;
  skill_name?: string;
  arguments: Record<string, unknown>;
  agent_type: 'flowpilot' | 'chat';
  conversation_id?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body: ExecuteRequest = await req.json();
    const { skill_id, skill_name, arguments: args, agent_type, conversation_id } = body;

    if (!skill_id && !skill_name) {
      return new Response(JSON.stringify({ error: 'skill_id or skill_name required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Look up the skill
    let query = supabase.from('agent_skills').select('*').eq('enabled', true);
    if (skill_id) query = query.eq('id', skill_id);
    else if (skill_name) query = query.eq('name', skill_name);

    const { data: skills, error: skillError } = await query.limit(1).single();
    if (skillError || !skills) {
      return new Response(JSON.stringify({ error: `Skill not found: ${skill_id || skill_name}` }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const skill = skills;

    // 2. Validate scope
    if (agent_type === 'chat' && skill.scope === 'internal') {
      await logActivity(supabase, {
        agent: agent_type, skill_id: skill.id, skill_name: skill.name,
        input: args, output: { error: 'Scope violation' },
        status: 'failed', conversation_id, duration_ms: Date.now() - startTime,
        error_message: `Skill '${skill.name}' is internal-only, cannot run from public chat`,
      });
      return new Response(JSON.stringify({ error: 'This action is not available' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Check requires_approval
    if (skill.requires_approval) {
      const activityId = await logActivity(supabase, {
        agent: agent_type, skill_id: skill.id, skill_name: skill.name,
        input: args, output: {}, status: 'pending_approval',
        conversation_id, duration_ms: Date.now() - startTime,
      });

      return new Response(JSON.stringify({
        status: 'pending_approval',
        activity_id: activityId,
        skill: skill.name,
        message: `Action '${skill.name}' requires admin approval before executing.`,
        input: args,
      }), {
        status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Route to handler
    let result: unknown;
    const handler = skill.handler as string;

    if (handler.startsWith('edge:')) {
      // Invoke another edge function
      const fnName = handler.replace('edge:', '');
      const response = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify(args),
      });
      result = await response.json();

    } else if (handler.startsWith('module:')) {
      // Module registry — route through the module's table
      const moduleName = handler.replace('module:', '');
      result = await executeModuleAction(supabase, moduleName, skill.name, args);

    } else if (handler.startsWith('db:')) {
      // Direct DB operation
      const table = handler.replace('db:', '');
      result = await executeDbAction(supabase, table, skill.name, args);

    } else if (handler.startsWith('webhook:')) {
      // External webhook (N8N etc)
      result = await executeWebhook(supabase, args);

    } else {
      result = { error: `Unknown handler type: ${handler}` };
    }

    // 5. Log activity
    const activityId = await logActivity(supabase, {
      agent: agent_type, skill_id: skill.id, skill_name: skill.name,
      input: args, output: result as Record<string, unknown>,
      status: 'success', conversation_id,
      duration_ms: Date.now() - startTime,
    });

    // 6. Auto-track objective progress
    if (activityId) {
      await trackObjectiveProgress(supabase, skill.name, activityId);
    }

    return new Response(JSON.stringify({ status: 'success', result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('agent-execute error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// =============================================================================
// Handler implementations
// =============================================================================

async function executeModuleAction(
  supabase: ReturnType<typeof createClient>,
  moduleName: string,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (moduleName) {
    case 'blog': {
      const { title, topic, tone = 'professional', language = 'en' } = args as any;
      // Create a draft blog post
      const slug = (title as string).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const { data, error } = await supabase.from('blog_posts').insert({
        title, slug, status: 'draft',
        excerpt: `Blog post about: ${topic}`,
        meta_json: { tone, language, generated_by: 'flowpilot', topic },
      }).select().single();
      if (error) throw new Error(`Blog insert failed: ${error.message}`);
      return { blog_post_id: data.id, slug: data.slug, title: data.title, status: 'draft' };
    }

    case 'crm': {
      const { email, name, source = 'chat', phone } = args as any;
      const { data, error } = await supabase.from('leads').insert({
        email, name, source, phone,
      }).select().single();
      if (error) throw new Error(`Lead insert failed: ${error.message}`);
      return { lead_id: data.id, email: data.email, status: data.status };
    }

    case 'booking': {
      const { service_id, customer_name, customer_email, date, time } = args as any;
      // Find service or use first active service
      let svcId = service_id;
      if (!svcId) {
        const { data: services } = await supabase
          .from('booking_services').select('id, duration_minutes')
          .eq('is_active', true).order('sort_order').limit(1);
        if (services?.length) svcId = services[0].id;
      }

      const startTime = new Date(`${date}T${time}:00`);
      const { data: svc } = await supabase.from('booking_services')
        .select('duration_minutes').eq('id', svcId).single();
      const duration = svc?.duration_minutes || 60;
      const endTime = new Date(startTime.getTime() + duration * 60000);

      const { data, error } = await supabase.from('bookings').insert({
        service_id: svcId, customer_name, customer_email,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        status: 'pending',
      }).select().single();
      if (error) throw new Error(`Booking failed: ${error.message}`);
      return { booking_id: data.id, start_time: data.start_time, status: 'pending' };
    }

    case 'newsletter': {
      const { subject, content, schedule_at } = args as any;
      const { data, error } = await supabase.from('newsletters').insert({
        subject,
        content_html: content,
        status: schedule_at ? 'scheduled' : 'draft',
        scheduled_at: schedule_at || null,
      }).select().single();
      if (error) throw new Error(`Newsletter failed: ${error.message}`);
      return { newsletter_id: data.id, subject: data.subject, status: data.status };
    }

    case 'orders': {
      const { order_id, email } = args as any;
      let query = supabase.from('orders').select('id, status, total_cents, currency, created_at, customer_email');
      if (order_id) query = query.eq('id', order_id);
      else if (email) query = query.eq('customer_email', email);
      const { data, error } = await query.order('created_at', { ascending: false }).limit(5);
      if (error) throw new Error(`Order lookup failed: ${error.message}`);
      return { orders: data || [] };
    }

    case 'objectives': {
      const { goal, constraints = {}, success_criteria = {} } = args as any;
      if (!goal) throw new Error('goal is required');
      const { data, error } = await supabase.from('agent_objectives').insert({
        goal,
        constraints,
        success_criteria,
        status: 'active',
        progress: {},
      }).select('id, goal, status').single();
      if (error) throw new Error(`Objective insert failed: ${error.message}`);
      return { objective_id: data.id, goal: data.goal, status: data.status };
    }

    case 'automations': {
      const { name, description, trigger_type = 'cron', trigger_config = {}, skill_name: targetSkill, skill_arguments = {}, enabled = false } = args as any;
      if (!name || !targetSkill) throw new Error('name and skill_name are required');

      // Look up skill_id from skill_name
      const { data: skillRef } = await supabase.from('agent_skills')
        .select('id').eq('name', targetSkill).eq('enabled', true).limit(1).single();

      const { data, error } = await supabase.from('agent_automations').insert({
        name,
        description: description || null,
        trigger_type,
        trigger_config,
        skill_id: skillRef?.id || null,
        skill_name: targetSkill,
        skill_arguments,
        enabled,
      }).select('id, name, trigger_type, enabled').single();
      if (error) throw new Error(`Automation insert failed: ${error.message}`);
      return { automation_id: data.id, name: data.name, trigger_type: data.trigger_type, enabled: data.enabled };
    }

    default:
      return { error: `Unknown module: ${moduleName}` };
  }
}

async function executeDbAction(
  supabase: ReturnType<typeof createClient>,
  table: string,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (table) {
    case 'site_settings': {
      const { key, value } = args as any;
      const { data, error } = await supabase.from('site_settings')
        .upsert({ key, value }, { onConflict: 'key' })
        .select().single();
      if (error) throw new Error(`Settings update failed: ${error.message}`);
      return { key: data.key, updated: true };
    }

    case 'page_views': {
      const { period = 'week', focus = 'all' } = args as any;
      const now = new Date();
      const since = new Date(now);
      switch (period) {
        case 'today': since.setHours(0, 0, 0, 0); break;
        case 'week': since.setDate(now.getDate() - 7); break;
        case 'month': since.setMonth(now.getMonth() - 1); break;
        case 'quarter': since.setMonth(now.getMonth() - 3); break;
      }

      const { data, error } = await supabase.from('page_views')
        .select('page_slug, page_title, created_at, referrer, device_type')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw new Error(`Analytics query failed: ${error.message}`);

      const views = data || [];
      const totalViews = views.length;
      const uniqueSlugs = [...new Set(views.map(v => v.page_slug))];
      const topPages = uniqueSlugs.map(slug => ({
        slug,
        title: views.find(v => v.page_slug === slug)?.page_title || slug,
        views: views.filter(v => v.page_slug === slug).length,
      })).sort((a, b) => b.views - a.views).slice(0, 10);

      return { period, total_views: totalViews, unique_pages: uniqueSlugs.length, top_pages: topPages };
    }

    default:
      return { error: `Unknown table handler: ${table}` };
  }
}

async function executeWebhook(
  supabase: ReturnType<typeof createClient>,
  args: Record<string, unknown>,
): Promise<unknown> {
  // Get active webhooks, find one matching the event
  const { data: webhooks } = await supabase.from('webhooks')
    .select('*').eq('is_active', true).limit(10);

  if (!webhooks?.length) return { error: 'No active webhooks configured' };

  // Fire to first webhook (can be refined to match by event type)
  const webhook = webhooks[0];
  const response = await fetch(webhook.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(webhook.headers || {}),
    },
    body: JSON.stringify(args),
  });

  return {
    webhook_id: webhook.id,
    status: response.status,
    success: response.ok,
  };
}

// =============================================================================
// Activity logging
// =============================================================================

async function logActivity(
  supabase: ReturnType<typeof createClient>,
  activity: {
    agent: string;
    skill_id: string;
    skill_name: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    status: string;
    conversation_id?: string;
    duration_ms: number;
    error_message?: string;
  },
): Promise<string | null> {
  const { data, error } = await supabase.from('agent_activity').insert({
    agent: activity.agent,
    skill_id: activity.skill_id,
    skill_name: activity.skill_name,
    input: activity.input,
    output: activity.output,
    status: activity.status,
    conversation_id: activity.conversation_id || null,
    duration_ms: activity.duration_ms,
    error_message: activity.error_message || null,
  }).select('id').single();

  if (error) console.error('Failed to log activity:', error);
  return data?.id || null;
}

// =============================================================================
// Objective progress auto-tracking
// =============================================================================

// Maps skill names to objective keywords they contribute to
const SKILL_OBJECTIVE_MAP: Record<string, string[]> = {
  write_blog_post: ['blog', 'content', 'publish', 'article'],
  create_page_block: ['page', 'content', 'website'],
  send_newsletter: ['newsletter', 'email', 'subscriber', 'engagement'],
  add_lead: ['lead', 'crm', 'sales', 'pipeline'],
  prospect_research: ['prospect', 'research', 'sales', 'lead'],
  prospect_fit_analysis: ['prospect', 'fit', 'sales', 'pipeline'],
  create_campaign: ['campaign', 'marketing', 'engagement'],
  book_appointment: ['booking', 'appointment', 'calendar'],
  analyze_analytics: ['analytics', 'traffic', 'performance', 'growth'],
  weekly_business_digest: ['digest', 'report', 'overview'],
  search_web: ['research', 'content'],
};

async function trackObjectiveProgress(
  supabase: ReturnType<typeof createClient>,
  skillName: string,
  activityId: string,
): Promise<void> {
  try {
    // Find active objectives
    const { data: objectives } = await supabase
      .from('agent_objectives')
      .select('id, goal, progress')
      .eq('status', 'active');

    if (!objectives?.length) return;

    const keywords = SKILL_OBJECTIVE_MAP[skillName] || [];
    if (!keywords.length) return;

    for (const obj of objectives) {
      const goalLower = obj.goal.toLowerCase();
      const matches = keywords.some(kw => goalLower.includes(kw));
      if (!matches) continue;

      // Link activity to objective
      await supabase.from('agent_objective_activities').insert({
        objective_id: obj.id,
        activity_id: activityId,
      }).select().maybeSingle();

      // Increment progress counter
      const progress = (obj.progress as Record<string, unknown>) || {};
      const skillCount = ((progress[skillName] as number) || 0) + 1;
      const totalActions = ((progress.total_actions as number) || 0) + 1;

      await supabase
        .from('agent_objectives')
        .update({
          progress: {
            ...progress,
            [skillName]: skillCount,
            total_actions: totalActions,
            last_skill: skillName,
            last_action_at: new Date().toISOString(),
          },
        })
        .eq('id', obj.id);

      console.log(`[objective-tracker] Linked skill '${skillName}' to objective '${obj.goal}' (actions: ${totalActions})`);
    }
  } catch (err) {
    console.error('[objective-tracker] Error:', err);
    // Non-fatal — don't break skill execution
  }
}
