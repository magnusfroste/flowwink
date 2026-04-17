import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { normalizeBlockData, normalizeBlocks, validateBlockData } from '../_shared/normalize-blocks.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ExecuteRequest {
  skill_id?: string;
  skill_name?: string;
  arguments: Record<string, unknown>;
  agent_type: 'flowpilot' | 'chat';
  conversation_id?: string;
  /** Trace ID from the parent reason() loop for end-to-end observability */
  trace_id?: string;
  objective_context?: {
    goal: string;
    step: string;
    why: string;
  };
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
    const { skill_id, skill_name, arguments: args = {}, agent_type, conversation_id, objective_context, trace_id } = body;

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

    // 3. Check trust level (auto → execute, notify → execute + notify, approve → block)
    const trustLevel = skill.trust_level || (skill.requires_approval ? 'approve' : 'auto');

    if (trustLevel === 'approve') {
      const activityId = await logActivity(supabase, {
        agent: agent_type, skill_id: skill.id, skill_name: skill.name,
        input: args, output: {}, status: 'pending_approval',
        conversation_id, duration_ms: Date.now() - startTime,
      });

      return new Response(JSON.stringify({
        status: 'pending_approval',
        activity_id: activityId,
        skill: skill.name,
        trust_level: 'approve',
        message: `Action '${skill.name}' requires admin approval before executing.`,
        input: args,
      }), {
        status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Route to handler — wrapped in try/catch for normalized error handling
    let result: unknown;
    const handler = skill.handler as string;

    try {
      if (handler.startsWith('edge:')) {
        const fnName = handler.replace('edge:', '');
        
        // For composio-proxy, map skill_name to the expected action/params format
        let edgeBody = args;
        if (fnName === 'composio-proxy') {
          const skillToAction: Record<string, string> = {
            composio_gmail_read: 'gmail_read',
            composio_gmail_send: 'gmail_send',
            composio_search_tools: 'search_tools',
            composio_execute: 'execute',
          };
          const action = skillToAction[skill.name] || skill.name.replace('composio_', '');
          edgeBody = { action, params: args };
        }
        
        const response = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify(edgeBody),
        });
        const edgeResult = await response.json();
        if (!response.ok && !edgeResult.error) {
          edgeResult.error = `Edge function '${fnName}' returned HTTP ${response.status}`;
        }
        result = edgeResult;

      } else if (handler.startsWith('module:')) {
        const moduleName = handler.replace('module:', '');
        await autoActivateModule(supabase, moduleName);
        result = await executeModuleAction(supabase, moduleName, skill.name, args);

      } else if (handler.startsWith('db:')) {
        const table = handler.replace('db:', '');
        result = await executeDbAction(supabase, table, skill.name, args);

      } else if (handler.startsWith('webhook:')) {
        result = await executeWebhook(supabase, args);

      } else if (handler.startsWith('responses:')) {
        const peerName = handler.replace('responses:', '');
        result = await executeOpenResponsesRequest(peerName, args);

      } else if (handler.startsWith('a2a:')) {
        const peerName = handler.replace('a2a:', '');
        result = await executeA2ARequest(supabase, peerName, args);

      } else {
        result = { error: `Unknown handler type: ${handler}` };
      }
    } catch (handlerErr: any) {
      // Normalize all handler exceptions to {error: string} format
      console.error(`[agent-execute] Handler '${handler}' threw:`, handlerErr.message);
      result = { error: `Handler exception: ${handlerErr.message || 'Unknown error'}`, status: 'failed' };
    }

    // 5. Log activity (with objective context and trace_id if provided)
    const activityInput: Record<string, unknown> = { ...args };
    if (objective_context) activityInput._objective_context = objective_context;
    if (trace_id) activityInput.trace_id = trace_id;
    // Determine if the handler actually succeeded
    const handlerFailed = !!(result as any)?.error;
    const activityId = await logActivity(supabase, {
      agent: agent_type, skill_id: skill.id, skill_name: skill.name,
      input: activityInput, output: result as Record<string, unknown>,
      status: handlerFailed ? 'failed' : 'success', conversation_id,
      duration_ms: Date.now() - startTime,
      error_message: handlerFailed ? String((result as any).error).slice(0, 500) : undefined,
    });

    // 5b. Outcome tracking: leave outcome_status as NULL
    // The heartbeat's evaluate_outcomes tool picks up activities with NULL outcome_status.
    // Note: 'pending' is NOT in the activity_outcome_status enum — do not set it.

    // 6. Auto-track objective progress
    if (activityId) {
      await trackObjectiveProgress(supabase, skill.name, activityId);
    }

    // 7. For 'notify' trust level, send proactive notification to admin chat
    if (trustLevel === 'notify' && activityId) {
      try {
        // Find active admin conversation for notification
        const { data: conv } = await supabase.from('chat_conversations')
          .select('id')
          .not('user_id', 'is', null)
          .eq('conversation_status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (conv?.id) {
          await supabase.from('chat_messages').insert({
            conversation_id: conv.id,
            role: 'assistant',
            source: 'proactive',
            content: `✅ Executed **${skill.name}** autonomously.\n\n${JSON.stringify(args, null, 2).slice(0, 500)}`,
            metadata: { trust_level: 'notify', activity_id: activityId, skill_name: skill.name },
          });
        }
      } catch (notifyErr) {
        console.warn('[agent-execute] Notify failed (non-fatal):', notifyErr);
      }
    }

    return new Response(JSON.stringify({ status: 'success', result, trust_level: trustLevel }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('agent-execute error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// =============================================================================
// Markdown → Tiptap JSON converter
// =============================================================================

function markdownToTiptap(md: string): any {
  const lines = md.split('\n');
  const nodes: any[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      nodes.push({
        type: 'heading',
        attrs: { level },
        content: [{ type: 'text', text: inlineClean(headingMatch[2]) }],
      });
      i++;
      continue;
    }

    // Bullet list items
    if (/^[-*]\s+/.test(line)) {
      const items: any[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^[-*]\s+/, '');
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInline(itemText) }],
        });
        i++;
      }
      nodes.push({ type: 'bulletList', content: items });
      continue;
    }

    // Numbered list
    if (/^\d+\.\s+/.test(line)) {
      const items: any[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\d+\.\s+/, '');
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInline(itemText) }],
        });
        i++;
      }
      nodes.push({ type: 'orderedList', content: items });
      continue;
    }

    // Empty line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Regular paragraph
    nodes.push({
      type: 'paragraph',
      content: parseInline(line),
    });
    i++;
  }

  if (nodes.length === 0) {
    nodes.push({ type: 'paragraph' });
  }

  return { type: 'doc', content: nodes };
}

function inlineClean(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/_(.+?)_/g, '$1').trim();
}

function parseInline(text: string): any[] {
  const result: any[] = [];
  // Simple bold/italic parsing
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_|([^*_]+))/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      // Bold
      result.push({ type: 'text', marks: [{ type: 'bold' }], text: match[2] });
    } else if (match[3]) {
      // Italic
      result.push({ type: 'text', marks: [{ type: 'italic' }], text: match[3] });
    } else if (match[4]) {
      // Italic (underscore)
      result.push({ type: 'text', marks: [{ type: 'italic' }], text: match[4] });
    } else if (match[5] && match[5].trim()) {
      result.push({ type: 'text', text: match[5] });
    }
  }
  if (result.length === 0) {
    result.push({ type: 'text', text: text.trim() || ' ' });
  }
  return result;
}

// =============================================================================
// Auto-activate module when FlowPilot uses it
// =============================================================================

// Maps handler module names to site_settings module keys
const MODULE_HANDLER_TO_SETTING: Record<string, string> = {
  blog: 'blog',
  crm: 'leads',
  booking: 'bookings',
  newsletter: 'newsletter',
  orders: 'ecommerce',
  objectives: 'analytics',
  products: 'ecommerce',
  media: 'media',
  resume: 'resume',
  pages: 'pages',
  kb: 'knowledgeBase',
  globalElements: 'globalElements',
  deals: 'deals',
  companies: 'companies',
  forms: 'forms',
  webinars: 'webinars',
  handbook: 'handbook',
  purchasing: 'purchasing',
};

async function autoActivateModule(
  supabase: any,
  moduleName: string,
): Promise<void> {
  const settingKey = MODULE_HANDLER_TO_SETTING[moduleName];
  if (!settingKey) return;

  try {
    const { data: existing } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'modules')
      .maybeSingle();

    if (!existing?.value) return;

    const modules = existing.value as Record<string, any>;
    const moduleConfig = modules[settingKey];
    
    // Already enabled or doesn't exist in settings
    if (!moduleConfig || moduleConfig.enabled) return;

    // Enable the module
    modules[settingKey] = { ...moduleConfig, enabled: true };
    
    await supabase
      .from('site_settings')
      .update({ value: modules })
      .eq('key', 'modules');

    console.log(`[agent-execute] Auto-activated module: ${settingKey} (triggered by handler module:${moduleName})`);
  } catch (err) {
    // Non-fatal — don't break skill execution
    console.error(`[agent-execute] Failed to auto-activate module ${settingKey}:`, err);
  }
}

// =============================================================================
// Handler implementations
// =============================================================================

async function executeModuleAction(
  supabase: any,
  moduleName: string,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (moduleName) {
    case 'blog': {
      if (skillName === 'manage_blog_posts') {
        return await executeBlogPostsManagement(supabase, args);
      }
      return await executeBlogAction(supabase, skillName, args);
    }

    case 'crm': {
      if (skillName === 'manage_leads') {
        return await executeLeadsAction(supabase, args);
      }
      if (skillName === 'send_email_to_lead') {
        return await executeSendEmailToLead(supabase, args);
      }
      // add_lead — upsert to handle duplicate emails gracefully
      const { email, name, source = 'chat', phone } = args as any;
      // Check if lead already exists
      const { data: existing } = await supabase.from('leads')
        .select('id, email, status, name').eq('email', email).maybeSingle();
      if (existing) {
        // Update existing lead with any new info
        const updates: Record<string, unknown> = {};
        if (name && name !== existing.name) updates.name = name;
        if (phone) updates.phone = phone;
        if (Object.keys(updates).length > 0) {
          await supabase.from('leads').update(updates).eq('id', existing.id);
        }
        return { lead_id: existing.id, email: existing.email, status: existing.status, existing: true };
      }
      const { data, error } = await supabase.from('leads').insert({
        email, name, source, phone,
      }).select().single();
      if (error) throw new Error(`Lead insert failed: ${error.message}`);
      return { lead_id: data.id, email: data.email, status: data.status, existing: false };
    }

    case 'booking': {
      if (skillName === 'manage_bookings') {
        return await executeBookingsManagement(supabase, args);
      }
      return await executeBookingAction(supabase, skillName, args);
    }

    case 'newsletter': {
      return await executeNewsletterAction(supabase, skillName, args);
    }

    case 'orders': {
      if (skillName === 'send_invoice_for_order') {
        return await executeSendInvoiceForOrder(supabase, args);
      }
      return await executeOrdersAction(supabase, skillName, args);
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

    case 'analytics': {
      return await executeAnalyticsAction(supabase, skillName, args);
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

    case 'media': {
      const { action = 'list', folder, search, file_path } = args as any;

      if (action === 'list') {
        const targetFolders = folder ? [folder] : ['pages', 'imports', 'templates', 'uploads'];
        const allFiles: Array<{ name: string; folder: string; url: string; size?: number; type?: string; created_at?: string }> = [];

        for (const f of targetFolders) {
          const { data: files } = await supabase.storage
            .from('cms-images')
            .list(f, { sortBy: { column: 'created_at', order: 'desc' }, limit: 50 });
          if (files) {
            for (const file of files) {
              if (file.name === '.emptyFolderPlaceholder') continue;
              const { data: { publicUrl } } = supabase.storage
                .from('cms-images')
                .getPublicUrl(`${f}/${file.name}`);
              allFiles.push({
                name: file.name,
                folder: f,
                url: publicUrl,
                size: (file.metadata as any)?.size,
                type: (file.metadata as any)?.mimetype,
                created_at: file.created_at,
              });
            }
          }
        }

        // Optional search filter
        const filtered = search
          ? allFiles.filter(f => f.name.toLowerCase().includes((search as string).toLowerCase()))
          : allFiles;

        return { files: filtered.slice(0, 30), total: filtered.length };
      }

      if (action === 'get_url' && file_path) {
        const { data: { publicUrl } } = supabase.storage
          .from('cms-images')
          .getPublicUrl(file_path);
        return { url: publicUrl, path: file_path };
      }

      if (action === 'delete' && file_path) {
        const { error } = await supabase.storage
          .from('cms-images')
          .remove([file_path]);
        if (error) throw new Error(`Delete failed: ${error.message}`);
        return { deleted: file_path };
      }

      if (action === 'clear_all') {
        const targetFolders = ['pages', 'imports', 'templates', 'uploads', 'blog'];
        let totalDeleted = 0;
        for (const f of targetFolders) {
          const { data: files } = await supabase.storage
            .from('cms-images')
            .list(f, { limit: 1000 });
          if (files?.length) {
            const paths = files
              .filter((file: any) => file.name !== '.emptyFolderPlaceholder')
              .map((file: any) => `${f}/${file.name}`);
            if (paths.length > 0) {
              const { error } = await supabase.storage.from('cms-images').remove(paths);
              if (!error) totalDeleted += paths.length;
            }
          }
        }
        return { action: 'clear_all', total_deleted: totalDeleted, folders_cleaned: targetFolders };
      }

      return { error: `Unknown media action: ${action}` };
    }

    case 'resume': {
      return await executeResumeAction(supabase, skillName, args);
    }

    case 'pages': {
      return await executePagesAction(supabase, skillName, args);
    }

    case 'kb': {
      return await executeKbAction(supabase, skillName, args);
    }

    case 'globalElements': {
      return await executeGlobalBlocksAction(supabase, skillName, args);
    }

    case 'deals': {
      return await executeDealsAction(supabase, skillName, args);
    }

    case 'products': {
      return await executeProductsAction(supabase, skillName, args);
    }

    case 'companies': {
      return await executeCompaniesAction(supabase, skillName, args);
    }

    case 'forms': {
      return await executeFormsAction(supabase, skillName, args);
    }

    case 'webinars': {
      return await executeWebinarsAction(supabase, skillName, args);
    }

    case 'openclaw': {
      return await executeOpenClawAction(supabase, skillName, args);
    }

    case 'handbook': {
      return await executeHandbookAction(supabase, skillName, args);
    }

    case 'timesheets': {
      return await executeTimesheetsAction(supabase, skillName, args);
    }

    default:
      return { error: `Unknown module: ${moduleName}` };
  }
}

// =============================================================================
// Timesheets module handler
// =============================================================================

async function executeTimesheetsAction(
  supabase: any,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (skillName) {
    case 'log_time': {
      const { action = 'list', project_id, project_name, entry_date, hours, description, is_billable, user_id, entry_id, week_offset = 0 } = args as any;

      if (action === 'create') {
        let resolvedProjectId = project_id;
        // Look up project by name if no ID
        if (!resolvedProjectId && project_name) {
          const { data: proj } = await supabase
            .from('projects')
            .select('id')
            .ilike('name', `%${project_name}%`)
            .eq('is_active', true)
            .limit(1)
            .single();
          if (proj) resolvedProjectId = proj.id;
          else return { error: `No active project matching "${project_name}"` };
        }
        if (!resolvedProjectId) return { error: 'project_id or project_name required' };

        const { data, error } = await supabase.from('time_entries').insert([{
          user_id: user_id || (await supabase.auth.getUser()).data?.user?.id,
          project_id: resolvedProjectId,
          entry_date: entry_date || new Date().toISOString().slice(0, 10),
          hours: hours || 0,
          description: description || null,
          is_billable: is_billable ?? true,
        }]).select('*, projects(name)').single();
        if (error) return { error: error.message };
        return { success: true, entry: data, message: `Logged ${hours}h on ${data.projects?.name || 'project'}` };
      }

      if (action === 'delete') {
        if (!entry_id) return { error: 'entry_id required' };
        const { error } = await supabase.from('time_entries').delete().eq('id', entry_id).eq('is_invoiced', false);
        if (error) return { error: error.message };
        return { success: true };
      }

      // list
      const now = new Date();
      const day = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + (week_offset as number) * 7);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const ws = monday.toISOString().slice(0, 10);
      const we = sunday.toISOString().slice(0, 10);

      let query = supabase.from('time_entries').select('*, projects(name, color, client_name)').gte('entry_date', ws).lte('entry_date', we).order('entry_date');
      if (user_id) query = query.eq('user_id', user_id);
      if (project_id) query = query.eq('project_id', project_id);
      const { data, error } = await query;
      if (error) return { error: error.message };
      const total = (data || []).reduce((s: number, e: any) => s + Number(e.hours), 0);
      return { entries: data, total_hours: total, period: `${ws} to ${we}` };
    }

    case 'manage_projects': {
      const { action = 'list', project_id, name, client_name, description, color, hourly_rate_cents, currency, is_billable } = args as any;

      if (action === 'create') {
        const { data, error } = await supabase.from('projects').insert([{
          name: name || 'New Project',
          client_name: client_name || null,
          description: description || null,
          color: color || '#6366f1',
          hourly_rate_cents: hourly_rate_cents || 0,
          currency: currency || 'SEK',
          is_billable: is_billable ?? true,
        }]).select().single();
        if (error) return { error: error.message };
        return { success: true, project: data };
      }

      if (action === 'update' || action === 'deactivate') {
        if (!project_id) return { error: 'project_id required' };
        const updates: any = {};
        if (name) updates.name = name;
        if (client_name !== undefined) updates.client_name = client_name;
        if (description !== undefined) updates.description = description;
        if (color) updates.color = color;
        if (hourly_rate_cents !== undefined) updates.hourly_rate_cents = hourly_rate_cents;
        if (currency) updates.currency = currency;
        if (is_billable !== undefined) updates.is_billable = is_billable;
        if (action === 'deactivate') updates.is_active = false;
        const { error } = await supabase.from('projects').update(updates).eq('id', project_id);
        if (error) return { error: error.message };
        return { success: true };
      }

      // list
      const { data, error } = await supabase.from('projects').select('*').eq('is_active', true).order('name');
      if (error) return { error: error.message };
      return { projects: data };
    }

    case 'timesheet_summary': {
      const { period = 'this_week', start_date, end_date, project_id, user_id, billable_only, include_revenue } = args as any;

      let ws: string, we: string;
      const now = new Date();

      switch (period) {
        case 'this_week': {
          const day = now.getDay();
          const monday = new Date(now);
          monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
          const sunday = new Date(monday);
          sunday.setDate(monday.getDate() + 6);
          ws = monday.toISOString().slice(0, 10);
          we = sunday.toISOString().slice(0, 10);
          break;
        }
        case 'last_week': {
          const day = now.getDay();
          const monday = new Date(now);
          monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) - 7);
          const sunday = new Date(monday);
          sunday.setDate(monday.getDate() + 6);
          ws = monday.toISOString().slice(0, 10);
          we = sunday.toISOString().slice(0, 10);
          break;
        }
        case 'this_month': {
          ws = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
          we = now.toISOString().slice(0, 10);
          break;
        }
        case 'last_month': {
          const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
          ws = lastMonth.toISOString().slice(0, 10);
          we = lastDay.toISOString().slice(0, 10);
          break;
        }
        default:
          ws = start_date || now.toISOString().slice(0, 10);
          we = end_date || now.toISOString().slice(0, 10);
      }

      let query = supabase.from('time_entries').select('*, projects(name, hourly_rate_cents, currency)').gte('entry_date', ws).lte('entry_date', we);
      if (project_id) query = query.eq('project_id', project_id);
      if (user_id) query = query.eq('user_id', user_id);
      if (billable_only) query = query.eq('is_billable', true);
      const { data: entries, error } = await query;
      if (error) return { error: error.message };

      // Group by project
      const byProject = new Map<string, { name: string; hours: number; billable_hours: number; revenue_cents: number; currency: string }>();
      for (const e of entries || []) {
        const key = e.project_id;
        const existing = byProject.get(key) || { name: e.projects?.name || 'Unknown', hours: 0, billable_hours: 0, revenue_cents: 0, currency: e.projects?.currency || 'SEK' };
        existing.hours += Number(e.hours);
        if (e.is_billable) {
          existing.billable_hours += Number(e.hours);
          if (include_revenue && e.projects?.hourly_rate_cents) {
            existing.revenue_cents += Number(e.hours) * e.projects.hourly_rate_cents;
          }
        }
        byProject.set(key, existing);
      }

      const totalHours = (entries || []).reduce((s: number, e: any) => s + Number(e.hours), 0);
      const totalBillable = (entries || []).filter((e: any) => e.is_billable).reduce((s: number, e: any) => s + Number(e.hours), 0);

      return {
        period: `${ws} to ${we}`,
        total_hours: totalHours,
        billable_hours: totalBillable,
        by_project: Array.from(byProject.values()),
        entry_count: (entries || []).length,
      };
    }

    default:
      return { error: `Unknown timesheets skill: ${skillName}` };
  }
}


async function executeHandbookAction(
  supabase: any,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { query, slug, limit = 5 } = args as any;

  if (slug) {
    // Fetch specific chapter by slug
    const { data, error } = await supabase
      .from('handbook_chapters')
      .select('title, slug, content, sort_order, frontmatter')
      .eq('slug', slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { error: `Chapter "${slug}" not found` };
    return { chapter: data };
  }

  if (query) {
    // Search across chapters
    const q = `%${query}%`;
    const { data, error } = await supabase
      .from('handbook_chapters')
      .select('title, slug, content, sort_order')
      .or(`title.ilike.${q},content.ilike.${q}`)
      .order('sort_order', { ascending: true })
      .limit(Number(limit));
    if (error) throw new Error(error.message);

    // Trim content to relevant snippet
    const results = (data || []).map((ch: any) => {
      const idx = ch.content.toLowerCase().indexOf(query.toLowerCase());
      const start = Math.max(0, idx - 200);
      const end = Math.min(ch.content.length, idx + 500);
      return {
        title: ch.title,
        slug: ch.slug,
        snippet: ch.content.slice(start, end),
      };
    });
    return { results, total: results.length };
  }

  // List all chapters (TOC)
  const { data, error } = await supabase
    .from('handbook_chapters')
    .select('title, slug, sort_order, frontmatter')
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return { chapters: data };
}

// =============================================================================
// OpenClaw Beta Tester module handlers
// =============================================================================

async function executeOpenClawAction(
  supabase: any,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (skillName) {
    case 'openclaw_start_session': {
      const { scenario, peer_name = 'openclaw', metadata = {} } = args as any;
      if (!scenario) return { error: 'scenario is required' };

      const { data, error } = await supabase
        .from('beta_test_sessions')
        .insert({ scenario, peer_name, metadata, status: 'running' })
        .select('id, scenario, status, started_at')
        .single();
      if (error) throw new Error(`Session start failed: ${error.message}`);
      return { success: true, session: data };
    }

    case 'openclaw_end_session': {
      const { session_id, summary, status = 'completed' } = args as any;
      if (!session_id) return { error: 'session_id is required' };

      const { data: session } = await supabase
        .from('beta_test_sessions')
        .select('started_at')
        .eq('id', session_id)
        .single();

      const durationMs = session
        ? Date.now() - new Date(session.started_at).getTime()
        : null;

      const { error } = await supabase
        .from('beta_test_sessions')
        .update({ status, summary, completed_at: new Date().toISOString(), duration_ms: durationMs })
        .eq('id', session_id);
      if (error) throw new Error(`Session end failed: ${error.message}`);
      return { success: true, session_id, duration_ms: durationMs };
    }

    case 'openclaw_report_finding': {
      const { session_id, type, severity = 'medium', title, description, context = {}, screenshot_url, auto_objective = true } = args as any;
      const normalizedType = typeof type === 'string'
        ? ({ observation: 'suggestion', seo: 'suggestion', seo_audit: 'suggestion' } as Record<string, string>)[type.trim()] ?? type.trim()
        : '';
      const validFindingTypes = ['bug', 'ux_issue', 'suggestion', 'positive', 'performance', 'missing_feature'];

      if (!normalizedType || !title) return { error: 'type and title are required' };
      if (!validFindingTypes.includes(normalizedType)) {
        return { error: `invalid finding type "${normalizedType}". Allowed: ${validFindingTypes.join(', ')}` };
      }

      // Save finding (session_id now optional for MCP-driven reports)
      const { data, error } = await supabase
        .from('beta_test_findings')
        .insert({ session_id: session_id || null, type: normalizedType, severity, title, description, context, screenshot_url })
        .select('id, type, severity, title')
        .single();
      if (error) throw new Error(`Finding report failed: ${error.message}`);

      // Auto-create objective for high/critical findings
      let objective = null;
      if (auto_objective && (severity === 'high' || severity === 'critical')) {
        const goalPrefix = normalizedType === 'bug'
          ? 'Fix'
          : normalizedType === 'ux_issue'
            ? 'Improve UX'
            : normalizedType === 'missing_feature'
              ? 'Add'
              : normalizedType === 'performance'
                ? 'Optimize'
                : 'Address';
        const { data: obj } = await supabase
          .from('agent_objectives')
          .insert({
            goal: `${goalPrefix}: ${title}`,
            status: 'active',
            constraints: { source: 'openclaw_report_finding', finding_id: data.id, severity, type: normalizedType, created_by: 'peer_report' },
            success_criteria: { description_met: description || title },
          })
          .select('id, goal')
          .single();
        objective = obj;
      }

      return { success: true, finding: data, normalized_type: normalizedType, objective };
    }

    case 'openclaw_exchange': {
      const { session_id, direction = 'openclaw_to_flowpilot', message_type = 'observation', content, payload = {} } = args as any;
      if (!content) return { error: 'content is required' };

      // Save to local exchange log
      const { data, error } = await supabase
        .from('beta_test_exchanges')
        .insert({ session_id: session_id || null, direction, message_type, content, payload })
        .select('id, direction, message_type, created_at')
        .single();
      if (error) throw new Error(`Exchange failed: ${error.message}`);

      // Actually send to ClawOne via A2A when direction is outbound
      let peerResponse: any = null;
      if (direction === 'flowpilot_to_openclaw') {
        try {
          const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
          const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
          const outboundRes = await fetch(`${supabaseUrl}/functions/v1/a2a-outbound`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              peer_name: 'Clawone',
              skill: 'message',
              message: `[${message_type}] ${content}`,
            }),
          });
          const outboundData = await outboundRes.json();
          peerResponse = outboundData;

          // Extract text from A2A response
          let responseText = '';
          if (outboundData?.result?.status?.message?.parts) {
            responseText = outboundData.result.status.message.parts.map((p: any) => p.text).filter(Boolean).join('\n');
          } else if (outboundData?.result?.artifacts) {
            responseText = outboundData.result.artifacts.flatMap((a: any) => a.parts || []).map((p: any) => p.text).filter(Boolean).join('\n');
          } else if (outboundData?.error?.message) {
            responseText = `⚠️ ${outboundData.error.message}`;
          }

          // Log ClawOne's reply back as an inbound exchange
          if (responseText) {
            await supabase.from('beta_test_exchanges').insert({
              session_id: session_id || null,
              direction: 'openclaw_to_flowpilot',
              message_type: 'acknowledgment',
              content: responseText,
              payload: { raw_response: outboundData },
            });
          }
        } catch (fetchErr: any) {
          console.error('[openclaw_exchange] A2A outbound call failed:', fetchErr.message);
          peerResponse = { error: fetchErr.message };
        }
      }

      return { success: true, exchange: data, peer_response: peerResponse };
    }

    case 'openclaw_get_status': {
      // Return sessions, findings, exchanges, pending tests, AND site context
      const [sessionsRes, findingsRes, exchangesRes, pendingTestsRes, siteMemory] = await Promise.all([
        supabase.from('beta_test_sessions').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('beta_test_findings').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('beta_test_exchanges').select('*').order('created_at', { ascending: false }).limit(30),
        supabase.from('beta_test_exchanges')
          .select('*')
          .eq('direction', 'flowpilot_to_openclaw')
          .eq('message_type', 'test_request')
          .is('payload->acknowledged_at', null)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase.from('agent_memory').select('value').eq('key', 'identity').single(),
      ]);

      return {
        site: {
          url: 'https://demo.flowwink.com',
          name: 'FlowWink',
          description: 'Autonomous Agentic CMS — test this URL, not any template/example domains',
        },
        sessions: sessionsRes.data || [],
        findings: findingsRes.data || [],
        exchanges: exchangesRes.data || [],
        pending_test_requests: pendingTestsRes.data || [],
      };
    }

    case 'scan_beta_findings': {
      // FlowPilot heartbeat skill: scan unresolved findings and return summary
      const { data: unresolvedFindings } = await supabase
        .from('beta_test_findings')
        .select('id, type, severity, title, description, session_id, created_at')
        .is('resolved_at', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!unresolvedFindings?.length) {
        return { success: true, summary: 'No unresolved findings.', findings: [], counts: {} };
      }

      const counts: Record<string, number> = {};
      for (const f of unresolvedFindings) {
        counts[f.severity] = (counts[f.severity] || 0) + 1;
      }

      return {
        success: true,
        summary: `${unresolvedFindings.length} unresolved findings: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}`,
        findings: unresolvedFindings,
        counts,
        recommendation: counts['critical'] ? 'Create objective immediately for critical findings' :
          counts['high'] ? 'Consider creating objective for high-severity findings' :
          'Monitor — no urgent action needed',
      };
    }

    case 'queue_beta_test': {
      // FlowPilot queues a test scenario for OpenClaw to pick up
      const { scenario, instructions, priority = 'normal' } = args as any;
      if (!scenario) return { error: 'scenario is required' };

      const { data, error } = await supabase
        .from('beta_test_exchanges')
        .insert({
          direction: 'flowpilot_to_openclaw',
          message_type: 'test_request',
          content: scenario,
          payload: { instructions, priority, acknowledged_at: null },
        })
        .select('id, created_at')
        .single();
      if (error) throw new Error(`Queue test failed: ${error.message}`);
      return { success: true, test_request_id: data.id, scenario };
    }

    case 'resolve_finding': {
      // Mark a finding as resolved
      const { finding_id, resolution_note } = args as any;
      if (!finding_id) return { error: 'finding_id is required' };

      const { error } = await supabase
        .from('beta_test_findings')
        .update({ resolved_at: new Date().toISOString() })
        .eq('id', finding_id);
      if (error) throw new Error(`Resolve failed: ${error.message}`);

      // Log resolution as exchange
      if (resolution_note) {
        await supabase.from('beta_test_exchanges').insert({
          direction: 'flowpilot_to_openclaw',
          message_type: 'resolution',
          content: resolution_note,
          payload: { finding_id },
        });
      }
      return { success: true, finding_id, resolved: true };
    }

    case 'place_order': {
      // MCP skill: external agent (ClawTwo) places an order as a customer
      const { customer_email, customer_name, items, currency = 'SEK', notes } = args as any;
      if (!customer_email || !items?.length) {
        return { error: 'customer_email and items[] (each with product_id or product_name, quantity) are required' };
      }

      // Resolve products and calculate total
      let totalCents = 0;
      const resolvedItems: any[] = [];
      for (const item of items) {
        const qty = item.quantity || 1;
        let product: any = null;

        if (item.product_id) {
          const { data } = await supabase.from('products').select('id, name, price_cents').eq('id', item.product_id).single();
          product = data;
        } else if (item.product_name || item.name) {
          const searchName = item.product_name || item.name;
          const { data } = await supabase.from('products').select('id, name, price_cents').ilike('name', `%${searchName}%`).limit(1).single();
          product = data;
        }

        if (!product) return { error: `Product not found: ${item.product_id || item.product_name}` };
        totalCents += product.price_cents * qty;
        resolvedItems.push({ product_id: product.id, product_name: product.name, price_cents: product.price_cents, quantity: qty });
      }

      // Create order
      const { data: order, error: orderErr } = await supabase.from('orders').insert({
        customer_email,
        customer_name: customer_name || customer_email,
        total_cents: totalCents,
        currency,
        status: 'pending',
        metadata: { source: 'mcp_place_order', notes },
      }).select('id, status, total_cents, currency').single();
      if (orderErr) throw new Error(`Order creation failed: ${orderErr.message}`);

      // Create order items
      for (const ri of resolvedItems) {
        await supabase.from('order_items').insert({ order_id: order.id, ...ri });
      }

      return {
        success: true,
        order_id: order.id,
        status: order.status,
        total_cents: order.total_cents,
        currency: order.currency,
        items_count: resolvedItems.length,
        message: `Order ${order.id} created with ${resolvedItems.length} item(s) totaling ${(totalCents / 100).toFixed(2)} ${currency}`,
      };
    }

    case 'confirm_fulfillment': {
      // MCP skill: external agent (ClawThree/supplier) confirms delivery of an order or PO
      const { order_id, purchase_order_id, tracking_number, tracking_url, notes: fulfillNotes } = args as any;

      if (order_id) {
        const { data: existing } = await supabase.from('orders').select('id, status, fulfillment_status').eq('id', order_id).single();
        if (!existing) return { error: `Order ${order_id} not found` };

        const { error } = await supabase.from('orders').update({
          fulfillment_status: 'delivered',
          status: existing.status === 'pending' ? 'paid' : existing.status,
          tracking_number: tracking_number || null,
          tracking_url: tracking_url || null,
          fulfillment_notes: fulfillNotes || null,
          updated_at: new Date().toISOString(),
        }).eq('id', order_id);
        if (error) throw new Error(`Fulfillment update failed: ${error.message}`);

        return {
          success: true,
          entity: 'order',
          entity_id: order_id,
          fulfillment_status: 'delivered',
          message: `Order ${order_id} marked as delivered`,
        };
      }

      if (purchase_order_id) {
        const { data: po } = await supabase.from('purchase_orders').select('id, status, po_number').eq('id', purchase_order_id).single();
        if (!po) return { error: `Purchase order ${purchase_order_id} not found` };

        const { error } = await supabase.from('purchase_orders').update({
          status: 'received',
          updated_at: new Date().toISOString(),
        }).eq('id', purchase_order_id);
        if (error) throw new Error(`PO fulfillment update failed: ${error.message}`);

        return {
          success: true,
          entity: 'purchase_order',
          entity_id: purchase_order_id,
          po_number: po.po_number,
          status: 'received',
          message: `PO ${po.po_number} marked as received`,
        };
      }

      return { error: 'Either order_id or purchase_order_id is required' };
    }

    default:
      return { error: `Unknown openclaw skill: ${skillName}` };
  }
}

// =============================================================================
// Resume module handlers
// =============================================================================

async function executeResumeAction(
  supabase: any,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (skillName) {
    case 'manage_consultant_profile': {
      const { action = 'create', profile_id, ...profileData } = args as any;

      if (action === 'list') {
        const { data, error } = await supabase.from('consultant_profiles')
          .select('id, name, title, skills, experience_years, is_active, availability')
          .order('created_at', { ascending: false }).limit(50);
        if (error) throw new Error(`List failed: ${error.message}`);
        return { profiles: data || [] };
      }

      if (action === 'create') {
        const { name, title, skills = [], bio, experience_years, experience_json, education, certifications, languages, email, phone, hourly_rate_cents, currency, summary } = profileData;
        if (!name) throw new Error('name is required');
        const { data, error } = await supabase.from('consultant_profiles').insert({
          name, title, skills, bio, experience_years, experience_json, education, certifications, languages, email, phone, hourly_rate_cents, currency, summary, is_active: true,
        }).select('id, name, title').single();
        if (error) throw new Error(`Create failed: ${error.message}`);
        return { profile_id: data.id, name: data.name, status: 'created' };
      }

      if (action === 'update' && profile_id) {
        delete profileData.action;
        const { data, error } = await supabase.from('consultant_profiles')
          .update(profileData).eq('id', profile_id).select('id, name').single();
        if (error) throw new Error(`Update failed: ${error.message}`);
        return { profile_id: data.id, status: 'updated' };
      }

      if (action === 'delete' && profile_id) {
        const { error } = await supabase.from('consultant_profiles')
          .delete().eq('id', profile_id);
        if (error) throw new Error(`Delete failed: ${error.message}`);
        return { profile_id, status: 'deleted' };
      }

      if (action === 'find_duplicates') {
        const { data: all, error } = await supabase.from('consultant_profiles')
          .select('id, name, email, title, skills')
          .order('created_at', { ascending: true });
        if (error) throw new Error(`List failed: ${error.message}`);
        const profiles = all || [];
        const duplicates: Array<{ ids: string[]; name: string; reason: string }> = [];
        const seen = new Map<string, any>();
        for (const p of profiles) {
          const key = p.name?.toLowerCase().trim();
          if (key && seen.has(key)) {
            duplicates.push({ ids: [seen.get(key).id, p.id], name: p.name, reason: 'Same name' });
          } else if (key) {
            seen.set(key, p);
          }
          if (p.email) {
            const emailKey = p.email.toLowerCase();
            if (seen.has(`email:${emailKey}`)) {
              duplicates.push({ ids: [seen.get(`email:${emailKey}`).id, p.id], name: p.name, reason: 'Same email' });
            } else {
              seen.set(`email:${emailKey}`, p);
            }
          }
        }
        return { total_profiles: profiles.length, duplicates, duplicate_count: duplicates.length };
      }

      return { error: `Unknown resume action: ${action}` };
    }

    case 'match_consultant': {
      const { job_description, max_results = 3 } = args as any;
      if (!job_description) throw new Error('job_description is required');
      
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const response = await fetch(`${supabaseUrl}/functions/v1/resume-match`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ job_description, max_results }),
      });
      return await response.json();
    }

    default:
      return { error: `Unknown resume skill: ${skillName}` };
  }
}

// =============================================================================
// Pages module — full page lifecycle + block manipulation
// =============================================================================

async function executePagesAction(
  supabase: SupabaseClient,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const resolvePageId = async (rawPageId: string): Promise<string> => {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawPageId)) {
      return rawPageId;
    }

    const { data: pageBySlug, error } = await supabase
      .from('pages')
      .select('id')
      .eq('slug', rawPageId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`Resolve page failed: ${error.message}`);
    if (!pageBySlug?.id) throw new Error(`Page not found: ${rawPageId}`);
    return pageBySlug.id;
  };

  switch (skillName) {
    case 'manage_page':
    case 'manage_pages': {
      const { action = 'list', page_id, slug, title, status, meta, blocks } = args as any;

      if (action === 'list') {
        let query = supabase.from('pages')
          .select('id, title, slug, status, menu_order, created_at, updated_at')
          .is('deleted_at', null)
          .order('updated_at', { ascending: false })
          .limit(50);
        if (status) query = query.eq('status', status);
        const { data, error } = await query;
        if (error) throw new Error(`List pages failed: ${error.message}`);
        return { pages: data || [] };
      }

      if (action === 'get') {
        let query = supabase.from('pages')
          .select('id, title, slug, status, content_json, meta_json, menu_order, created_at, updated_at');
        if (page_id) query = query.eq('id', page_id);
        else if (slug) query = query.eq('slug', slug);
        else throw new Error('page_id or slug required');
        // Use .limit(1) + manual pick to avoid "Cannot coerce to single JSON" when slug matches multiple rows
        const { data: rows, error } = await query.is('deleted_at', null).order('created_at', { ascending: true }).limit(1);
        if (error) throw new Error(`Get page failed: ${error.message}`);
        if (!rows || rows.length === 0) throw new Error(`Page not found: ${page_id || slug}`);
        const data = rows[0];
        if (error) throw new Error(`Get page failed: ${error.message}`);
        const blockSummary = (data.content_json as any[] || []).map((b: any, i: number) => ({
          index: i, id: b.id, type: b.type, hidden: b.hidden || false,
        }));
        return { ...data, block_count: blockSummary.length, block_summary: blockSummary };
      }

      if (action === 'create') {
        if (!title) throw new Error('title is required');
        const baseSlug = (slug || title.toLowerCase().replace(/[^a-z0-9åäö]+/g, '-').replace(/(^-|-$)/g, ''));
        // Ensure unique slug by appending timestamp suffix if slug already exists
        const { count: slugExists } = await supabase
          .from('pages').select('id', { count: 'exact', head: true }).eq('slug', baseSlug);
        const pageSlug = (slugExists ?? 0) > 0 ? `${baseSlug}-${Date.now().toString(36)}` : baseSlug;

        // Check if this is the first page — auto-set as homepage
        const { count: existingPages } = await supabase
          .from('pages').select('id', { count: 'exact', head: true }).is('deleted_at', null);

        const pageBlocks = blocks || [];
        normalizeBlocks(pageBlocks);
        const { data, error } = await supabase.from('pages').insert({
          title,
          slug: pageSlug,
          status: 'draft',
          content_json: pageBlocks,
          meta_json: meta || {},
        }).select('id, title, slug, status').single();
        if (error) throw new Error(`Create page failed: ${error.message}`);

        // If this is the first page, set it as homepage
        let setAsHomepage = false;
        if ((existingPages ?? 0) <= 1) {
          await supabase.from('site_settings').upsert(
            { key: 'general', value: { homepageSlug: pageSlug } },
            { onConflict: 'key' }
          );
          setAsHomepage = true;
        }

        return { page_id: data.id, slug: data.slug, title: data.title, status: 'draft', set_as_homepage: setAsHomepage };
      }

      if (action === 'update' && page_id) {
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (title !== undefined) updates.title = title;
        if (slug !== undefined) updates.slug = slug;
        if (meta !== undefined) updates.meta_json = meta;
        if (blocks !== undefined) {
          normalizeBlocks(blocks as unknown[]);
          updates.content_json = blocks;
        }
        const { data, error } = await supabase.from('pages')
          .update(updates).eq('id', page_id).select('id, title, slug, status').single();
        if (error) throw new Error(`Update page failed: ${error.message}`);
        return { page_id: data.id, status: 'updated' };
      }

      if (action === 'publish' && page_id) {
        // Save version before publishing
        const { data: current } = await supabase.from('pages')
          .select('title, content_json, meta_json').eq('id', page_id).single();
        if (current) {
          await supabase.from('page_versions').insert({
            page_id, title: current.title,
            content_json: current.content_json, meta_json: current.meta_json,
          });
        }
        const { data, error } = await supabase.from('pages')
          .update({ status: 'published', updated_at: new Date().toISOString() })
          .eq('id', page_id).select('id, title, slug, status').single();
        if (error) throw new Error(`Publish failed: ${error.message}`);
        return { page_id: data.id, slug: data.slug, status: 'published' };
      }

      if (action === 'archive' && page_id) {
        const { data, error } = await supabase.from('pages')
          .update({ status: 'archived', updated_at: new Date().toISOString() })
          .eq('id', page_id).select('id, title, status').single();
        if (error) throw new Error(`Archive failed: ${error.message}`);
        return { page_id: data.id, status: 'archived' };
      }

      if (action === 'delete' && page_id) {
        const { error } = await supabase.from('pages')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', page_id);
        if (error) throw new Error(`Delete failed: ${error.message}`);
        return { page_id, status: 'deleted' };
      }

      if (action === 'rollback' && page_id) {
        const { version_id } = args as any;
        let query = supabase.from('page_versions')
          .select('id, title, content_json, meta_json, created_at')
          .eq('page_id', page_id)
          .order('created_at', { ascending: false });
        if (version_id) query = query.eq('id', version_id);
        const { data: version } = await query.limit(1).single();
        if (!version) throw new Error('No version found to rollback to');
        // Save current state as new version before rollback
        const { data: current } = await supabase.from('pages')
          .select('title, content_json, meta_json').eq('id', page_id).single();
        if (current) {
          await supabase.from('page_versions').insert({
            page_id, title: current.title,
            content_json: current.content_json, meta_json: current.meta_json,
          });
        }
        await supabase.from('pages').update({
          title: version.title, content_json: version.content_json,
          meta_json: version.meta_json, updated_at: new Date().toISOString(),
        }).eq('id', page_id);
        return { page_id, rolled_back_to: version.id, version_date: version.created_at };
      }

      // Better error messages for missing arguments
      if (['update', 'publish', 'archive', 'delete', 'rollback'].includes(action) && !page_id) {
        return { error: `page_id is required for action: ${action}` };
      }
      return { error: `Unknown page action: ${action}. Valid actions: list, get, create, update, publish, archive, delete, rollback` };
    }

    case 'manage_page_blocks': {
      const { action = 'list', page_id } = args as any;
      if (!page_id) throw new Error('page_id is required');
      const resolvedPageId = await resolvePageId(page_id);

      // Fetch current page blocks and hydrate missing IDs
      const { data: page, error: fetchErr } = await supabase.from('pages')
        .select('id, content_json').eq('id', resolvedPageId).is('deleted_at', null).single();
      if (fetchErr || !page) throw new Error(`Page not found: ${page_id}`);

      const blocks = (page.content_json as any[]) || [];
      // Hydrate blocks without IDs (from old migrations)
      let hydrated = false;
      for (let i = 0; i < blocks.length; i++) {
        if (!blocks[i].id) {
          blocks[i].id = crypto.randomUUID();
          hydrated = true;
        }
      }
      if (hydrated) {
        await supabase.from('pages')
          .update({ content_json: blocks, updated_at: new Date().toISOString() })
          .eq('id', resolvedPageId);
      }

      if (action === 'list') {
        return {
          page_id: resolvedPageId,
          block_count: blocks.length,
          blocks: blocks.map((b: any, i: number) => ({
            index: i, id: b.id, type: b.type, hidden: b.hidden || false,
            has_data: !!b.data && Object.keys(b.data).length > 0,
          })),
        };
      }

      if (action === 'add') {
        const { block_type, block_data = {}, position } = args as any;
        if (!block_type) throw new Error('block_type is required');

        // Validate before saving — return actionable error so FlowPilot can self-correct
        const validation = validateBlockData(block_type, block_data as Record<string, unknown>);
        if (!validation.valid) {
          return {
            error: `Block validation failed for "${block_type}": ${validation.errors.join('; ')}`,
            validation_errors: validation.errors,
            hint: validation.hint,
            example: validation.example,
            status: 'validation_failed',
          };
        }

        const newBlock = {
          id: crypto.randomUUID(),
          type: block_type,
          data: block_data,
          spacing: {},
          animation: { type: 'fade-up' },
        };
        normalizeBlockData(newBlock);
        const pos = position !== undefined ? Math.min(position, blocks.length) : blocks.length;
        blocks.splice(pos, 0, newBlock);
        await supabase.from('pages')
          .update({ content_json: blocks, updated_at: new Date().toISOString() })
          .eq('id', resolvedPageId);
        return { page_id: resolvedPageId, block_id: newBlock.id, type: block_type, position: pos, total_blocks: blocks.length };
      }

      if (action === 'update') {
        const { block_id, block_data } = args as any;
        if (!block_id || !block_data) throw new Error('block_id and block_data required');
        const idx = blocks.findIndex((b: any) => b.id === block_id);
        if (idx === -1) throw new Error(`Block not found: ${block_id}`);

        // Merge first, then validate the merged result
        const mergedData = { ...blocks[idx].data as Record<string, unknown>, ...block_data };
        const blockType = String(blocks[idx].type);
        const validation = validateBlockData(blockType, mergedData);
        if (!validation.valid) {
          return {
            error: `Block validation failed for "${blockType}": ${validation.errors.join('; ')}`,
            validation_errors: validation.errors,
            hint: validation.hint,
            example: validation.example,
            current_data: blocks[idx].data,
            status: 'validation_failed',
          };
        }

        blocks[idx] = { ...blocks[idx], data: mergedData };
        normalizeBlockData(blocks[idx]);
        await supabase.from('pages')
          .update({ content_json: blocks, updated_at: new Date().toISOString() })
          .eq('id', resolvedPageId);
        return { page_id: resolvedPageId, block_id, type: blocks[idx].type, status: 'updated' };
      }

      if (action === 'get_block') {
        const { block_id } = args as any;
        if (!block_id) throw new Error('block_id is required');
        const block = blocks.find((b: any) => b.id === block_id);
        if (!block) throw new Error(`Block not found: ${block_id}`);
        return { page_id: resolvedPageId, block_id, type: block.type, data: block.data };
      }

      if (action === 'remove') {
        const { block_id } = args as any;
        if (!block_id) throw new Error('block_id is required');
        const idx = blocks.findIndex((b: any) => b.id === block_id);
        if (idx === -1) throw new Error(`Block not found: ${block_id}`);
        const removed = blocks.splice(idx, 1)[0];
        await supabase.from('pages')
          .update({ content_json: blocks, updated_at: new Date().toISOString() })
          .eq('id', resolvedPageId);
        return { page_id: resolvedPageId, removed_block_id: removed.id, removed_type: removed.type, remaining_blocks: blocks.length };
      }

      if (action === 'reorder') {
        const { block_ids } = args as any;
        if (!Array.isArray(block_ids)) throw new Error('block_ids array is required');
        const reordered: any[] = [];
        for (const bid of block_ids) {
          const block = blocks.find((b: any) => b.id === bid);
          if (block) reordered.push(block);
        }
        // Append any blocks not in the reorder list at the end
        for (const b of blocks) {
          if (!block_ids.includes(b.id)) reordered.push(b);
        }
        await supabase.from('pages')
          .update({ content_json: reordered, updated_at: new Date().toISOString() })
          .eq('id', resolvedPageId);
        return { page_id: resolvedPageId, new_order: reordered.map((b: any) => b.id), total_blocks: reordered.length };
      }

      if (action === 'toggle_visibility') {
        const { block_id } = args as any;
        if (!block_id) throw new Error('block_id is required');
        const idx = blocks.findIndex((b: any) => b.id === block_id);
        if (idx === -1) throw new Error(`Block not found: ${block_id}`);
        blocks[idx].hidden = !blocks[idx].hidden;
        await supabase.from('pages')
          .update({ content_json: blocks, updated_at: new Date().toISOString() })
          .eq('id', resolvedPageId);
        return { page_id: resolvedPageId, block_id, hidden: blocks[idx].hidden };
      }

      if (action === 'duplicate') {
        const { block_id } = args as any;
        if (!block_id) throw new Error('block_id is required');
        const idx = blocks.findIndex((b: any) => b.id === block_id);
        if (idx === -1) throw new Error(`Block not found: ${block_id}`);
        const clone = JSON.parse(JSON.stringify(blocks[idx]));
        clone.id = crypto.randomUUID();
        blocks.splice(idx + 1, 0, clone);
        await supabase.from('pages')
          .update({ content_json: blocks, updated_at: new Date().toISOString() })
          .eq('id', resolvedPageId);
        return { page_id: resolvedPageId, original_block_id: block_id, new_block_id: clone.id, position: idx + 1 };
      }

      return { error: `Unknown block action: ${action}` };
    }

    case 'create_page_block': {
      // Supports single block OR batch: { blocks: [{ type, data }] }
      const { page_id, block_type, block_data = {}, position, blocks: batchBlocks } = args as any;
      if (!page_id) {
        return {
          error: 'page_id is required. Create the page first with manage_page { action: "create", title, slug? } and then call create_page_block using the returned page_id.',
          next_step: 'manage_page.create',
        };
      }

      // ── Batch mode: add multiple blocks in one call ──
      if (Array.isArray(batchBlocks) && batchBlocks.length > 0) {
        const resolvedPageId = await resolvePageId(page_id);
        const { data: page, error: fetchErr } = await supabase.from('pages')
          .select('id, content_json').eq('id', resolvedPageId).is('deleted_at', null).single();
        if (fetchErr || !page) throw new Error(`Page not found: ${page_id}`);

        const existingBlocks = (page.content_json as any[]) || [];
        const addedIds: string[] = [];
        const errors: string[] = [];

        for (const b of batchBlocks) {
          if (!b.type) { errors.push('Block missing type'); continue; }
          const bData = b.data || {};
          const validation = validateBlockData(b.type, bData);
          if (!validation.valid) {
            errors.push(`${b.type}: ${validation.errors.join('; ')}`);
            continue;
          }
          const newBlock = {
            id: crypto.randomUUID(),
            type: b.type,
            data: bData,
            spacing: {},
            animation: { type: 'fade-up' },
          };
          normalizeBlockData(newBlock);
          existingBlocks.push(newBlock);
          addedIds.push(newBlock.id);
        }

        await supabase.from('pages')
          .update({ content_json: existingBlocks, updated_at: new Date().toISOString() })
          .eq('id', resolvedPageId);

        return {
          page_id: resolvedPageId,
          blocks_added: addedIds.length,
          block_ids: addedIds,
          total_blocks: existingBlocks.length,
          errors: errors.length > 0 ? errors : undefined,
        };
      }

      // ── Single block mode (backward compatible) ──
      if (!block_type) return { error: 'block_type is required (or use blocks[] array for batch)' };
      return executePagesAction(supabase, 'manage_page_blocks', {
        action: 'add',
        page_id,
        block_type,
        block_data,
        position,
      });
    }

    case 'generate_meta_description': {
      return await executeGenerateMetaDescription(supabase, args);
    }

    case 'generate_alt_text': {
      return await executeGenerateAltText(supabase, args);
    }

    default:
      return { error: `Unknown pages skill: ${skillName}` };
  }
}

// =============================================================================
// SEO Maintenance helpers — generate_meta_description, generate_alt_text
// =============================================================================

/**
 * Shared text-generation helper. Tries Gemini first, then OpenAI.
 * Returns trimmed text or null on failure.
 */
async function generateShortText(prompt: string, maxTokens = 256): Promise<string | null> {
  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  const openaiKey = Deno.env.get('OPENAI_API_KEY');

  if (geminiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.4 },
        }),
      });
      const data = await resp.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return String(text).trim();
    } catch (e) {
      console.error('[generateShortText] Gemini failed:', e);
    }
  }

  if (openaiKey) {
    try {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: maxTokens,
          temperature: 0.4,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await resp.json();
      const text = data.choices?.[0]?.message?.content;
      if (text) return String(text).trim();
    } catch (e) {
      console.error('[generateShortText] OpenAI failed:', e);
    }
  }

  return null;
}

/**
 * Extract plain text from a page's content_json blocks for context.
 * Pulls headings/text/paragraphs from common block types, capped to ~2000 chars.
 */
function extractPageText(blocks: any[]): string {
  if (!Array.isArray(blocks)) return '';
  const parts: string[] = [];
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue;
    const d = b.data || {};
    const candidates = [d.title, d.subtitle, d.heading, d.subheading, d.text, d.body, d.content, d.description];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) parts.push(c.trim());
    }
    // List/feature items
    const items = d.items || d.features || d.cards;
    if (Array.isArray(items)) {
      for (const it of items) {
        if (it?.title) parts.push(String(it.title));
        if (it?.description) parts.push(String(it.description));
      }
    }
  }
  return parts.join(' ').slice(0, 2000);
}

async function executeGenerateMetaDescription(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { page_id, slug, scan_all = false, limit = 10, dry_run = false } = args as any;

  // Targeted single-page mode
  if (page_id || slug) {
    let query = supabase.from('pages').select('id, title, slug, content_json, meta_json').is('deleted_at', null);
    if (page_id) query = query.eq('id', page_id);
    else query = query.eq('slug', slug);
    const { data: rows, error } = await query.limit(1);
    if (error) throw new Error(`Lookup failed: ${error.message}`);
    if (!rows?.length) throw new Error(`Page not found: ${page_id || slug}`);
    const result = await processOnePageMeta(supabase, rows[0], dry_run);
    return { mode: 'single', ...result };
  }

  // Scan mode — find published pages without meta_description
  const cap = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const { data: pages, error } = await supabase
    .from('pages')
    .select('id, title, slug, content_json, meta_json, status')
    .is('deleted_at', null)
    .eq('status', 'published')
    .limit(200);

  if (error) throw new Error(`Scan failed: ${error.message}`);

  const missing = (pages || []).filter((p: any) => {
    const desc = p.meta_json?.description || p.meta_json?.meta_description;
    return !desc || String(desc).trim().length < 20;
  }).slice(0, cap);

  if (!scan_all && missing.length === 0) {
    return { mode: 'scan', scanned: pages?.length || 0, missing: 0, message: 'No pages need meta descriptions.' };
  }

  const results: any[] = [];
  for (const p of missing) {
    try {
      const r = await processOnePageMeta(supabase, p, dry_run);
      results.push(r);
    } catch (e) {
      results.push({ page_id: p.id, slug: p.slug, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return {
    mode: 'scan',
    scanned: pages?.length || 0,
    missing: missing.length,
    processed: results.length,
    updated: results.filter((r) => r.updated).length,
    dry_run,
    results,
  };
}

async function processOnePageMeta(supabase: SupabaseClient, page: any, dryRun: boolean) {
  const context = extractPageText(page.content_json || []);
  const prompt = `Write an SEO meta description for this page.
Title: "${page.title}"
Page content excerpt: ${context || '(no body content available — write based on title)'}

Requirements:
- 140-160 characters
- Compelling, includes the main topic
- No quotes, no trailing period unless natural
- Plain text only, no markdown
- Match the language of the title/content

Output ONLY the meta description, nothing else.`;

  const description = await generateShortText(prompt, 200);
  if (!description) {
    return { page_id: page.id, slug: page.slug, title: page.title, updated: false, error: 'AI generation failed (no key configured or API error)' };
  }

  const cleaned = description.replace(/^["']|["']$/g, '').trim().slice(0, 160);

  if (dryRun) {
    return { page_id: page.id, slug: page.slug, title: page.title, generated: cleaned, updated: false, dry_run: true };
  }

  const newMeta = { ...(page.meta_json || {}), description: cleaned };
  const { error } = await supabase
    .from('pages')
    .update({ meta_json: newMeta, updated_at: new Date().toISOString() })
    .eq('id', page.id);

  if (error) {
    return { page_id: page.id, slug: page.slug, updated: false, error: error.message };
  }
  return { page_id: page.id, slug: page.slug, title: page.title, generated: cleaned, updated: true };
}

async function executeGenerateAltText(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { page_id, slug, limit = 20, dry_run = false } = args as any;

  // Single-page mode
  if (page_id || slug) {
    let query = supabase.from('pages').select('id, title, slug, content_json').is('deleted_at', null);
    if (page_id) query = query.eq('id', page_id);
    else query = query.eq('slug', slug);
    const { data: rows, error } = await query.limit(1);
    if (error) throw new Error(`Lookup failed: ${error.message}`);
    if (!rows?.length) throw new Error(`Page not found: ${page_id || slug}`);
    const r = await processOnePageAlt(supabase, rows[0], dry_run);
    return { mode: 'single', ...r };
  }

  // Scan mode — published pages, find images missing alt
  const cap = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const { data: pages, error } = await supabase
    .from('pages')
    .select('id, title, slug, content_json')
    .is('deleted_at', null)
    .eq('status', 'published')
    .limit(100);

  if (error) throw new Error(`Scan failed: ${error.message}`);

  const results: any[] = [];
  let totalFixed = 0;
  for (const p of pages || []) {
    try {
      const r = await processOnePageAlt(supabase, p, dry_run, cap - totalFixed);
      if (r.images_fixed > 0) {
        results.push(r);
        totalFixed += r.images_fixed;
      }
      if (totalFixed >= cap) break;
    } catch (e) {
      results.push({ page_id: p.id, slug: p.slug, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return {
    mode: 'scan',
    scanned: pages?.length || 0,
    pages_updated: results.filter((r) => r.updated).length,
    images_fixed: totalFixed,
    dry_run,
    results,
  };
}

/**
 * Walk a page's blocks, find images without alt-text, generate alt for each, save.
 * Looks for: block.data.image, block.data.imageUrl, block.data.images[].url, block.data.src
 * Saves alt at block.data.imageAlt, block.data.alt, or block.data.images[].alt accordingly.
 */
async function processOnePageAlt(
  supabase: SupabaseClient,
  page: any,
  dryRun: boolean,
  remainingBudget = 100,
) {
  const blocks = Array.isArray(page.content_json) ? JSON.parse(JSON.stringify(page.content_json)) : [];
  const pageContext = `Page title: "${page.title}". ${extractPageText(blocks).slice(0, 500)}`;
  let fixed = 0;
  const fixes: any[] = [];

  for (const b of blocks) {
    if (!b || typeof b !== 'object' || !b.data) continue;
    const d = b.data;

    // Pattern 1: single image with imageAlt/alt sibling
    const singleImageUrl = d.image || d.imageUrl || d.src || d.backgroundImage;
    const singleAltKey = d.imageAlt !== undefined ? 'imageAlt' : (d.alt !== undefined ? 'alt' : 'imageAlt');
    if (singleImageUrl && (!d[singleAltKey] || String(d[singleAltKey]).trim() === '')) {
      if (fixed >= remainingBudget) break;
      const alt = await generateAltForImage(singleImageUrl, pageContext);
      if (alt) {
        d[singleAltKey] = alt;
        fixed++;
        fixes.push({ block_type: b.type, image: singleImageUrl, alt });
      }
    }

    // Pattern 2: images[] array
    if (Array.isArray(d.images)) {
      for (const img of d.images) {
        if (fixed >= remainingBudget) break;
        if (img && typeof img === 'object') {
          const url = img.url || img.src;
          if (url && (!img.alt || String(img.alt).trim() === '')) {
            const alt = await generateAltForImage(url, pageContext);
            if (alt) {
              img.alt = alt;
              fixed++;
              fixes.push({ block_type: b.type, image: url, alt });
            }
          }
        }
      }
    }
  }

  if (fixed === 0) {
    return { page_id: page.id, slug: page.slug, title: page.title, images_fixed: 0, updated: false };
  }

  if (dryRun) {
    return { page_id: page.id, slug: page.slug, title: page.title, images_fixed: fixed, updated: false, dry_run: true, fixes };
  }

  const { error } = await supabase
    .from('pages')
    .update({ content_json: blocks, updated_at: new Date().toISOString() })
    .eq('id', page.id);

  if (error) {
    return { page_id: page.id, slug: page.slug, updated: false, error: error.message };
  }
  return { page_id: page.id, slug: page.slug, title: page.title, images_fixed: fixed, updated: true, fixes };
}

async function generateAltForImage(imageUrl: string, pageContext: string): Promise<string | null> {
  // Extract filename hint from URL
  let filenameHint = '';
  try {
    const u = new URL(imageUrl);
    const last = u.pathname.split('/').pop() || '';
    filenameHint = decodeURIComponent(last.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ')).trim();
  } catch (_) {
    // Ignore — relative URLs etc.
  }

  const prompt = `Write a concise alt-text description for an image used on a webpage.
${pageContext}
Image filename hint: "${filenameHint || '(unknown)'}"
Image URL: ${imageUrl}

Requirements:
- 5-15 words, descriptive and specific
- No "image of" / "picture of" prefix
- Plain text, no quotes, no period at end
- Match the language of the page

Output ONLY the alt text, nothing else.`;

  const alt = await generateShortText(prompt, 80);
  if (!alt) return null;
  return alt.replace(/^["']|["']$/g, '').replace(/\.$/, '').trim().slice(0, 125);
}

// =============================================================================
// Knowledge Base module handlers
// =============================================================================

async function executeKbAction(
  supabase: SupabaseClient,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { action = 'list' } = args as any;

  if (action === 'list') {
    const { category, is_published } = args as any;
    let query = supabase.from('kb_articles')
      .select('id, title, slug, question, category_id, is_published, is_featured, views_count, helpful_count, not_helpful_count, created_at, updated_at')
      .order('updated_at', { ascending: false }).limit(50);
    if (category) {
      // Resolve category name → id
      const { data: cat } = await supabase.from('kb_categories').select('id').ilike('name', category).maybeSingle();
      if (cat) query = query.eq('category_id', cat.id);
    }
    if (is_published !== undefined) query = query.eq('is_published', is_published);
    const { data, error } = await query;
    if (error) throw new Error(`List KB articles failed: ${error.message}`);
    return { articles: data || [] };
  }

  if (action === 'get') {
    const { article_id, slug } = args as any;
    let query = supabase.from('kb_articles')
      .select('*');
    if (article_id) query = query.eq('id', article_id);
    else if (slug) query = query.eq('slug', slug);
    else throw new Error('article_id or slug required');
    const { data, error } = await query.single();
    if (error) throw new Error(`Get KB article failed: ${error.message}`);
    return data;
  }

  if (action === 'create') {
    const { title, question, answer, category = 'general', include_in_chat = true, is_featured = false } = args as any;
    if (!title || !question) throw new Error('title and question are required');
    const articleSlug = title.toLowerCase().replace(/[^a-z0-9åäö]+/g, '-').replace(/(^-|-$)/g, '');

    // Resolve category string → category_id UUID
    const { data: cats } = await supabase.from('kb_categories').select('id, slug, name').eq('is_active', true).limit(20);
    let categoryId: string | null = null;
    if (cats && cats.length > 0) {
      const match = cats.find(c =>
        c.slug === category.toLowerCase().replace(/\s+/g, '-') ||
        c.name?.toLowerCase() === category.toLowerCase()
      );
      categoryId = match?.id ?? cats[0].id;
    }
    if (!categoryId) {
      // Auto-create a default "General" category
      const catSlug = category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'general';
      const { data: newCat, error: catErr } = await supabase.from('kb_categories').insert({
        name: category || 'General',
        slug: catSlug,
        description: 'Auto-created category',
        icon: 'HelpCircle',
        is_active: true,
      }).select('id').single();
      if (catErr) throw new Error(`Failed to auto-create KB category: ${catErr.message}`);
      categoryId = newCat.id;
    }

    const { data, error } = await supabase.from('kb_articles').insert({
      title, question,
      answer_text: answer || '',
      slug: articleSlug,
      category_id: categoryId,
      include_in_chat, is_featured,
      is_published: false,
    }).select('id, title, slug, is_published').single();
    if (error) throw new Error(`Create KB article failed: ${error.message}`);
    return { article_id: data.id, slug: data.slug, title: data.title, status: 'draft' };
  }

  if (action === 'update') {
    const { article_id, ...updateData } = args as any;
    if (!article_id) throw new Error('article_id is required');
    delete updateData.action;
    const { data, error } = await supabase.from('kb_articles')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', article_id).select('id, title, is_published').single();
    if (error) throw new Error(`Update KB article failed: ${error.message}`);
    return { article_id: data.id, title: data.title, status: 'updated' };
  }

  if (action === 'publish') {
    const { article_id } = args as any;
    if (!article_id) throw new Error('article_id is required');
    const { data, error } = await supabase.from('kb_articles')
      .update({ is_published: true, updated_at: new Date().toISOString() })
      .eq('id', article_id).select('id, title, slug').single();
    if (error) throw new Error(`Publish failed: ${error.message}`);
    return { article_id: data.id, slug: data.slug, status: 'published' };
  }

  if (action === 'unpublish') {
    const { article_id } = args as any;
    if (!article_id) throw new Error('article_id is required');
    const { data, error } = await supabase.from('kb_articles')
      .update({ is_published: false, updated_at: new Date().toISOString() })
      .eq('id', article_id).select('id, title').single();
    if (error) throw new Error(`Unpublish failed: ${error.message}`);
    return { article_id: data.id, status: 'unpublished' };
  }

  return { error: `Unknown KB action: ${action}` };
}

// =============================================================================
// Global Blocks module handlers
// =============================================================================

async function executeGlobalBlocksAction(
  supabase: SupabaseClient,
  _skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { action = 'list', slot, block_data } = args as any;

  if (action === 'list') {
    const { data, error } = await supabase.from('global_blocks')
      .select('id, slot, type, data, is_active, updated_at');
    if (error) throw new Error(`List global blocks failed: ${error.message}`);
    return { global_blocks: data || [] };
  }

  if (action === 'get' && slot) {
    const { data, error } = await supabase.from('global_blocks')
      .select('*').eq('slot', slot).maybeSingle();
    if (error) throw new Error(`Get global block failed: ${error.message}`);
    return data || { slot, exists: false };
  }

  if (action === 'update' && slot) {
    if (!block_data) throw new Error('block_data is required');
    const { data: existing } = await supabase.from('global_blocks')
      .select('id, data').eq('slot', slot).maybeSingle();

    if (existing) {
      const mergedData = { ...existing.data, ...block_data };
      const { data, error } = await supabase.from('global_blocks')
        .update({ data: mergedData, updated_at: new Date().toISOString() })
        .eq('id', existing.id).select('id, slot, type').single();
      if (error) throw new Error(`Update global block failed: ${error.message}`);
      return { id: data.id, slot: data.slot, status: 'updated' };
    } else {
      const { block_type = slot === 'header' ? 'header' : 'footer' } = args as any;
      const { data, error } = await supabase.from('global_blocks').insert({
        slot, type: block_type, data: block_data, is_active: true,
      }).select('id, slot, type').single();
      if (error) throw new Error(`Create global block failed: ${error.message}`);
      return { id: data.id, slot: data.slot, status: 'created' };
    }
  }

  if (action === 'toggle' && slot) {
    const { data: existing } = await supabase.from('global_blocks')
      .select('id, is_active').eq('slot', slot).single();
    if (!existing) throw new Error(`No global block in slot: ${slot}`);
    const { data, error } = await supabase.from('global_blocks')
      .update({ is_active: !existing.is_active, updated_at: new Date().toISOString() })
      .eq('id', existing.id).select('id, slot, is_active').single();
    if (error) throw new Error(`Toggle failed: ${error.message}`);
    return { id: data.id, slot: data.slot, is_active: data.is_active };
  }

  return { error: `Unknown global blocks action: ${action}` };
}

// =============================================================================
// Deals module handlers
// =============================================================================

async function executeDealsAction(
  supabase: SupabaseClient,
  _skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { action = 'list' } = args as any;

  if (action === 'list') {
    const { stage, lead_id } = args as any;
    let query = supabase.from('deals')
      .select('id, value_cents, currency, stage, lead_id, product_id, expected_close, notes, created_at, updated_at')
      .order('updated_at', { ascending: false }).limit(50);
    if (stage) query = query.eq('stage', stage);
    if (lead_id) query = query.eq('lead_id', lead_id);
    const { data, error } = await query;
    if (error) throw new Error(`List deals failed: ${error.message}`);
    return { deals: data || [] };
  }

  if (action === 'create') {
    const { value_cents = 0, currency = 'SEK', stage = 'proposal', lead_id, product_id, expected_close, notes } = args as any;
    if (!lead_id) throw new Error('lead_id is required');
    const { data, error } = await supabase.from('deals').insert({
      value_cents, currency, stage, lead_id, product_id, expected_close, notes,
    }).select('id, stage, value_cents').single();
    if (error) throw new Error(`Create deal failed: ${error.message}`);
    return { deal_id: data.id, stage: data.stage, value_cents: data.value_cents };
  }

  if (action === 'update') {
    const { deal_id, ...updateData } = args as any;
    if (!deal_id) throw new Error('deal_id is required');
    delete updateData.action;
    const { data, error } = await supabase.from('deals')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', deal_id).select('id, stage').single();
    if (error) throw new Error(`Update deal failed: ${error.message}`);
    return { deal_id: data.id, stage: data.stage, status: 'updated' };
  }

  if (action === 'move_stage') {
    const { deal_id, stage } = args as any;
    if (!deal_id || !stage) throw new Error('deal_id and stage required');
    const closed_at = ['closed_won', 'closed_lost'].includes(stage) ? new Date().toISOString() : null;
    const { data, error } = await supabase.from('deals')
      .update({ stage, closed_at, updated_at: new Date().toISOString() })
      .eq('id', deal_id).select('id, stage').single();
    if (error) throw new Error(`Move stage failed: ${error.message}`);
    return { deal_id: data.id, new_stage: data.stage };
  }

  return { error: `Unknown deals action: ${action}` };
}

// =============================================================================
// Products module handlers
// =============================================================================

async function executeProductsAction(
  supabase: SupabaseClient,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  // browse_products — visitor-facing
  if (skillName === 'browse_products') {
    const { search, type } = args as any;
    let query = supabase.from('products')
      .select('id, name, description, price_cents, currency, type, image_url, stock_quantity, track_inventory')
      .eq('is_active', true)
      .order('created_at', { ascending: false }).limit(20);
    if (type) query = query.eq('type', type);
    if (search) query = query.ilike('name', `%${search}%`);
    const { data, error } = await query;
    if (error) throw new Error(`Browse products failed: ${error.message}`);
    return { products: (data || []).map((p: any) => ({
      ...p,
      in_stock: !p.track_inventory || (p.stock_quantity !== null && p.stock_quantity > 0),
    })) };
  }

  // manage_inventory
  if (skillName === 'manage_inventory') {
    const { action = 'list_stock', product_id, quantity, threshold } = args as any;

    if (action === 'list_stock') {
      const { data, error } = await supabase.from('products')
        .select('id, name, stock_quantity, track_inventory, low_stock_threshold, allow_backorder, is_active')
        .eq('track_inventory', true)
        .order('stock_quantity', { ascending: true });
      if (error) throw new Error(`List stock failed: ${error.message}`);
      return { products: data || [] };
    }

    if (action === 'update_stock' && product_id) {
      const updateData: any = { updated_at: new Date().toISOString() };
      if (quantity !== undefined) updateData.stock_quantity = quantity;
      if (threshold !== undefined) updateData.low_stock_threshold = threshold;
      const { data, error } = await supabase.from('products')
        .update(updateData).eq('id', product_id)
        .select('id, name, stock_quantity, low_stock_threshold').single();
      if (error) throw new Error(`Update stock failed: ${error.message}`);
      return { product_id: data.id, name: data.name, stock_quantity: data.stock_quantity, status: 'updated' };
    }

    if (action === 'low_stock_alerts') {
      const { data, error } = await supabase.from('products')
        .select('id, name, stock_quantity, low_stock_threshold')
        .eq('track_inventory', true)
        .eq('is_active', true);
      if (error) throw new Error(`Low stock query failed: ${error.message}`);
      const lowStock = (data || []).filter((p: any) =>
        p.stock_quantity !== null && p.stock_quantity <= (p.low_stock_threshold || 5)
      );
      return { low_stock_products: lowStock, count: lowStock.length };
    }

    if (action === 'back_in_stock_requests') {
      const { data, error } = await supabase.from('back_in_stock_requests')
        .select('id, email, product_id, created_at, notified_at')
        .is('notified_at', null)
        .order('created_at', { ascending: false }).limit(50);
      if (error) throw new Error(`Back in stock query failed: ${error.message}`);
      return { requests: data || [] };
    }

    return { error: `Unknown inventory action: ${action}` };
  }

  // manage_product — original CRUD
  const { action = 'list' } = args as any;

  if (action === 'list') {
    const { is_active } = args as any;
    let query = supabase.from('products')
      .select('id, name, description, price_cents, currency, type, is_active, stock_quantity, track_inventory, image_url, created_at')
      .order('created_at', { ascending: false }).limit(50);
    if (is_active !== undefined) query = query.eq('is_active', is_active);
    const { data, error } = await query;
    if (error) throw new Error(`List products failed: ${error.message}`);
    return { products: data || [] };
  }

  if (action === 'create') {
    const { name, description, price_cents, currency = 'SEK', type = 'one_time', image_url, stripe_price_id } = args as any;
    if (!name || price_cents === undefined) throw new Error('name and price_cents required');
    const { data, error } = await supabase.from('products').insert({
      name, description, price_cents, currency, type,
      image_url, stripe_price_id, is_active: true,
    }).select('id, name, price_cents').single();
    if (error) throw new Error(`Create product failed: ${error.message}`);
    return { product_id: data.id, name: data.name, price_cents: data.price_cents };
  }

  if (action === 'update') {
    const { product_id, ...updateData } = args as any;
    if (!product_id) throw new Error('product_id is required');
    delete updateData.action;
    const { data, error } = await supabase.from('products')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', product_id).select('id, name, is_active').single();
    if (error) throw new Error(`Update product failed: ${error.message}`);
    return { product_id: data.id, name: data.name, status: 'updated' };
  }

  return { error: `Unknown products action: ${action}` };
}

// =============================================================================
// Companies module handlers
// =============================================================================

async function executeCompaniesAction(
  supabase: SupabaseClient,
  _skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { action = 'list' } = args as any;

  if (action === 'list') {
    const { data, error } = await supabase.from('companies')
      .select('id, name, domain, industry, size, address, phone, website, notes, created_at')
      .order('created_at', { ascending: false }).limit(50);
    if (error) throw new Error(`List companies failed: ${error.message}`);
    return { companies: data || [] };
  }

  if (action === 'create') {
    const { name, domain, industry, size, address, phone, website, notes } = args as any;
    if (!name) throw new Error('name is required');
    const { data, error } = await supabase.from('companies').insert({
      name, domain, industry, size, address, phone, website, notes,
    }).select('id, name, domain').single();
    if (error) throw new Error(`Create company failed: ${error.message}`);
    return { company_id: data.id, name: data.name, domain: data.domain };
  }

  if (action === 'update') {
    const { company_id, ...updateData } = args as any;
    if (!company_id) throw new Error('company_id is required');
    delete updateData.action;
    const { data, error } = await supabase.from('companies')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', company_id).select('id, name').single();
    if (error) throw new Error(`Update company failed: ${error.message}`);
    return { company_id: data.id, name: data.name, status: 'updated' };
  }

  if (action === 'delete') {
    const { company_id } = args as any;
    if (!company_id) throw new Error('company_id is required');
    const { error } = await supabase.from('companies').delete().eq('id', company_id);
    if (error) throw new Error(`Delete company failed: ${error.message}`);
    return { company_id, status: 'deleted' };
  }

  return { error: `Unknown companies action: ${action}` };
}

// =============================================================================
// Forms module handlers
// =============================================================================

async function executeFormsAction(
  supabase: SupabaseClient,
  _skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { action = 'list' } = args as any;

  if (action === 'list') {
    const { form_name, limit = 50 } = args as any;
    let query = supabase.from('form_submissions')
      .select('id, form_name, block_id, data, metadata, page_id, created_at')
      .order('created_at', { ascending: false }).limit(limit);
    if (form_name) query = query.eq('form_name', form_name);
    const { data, error } = await query;
    if (error) throw new Error(`List submissions failed: ${error.message}`);
    return { submissions: data || [] };
  }

  if (action === 'get') {
    const { submission_id } = args as any;
    if (!submission_id) throw new Error('submission_id is required');
    const { data, error } = await supabase.from('form_submissions')
      .select('*').eq('id', submission_id).single();
    if (error) throw new Error(`Get submission failed: ${error.message}`);
    return data;
  }

  if (action === 'delete') {
    const { submission_id } = args as any;
    if (!submission_id) throw new Error('submission_id is required');
    const { error } = await supabase.from('form_submissions').delete().eq('id', submission_id);
    if (error) throw new Error(`Delete failed: ${error.message}`);
    return { submission_id, status: 'deleted' };
  }

  if (action === 'stats') {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const { data, error } = await supabase.from('form_submissions')
      .select('form_name, created_at')
      .gte('created_at', since.toISOString());
    if (error) throw new Error(`Form stats failed: ${error.message}`);
    const submissions = data || [];
    const byForm: Record<string, number> = {};
    for (const s of submissions) {
      byForm[s.form_name || 'unknown'] = (byForm[s.form_name || 'unknown'] || 0) + 1;
    }
    return { period_days: 30, total: submissions.length, by_form: byForm };
  }

  return { error: `Unknown forms action: ${action}` };
}

// =============================================================================
// Webinars module handlers
// =============================================================================

async function executeWebinarsAction(
  supabase: SupabaseClient,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { action = 'list' } = args as any;

  if (action === 'list' || action === 'list_upcoming') {
    let query = supabase.from('webinars')
      .select('id, title, description, scheduled_at, platform, meeting_url, status, max_attendees, created_at')
      .order('scheduled_at', { ascending: false }).limit(50);
    if (action === 'list_upcoming') {
      query = query.eq('status', 'upcoming').gte('scheduled_at', new Date().toISOString()).order('scheduled_at', { ascending: true });
    }
    const { data, error } = await query;
    if (error) throw new Error(`List webinars failed: ${error.message}`);
    return { webinars: data || [] };
  }

  if (action === 'register') {
    const { webinar_id, name, email, phone } = args as any;
    if (!webinar_id || !name || !email) throw new Error('webinar_id, name, and email required');
    const { data, error } = await supabase.from('webinar_registrations').insert({
      webinar_id, name, email, phone: phone || null,
    }).select('id, name, email').single();
    if (error) throw new Error(`Registration failed: ${error.message}`);
    return { registration_id: data.id, name: data.name, email: data.email, status: 'registered' };
  }

  if (action === 'create') {
    const { title, description, scheduled_at, platform = 'google_meet', meeting_url, max_attendees } = args as any;
    if (!title || !scheduled_at) throw new Error('title and scheduled_at required');
    const { data, error } = await supabase.from('webinars').insert({
      title, description, scheduled_at, platform, meeting_url,
      max_attendees, status: 'upcoming',
    }).select('id, title, scheduled_at, status').single();
    if (error) throw new Error(`Create webinar failed: ${error.message}`);
    return { webinar_id: data.id, title: data.title, scheduled_at: data.scheduled_at };
  }

  if (action === 'update') {
    const { webinar_id, ...updateData } = args as any;
    if (!webinar_id) throw new Error('webinar_id is required');
    delete updateData.action;
    const { data, error } = await supabase.from('webinars')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', webinar_id).select('id, title, status').single();
    if (error) throw new Error(`Update webinar failed: ${error.message}`);
    return { webinar_id: data.id, title: data.title, status: 'updated' };
  }

  return { error: `Unknown webinars action: ${action}` };
}

// =============================================================================
// Blog module — full handler with browse, categories, write
// =============================================================================

async function executeBlogAction(
  supabase: SupabaseClient,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  // browse_blog — list published posts for visitors
  if (skillName === 'browse_blog') {
    const { search, limit = 5 } = args as any;
    let query = supabase.from('blog_posts')
      .select('id, title, slug, excerpt, featured_image, published_at, reading_time_minutes')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(limit);
    if (search) query = query.ilike('title', `%${search}%`);
    const { data, error } = await query;
    if (error) throw new Error(`Browse blog failed: ${error.message}`);
    return { posts: data || [] };
  }

  // manage_blog_categories
  if (skillName === 'manage_blog_categories') {
    const { action = 'list_categories' } = args as any;

    if (action === 'list_categories') {
      const { data, error } = await supabase.from('blog_categories')
        .select('id, name, slug, description, sort_order').order('sort_order');
      if (error) throw new Error(`List categories failed: ${error.message}`);
      return { categories: data || [] };
    }
    if (action === 'create_category') {
      const { name, slug, description } = args as any;
      if (!name) throw new Error('name is required');
      const catSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const { data, error } = await supabase.from('blog_categories').insert({ name, slug: catSlug, description }).select('id, name, slug').single();
      if (error) throw new Error(`Create category failed: ${error.message}`);
      return { category_id: data.id, name: data.name, slug: data.slug };
    }
    if (action === 'list_tags') {
      const { data, error } = await supabase.from('blog_tags').select('id, name, slug').order('name');
      if (error) throw new Error(`List tags failed: ${error.message}`);
      return { tags: data || [] };
    }
    if (action === 'create_tag') {
      const { name, slug } = args as any;
      if (!name) throw new Error('name is required');
      const tagSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const { data, error } = await supabase.from('blog_tags').insert({ name, slug: tagSlug }).select('id, name, slug').single();
      if (error) throw new Error(`Create tag failed: ${error.message}`);
      return { tag_id: data.id, name: data.name, slug: data.slug };
    }
    return { error: `Unknown blog categories action: ${action}` };
  }

  // write_blog_post — original handler
  const { title: rawTitle, topic, tone = 'professional', language = 'en', content } = args as any;
  const resolvedTitle = rawTitle || topic || 'Untitled Post';
  const slug = String(resolvedTitle).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  let tiptapDoc: any = { type: 'doc', content: [{ type: 'paragraph' }] };
  let excerpt = `Blog post about: ${topic || resolvedTitle}`;
  let markdownContent = content as string | undefined;

  if (!markdownContent) {
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (geminiKey) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
        const genPrompt = `Write a comprehensive blog post about: "${topic}"\nTitle: "${resolvedTitle}"\nTone: ${tone}\nLanguage: ${language}\n\nWrite 600-1200 words. Use markdown with ## headings, paragraphs, and bullet points where appropriate. Do NOT include the title as an H1 — start with the first section. Output ONLY the markdown content, no preamble.`;
        const genResp = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: genPrompt }] }],
            generationConfig: { maxOutputTokens: 8192, temperature: 0.7 },
          }),
        });
        const genData = await genResp.json();
        markdownContent = genData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } catch (e) {
        console.error('[write_blog_post] Gemini generation failed:', e);
      }
    } else if (openaiKey) {
      try {
        const genResp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
          body: JSON.stringify({
            model: 'gpt-4o-mini', max_tokens: 4096,
            messages: [
              { role: 'system', content: `You are a blog writer. Tone: ${tone}. Language: ${language}.` },
              { role: 'user', content: `Write a blog post about "${topic}" titled "${resolvedTitle}". 600-1200 words. Use markdown with ## headings. Do NOT include the title. Output ONLY markdown.` }
            ],
          }),
        });
        const genData = await genResp.json();
        markdownContent = genData.choices?.[0]?.message?.content || '';
      } catch (e) {
        console.error('[write_blog_post] OpenAI generation failed:', e);
      }
    }
  }

  if (markdownContent && markdownContent.trim()) {
    tiptapDoc = markdownToTiptap(markdownContent);
    const plainText = markdownContent.replace(/[#*_\[\]()>`-]/g, '').replace(/\n+/g, ' ').trim();
    excerpt = plainText.substring(0, 160) + (plainText.length > 160 ? '...' : '');
  }

  // --- Auto-fetch featured image ---
  let featuredImage: string | null = null;
  let featuredImageAlt: string | null = null;
  const imageQuery = topic || title;

  // Strategy 1: Unsplash (free, fast, high quality photos)
  const unsplashKey = Deno.env.get('UNSPLASH_ACCESS_KEY');
  if (!featuredImage && unsplashKey) {
    try {
      const searchUrl = new URL('https://api.unsplash.com/search/photos');
      searchUrl.searchParams.set('query', imageQuery);
      searchUrl.searchParams.set('per_page', '1');
      searchUrl.searchParams.set('orientation', 'landscape');
      const uResp = await fetch(searchUrl.toString(), {
        headers: { 'Authorization': `Client-ID ${unsplashKey}`, 'Accept-Version': 'v1' },
      });
      if (uResp.ok) {
        const uData = await uResp.json();
        const photo = uData.results?.[0];
        if (photo) {
          featuredImage = photo.urls?.regular;
          featuredImageAlt = photo.alt_description || photo.description || `Photo by ${photo.user?.name} on Unsplash`;
          console.log(`[write_blog_post] Unsplash image found: ${featuredImage}`);
        }
      }
    } catch (e) {
      console.error('[write_blog_post] Unsplash fetch failed:', e);
    }
  }

  // Strategy 2: Gemini image generation (direct API, self-hosted)
  const geminiKeyImg = Deno.env.get('GEMINI_API_KEY');
  if (!featuredImage && geminiKeyImg) {
    try {
      const imgPrompt = `Generate a professional, modern blog header image for an article titled "${resolvedTitle}" about "${topic}". The image should be visually striking, landscape oriented, suitable as a blog featured image. No text in the image.`;
      const imgResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiKeyImg}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: imgPrompt }] }],
            generationConfig: {
              responseModalities: ['IMAGE', 'TEXT'],
            },
          }),
        }
      );
      if (imgResp.ok) {
        const imgData = await imgResp.json();
        const parts = imgData.candidates?.[0]?.content?.parts || [];
        const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));
        if (imagePart?.inlineData?.data) {
          const mimeType = imagePart.inlineData.mimeType || 'image/png';
          const ext = mimeType.includes('jpeg') ? 'jpg' : 'png';
          const imageBytes = Uint8Array.from(atob(imagePart.inlineData.data), c => c.charCodeAt(0));
          const fileName = `blog/${slug}-${Date.now()}.${ext}`;
          const { error: uploadErr } = await supabase.storage
            .from('cms-images')
            .upload(fileName, imageBytes, { contentType: mimeType, upsert: true });
          if (!uploadErr) {
            const { data: urlData } = supabase.storage.from('cms-images').getPublicUrl(fileName);
            featuredImage = urlData.publicUrl;
            featuredImageAlt = `Featured image for ${title}`;
            console.log(`[write_blog_post] Gemini image generated and uploaded: ${featuredImage}`);
          } else {
            console.error('[write_blog_post] Image upload failed:', uploadErr.message);
          }
        }
      }
    } catch (e) {
      console.error('[write_blog_post] Gemini image generation failed:', e);
    }
  }

  const insertData: Record<string, unknown> = {
    title: resolvedTitle, slug, status: 'draft', excerpt, content_json: tiptapDoc,
    meta_json: { tone, language, generated_by: 'flowpilot', topic },
  };
  if (featuredImage) {
    insertData.featured_image = featuredImage;
    insertData.featured_image_alt = featuredImageAlt;
  }

  const { data, error } = await supabase.from('blog_posts').insert(insertData).select().single();
  if (error) throw new Error(`Blog insert failed: ${error.message}`);
  return { blog_post_id: data.id, slug: data.slug, title: data.title, status: 'draft', has_content: !!markdownContent, has_featured_image: !!featuredImage };
}

// =============================================================================
// Booking module — full handler with availability checking
// =============================================================================

async function executeBookingAction(
  supabase: SupabaseClient,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  // check_availability — check available slots
  if (skillName === 'check_availability') {
    const { date, service_id } = args as any;
    if (!date) throw new Error('date is required');

    const dayOfWeek = new Date(date).getDay();
    let availQuery = supabase.from('booking_availability')
      .select('start_time, end_time, service_id')
      .eq('day_of_week', dayOfWeek)
      .eq('is_active', true);
    if (service_id) availQuery = availQuery.eq('service_id', service_id);
    const { data: availability } = await availQuery;

    // Check blocked dates
    const { data: blocked } = await supabase.from('booking_blocked_dates')
      .select('id, reason, is_all_day, start_time, end_time')
      .eq('date', date);

    // Check existing bookings
    const dayStart = `${date}T00:00:00`;
    const dayEnd = `${date}T23:59:59`;
    const { data: bookings } = await supabase.from('bookings')
      .select('start_time, end_time, service_id')
      .gte('start_time', dayStart).lte('start_time', dayEnd)
      .neq('status', 'cancelled');

    const isFullyBlocked = blocked?.some((b: any) => b.is_all_day);

    return {
      date,
      day_of_week: dayOfWeek,
      is_blocked: isFullyBlocked || false,
      blocked_reasons: blocked?.map((b: any) => b.reason).filter(Boolean) || [],
      available_windows: isFullyBlocked ? [] : (availability || []).map((a: any) => ({
        start: a.start_time, end: a.end_time, service_id: a.service_id,
      })),
      existing_bookings: (bookings || []).length,
    };
  }

  // browse_services — list services
  if (skillName === 'browse_services') {
    const { data, error } = await supabase.from('booking_services')
      .select('id, name, description, duration_minutes, price_cents, currency, color')
      .eq('is_active', true).order('sort_order');
    if (error) throw new Error(`List services failed: ${error.message}`);
    return { services: data || [] };
  }

  // manage_booking_availability
  if (skillName === 'manage_booking_availability') {
    const { action = 'list_hours' } = args as any;
    if (action === 'list_hours') {
      const { data } = await supabase.from('booking_availability')
        .select('id, day_of_week, start_time, end_time, is_active, service_id')
        .order('day_of_week').order('start_time');
      return { hours: data || [] };
    }
    if (action === 'set_hours') {
      const { day_of_week, start_time, end_time } = args as any;
      if (day_of_week === undefined || !start_time || !end_time) throw new Error('day_of_week, start_time, end_time required');
      const { data, error } = await supabase.from('booking_availability').insert({
        day_of_week, start_time, end_time, is_active: true,
      }).select('id').single();
      if (error) throw new Error(`Set hours failed: ${error.message}`);
      return { availability_id: data.id, status: 'created' };
    }
    if (action === 'block_date') {
      const { date, reason } = args as any;
      if (!date) throw new Error('date is required');
      const { data, error } = await supabase.from('booking_blocked_dates').insert({
        date, reason: reason || null, is_all_day: true,
      }).select('id').single();
      if (error) throw new Error(`Block date failed: ${error.message}`);
      return { blocked_date_id: data.id, status: 'blocked' };
    }
    if (action === 'unblock_date') {
      const { date } = args as any;
      if (!date) throw new Error('date is required');
      const { error } = await supabase.from('booking_blocked_dates').delete().eq('date', date);
      if (error) throw new Error(`Unblock failed: ${error.message}`);
      return { date, status: 'unblocked' };
    }
    if (action === 'list_blocked') {
      const { data } = await supabase.from('booking_blocked_dates')
        .select('id, date, reason, is_all_day').order('date');
      return { blocked_dates: data || [] };
    }
    return { error: `Unknown availability action: ${action}` };
  }

  // book_appointment — original handler
  const { service_id, customer_name, customer_email, date, time } = args as any;
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
    start_time: startTime.toISOString(), end_time: endTime.toISOString(),
    status: 'pending',
  }).select().single();
  if (error) throw new Error(`Booking failed: ${error.message}`);
  return { booking_id: data.id, start_time: data.start_time, status: 'pending' };
}

// =============================================================================
// Newsletter module — with subscriber management
// =============================================================================

async function executeNewsletterAction(
  supabase: SupabaseClient,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (skillName === 'manage_newsletter_subscribers') {
    const { action = 'list', search, status, email, limit = 50 } = args as any;
    if (action === 'list' || action === 'search') {
      let query = supabase.from('newsletter_subscribers')
        .select('id, email, name, status, created_at, confirmed_at')
        .order('created_at', { ascending: false }).limit(limit);
      if (status) query = query.eq('status', status);
      if (search) query = query.or(`email.ilike.%${search}%,name.ilike.%${search}%`);
      const { data, error } = await query;
      if (error) throw new Error(`List subscribers failed: ${error.message}`);
      return { subscribers: data || [] };
    }
    if (action === 'count') {
      const { count, error } = await supabase.from('newsletter_subscribers')
        .select('*', { count: 'exact', head: true }).eq('status', 'active');
      if (error) throw new Error(`Count failed: ${error.message}`);
      return { active_subscribers: count || 0 };
    }
    if (action === 'remove' && email) {
      const { error } = await supabase.from('newsletter_subscribers')
        .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() })
        .eq('email', email);
      if (error) throw new Error(`Remove failed: ${error.message}`);
      return { email, status: 'unsubscribed' };
    }
    return { error: `Unknown subscriber action: ${action}` };
  }

  // manage_newsletters — full CRUD on newsletters table
  if (skillName === 'manage_newsletters') {
    const { action = 'list', newsletter_id, subject, content_html, status, schedule_at, limit = 20 } = args as any;

    if (action === 'list') {
      let query = supabase.from('newsletters')
        .select('id, subject, status, sent_count, open_count, click_count, scheduled_at, sent_at, created_at')
        .order('created_at', { ascending: false }).limit(limit);
      if (status) query = query.eq('status', status);
      const { data, error } = await query;
      if (error) throw new Error(`List newsletters failed: ${error.message}`);
      return { newsletters: data || [] };
    }

    if (action === 'get') {
      const id = newsletter_id;
      if (!id) throw new Error('newsletter_id required for get');
      const { data, error } = await supabase.from('newsletters')
        .select('*').eq('id', id).single();
      if (error) throw new Error(`Get newsletter failed: ${error.message}`);
      return data;
    }

    if (action === 'create') {
      if (!subject) throw new Error('subject required for create');
      let finalHtml = content_html as string | undefined;
      const { topic, tone = 'professional', language = 'en', blog_content } = args as any;

      // AI-generate newsletter content if topic provided but no content_html
      if (!finalHtml && (topic || blog_content)) {
        const geminiKey = Deno.env.get('GEMINI_API_KEY');
        const openaiKey = Deno.env.get('OPENAI_API_KEY');
        const sourceContext = blog_content
          ? `Base the newsletter on this blog post content:\n\n${blog_content}\n\nAdapt it for email format — shorter, more direct, with a clear CTA.`
          : `Topic: "${topic}"`;

        const genPrompt = `Write a professional newsletter email about: ${sourceContext}
Subject line: "${subject}"
Tone: ${tone}
Language: ${language}

Write 300-600 words. Output clean HTML suitable for email (use <h2>, <p>, <ul>, <li>, <strong>, <em>, <a>).
Include:
- An engaging opening paragraph
- 3-5 key points or tips
- A clear call-to-action at the end
Do NOT include <html>, <head>, <body> tags — just the inner content HTML.
Do NOT include the subject line as a heading.
Output ONLY the HTML content, no preamble or explanation.`;

        if (geminiKey) {
          try {
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
            const genResp = await fetch(geminiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: genPrompt }] }],
                generationConfig: { maxOutputTokens: 4096, temperature: 0.7 },
              }),
            });
            const genData = await genResp.json();
            const raw = genData.candidates?.[0]?.content?.parts?.[0]?.text || '';
            finalHtml = raw.replace(/^```html\s*/i, '').replace(/```\s*$/, '').trim();
            console.log(`[manage_newsletters] AI content generated via Gemini (${finalHtml.length} chars)`);
          } catch (e) {
            console.error('[manage_newsletters] Gemini generation failed:', e);
          }
        } else if (openaiKey) {
          try {
            const genResp = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
              body: JSON.stringify({
                model: 'gpt-4o-mini', max_tokens: 4096,
                messages: [
                  { role: 'system', content: `You are a newsletter copywriter. Tone: ${tone}. Language: ${language}.` },
                  { role: 'user', content: genPrompt }
                ],
              }),
            });
            const genData = await genResp.json();
            const raw = genData.choices?.[0]?.message?.content || '';
            finalHtml = raw.replace(/^```html\s*/i, '').replace(/```\s*$/, '').trim();
            console.log(`[manage_newsletters] AI content generated via OpenAI (${finalHtml.length} chars)`);
          } catch (e) {
            console.error('[manage_newsletters] OpenAI generation failed:', e);
          }
        }
      }

      const { data, error } = await supabase.from('newsletters').insert({
        subject,
        content_html: finalHtml || '',
        status: schedule_at ? 'scheduled' : 'draft',
        scheduled_at: schedule_at || null,
      }).select().single();
      if (error) throw new Error(`Create newsletter failed: ${error.message}`);
      return { newsletter_id: data.id, subject: data.subject, status: data.status, ai_generated: !!(finalHtml && !content_html) };
    }

    if (action === 'update') {
      if (!newsletter_id) throw new Error('newsletter_id required for update');
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (subject !== undefined) updates.subject = subject;
      if (content_html !== undefined) updates.content_html = content_html;
      if (status !== undefined) updates.status = status;
      if (schedule_at !== undefined) updates.scheduled_at = schedule_at;
      const { data, error } = await supabase.from('newsletters')
        .update(updates).eq('id', newsletter_id).select('id, subject, status').single();
      if (error) throw new Error(`Update newsletter failed: ${error.message}`);
      return { newsletter_id: data.id, subject: data.subject, status: data.status };
    }

    if (action === 'delete') {
      if (!newsletter_id) throw new Error('newsletter_id required for delete');
      const { error } = await supabase.from('newsletters').delete().eq('id', newsletter_id);
      if (error) throw new Error(`Delete newsletter failed: ${error.message}`);
      return { newsletter_id, status: 'deleted' };
    }

    return { error: `Unknown newsletters action: ${action}` };
  }

  // lead_nurture_sequence — AI-generated nurture email for a lead
  if (skillName === 'lead_nurture_sequence') {
    const { lead_id, sequence_type = 'welcome', tone = 'professional', language = 'en' } = args as any;
    if (!lead_id) throw new Error('lead_id is required');

    // Fetch lead info
    const { data: lead, error: leadErr } = await supabase.from('leads')
      .select('id, email, name, status, source, score')
      .eq('id', lead_id).single();
    if (leadErr || !lead) throw new Error('Lead not found');

    // Generate nurture email via AI
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    const prompt = `Create a ${sequence_type} nurture email for a lead named "${lead.name || 'there'}" (source: ${lead.source || 'website'}).
Tone: ${tone}. Language: ${language}.
Return ONLY a JSON object with "subject" and "body_html" keys. The body_html should be a complete email in HTML format with inline styles.`;

    let subject = `${sequence_type.charAt(0).toUpperCase() + sequence_type.slice(1)} — ${lead.name || lead.email}`;
    let bodyHtml = `<p>Hi ${lead.name || 'there'},</p><p>Thank you for your interest!</p>`;

    try {
      let aiResponse: any;
      if (geminiKey) {
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 2048, responseMimeType: 'application/json' } }),
        });
        const data = await resp.json();
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        aiResponse = JSON.parse(raw);
      } else if (openaiKey) {
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'gpt-4.1-mini', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' } }),
        });
        const data = await resp.json();
        aiResponse = JSON.parse(data.choices?.[0]?.message?.content || '{}');
      }
      if (aiResponse?.subject) subject = aiResponse.subject;
      if (aiResponse?.body_html) bodyHtml = aiResponse.body_html;
    } catch (e) {
      console.error('[lead_nurture_sequence] AI generation failed, using fallback:', e);
    }

    // Create newsletter draft
    const { data: nl, error: nlErr } = await supabase.from('newsletters').insert({
      subject,
      content_html: bodyHtml,
      status: 'draft',
    }).select('id, subject, status').single();
    if (nlErr) throw new Error(`Newsletter creation failed: ${nlErr.message}`);

    return { newsletter_id: nl.id, subject: nl.subject, status: nl.status, lead_email: lead.email, sequence_type };
  }

  // send_newsletter — legacy handler (create draft)
  const { subject, content, schedule_at } = args as any;
  if (!subject) throw new Error('subject is required');
  const { data, error } = await supabase.from('newsletters').insert({
    subject, content_html: content,
    status: schedule_at ? 'scheduled' : 'draft',
    scheduled_at: schedule_at || null,
  }).select().single();
  if (error) throw new Error(`Newsletter failed: ${error.message}`);
  return { newsletter_id: data.id, subject: data.subject, status: data.status };
}

// =============================================================================
// Orders module — with management and stats
// =============================================================================

async function executeOrdersAction(
  supabase: SupabaseClient,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (skillName === 'manage_orders') {
    const { action = 'list', order_id, status, period = 'month', limit = 20 } = args as any;

    if (action === 'list') {
      let query = supabase.from('orders')
        .select('id, status, total_cents, currency, customer_email, customer_name, created_at')
        .order('created_at', { ascending: false }).limit(limit);
      if (status) query = query.eq('status', status);
      const { data, error } = await query;
      if (error) throw new Error(`List orders failed: ${error.message}`);
      return { orders: data || [] };
    }

    if (action === 'get' && order_id) {
      const { data: order, error } = await supabase.from('orders')
        .select('*').eq('id', order_id).single();
      if (error) throw new Error(`Get order failed: ${error.message}`);
      const { data: items } = await supabase.from('order_items')
        .select('id, product_name, quantity, price_cents').eq('order_id', order_id);
      return { ...order, items: items || [] };
    }

    if (action === 'update_status' && order_id && status) {
      const { data, error } = await supabase.from('orders')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', order_id).select('id, status').single();
      if (error) throw new Error(`Update order failed: ${error.message}`);
      return { order_id: data.id, status: data.status };
    }

    if (action === 'stats') {
      const since = new Date();
      if (period === 'week') since.setDate(since.getDate() - 7);
      else if (period === 'month') since.setMonth(since.getMonth() - 1);
      else if (period === 'quarter') since.setMonth(since.getMonth() - 3);
      else since.setHours(0, 0, 0, 0);

      const { data } = await supabase.from('orders')
        .select('id, total_cents, currency, status, created_at')
        .gte('created_at', since.toISOString());
      const orders = data || [];
      const totalRevenue = orders.filter((o: any) => o.status === 'paid' || o.status === 'delivered')
        .reduce((sum: number, o: any) => sum + o.total_cents, 0);
      return { period, total_orders: orders.length, total_revenue_cents: totalRevenue, by_status: groupBy(orders, 'status') };
    }

    return { error: `Unknown orders action: ${action}` };
  }

  // check_order / lookup_order — original handler
  const { order_id, email } = args as any;
  let query = supabase.from('orders').select('id, status, total_cents, currency, created_at, customer_email');
  if (order_id) query = query.eq('id', order_id);
  else if (email) query = query.eq('customer_email', email);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(5);
  if (error) throw new Error(`Order lookup failed: ${error.message}`);
  return { orders: data || [] };
}

function groupBy(items: any[], key: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) {
    const val = item[key] || 'unknown';
    result[val] = (result[val] || 0) + 1;
  }
  return result;
}

// =============================================================================
// Leads management handler
// =============================================================================

async function executeLeadsAction(
  supabase: any,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { action = 'list', lead_id, status, score, search, limit = 50 } = args as any;

  if (action === 'list') {
    let query = supabase.from('leads')
      .select('id, email, name, phone, status, score, source, ai_summary, created_at, updated_at')
      .order('updated_at', { ascending: false }).limit(limit);
    if (status) query = query.eq('status', status);
    if (search) query = query.or(`email.ilike.%${search}%,name.ilike.%${search}%`);
    const { data, error } = await query;
    if (error) throw new Error(`List leads failed: ${error.message}`);
    return { leads: data || [] };
  }

  if (action === 'get' && lead_id) {
    const { data, error } = await supabase.from('leads')
      .select('*').eq('id', lead_id).single();
    if (error) throw new Error(`Get lead failed: ${error.message}`);
    // Get activities
    const { data: activities } = await supabase.from('lead_activities')
      .select('id, type, metadata, points, created_at')
      .eq('lead_id', lead_id).order('created_at', { ascending: false }).limit(20);
    return { ...data, activities: activities || [] };
  }

  if (action === 'update' && lead_id) {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (status !== undefined) updates.status = status;
    if (score !== undefined) updates.score = score;
    const { data, error } = await supabase.from('leads')
      .update(updates).eq('id', lead_id).select('id, email, status, score').single();
    if (error) throw new Error(`Update lead failed: ${error.message}`);
    return { lead_id: data.id, status: data.status, score: data.score };
  }

  if (action === 'delete' && lead_id) {
    const { error } = await supabase.from('leads').delete().eq('id', lead_id);
    if (error) throw new Error(`Delete lead failed: ${error.message}`);
    return { lead_id, status: 'deleted' };
  }

  return { error: `Unknown leads action: ${action}` };
}

// =============================================================================
// send_email_to_lead — Send a transactional outreach email to a single lead
// =============================================================================
// Uses AI (Gemini → OpenAI) to draft subject + body when not provided.
// Sends via Resend. Logs result to lead_activities for audit + future
// suppression checks. Supports dry_run for safe previews.

async function executeSendEmailToLead(
  supabase: any,
  args: Record<string, unknown>,
): Promise<unknown> {
  const {
    lead_id,
    subject: providedSubject,
    body_html: providedBody,
    purpose = 'outreach', // outreach | follow_up | nurture | reply
    tone = 'professional',
    language = 'en',
    custom_instructions,
    dry_run = false,
  } = args as any;

  if (!lead_id) throw new Error('lead_id is required');

  // 1. Fetch lead
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, email, name, status, source, score, ai_summary')
    .eq('id', lead_id)
    .maybeSingle();
  if (leadErr) throw new Error(`Lead lookup failed: ${leadErr.message}`);
  if (!lead) throw new Error(`Lead ${lead_id} not found`);
  if (!lead.email) throw new Error(`Lead ${lead_id} has no email address`);

  // 2. Suppression check — has this lead unsubscribed previously?
  const { data: suppressionActivity } = await supabase
    .from('lead_activities')
    .select('id, type')
    .eq('lead_id', lead_id)
    .in('type', ['unsubscribed', 'bounced', 'complained'])
    .limit(1)
    .maybeSingle();
  if (suppressionActivity) {
    return {
      sent: false,
      suppressed: true,
      reason: `Lead has prior ${suppressionActivity.type} event — not sending`,
      lead_email: lead.email,
    };
  }

  // 3. Generate subject + body via AI if not provided
  let subject = providedSubject as string | undefined;
  let bodyHtml = providedBody as string | undefined;

  if (!subject || !bodyHtml) {
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    const prompt = `Write a ${purpose} email to a lead.
Lead: ${lead.name || 'unknown'} <${lead.email}>
Source: ${lead.source || 'website'}
Status: ${lead.status}
${lead.ai_summary ? `Context: ${lead.ai_summary}` : ''}
${custom_instructions ? `Special instructions: ${custom_instructions}` : ''}

Tone: ${tone}. Language: ${language}.
Keep it short (under 150 words), personal, and end with one clear call to action.
Return ONLY a JSON object: {"subject": "...", "body_html": "<p>...</p>"}.
The body_html should be clean HTML with inline styles, no <html>/<body> wrapper.`;

    try {
      let aiResp: any;
      if (geminiKey) {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 1024,
                responseMimeType: 'application/json',
              },
            }),
          },
        );
        const data = await r.json();
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        aiResp = JSON.parse(raw);
      } else if (openaiKey) {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4.1-mini',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
          }),
        });
        const data = await r.json();
        aiResp = JSON.parse(data.choices?.[0]?.message?.content || '{}');
      } else {
        throw new Error('No AI provider configured (GEMINI_API_KEY or OPENAI_API_KEY)');
      }
      subject = subject || aiResp?.subject;
      bodyHtml = bodyHtml || aiResp?.body_html;
    } catch (e) {
      console.error('[send_email_to_lead] AI generation failed:', e);
      throw new Error(`Email draft generation failed: ${(e as Error).message}`);
    }
  }

  if (!subject || !bodyHtml) {
    throw new Error('Could not produce subject and body for email');
  }

  // 4. Dry-run — return draft without sending
  if (dry_run) {
    return {
      sent: false,
      dry_run: true,
      lead_email: lead.email,
      lead_name: lead.name,
      subject,
      body_html: bodyHtml,
      preview: bodyHtml.replace(/<[^>]+>/g, ' ').slice(0, 200),
    };
  }

  // 5. Send via Resend
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  const fromEmail = 'FlowPilot <flowpilot@news.flowwink.com>';
  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [lead.email],
      subject,
      html: bodyHtml,
    }),
  });

  const resendData = await resendRes.json();
  if (!resendRes.ok) {
    // Log failure
    await supabase.from('lead_activities').insert({
      lead_id,
      type: 'email_failed',
      metadata: { subject, error: resendData?.message || 'Unknown error', purpose },
      points: 0,
    });
    throw new Error(`Resend API error: ${resendData?.message || resendRes.statusText}`);
  }

  // 6. Log success activity
  await supabase.from('lead_activities').insert({
    lead_id,
    type: 'email_sent',
    metadata: {
      subject,
      purpose,
      provider: 'resend',
      message_id: resendData?.id,
      from: fromEmail,
    },
    points: 5,
  });

  return {
    sent: true,
    lead_email: lead.email,
    lead_name: lead.name,
    subject,
    message_id: resendData?.id,
    purpose,
  };
}

// =============================================================================
// send_invoice_for_order — Quote-to-cash: convert an order into a sent invoice
// =============================================================================
// Creates an invoice from an order's line items, marks it as sent, and emails
// the customer a link via Resend. Idempotent: if an invoice already exists for
// the order (matched on metadata.order_id), it is reused instead of duplicated.
// Supports dry_run for safe preview.

async function executeSendInvoiceForOrder(
  supabase: any,
  args: Record<string, unknown>,
): Promise<unknown> {
  const {
    order_id,
    due_days = 14,
    tax_rate,
    notes,
    payment_terms,
    dry_run = false,
  } = args as any;

  if (!order_id) throw new Error('order_id is required');

  // 1. Fetch order + items
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, customer_email, customer_name, currency, total_cents, status, metadata, user_id')
    .eq('id', order_id)
    .maybeSingle();
  if (orderErr) throw new Error(`Order lookup failed: ${orderErr.message}`);
  if (!order) throw new Error(`Order ${order_id} not found`);
  if (!order.customer_email) throw new Error(`Order ${order_id} has no customer_email`);

  const { data: items, error: itemsErr } = await supabase
    .from('order_items')
    .select('product_name, quantity, price_cents')
    .eq('order_id', order_id);
  if (itemsErr) throw new Error(`Order items lookup failed: ${itemsErr.message}`);
  if (!items || items.length === 0) throw new Error(`Order ${order_id} has no line items`);

  // 2. Build invoice line items
  const lineItems = items.map((it: any) => ({
    description: it.product_name,
    qty: it.quantity,
    unit_price_cents: it.price_cents,
  }));
  const subtotal = lineItems.reduce((s: number, i: any) => s + i.qty * i.unit_price_cents, 0);
  const effectiveTaxRate = typeof tax_rate === 'number' ? tax_rate : 0.25;
  const taxCents = Math.round(subtotal * effectiveTaxRate);
  const totalCents = subtotal + taxCents;

  // 3. Idempotency — reuse existing invoice for this order if present
  const { data: existingByMeta } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, total_cents')
    .contains('line_items', [{ order_id: order_id }] as any)
    .maybeSingle()
    .then((r: any) => r, () => ({ data: null }));

  // Fallback: scan recent invoices with notes referencing the order
  let existingInvoice = existingByMeta;
  if (!existingInvoice) {
    const { data: byNotes } = await supabase
      .from('invoices')
      .select('id, invoice_number, status')
      .eq('customer_email', order.customer_email)
      .ilike('notes', `%order:${order_id}%`)
      .limit(1)
      .maybeSingle();
    existingInvoice = byNotes;
  }

  // 4. Dry-run preview
  if (dry_run) {
    return {
      sent: false,
      dry_run: true,
      order_id,
      customer_email: order.customer_email,
      reuse_existing: !!existingInvoice,
      existing_invoice: existingInvoice || null,
      preview: {
        line_items: lineItems,
        subtotal_cents: subtotal,
        tax_rate: effectiveTaxRate,
        tax_cents: taxCents,
        total_cents: totalCents,
        currency: order.currency || 'SEK',
      },
    };
  }

  // 5. Create or reuse invoice
  let invoice = existingInvoice;
  if (!invoice) {
    const { count } = await supabase.from('invoices').select('*', { count: 'exact', head: true });
    const invoiceNumber = `INV-${String((count || 0) + 1).padStart(4, '0')}`;
    const dueDate = new Date(Date.now() + due_days * 86400000).toISOString().slice(0, 10);

    const { data: created, error: createErr } = await supabase
      .from('invoices')
      .insert({
        invoice_number: invoiceNumber,
        customer_email: order.customer_email,
        customer_name: order.customer_name || '',
        line_items: lineItems as any,
        subtotal_cents: subtotal,
        tax_rate: effectiveTaxRate,
        tax_cents: taxCents,
        total_cents: totalCents,
        currency: order.currency || 'SEK',
        due_date: dueDate,
        payment_terms: payment_terms || `Net ${due_days}`,
        notes: `${notes ? notes + '\n' : ''}order:${order_id}`,
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      .select('id, invoice_number, total_cents, currency, due_date')
      .single();
    if (createErr) throw new Error(`Invoice create failed: ${createErr.message}`);
    invoice = created;
  } else if (invoice.status === 'draft') {
    await supabase
      .from('invoices')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', invoice.id);
  }

  // 6. Email customer
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  let emailResult: any = { skipped: true, reason: 'RESEND_API_KEY not configured' };
  if (RESEND_API_KEY) {
    const fromEmail = 'FlowPilot <flowpilot@news.flowwink.com>';
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const pdfUrl = `${supabaseUrl}/functions/v1/generate-invoice-pdf?invoice_id=${invoice.id}`;
    const fmt = (cents: number) =>
      new Intl.NumberFormat('sv-SE', { style: 'currency', currency: order.currency || 'SEK' }).format(cents / 100);

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="margin:0 0 12px">Invoice ${invoice.invoice_number}</h2>
        <p>Hi ${order.customer_name || 'there'},</p>
        <p>Thank you for your order. Please find your invoice for <strong>${fmt(totalCents)}</strong> below.</p>
        <p><a href="${pdfUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">View invoice</a></p>
        <p style="color:#666;font-size:13px">If you have any questions, just reply to this email.</p>
      </div>`;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromEmail,
        to: [order.customer_email],
        subject: `Invoice ${invoice.invoice_number} from FlowPilot`,
        html,
      }),
    });
    const resendData = await resendRes.json();
    emailResult = resendRes.ok
      ? { sent: true, message_id: resendData?.id }
      : { sent: false, error: resendData?.message || resendRes.statusText };
  }

  // 7. Audit trail
  await supabase.from('audit_logs').insert({
    action: 'invoice_sent',
    entity_type: 'invoice',
    entity_id: invoice.id,
    metadata: {
      order_id,
      invoice_number: invoice.invoice_number,
      total_cents: totalCents,
      currency: order.currency || 'SEK',
      customer_email: order.customer_email,
      email: emailResult,
    },
  });

  return {
    sent: true,
    order_id,
    invoice_id: invoice.id,
    invoice_number: invoice.invoice_number,
    total_cents: totalCents,
    currency: order.currency || 'SEK',
    customer_email: order.customer_email,
    email: emailResult,
  };
}

// =============================================================================
// Blog posts management (update/publish/delete existing)
// =============================================================================

async function executeBlogPostsManagement(
  supabase: any,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { action = 'list', post_id, slug, status, title, excerpt, featured_image, limit = 20 } = args as any;

  if (action === 'list') {
    let query = supabase.from('blog_posts')
      .select('id, title, slug, status, excerpt, featured_image, created_at, updated_at, published_at')
      .order('updated_at', { ascending: false }).limit(limit);
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw new Error(`List posts failed: ${error.message}`);
    return { posts: data || [] };
  }

  if (action === 'get') {
    let query = supabase.from('blog_posts').select('*');
    if (post_id) query = query.eq('id', post_id);
    else if (slug) query = query.eq('slug', slug);
    else throw new Error('post_id or slug required');
    const { data, error } = await query.single();
    if (error) throw new Error(`Get post failed: ${error.message}`);
    return data;
  }

  // Resolve post_id from slug if needed
  const resolvedPostId = post_id || (slug ? await (async () => {
    const { data } = await supabase.from('blog_posts').select('id').eq('slug', slug).maybeSingle();
    return data?.id;
  })() : null);

  if (action === 'update') {
    if (!resolvedPostId) throw new Error('post_id or slug required for update');
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title;
    if (excerpt !== undefined) updates.excerpt = excerpt;
    if (featured_image !== undefined) updates.featured_image = featured_image;
    const { data, error } = await supabase.from('blog_posts')
      .update(updates).eq('id', resolvedPostId).select('id, title, status').single();
    if (error) throw new Error(`Update post failed: ${error.message}`);
    return { post_id: data.id, status: 'updated' };
  }

  if (action === 'publish') {
    if (!resolvedPostId) throw new Error('post_id or slug required for publish');
    const { data, error } = await supabase.from('blog_posts')
      .update({ status: 'published', published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', resolvedPostId).select('id, title, slug, status').single();
    if (error) throw new Error(`Publish failed: ${error.message}`);
    return { post_id: data.id, slug: data.slug, status: 'published' };
  }

  if (action === 'unpublish') {
    if (!resolvedPostId) throw new Error('post_id or slug required for unpublish');
    const { data, error } = await supabase.from('blog_posts')
      .update({ status: 'draft', updated_at: new Date().toISOString() })
      .eq('id', resolvedPostId).select('id, title, status').single();
    if (error) throw new Error(`Unpublish failed: ${error.message}`);
    return { post_id: data.id, status: 'draft' };
  }

  if (action === 'delete') {
    if (!resolvedPostId) throw new Error('post_id or slug required for delete');
    const { error } = await supabase.from('blog_posts').delete().eq('id', resolvedPostId);
    if (error) throw new Error(`Delete post failed: ${error.message}`);
    return { post_id: resolvedPostId, status: 'deleted' };
  }

  throw new Error(`Unknown blog posts action: ${action}. Supported: list, get, update, publish, unpublish, delete`);
}

// =============================================================================
// Bookings management handler
// =============================================================================

async function executeBookingsManagement(
  supabase: any,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { action = 'list', booking_id, status, period = 'month', limit = 50 } = args as any;

  if (action === 'list') {
    const since = new Date();
    if (period === 'today') since.setHours(0, 0, 0, 0);
    else if (period === 'week') since.setDate(since.getDate() - 7);
    else since.setMonth(since.getMonth() - 1);

    let query = supabase.from('bookings')
      .select('id, customer_name, customer_email, start_time, end_time, status, service_id, created_at')
      .gte('start_time', since.toISOString())
      .order('start_time', { ascending: true }).limit(limit);
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw new Error(`List bookings failed: ${error.message}`);
    return { bookings: data || [] };
  }

  if (action === 'get' && booking_id) {
    const { data, error } = await supabase.from('bookings')
      .select('*').eq('id', booking_id).single();
    if (error) throw new Error(`Get booking failed: ${error.message}`);
    return data;
  }

  if (action === 'update_status' && booking_id && status) {
    const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === 'cancelled') updates.cancelled_at = new Date().toISOString();
    const { data, error } = await supabase.from('bookings')
      .update(updates).eq('id', booking_id).select('id, status').single();
    if (error) throw new Error(`Update booking failed: ${error.message}`);
    return { booking_id: data.id, status: data.status };
  }

  if (action === 'cancel' && booking_id) {
    const { cancelled_reason } = args as any;
    const { data, error } = await supabase.from('bookings')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_reason: cancelled_reason || null,
        updated_at: new Date().toISOString(),
      }).eq('id', booking_id).select('id, status').single();
    if (error) throw new Error(`Cancel booking failed: ${error.message}`);
    return { booking_id: data.id, status: 'cancelled' };
  }

  return { error: `Unknown bookings action: ${action}` };
}

async function executeDbAction(
  supabase: any,
  table: string,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (table) {
    case 'site_settings': {
      // Skill-specific routing for branding skills
      if (skillName === 'site_branding_get') {
        const { data, error } = await supabase.from('site_settings')
          .select('key, value').eq('key', 'branding').maybeSingle();
        if (error) throw new Error(`Get branding failed: ${error.message}`);
        return { branding: data?.value || {} };
      }

      if (skillName === 'site_branding_update') {
        const { logo_url, primary_color, accent_color, font_family, favicon_url } = args as any;
        // Read current branding, merge updates
        const { data: existing } = await supabase.from('site_settings')
          .select('value').eq('key', 'branding').maybeSingle();
        const current = existing?.value || {};
        const updated = { ...current };
        if (logo_url !== undefined) updated.logo_url = logo_url;
        if (primary_color !== undefined) updated.primary_color = primary_color;
        if (accent_color !== undefined) updated.accent_color = accent_color;
        if (font_family !== undefined) updated.font_family = font_family;
        if (favicon_url !== undefined) updated.favicon_url = favicon_url;
        const { error } = await supabase.from('site_settings')
          .upsert({ key: 'branding', value: updated }, { onConflict: 'key' });
        if (error) throw new Error(`Branding update failed: ${error.message}`);
        return { branding: updated, updated: true };
      }

      const { action = 'update', key, value } = args as any;

      if (action === 'get_all') {
        const { data, error } = await supabase.from('site_settings').select('key, value');
        if (error) throw new Error(`Get settings failed: ${error.message}`);
        const settings: Record<string, unknown> = {};
        for (const row of (data || [])) settings[row.key] = row.value;
        return { settings };
      }

      if (action === 'get') {
        if (!key) throw new Error('key is required');
        const { data, error } = await supabase.from('site_settings')
          .select('key, value').eq('key', key).maybeSingle();
        if (error) throw new Error(`Get setting failed: ${error.message}`);
        return data || { key, value: null, exists: false };
      }

      // update (default)
      if (!key) throw new Error('key is required for update');
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
      const uniqueSlugs = [...new Set(views.map((v: any) => v.page_slug))];
      const topPages = uniqueSlugs.map(slug => ({
        slug,
        title: views.find((v: any) => v.page_slug === slug)?.page_title || slug,
        views: views.filter((v: any) => v.page_slug === slug).length,
      })).sort((a, b) => b.views - a.views).slice(0, 10);

      return { period, total_views: totalViews, unique_pages: uniqueSlugs.length, top_pages: topPages };
    }

    case 'profiles': {
      const { action = 'list', limit = 50 } = args as any;
      if (action === 'list') {
        const { data, error } = await supabase.from('profiles')
          .select('id, email, full_name, role, created_at')
          .order('created_at', { ascending: false })
          .limit(limit);
        if (error) throw new Error(`List users failed: ${error.message}`);
        return { users: data || [], count: (data || []).length };
      }
      return { error: `Unknown profiles action: ${action}` };
    }

    case 'crm_tasks': {
      // Route by skill name since each skill has different parameters
      if (skillName === 'crm_task_create') {
        const { title, description, due_date, priority, lead_id, deal_id } = args as any;
        if (!title) throw new Error('title is required');
        const { data, error } = await supabase.from('crm_tasks')
          .insert({ title, description, due_date, priority: priority || 'medium', lead_id, deal_id })
          .select().single();
        if (error) throw new Error(`Create task failed: ${error.message}`);
        return { task_id: data.id, title: data.title, created: true };
      }
      if (skillName === 'crm_task_list') {
        const { lead_id, deal_id, include_completed = false, limit = 50 } = args as any;
        let query = supabase.from('crm_tasks')
          .select('id, title, description, priority, due_date, completed_at, lead_id, deal_id, created_at')
          .order('due_date', { ascending: true, nullsFirst: false })
          .limit(limit);
        if (!include_completed) query = query.is('completed_at', null);
        if (lead_id) query = query.eq('lead_id', lead_id);
        if (deal_id) query = query.eq('deal_id', deal_id);
        const { data, error } = await query;
        if (error) throw new Error(`List tasks failed: ${error.message}`);
        return { tasks: data || [], count: (data || []).length };
      }
      if (skillName === 'crm_task_update') {
        const { id, title, description, due_date, priority, completed_at } = args as any;
        if (!id) throw new Error('id is required');
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (title !== undefined) updates.title = title;
        if (description !== undefined) updates.description = description;
        if (due_date !== undefined) updates.due_date = due_date;
        if (priority !== undefined) updates.priority = priority;
        if (completed_at !== undefined) updates.completed_at = completed_at;
        const { error } = await supabase.from('crm_tasks').update(updates).eq('id', id);
        if (error) throw new Error(`Update task failed: ${error.message}`);
        return { task_id: id, updated: true };
      }
      return { error: `Unknown crm_tasks skill: ${skillName}` };
    }

    case 'chat_conversations': {
      if (skillName === 'support_list_conversations') {
        const { status = 'active', limit = 20 } = args as any;
        let query = supabase.from('chat_conversations')
          .select('id, title, customer_name, customer_email, conversation_status, priority, sentiment_score, created_at, updated_at')
          .order('updated_at', { ascending: false })
          .limit(limit);
        if (status !== 'all') query = query.eq('conversation_status', status);
        const { data, error } = await query;
        if (error) throw new Error(`List conversations failed: ${error.message}`);
        return { conversations: data || [], count: (data || []).length };
      }
      if (skillName === 'support_assign_conversation') {
        const { conversation_id, agent_id, priority, status: newStatus } = args as any;
        if (!conversation_id) throw new Error('conversation_id is required');
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (agent_id !== undefined) updates.assigned_agent_id = agent_id;
        if (priority !== undefined) updates.priority = priority;
        if (newStatus !== undefined) updates.conversation_status = newStatus;
        const { error } = await supabase.from('chat_conversations').update(updates).eq('id', conversation_id);
        if (error) throw new Error(`Assign conversation failed: ${error.message}`);
        return { conversation_id, updated: true };
      }
      return { error: `Unknown chat_conversations skill: ${skillName}` };
    }

    case 'chat_feedback': {
      const { period = 'week', limit = 100 } = args as any;
      const now = new Date();
      const since = new Date(now);
      switch (period) {
        case 'today': since.setHours(0, 0, 0, 0); break;
        case 'week': since.setDate(now.getDate() - 7); break;
        case 'month': since.setMonth(now.getMonth() - 1); break;
      }
      const { data, error } = await supabase.from('chat_feedback')
        .select('id, rating, user_question, ai_response, created_at')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(`Get feedback failed: ${error.message}`);
      const ratings = (data || []);
      const positive = ratings.filter((r: any) => r.rating === 'positive').length;
      const negative = ratings.filter((r: any) => r.rating === 'negative').length;
      return { period, total: ratings.length, positive, negative, satisfaction_rate: ratings.length > 0 ? Math.round(positive / ratings.length * 100) : null, recent: ratings.slice(0, 10) };
    }

    case 'journal_entries': {
      // ─── Accounting: Journal Entries & Reports ─────────────────────────
      if (skillName === 'suggest_accounting_template') {
        const { min_occurrences = 3, since_date } = args as any;

        let query = supabase.from('journal_entry_lines').select(`
          account_code, account_name, debit_cents, credit_cents,
          journal_entries!inner(id, entry_date, description, status)
        `).eq('journal_entries.status', 'posted');
        if (since_date) query = query.gte('journal_entries.entry_date', since_date);
        const { data: lines, error } = await query.limit(1000);
        if (error) throw new Error(`Query failed: ${error.message}`);

        // Group lines by journal_entry_id, then find recurring account patterns
        const entryMap = new Map<string, { accounts: string[]; description: string }>();
        for (const l of (lines || []) as any[]) {
          const eid = l.journal_entries.id;
          if (!entryMap.has(eid)) entryMap.set(eid, { accounts: [], description: l.journal_entries.description });
          entryMap.get(eid)!.accounts.push(l.account_code);
        }

        // Create pattern signatures
        const patternCounts = new Map<string, { count: number; descriptions: string[]; accounts: string[] }>();
        for (const [, entry] of entryMap) {
          const sig = entry.accounts.sort().join(',');
          const existing = patternCounts.get(sig) || { count: 0, descriptions: [], accounts: entry.accounts };
          existing.count++;
          if (existing.descriptions.length < 5) existing.descriptions.push(entry.description);
          patternCounts.set(sig, existing);
        }

        // Filter by min_occurrences and check against existing templates
        const { data: existingTemplates } = await supabase.from('accounting_templates').select('template_lines');
        const existingSigs = new Set((existingTemplates || []).map((t: any) => {
          const codes = (t.template_lines || []).map((l: any) => l.account_code).sort();
          return codes.join(',');
        }));

        const suggestions = [];
        for (const [sig, pattern] of patternCounts) {
          if (pattern.count >= min_occurrences && !existingSigs.has(sig)) {
            suggestions.push({
              account_codes: pattern.accounts,
              occurrences: pattern.count,
              sample_descriptions: pattern.descriptions,
              suggested_keywords: pattern.descriptions.flatMap((d: string) => d.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3)).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i).slice(0, 5),
            });
          }
        }

        return { suggestions: suggestions.sort((a, b) => b.occurrences - a.occurrences).slice(0, 10), analyzed_entries: entryMap.size };
      }

      if (skillName === 'accounting_reports') {
        const { report_type, period = 'all', account_code } = args as any;

        // Determine date filter
        let sinceDate: string | null = null;
        if (period !== 'all') {
          const now = new Date();
          const since = new Date(now);
          if (period === 'month') since.setMonth(now.getMonth() - 1);
          else if (period === 'quarter') since.setMonth(now.getMonth() - 3);
          else if (period === 'year') since.setFullYear(now.getFullYear() - 1);
          sinceDate = since.toISOString();
        }

        // Fetch posted lines with optional filters
        let linesQuery = supabase.from('journal_entry_lines').select(`
          account_code, account_name, debit_cents, credit_cents, description,
          journal_entries!inner(id, entry_date, description, status)
        `).eq('journal_entries.status', 'posted');

        if (sinceDate) linesQuery = linesQuery.gte('journal_entries.entry_date', sinceDate);
        if (account_code) linesQuery = linesQuery.eq('account_code', account_code);

        const { data: lines, error: linesErr } = await linesQuery;
        if (linesErr) throw new Error(`Accounting query failed: ${linesErr.message}`);

        // Fetch chart of accounts for classification
        const { data: chart } = await supabase.from('chart_of_accounts')
          .select('account_code, account_name, account_type, account_category, normal_balance')
          .eq('is_active', true);
        const chartMap = new Map((chart || []).map((a: any) => [a.account_code, a]));

        // Aggregate balances
        const balanceMap = new Map<string, { account_code: string; account_name: string; account_type: string; debit_total: number; credit_total: number; balance: number }>();
        for (const line of (lines || []) as any[]) {
          const existing = balanceMap.get(line.account_code) || {
            account_code: line.account_code,
            account_name: line.account_name,
            account_type: chartMap.get(line.account_code)?.account_type || 'unknown',
            debit_total: 0, credit_total: 0, balance: 0,
          };
          existing.debit_total += Number(line.debit_cents || 0);
          existing.credit_total += Number(line.credit_cents || 0);
          balanceMap.set(line.account_code, existing);
        }

        // Calculate balances based on normal_balance
        for (const [code, bal] of balanceMap) {
          const normalBalance = chartMap.get(code)?.normal_balance || 'debit';
          bal.balance = normalBalance === 'debit'
            ? bal.debit_total - bal.credit_total
            : bal.credit_total - bal.debit_total;
        }

        const balances = Array.from(balanceMap.values()).sort((a, b) => a.account_code.localeCompare(b.account_code));

        if (report_type === 'account_balance' || report_type === 'ledger') {
          return { report_type, period, accounts: balances, total_accounts: balances.length };
        }

        if (report_type === 'balance_sheet') {
          const assets = balances.filter(b => b.account_type === 'asset' && b.balance !== 0);
          const liabilities = balances.filter(b => b.account_type === 'liability' && b.balance !== 0);
          const equity = balances.filter(b => b.account_type === 'equity' && b.balance !== 0);
          const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
          const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0);
          const totalEquity = equity.reduce((s, a) => s + a.balance, 0);
          return {
            report_type: 'balance_sheet', period,
            assets, liabilities, equity,
            total_assets_cents: totalAssets,
            total_liabilities_cents: totalLiabilities,
            total_equity_cents: totalEquity,
            balanced: totalAssets === totalLiabilities + totalEquity,
          };
        }

        if (report_type === 'profit_loss') {
          const income = balances.filter(b => b.account_type === 'income' && b.balance !== 0);
          const expenses = balances.filter(b => b.account_type === 'expense' && b.balance !== 0);
          const totalIncome = income.reduce((s, a) => s + a.balance, 0);
          const totalExpenses = expenses.reduce((s, a) => s + a.balance, 0);
          return {
            report_type: 'profit_loss', period,
            income, expenses,
            total_income_cents: totalIncome,
            total_expenses_cents: totalExpenses,
            net_result_cents: totalIncome - totalExpenses,
            profitable: totalIncome > totalExpenses,
          };
        }

        return { error: `Unknown report_type: ${report_type}` };
      }

      // ─── manage_journal_entry ──────────────────────────────────────────
      const { action = 'create' } = args as any;

      if (action === 'list') {
        const { data, error } = await supabase.from('journal_entries')
          .select('id, entry_date, description, reference_number, status, source, created_at')
          .order('entry_date', { ascending: false })
          .limit(50);
        if (error) throw new Error(`List entries failed: ${error.message}`);
        return { entries: data, count: (data || []).length };
      }

      if (action === 'void') {
        const { entry_id } = args as any;
        if (!entry_id) throw new Error('entry_id is required for void action');

        // Get original entry + lines
        const { data: original, error: origErr } = await supabase.from('journal_entries')
          .select('*').eq('id', entry_id).single();
        if (origErr) throw new Error(`Entry not found: ${origErr.message}`);

        const { data: origLines } = await supabase.from('journal_entry_lines')
          .select('*').eq('journal_entry_id', entry_id);

        // Mark original as voided
        await supabase.from('journal_entries').update({ status: 'voided' }).eq('id', entry_id);

        // Create reversal entry
        const { data: reversal, error: revErr } = await supabase.from('journal_entries')
          .insert({
            entry_date: new Date().toISOString().split('T')[0],
            description: `Reversal: ${original.description}`,
            reference_number: `REV-${original.reference_number || entry_id.slice(0, 8)}`,
            status: 'posted',
            source: 'flowpilot',
          }).select('id').single();
        if (revErr) throw new Error(`Reversal failed: ${revErr.message}`);

        // Reverse lines (swap debit/credit)
        if (origLines && origLines.length > 0) {
          await supabase.from('journal_entry_lines').insert(
            origLines.map((l: any) => ({
              journal_entry_id: reversal.id,
              account_code: l.account_code,
              account_name: l.account_name,
              debit_cents: l.credit_cents,
              credit_cents: l.debit_cents,
              description: `Reversal: ${l.description || ''}`,
            }))
          );
        }

        return { voided: true, original_id: entry_id, reversal_id: reversal.id };
      }

      // action === 'create'
      const { entry_date, description, reference_number, template_name, auto_confirm } = args as any;
      let { lines: entryLines } = args as any;

      // ─── Template-First Matching (OpenClaw instrument principle) ────────
      // FlowPilot MUST use templates. If no template matches, escalate.
      if (!entryLines || entryLines.length === 0) {
        // Fetch all templates for matching
        const { data: allTemplates } = await supabase.from('accounting_templates')
          .select('id, template_name, description, keywords, template_lines, usage_count, category');

        if (!allTemplates || allTemplates.length === 0) {
          return {
            status: 'escalate',
            confidence: 0,
            message: 'No accounting templates exist. Please create journal entries manually first so FlowPilot can learn patterns.',
          };
        }

        // Score each template against the description/template_name
        const searchTerms = `${template_name || ''} ${description || ''}`.toLowerCase().trim();
        if (!searchTerms) {
          throw new Error('Either description or template_name is required to match a template.');
        }

        const searchWords = searchTerms.split(/\s+/).filter((w: string) => w.length > 2);

        interface TemplateMatch {
          template: any;
          score: number;
          matchDetails: string[];
        }

        const scored: TemplateMatch[] = allTemplates.map((t: any) => {
          let score = 0;
          const details: string[] = [];

          // 1. Keyword match (strongest signal — 40 points per match)
          const keywords: string[] = t.keywords || [];
          for (const kw of keywords) {
            const kwLower = kw.toLowerCase();
            if (searchTerms.includes(kwLower)) {
              score += 40;
              details.push(`keyword:${kw}`);
            }
            // Partial match (word overlap)
            for (const sw of searchWords) {
              if (kwLower.includes(sw) || sw.includes(kwLower)) {
                score += 15;
                details.push(`partial:${sw}~${kw}`);
              }
            }
          }

          // 2. Template name match (30 points for exact contain, 15 for word overlap)
          const nameLower = t.template_name.toLowerCase();
          if (searchTerms.includes(nameLower) || nameLower.includes(searchTerms)) {
            score += 30;
            details.push('name:exact');
          } else {
            const nameWords = nameLower.split(/\s+/);
            const nameOverlap = searchWords.filter((sw: string) => 
              nameWords.some((nw: string) => nw.includes(sw) || sw.includes(nw))
            );
            if (nameOverlap.length > 0) {
              score += 15 * nameOverlap.length;
              details.push(`name:words(${nameOverlap.join(',')})`);
            }
          }

          // 3. Description match (10 points per word overlap)
          const descLower = (t.description || '').toLowerCase();
          for (const sw of searchWords) {
            if (descLower.includes(sw)) {
              score += 10;
              details.push(`desc:${sw}`);
            }
          }

          // 4. Usage frequency boost (max 10 points)
          score += Math.min(10, (t.usage_count || 0) * 2);

          return { template: t, score, matchDetails: details };
        });

        // Sort by score descending
        scored.sort((a: TemplateMatch, b: TemplateMatch) => b.score - a.score);

        const best = scored[0];
        const maxPossibleScore = 100; // normalize to percentage
        const confidence = Math.min(100, Math.round((best.score / maxPossibleScore) * 100));

        // ─── Confidence Zones ────────────────────────────────────────────
        if (confidence < 70) {
          // 🔴 ESCALATE — no reliable match
          return {
            status: 'escalate',
            confidence,
            message: `No template matched with sufficient confidence (${confidence}%). Please create this journal entry manually. FlowPilot will learn from it.`,
            top_candidates: scored.slice(0, 3).map((s: TemplateMatch) => ({
              name: s.template.template_name,
              confidence: Math.min(100, Math.round((s.score / maxPossibleScore) * 100)),
              match_details: s.matchDetails,
            })),
          };
        }

        if (confidence < 95 || !auto_confirm) {
          // 🟡 PROPOSE — good match but needs confirmation
          return {
            status: 'propose',
            confidence,
            template_id: best.template.id,
            template_name: best.template.template_name,
            template_lines: best.template.template_lines,
            match_details: best.matchDetails,
            message: `Template '${best.template.template_name}' matched with ${confidence}% confidence. Please confirm and provide amounts (debit_cents/credit_cents) for each line, then call again with action='create', the populated lines, and auto_confirm=true.`,
          };
        }

        // 🟢 AUTO-BOOK — very high confidence, use template lines
        // (Only reaches here if auto_confirm=true AND confidence ≥ 95%)
        entryLines = best.template.template_lines;
        // Log which template was used
        console.log(`[accounting] Auto-booking with template '${best.template.template_name}' (${confidence}% confidence)`);

        // Increment usage count
        await supabase.from('accounting_templates')
          .update({ usage_count: (best.template.usage_count || 0) + 1 })
          .eq('id', best.template.id);
      }

      if (!entryLines || entryLines.length === 0) {
        throw new Error('lines array is required for create action');
      }

      // Validate balance
      const totalDebit = entryLines.reduce((s: number, l: any) => s + (l.debit_cents || 0), 0);
      const totalCredit = entryLines.reduce((s: number, l: any) => s + (l.credit_cents || 0), 0);
      if (totalDebit !== totalCredit) {
        throw new Error(`Unbalanced: debit ${totalDebit} ≠ credit ${totalCredit}. Each entry must balance.`);
      }

      const { data: entry, error: entryErr } = await supabase.from('journal_entries')
        .insert({
          entry_date: entry_date || new Date().toISOString().split('T')[0],
          description: description || 'FlowPilot transaction',
          reference_number: reference_number || null,
          status: 'posted',
          source: 'flowpilot',
        }).select('id').single();
      if (entryErr) throw new Error(`Create entry failed: ${entryErr.message}`);

      const { error: linesErr2 } = await supabase.from('journal_entry_lines')
        .insert(entryLines.map((l: any) => ({
          journal_entry_id: entry.id,
          account_code: l.account_code,
          account_name: l.account_name,
          debit_cents: l.debit_cents || 0,
          credit_cents: l.credit_cents || 0,
          description: l.description || null,
        })));
      if (linesErr2) throw new Error(`Create lines failed: ${linesErr2.message}`);

      return {
        created: true,
        entry_id: entry.id,
        entry_date: entry_date || new Date().toISOString().split('T')[0],
        total_debit_cents: totalDebit,
        total_credit_cents: totalCredit,
        lines_count: entryLines.length,
      };
    }

    case 'opening_balances': {
      // ─── Accounting: Opening Balances CRUD ──────────────────────────────
      const { action = 'list' } = args as any;

      if (action === 'list') {
        const { fiscal_year, locale } = args as any;
        let query = supabase.from('opening_balances')
          .select('*')
          .order('account_code');
        if (fiscal_year) query = query.eq('fiscal_year', fiscal_year);
        if (locale) query = query.eq('locale', locale);
        const { data, error } = await query.limit(500);
        if (error) throw new Error(`List opening balances failed: ${error.message}`);
        
        const totalDebit = (data || []).filter((r: any) => r.balance_type === 'debit').reduce((s: number, r: any) => s + r.amount_cents, 0);
        const totalCredit = (data || []).filter((r: any) => r.balance_type === 'credit').reduce((s: number, r: any) => s + r.amount_cents, 0);
        return { balances: data, count: (data || []).length, total_debit_cents: totalDebit, total_credit_cents: totalCredit, balanced: totalDebit === totalCredit };
      }

      if (action === 'set') {
        const { fiscal_year, account_code, amount_cents, balance_type, locale = 'se-bas2024' } = args as any;
        if (!fiscal_year || !account_code || amount_cents === undefined || !balance_type) {
          throw new Error('fiscal_year, account_code, amount_cents, and balance_type are required');
        }

        // Upsert by fiscal_year + account_code + locale
        const { data: existing } = await supabase.from('opening_balances')
          .select('id')
          .eq('fiscal_year', fiscal_year)
          .eq('account_code', account_code)
          .eq('locale', locale)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase.from('opening_balances')
            .update({ amount_cents, balance_type })
            .eq('id', existing.id);
          if (error) throw new Error(`Update opening balance failed: ${error.message}`);
          return { updated: true, account_code, fiscal_year, amount_cents, balance_type };
        } else {
          const { error } = await supabase.from('opening_balances')
            .insert({ fiscal_year, account_code, amount_cents, balance_type, locale });
          if (error) throw new Error(`Insert opening balance failed: ${error.message}`);
          return { created: true, account_code, fiscal_year, amount_cents, balance_type };
        }
      }

      if (action === 'delete') {
        const { fiscal_year, account_code, locale = 'se-bas2024' } = args as any;
        if (!fiscal_year || !account_code) throw new Error('fiscal_year and account_code required');
        const { error } = await supabase.from('opening_balances')
          .delete()
          .eq('fiscal_year', fiscal_year)
          .eq('account_code', account_code)
          .eq('locale', locale);
        if (error) throw new Error(`Delete opening balance failed: ${error.message}`);
        return { deleted: true, account_code, fiscal_year };
      }

      throw new Error(`Unknown opening_balances action: ${action}`);
    }

    case 'chart_of_accounts': {
      // ─── Accounting: Chart of Accounts CRUD ─────────────────────────────
      const { action = 'list' } = args as any;

      if (action === 'list') {
        const { locale, search, account_type } = args as any;
        let query = supabase.from('chart_of_accounts')
          .select('*')
          .eq('is_active', true)
          .order('account_code');
        if (locale) query = query.eq('locale', locale);
        if (account_type) query = query.eq('account_type', account_type);
        if (search) query = query.or(`account_code.ilike.%${search}%,account_name.ilike.%${search}%`);
        const { data, error } = await query.limit(500);
        if (error) throw new Error(`List accounts failed: ${error.message}`);
        return { accounts: data, count: (data || []).length };
      }

      if (action === 'add') {
        const { account_code, account_name, account_type, account_category, normal_balance, locale = 'se-bas2024' } = args as any;
        if (!account_code || !account_name || !account_type || !normal_balance) {
          throw new Error('account_code, account_name, account_type, and normal_balance are required');
        }
        const { data, error } = await supabase.from('chart_of_accounts')
          .insert({ account_code, account_name, account_type, account_category: account_category || account_type, normal_balance, locale, is_active: true })
          .select('id, account_code, account_name')
          .single();
        if (error) throw new Error(`Add account failed: ${error.message}`);
        return { created: true, ...data };
      }

      if (action === 'update') {
        const { account_code, locale = 'se-bas2024', account_name, account_category } = args as any;
        if (!account_code) throw new Error('account_code is required');
        const updates: any = {};
        if (account_name) updates.account_name = account_name;
        if (account_category) updates.account_category = account_category;
        updates.updated_at = new Date().toISOString();
        const { error } = await supabase.from('chart_of_accounts')
          .update(updates)
          .eq('account_code', account_code)
          .eq('locale', locale);
        if (error) throw new Error(`Update account failed: ${error.message}`);
        return { updated: true, account_code };
      }

      if (action === 'deactivate') {
        const { account_code, locale = 'se-bas2024' } = args as any;
        if (!account_code) throw new Error('account_code is required');
        const { error } = await supabase.from('chart_of_accounts')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('account_code', account_code)
          .eq('locale', locale);
        if (error) throw new Error(`Deactivate account failed: ${error.message}`);
        return { deactivated: true, account_code };
      }

      throw new Error(`Unknown chart_of_accounts action: ${action}`);
    }

    case 'accounting_templates': {
      // ─── Accounting: Template CRUD ──────────────────────────────────────
      const { action = 'list' } = args as any;

      if (action === 'list') {
        const { search } = args as any;
        let query = supabase.from('accounting_templates')
          .select('*')
          .order('usage_count', { ascending: false });
        if (search) {
          query = query.or(`template_name.ilike.%${search}%,description.ilike.%${search}%,category.ilike.%${search}%`);
        }
        const { data, error } = await query.limit(50);
        if (error) throw new Error(`List templates failed: ${error.message}`);
        return { templates: data, count: (data || []).length };
      }

      if (action === 'create') {
        const { template_name, description: desc, category, keywords, template_lines } = args as any;
        if (!template_name) throw new Error('template_name is required');
        if (!template_lines || template_lines.length === 0) throw new Error('template_lines with at least one debit and one credit line required');

        const hasDebit = template_lines.some((l: any) => l.type === 'debit');
        const hasCredit = template_lines.some((l: any) => l.type === 'credit');
        if (!hasDebit || !hasCredit) throw new Error('Template must have at least one debit and one credit line');

        const { data, error } = await supabase.from('accounting_templates')
          .insert({
            template_name,
            description: desc || '',
            category: category || 'other',
            keywords: keywords || [],
            template_lines,
            is_system: false,
            usage_count: 0,
          })
          .select('id, template_name')
          .single();
        if (error) throw new Error(`Create template failed: ${error.message}`);
        return { created: true, template_id: data.id, template_name: data.template_name };
      }

      if (action === 'update') {
        const { template_id, template_name, description: desc, category, keywords, template_lines } = args as any;
        if (!template_id) throw new Error('template_id is required for update');
        const updates: any = {};
        if (template_name) updates.template_name = template_name;
        if (desc) updates.description = desc;
        if (category) updates.category = category;
        if (keywords) updates.keywords = keywords;
        if (template_lines) {
          const hasDebit = template_lines.some((l: any) => l.type === 'debit');
          const hasCredit = template_lines.some((l: any) => l.type === 'credit');
          if (!hasDebit || !hasCredit) throw new Error('Template must have at least one debit and one credit line');
          updates.template_lines = template_lines;
        }
        updates.updated_at = new Date().toISOString();

        const { error } = await supabase.from('accounting_templates')
          .update(updates).eq('id', template_id);
        if (error) throw new Error(`Update template failed: ${error.message}`);
        return { updated: true, template_id };
      }

      if (action === 'delete') {
        const { template_id } = args as any;
        if (!template_id) throw new Error('template_id is required for delete');
        const { error } = await supabase.from('accounting_templates')
          .delete().eq('id', template_id).eq('is_system', false);
        if (error) throw new Error(`Delete template failed: ${error.message}`);
        return { deleted: true, template_id, note: 'System templates cannot be deleted' };
      }

      throw new Error(`Unknown accounting_templates action: ${action}`);
    }

    case 'expenses': {
      // ─── Expense Reporting CRUD ─────────────────────────────────────────
      const { action = 'list' } = args as any;

      if (action === 'list') {
        const { user_id, status, period } = args as any;
        let query = supabase.from('expenses')
          .select('id, expense_date, description, amount_cents, vat_cents, currency, category, vendor, account_code, is_representation, attendees, receipt_url, receipt_analyzed, receipt_data, status, report_id, created_at')
          .order('expense_date', { ascending: false });
        if (user_id) query = query.eq('user_id', user_id);
        if (status) query = query.eq('status', status);
        if (period) {
          const [y, m] = period.split('-');
          query = query.gte('expense_date', `${y}-${m}-01`).lt('expense_date', `${y}-${String(Number(m) + 1).padStart(2, '0')}-01`);
        }
        const { data, error } = await query.limit(200);
        if (error) throw new Error(`List expenses failed: ${error.message}`);
        return { expenses: data, count: (data || []).length };
      }

      if (action === 'get') {
        const { expense_id } = args as any;
        if (!expense_id) throw new Error('expense_id is required for get action');
        const { data, error } = await supabase.from('expenses')
          .select('*')
          .eq('id', expense_id)
          .maybeSingle();
        if (error) throw new Error(`Get expense failed: ${error.message}`);
        if (!data) return { error: `Expense ${expense_id} not found` };
        return { expense: data };
      }

      if (action === 'create') {
        const { user_id, expense_date, description: desc, amount_cents, vat_cents, currency, category, vendor, account_code, is_representation, attendees, receipt_url, receipt_data } = args as any;
        if (!user_id) throw new Error('user_id is required');
        if (is_representation && (!attendees || attendees.length === 0)) {
          throw new Error('Representation expenses require attendees [{name, company}]');
        }
        const { data, error } = await supabase.from('expenses')
          .insert({
            user_id,
            expense_date: expense_date || new Date().toISOString().split('T')[0],
            description: desc || '',
            amount_cents: amount_cents || 0,
            vat_cents: vat_cents || 0,
            currency: currency || 'SEK',
            category: category || 'other',
            vendor: vendor || null,
            account_code: account_code || null,
            is_representation: is_representation || false,
            attendees: attendees || null,
            receipt_url: receipt_url || null,
            receipt_analyzed: !!receipt_data,
            receipt_data: receipt_data || null,
          })
          .select('id')
          .single();
        if (error) throw new Error(`Create expense failed: ${error.message}`);
        return { created: true, expense_id: data.id };
      }

      if (action === 'update') {
        const { expense_id, ...updates } = args as any;
        if (!expense_id) throw new Error('expense_id is required');
        delete updates.action;
        if (updates.is_representation && (!updates.attendees || updates.attendees.length === 0)) {
          throw new Error('Representation expenses require attendees');
        }
        updates.updated_at = new Date().toISOString();
        const { error } = await supabase.from('expenses').update(updates).eq('id', expense_id);
        if (error) throw new Error(`Update expense failed: ${error.message}`);
        return { updated: true, expense_id };
      }

      if (action === 'delete') {
        const { expense_id } = args as any;
        if (!expense_id) throw new Error('expense_id is required');
        const { error } = await supabase.from('expenses').delete().eq('id', expense_id).eq('status', 'draft');
        if (error) throw new Error(`Delete expense failed: ${error.message}`);
        return { deleted: true, expense_id };
      }

      if (action === 'submit_report') {
        // Submit a monthly expense report — group expenses and change status
        const { user_id, period } = args as any;
        if (!user_id || !period) throw new Error('user_id and period (YYYY-MM) required');

        // Find or create report
        const { data: existing } = await supabase.from('expense_reports')
          .select('id, status').eq('user_id', user_id).eq('period', period).maybeSingle();

        if (existing && existing.status !== 'draft') {
          return { error: `Report for ${period} already ${existing.status}` };
        }

        // Sum expenses for this period
        const [y, m] = period.split('-');
        const nextMonth = String(Number(m) + 1).padStart(2, '0');
        const { data: expenses } = await supabase.from('expenses')
          .select('id, amount_cents')
          .eq('user_id', user_id)
          .eq('status', 'draft')
          .gte('expense_date', `${y}-${m}-01`)
          .lt('expense_date', `${y}-${nextMonth}-01`);

        if (!expenses || expenses.length === 0) {
          return { error: `No draft expenses found for ${period}` };
        }

        const totalCents = expenses.reduce((s: number, e: any) => s + (e.amount_cents || 0), 0);
        const expenseIds = expenses.map((e: any) => e.id);

        let reportId: string;
        if (existing) {
          reportId = existing.id;
          await supabase.from('expense_reports')
            .update({ total_cents: totalCents, status: 'submitted', submitted_at: new Date().toISOString() })
            .eq('id', reportId);
        } else {
          const { data: report, error: rErr } = await supabase.from('expense_reports')
            .insert({ user_id, period, total_cents: totalCents, status: 'submitted', submitted_at: new Date().toISOString() })
            .select('id').single();
          if (rErr) throw new Error(`Create report failed: ${rErr.message}`);
          reportId = report.id;
        }

        // Link expenses to report and mark as submitted
        await supabase.from('expenses')
          .update({ report_id: reportId, status: 'submitted' })
          .in('id', expenseIds);

        return { submitted: true, report_id: reportId, period, expense_count: expenseIds.length, total_cents: totalCents };
      }

      if (action === 'approve_report') {
        const { report_id, approved_by } = args as any;
        if (!report_id) throw new Error('report_id required');
        const { error } = await supabase.from('expense_reports')
          .update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: approved_by || null })
          .eq('id', report_id).eq('status', 'submitted');
        if (error) throw new Error(`Approve report failed: ${error.message}`);
        // Also approve all linked expenses
        await supabase.from('expenses').update({ status: 'approved' }).eq('report_id', report_id);
        return { approved: true, report_id };
      }

      if (action === 'book_report') {
        // FlowPilot books approved report as a journal entry
        const { report_id } = args as any;
        if (!report_id) throw new Error('report_id required');

        const { data: report, error: rErr } = await supabase.from('expense_reports')
          .select('*').eq('id', report_id).eq('status', 'approved').single();
        if (rErr || !report) throw new Error('Report not found or not approved');

        // Get all expenses in this report
        const { data: expenses } = await supabase.from('expenses')
          .select('*').eq('report_id', report_id).eq('status', 'approved');

        if (!expenses || expenses.length === 0) throw new Error('No approved expenses in report');

        // Group by account_code for journal entry lines
        const accountMap = new Map<string, { debit: number; credit: number; name: string }>();
        let totalNet = 0;
        let totalVat = 0;

        for (const exp of expenses) {
          const code = exp.account_code || '6992'; // Default: Övriga diverse kostnader
          const net = (exp.amount_cents || 0) - (exp.vat_cents || 0);
          const vat = exp.vat_cents || 0;
          totalNet += net;
          totalVat += vat;

          if (!accountMap.has(code)) accountMap.set(code, { debit: 0, credit: 0, name: exp.vendor || 'Expense' });
          accountMap.get(code)!.debit += net;
        }

        // Build journal entry lines
        const lines: any[] = [];
        for (const [code, amounts] of accountMap) {
          lines.push({
            account_code: code,
            account_name: amounts.name,
            debit_cents: amounts.debit,
            credit_cents: 0,
          });
        }
        if (totalVat > 0) {
          lines.push({ account_code: '2640', account_name: 'Ingående moms', debit_cents: totalVat, credit_cents: 0 });
        }
        // Credit: employee reimbursement account
        lines.push({ account_code: '2820', account_name: 'Kortfristiga skulder till anställda', debit_cents: 0, credit_cents: totalNet + totalVat });

        // Create journal entry
        const { data: entry, error: jeErr } = await supabase.from('journal_entries')
          .insert({
            entry_date: new Date().toISOString().split('T')[0],
            description: `Expense report ${report.period}`,
            reference_number: `EXP-${report.period}`,
            status: 'posted',
            source: 'flowpilot',
          })
          .select('id').single();
        if (jeErr) throw new Error(`Create journal entry failed: ${jeErr.message}`);

        const { error: lErr } = await supabase.from('journal_entry_lines')
          .insert(lines.map(l => ({ ...l, journal_entry_id: entry.id })));
        if (lErr) throw new Error(`Create journal lines failed: ${lErr.message}`);

        // Mark report as booked
        await supabase.from('expense_reports')
          .update({ status: 'booked', journal_entry_id: entry.id })
          .eq('id', report_id);

        return { booked: true, report_id, journal_entry_id: entry.id, total_cents: totalNet + totalVat, line_count: lines.length };
      }

      if (action === 'list_reports') {
        const { user_id, status: reportStatus } = args as any;
        let query = supabase.from('expense_reports')
          .select('id, user_id, period, status, total_cents, currency, submitted_at, approved_at, journal_entry_id, created_at')
          .order('period', { ascending: false });
        if (user_id) query = query.eq('user_id', user_id);
        if (reportStatus) query = query.eq('status', reportStatus);
        const { data, error } = await query.limit(50);
        if (error) throw new Error(`List reports failed: ${error.message}`);
        return { reports: data, count: (data || []).length };
      }

      throw new Error(`Unknown expenses action: ${action}`);
    }

    // ─── Purchasing: Vendors ─────────────────────────────────────────────
    case 'vendors': {
      const { action = 'list' } = args as any;

      if (action === 'list') {
        const { search, is_active, limit = 50 } = args as any;
        let query = supabase.from('vendors')
          .select('id, name, email, phone, payment_terms, currency, is_active, created_at')
          .order('name').limit(limit);
        if (is_active !== undefined) query = query.eq('is_active', is_active);
        if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
        const { data, error } = await query;
        if (error) throw new Error(`List vendors failed: ${error.message}`);
        return { vendors: data || [], count: (data || []).length };
      }

      if (action === 'create') {
        const { name, email, phone, payment_terms, currency, address, notes } = args as any;
        if (!name) throw new Error('name is required');
        const { data, error } = await supabase.from('vendors')
          .insert({ name, email, phone, payment_terms: payment_terms || 'net30', currency: currency || 'SEK', address, notes })
          .select('id, name').single();
        if (error) throw new Error(`Create vendor failed: ${error.message}`);
        // Fire webhook
        try { await fetch(`${supabaseUrl}/functions/v1/send-webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` }, body: JSON.stringify({ event: 'vendor.created', data: { id: data.id, name: data.name, email } }) }); } catch {}
        return { vendor_id: data.id, name: data.name, created: true };
      }

      if (action === 'update') {
        const { vendor_id, ...updateData } = args as any;
        if (!vendor_id) throw new Error('vendor_id is required');
        delete updateData.action;
        const { error } = await supabase.from('vendors')
          .update({ ...updateData, updated_at: new Date().toISOString() })
          .eq('id', vendor_id);
        if (error) throw new Error(`Update vendor failed: ${error.message}`);
        return { vendor_id, updated: true };
      }

      if (action === 'deactivate') {
        const { vendor_id } = args as any;
        if (!vendor_id) throw new Error('vendor_id is required');
        const { error } = await supabase.from('vendors')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', vendor_id);
        if (error) throw new Error(`Deactivate vendor failed: ${error.message}`);
        return { vendor_id, deactivated: true };
      }

      return { error: `Unknown vendors action: ${action}` };
    }

    // ─── Purchasing: Purchase Orders (general CRUD) ─────────────────────
    case 'purchase_orders': {
      const { action = 'list' } = args as any;

      // ── CREATE ──
      if (action === 'create' || skillName === 'create_purchase_order') {
        const { vendor_id, order_date, expected_delivery, notes, lines: poLines } = args as any;
        if (!vendor_id || !poLines?.length) throw new Error('vendor_id and lines are required');

        let subtotalCents = 0;
        let taxCents = 0;
        for (const line of poLines) {
          const lineSubtotal = (line.quantity || 1) * (line.unit_price_cents || 0);
          const lineTax = Math.round(lineSubtotal * ((line.tax_rate || 25) / 100));
          subtotalCents += lineSubtotal;
          taxCents += lineTax;
        }

        const { data: po, error: poError } = await supabase.from('purchase_orders')
          .insert({
            vendor_id,
            order_date: order_date || new Date().toISOString().split('T')[0],
            expected_delivery: expected_delivery || null,
            notes: notes || null,
            subtotal_cents: subtotalCents,
            tax_cents: taxCents,
            total_cents: subtotalCents + taxCents,
            status: 'draft',
          }).select('id, po_number, status, total_cents').single();
        if (poError) throw new Error(`Create PO failed: ${poError.message}`);

        const lineInserts = poLines.map((l: any, i: number) => ({
          purchase_order_id: po.id,
          product_id: l.product_id || null,
          description: l.description || `Line ${i + 1}`,
          quantity: l.quantity || 1,
          unit_price_cents: l.unit_price_cents || 0,
          tax_rate: l.tax_rate ?? 25,
          line_total_cents: (l.quantity || 1) * (l.unit_price_cents || 0),
        }));
        const { error: linesErr } = await supabase.from('purchase_order_lines').insert(lineInserts);
        if (linesErr) throw new Error(`Insert PO lines failed: ${linesErr.message}`);

        try {
          const { data: vendorInfo } = await supabase.from('vendors').select('name').eq('id', vendor_id).single();
          await fetch(`${supabaseUrl}/functions/v1/send-webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` }, body: JSON.stringify({ event: 'purchase_order.created', data: { id: po.id, po_number: po.po_number, vendor_name: vendorInfo?.name, total_cents: po.total_cents, currency: 'SEK' } }) });
        } catch {}

        return { purchase_order_id: po.id, po_number: po.po_number, status: po.status, total_cents: po.total_cents, lines_count: poLines.length };
      }

      // ── UPDATE (status, expected_delivery, notes — general purpose) ──
      if (action === 'update') {
        const { purchase_order_id, status, expected_delivery, notes: poNotes } = args as any;
        if (!purchase_order_id) throw new Error('purchase_order_id is required');

        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (status) updates.status = status;
        if (expected_delivery !== undefined) updates.expected_delivery = expected_delivery || null;
        if (poNotes !== undefined) updates.notes = poNotes;

        const { error: updErr } = await supabase.from('purchase_orders')
          .update(updates).eq('id', purchase_order_id);
        if (updErr) throw new Error(`Update PO failed: ${updErr.message}`);

        // If transitioning to 'sent', attempt email via Composio
        let emailSent = false;
        if (status === 'sent') {
          const { data: po } = await supabase.from('purchase_orders')
            .select('id, po_number, total_cents, currency, notes, order_date, expected_delivery, vendor_id, vendors(name, email)')
            .eq('id', purchase_order_id).single();

          const vendorEmail = (po as any)?.vendors?.email;
          const vendorName = (po as any)?.vendors?.name;

          if (vendorEmail) {
            try {
              const composioKey = Deno.env.get('COMPOSIO_API_KEY');
              if (composioKey) {
                const { data: lines } = await supabase.from('purchase_order_lines')
                  .select('description, quantity, unit_price_cents, line_total_cents')
                  .eq('purchase_order_id', purchase_order_id);

                const lineItems = (lines || []).map((l: any) =>
                  `• ${l.description}: ${l.quantity}x @ ${(l.unit_price_cents / 100).toFixed(2)} ${po.currency} = ${(l.line_total_cents / 100).toFixed(2)} ${po.currency}`
                ).join('\n');

                const emailBody = [
                  `Purchase Order: ${po.po_number}`, `Date: ${po.order_date}`,
                  po.expected_delivery ? `Expected Delivery: ${po.expected_delivery}` : '',
                  '', 'Items:', lineItems, '',
                  `Total: ${(po.total_cents / 100).toFixed(2)} ${po.currency}`,
                  po.notes ? `\nNotes: ${po.notes}` : '',
                ].filter(Boolean).join('\n');

                const emailRes = await fetch(`${supabaseUrl}/functions/v1/composio-proxy`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
                  body: JSON.stringify({ action: 'gmail_send', params: { to: vendorEmail, subject: `Purchase Order ${po.po_number}`, body: emailBody } }),
                });
                const emailData = await emailRes.json();
                emailSent = emailRes.ok && !emailData.error;
              }
            } catch (emailErr) {
              console.warn('[agent-execute] PO email send error (non-fatal):', emailErr);
            }
          }

          try {
            await fetch(`${supabaseUrl}/functions/v1/send-webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` }, body: JSON.stringify({ event: 'purchase_order.sent', data: { id: purchase_order_id, po_number: po?.po_number, vendor_name: vendorName, email_sent: emailSent } }) });
          } catch {}
        }

        const { data: updated } = await supabase.from('purchase_orders')
          .select('id, po_number, status, total_cents, expected_delivery, notes').eq('id', purchase_order_id).single();

        return { ...updated, email_sent: emailSent, message: `PO ${updated?.po_number} updated successfully.` };
      }

      // ── LIST / GET ──
      if (action === 'get') {
        const { purchase_order_id } = args as any;
        if (!purchase_order_id) throw new Error('purchase_order_id required');
        const { data: po, error } = await supabase.from('purchase_orders')
          .select('*, vendors(name, email), purchase_order_lines(*)').eq('id', purchase_order_id).single();
        if (error) throw new Error(`Get PO failed: ${error.message}`);
        return po;
      }

      // Default: list
      const { status: poStatus, vendor_id, limit = 50 } = args as any;
      let query = supabase.from('purchase_orders')
        .select('id, po_number, status, total_cents, currency, order_date, expected_delivery, created_at, vendors(name)')
        .order('created_at', { ascending: false }).limit(limit);
      if (poStatus) query = query.eq('status', poStatus);
      if (vendor_id) query = query.eq('vendor_id', vendor_id);
      const { data, error } = await query;
      if (error) throw new Error(`List POs failed: ${error.message}`);
      return { purchase_orders: data || [], count: (data || []).length };
    }

    // ─── Purchasing: Goods Receipts ──────────────────────────────────────
    case 'goods_receipts': {
      const { purchase_order_id, receipt_date, notes, lines: receiptLines } = args as any;
      if (!purchase_order_id || !receiptLines?.length) throw new Error('purchase_order_id and lines required');

      // Create goods receipt
      const { data: gr, error: grErr } = await supabase.from('goods_receipts')
        .insert({
          purchase_order_id,
          receipt_date: receipt_date || new Date().toISOString().split('T')[0],
          notes: notes || null,
        }).select('id').single();
      if (grErr) throw new Error(`Create goods receipt failed: ${grErr.message}`);

      // Insert receipt lines, update PO line received quantities, and sync inventory
      for (const rl of receiptLines) {
        await supabase.from('goods_receipt_lines').insert({
          goods_receipt_id: gr.id,
          purchase_order_line_id: rl.po_line_id,
          quantity_received: rl.quantity_received,
        });

        // Update received_quantity on the PO line
        const { data: poLine } = await supabase.from('purchase_order_lines')
          .select('received_quantity, product_id').eq('id', rl.po_line_id).single();
        const newReceived = (poLine?.received_quantity || 0) + rl.quantity_received;
        await supabase.from('purchase_order_lines')
          .update({ received_quantity: newReceived })
          .eq('id', rl.po_line_id);

        // Auto-sync inventory: create stock move + update product_stock
        const productId = rl.product_id || poLine?.product_id;
        if (productId && rl.quantity_received > 0) {
          const { data: stockRow } = await supabase.from('product_stock')
            .select('id, quantity_on_hand').eq('product_id', productId).maybeSingle();
          if (stockRow) {
            await supabase.from('stock_moves').insert({
              product_id: productId,
              quantity: rl.quantity_received,
              move_type: 'in',
              reference_type: 'goods_receipt',
              reference_id: gr.id,
              notes: `Goods receipt – ${rl.quantity_received} units received`,
            });
            await supabase.from('product_stock')
              .update({ quantity_on_hand: stockRow.quantity_on_hand + rl.quantity_received })
              .eq('product_id', productId);
          }
        }
      }

      // Update PO status based on line fulfillment
      const { data: allLines } = await supabase.from('purchase_order_lines')
        .select('quantity, received_quantity')
        .eq('purchase_order_id', purchase_order_id);

      const allReceived = (allLines || []).every((l: any) => l.received_quantity >= l.quantity);
      const someReceived = (allLines || []).some((l: any) => l.received_quantity > 0);
      const newStatus = allReceived ? 'received' : someReceived ? 'partially_received' : undefined;
      if (newStatus) {
        await supabase.from('purchase_orders')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', purchase_order_id);
      }

      // Fire webhook
      try {
        const { data: poInfo } = await supabase.from('purchase_orders').select('po_number').eq('id', purchase_order_id).single();
        await fetch(`${supabaseUrl}/functions/v1/send-webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` }, body: JSON.stringify({ event: 'goods_receipt.created', data: { id: gr.id, purchase_order_id, po_number: poInfo?.po_number, lines_received: receiptLines.length, fully_received: allReceived } }) });
        if (allReceived) {
          await fetch(`${supabaseUrl}/functions/v1/send-webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` }, body: JSON.stringify({ event: 'purchase_order.received', data: { id: purchase_order_id, po_number: poInfo?.po_number, fully_received: true } }) });
        }
      } catch {}

      return {
        goods_receipt_id: gr.id,
        purchase_order_id,
        po_status: newStatus || 'confirmed',
        lines_received: receiptLines.length,
        fully_received: allReceived,
      };
    }

    // ─── Purchasing: Reorder Check + Auto-PO (via products table) ──────
    case 'products': {
      if (skillName === 'purchase_reorder_check') {
        const { threshold_override, auto_create = false } = args as any;

        // 1. Fetch products with stock info
        const { data: stockRows, error: stockErr } = await supabase.from('product_stock')
          .select('product_id, quantity_on_hand, reorder_point, reorder_quantity, auto_reorder');
        if (stockErr) throw new Error(`Stock check failed: ${stockErr.message}`);

        const { data: products, error: prodErr } = await supabase.from('products')
          .select('id, name, price_cents')
          .eq('track_inventory', true)
          .eq('is_active', true);
        if (prodErr) throw new Error(`Product fetch failed: ${prodErr.message}`);

        const stockMap = new Map((stockRows || []).map((s: any) => [s.product_id, s]));
        const lowStock: any[] = [];

        for (const p of (products || [])) {
          const stock = stockMap.get(p.id);
          if (!stock) continue;
          const threshold = threshold_override ?? stock.reorder_point ?? 5;
          if (stock.quantity_on_hand <= threshold) {
            lowStock.push({
              product_id: p.id,
              product_name: p.name,
              current_stock: stock.quantity_on_hand,
              reorder_point: threshold,
              reorder_quantity: stock.reorder_quantity || Math.max(threshold * 3, 10),
              auto_reorder: stock.auto_reorder || false,
            });
          }
        }

        if (lowStock.length === 0) {
          return { low_stock_items: [], count: 0, pos_created: 0, message: 'All stock levels are healthy.' };
        }

        // 2. Auto-create POs for items with auto_reorder enabled (or if auto_create forced)
        const itemsToOrder = lowStock.filter((i: any) => auto_create || i.auto_reorder);
        const createdPOs: any[] = [];

        if (itemsToOrder.length > 0) {
          // Find preferred vendors for these products
          const productIds = itemsToOrder.map((i: any) => i.product_id);
          const { data: vendorProducts } = await supabase.from('vendor_products')
            .select('product_id, vendor_id, unit_price_cents, lead_time_days')
            .in('product_id', productIds)
            .eq('is_preferred', true);

          const vendorMap = new Map((vendorProducts || []).map((vp: any) => [vp.product_id, vp]));

          // Group items by vendor
          const byVendor = new Map<string, any[]>();
          const noVendor: any[] = [];

          for (const item of itemsToOrder) {
            const vp = vendorMap.get(item.product_id);
            if (vp) {
              const key = vp.vendor_id;
              if (!byVendor.has(key)) byVendor.set(key, []);
              byVendor.get(key)!.push({ ...item, unit_price_cents: vp.unit_price_cents, lead_time_days: vp.lead_time_days });
            } else {
              noVendor.push(item);
            }
          }

          // Create one PO per vendor
          for (const [vendorId, items] of byVendor) {
            const maxLead = Math.max(...items.map((i: any) => i.lead_time_days || 7));
            const expectedDelivery = new Date();
            expectedDelivery.setDate(expectedDelivery.getDate() + maxLead);

            const lines = items.map((i: any) => ({
              product_id: i.product_id,
              description: i.product_name,
              quantity: i.reorder_quantity,
              unit_price_cents: i.unit_price_cents,
              tax_rate: 0.25,
              total_cents: i.unit_price_cents * i.reorder_quantity,
            }));

            const subtotal = lines.reduce((s: number, l: any) => s + l.total_cents, 0);
            const taxCents = Math.round(subtotal * 0.25);

            const { data: po, error: poErr } = await supabase.from('purchase_orders').insert({
              vendor_id: vendorId,
              status: 'draft',
              order_date: new Date().toISOString().split('T')[0],
              expected_delivery: expectedDelivery.toISOString().split('T')[0],
              subtotal_cents: subtotal,
              tax_cents: taxCents,
              total_cents: subtotal + taxCents,
              currency: 'SEK',
              notes: 'Auto-generated by FlowPilot reorder check',
            }).select('id, po_number').single();

            if (poErr) {
              console.error('PO creation failed:', poErr);
              continue;
            }

            // Insert PO lines
            for (const line of lines) {
              await supabase.from('purchase_order_lines').insert({
                purchase_order_id: po.id,
                ...line,
              });
            }

            createdPOs.push({
              po_id: po.id,
              po_number: po.po_number,
              vendor_id: vendorId,
              items_count: items.length,
              total_cents: subtotal + taxCents,
            });
          }
        }

        return {
          low_stock_items: lowStock,
          count: lowStock.length,
          pos_created: createdPOs.length,
          created_purchase_orders: createdPOs,
          items_without_vendor: lowStock.filter((i: any) => 
            itemsToOrder.includes(i) && !createdPOs.some((po: any) => 
              po.vendor_id // simplified check
            )
          ).length,
          message: createdPOs.length > 0
            ? `${lowStock.length} low-stock item(s) found. ${createdPOs.length} purchase order(s) auto-created as drafts.`
            : `${lowStock.length} product(s) below reorder threshold. Set auto_reorder=true or assign preferred vendors to enable auto-PO creation.`,
        };
      }

      // Fallthrough: generic products table not handled here
      return { error: `Unknown products skill in purchasing context: ${skillName}` };
    }

    default:
      // ─── Generic CRUD engine for any db:tablename handler ─────────────
      // Handles list, get, create, update, delete for tables that don't
      // have a dedicated handler above. This enables all modules (HR,
      // Projects, Contracts, etc.) to work via MCP/Chat/Automations
      // without writing per-table code.
      return await executeGenericCrud(supabase, table, skillName, args);
  }
}

// =============================================================================
// Generic CRUD engine — universal handler for any db:tablename skill
// =============================================================================

/**
 * Allowed tables for generic CRUD. Any table NOT in this set will be rejected
 * to prevent arbitrary table access. Add new module tables here as needed.
 */
const GENERIC_CRUD_TABLES = new Set([
  'employees', 'leave_requests', 'projects', 'project_tasks',
  'time_entries', 'contracts', 'contract_documents',
  'expenses', 'documents', 'invoices', 'invoice_lines',
  'vendors', 'purchase_orders', 'purchase_order_lines',
  'consultant_profiles', 'ad_campaigns', 'ad_creatives',
  'chart_of_accounts', 'journal_entries', 'journal_entry_lines',
  'accounting_templates', 'opening_balances',
  'tickets', 'webinars', 'webinar_registrations',
  'booking_services', 'booking_availability', 'bookings',
  'content_proposals', 'content_research',
  'agent_memory', 'agent_activity',
]);

/**
 * Tables with business logic that MUST go through dedicated skills.
 * Generic CRUD is blocked for these — callers get a redirect message.
 * Principle: One API, one flow. No backdoors.
 */
const DEDICATED_SKILL_TABLES: Record<string, string> = {
  orders: 'Use skill "place_order" to create orders (handles order_items + stock). Use "manage_orders" to list/get/fulfill.',
  order_items: 'Order items are created automatically by "place_order". Do not insert directly.',
  products: 'Use "manage_product" for product operations.',
  product_stock: 'Stock is managed automatically via order and purchase flows. Use "manage_inventory" to check levels.',
  stock_moves: 'Stock moves are created automatically by order and purchase triggers. Read-only via "manage_inventory".',
  leads: 'Use "manage_leads" for lead operations.',
};

async function executeGenericCrud(
  supabase: any,
  table: string,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  // Block tables that have dedicated business-logic skills
  if (DEDICATED_SKILL_TABLES[table]) {
    return { 
      error: `Table '${table}' has dedicated business logic and cannot be accessed via generic CRUD.`,
      hint: DEDICATED_SKILL_TABLES[table],
    };
  }

  // Security gate: only whitelisted tables
  if (!GENERIC_CRUD_TABLES.has(table)) {
    return { error: `Unknown db table: ${table}. Generic CRUD is not enabled for this table.` };
  }

  const { action = 'list', id, ...fields } = args as any;

  try {
    switch (action) {
      case 'list': {
        const { limit = 50, offset = 0, order_by = 'created_at', ascending = false, filters, ...rest } = fields;
        let query = supabase.from(table).select('*')
          .order(order_by, { ascending })
          .range(offset, offset + limit - 1);

        // Apply simple equality filters: { status: 'active', department: 'IT' }
        if (filters && typeof filters === 'object') {
          for (const [col, val] of Object.entries(filters)) {
            query = query.eq(col, val);
          }
        }

        const { data, error } = await query;
        if (error) throw new Error(`List ${table} failed: ${error.message}`);
        return { items: data || [], count: (data || []).length, table };
      }

      case 'get': {
        if (!id) return { error: 'id is required for get action' };
        const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
        if (error) throw new Error(`Get ${table} failed: ${error.message}`);
        return { item: data, table };
      }

      case 'create': {
        const { limit: _l, offset: _o, order_by: _ob, ascending: _a, filters: _f, ...insertData } = fields;
        const { data, error } = await supabase.from(table).insert(insertData).select().single();
        if (error) throw new Error(`Create ${table} failed: ${error.message}`);
        return { created: true, item: data, table };
      }

      case 'update': {
        if (!id) return { error: 'id is required for update action' };
        const { limit: _l, offset: _o, order_by: _ob, ascending: _a, filters: _f, ...updateData } = fields;
        updateData.updated_at = new Date().toISOString();
        const { data, error } = await supabase.from(table).update(updateData).eq('id', id).select().single();
        if (error) {
          // If updated_at doesn't exist on the table, retry without it
          if (error.message?.includes('updated_at')) {
            delete updateData.updated_at;
            const { data: d2, error: e2 } = await supabase.from(table).update(updateData).eq('id', id).select().single();
            if (e2) throw new Error(`Update ${table} failed: ${e2.message}`);
            return { updated: true, item: d2, table };
          }
          throw new Error(`Update ${table} failed: ${error.message}`);
        }
        return { updated: true, item: data, table };
      }

      case 'delete': {
        if (!id) return { error: 'id is required for delete action' };
        const { error } = await supabase.from(table).delete().eq('id', id);
        if (error) throw new Error(`Delete ${table} failed: ${error.message}`);
        return { deleted: true, id, table };
      }

      default:
        return { error: `Unknown action '${action}' for table ${table}. Supported: list, get, create, update, delete.` };
    }
  } catch (err: any) {
    return { error: `Generic CRUD error on ${table}: ${err.message}` };
  }
}

// =============================================================================
// Analytics skill handlers (SEO audit, KB gap analysis)
// =============================================================================

async function executeAnalyticsAction(
  supabase: any,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (skillName) {
    case 'seo_audit_page': {
      const { slug } = args as any;

      // If no slug provided, return a summary of all published pages for the agent to pick
      if (!slug) {
        const { data: pages } = await supabase.from('pages')
          .select('slug, title, status')
          .eq('status', 'published')
          .order('created_at', { ascending: false }).limit(20);
        const { data: posts } = await supabase.from('blog_posts')
          .select('slug, title, status')
          .eq('status', 'published')
          .order('created_at', { ascending: false }).limit(20);
        return {
          message: 'No slug provided. Here are published pages and posts to audit:',
          pages: (pages || []).map((p: any) => p.slug),
          posts: (posts || []).map((p: any) => p.slug),
        };
      }

      // Fetch page or blog post
      let page: any = null;
      const { data: pageData } = await supabase.from('pages')
        .select('id, title, slug, meta_json, content_json, status')
        .eq('slug', slug).maybeSingle();
      
      if (pageData) {
        page = { ...pageData, type: 'page' };
      } else {
        const { data: postData } = await supabase.from('blog_posts')
          .select('id, title, slug, meta_json, content_json, excerpt, featured_image, featured_image_alt, status')
          .eq('slug', slug).maybeSingle();
        if (postData) page = { ...postData, type: 'blog_post' };
      }

      if (!page) return { error: `No page or blog post found with slug '${slug}'` };

      const meta = (page.meta_json || {}) as Record<string, any>;
      const blocks = (page.content_json || []) as any[];
      const issues: string[] = [];
      const suggestions: string[] = [];
      let score = 100;

      // Title check
      if (!page.title || page.title.length < 10) {
        issues.push('Title is too short (< 10 chars)');
        score -= 15;
      } else if (page.title.length > 60) {
        issues.push(`Title is too long (${page.title.length} chars, recommended < 60)`);
        score -= 5;
      }

      // Meta description
      const metaDesc = meta.description || meta.metaDescription || '';
      if (!metaDesc) {
        issues.push('Missing meta description');
        score -= 20;
      } else if (metaDesc.length < 50) {
        issues.push(`Meta description too short (${metaDesc.length} chars, recommended 120-160)`);
        score -= 10;
      } else if (metaDesc.length > 160) {
        issues.push(`Meta description too long (${metaDesc.length} chars, recommended < 160)`);
        score -= 5;
      }

      // OG Image
      if (!meta.ogImage && !page.featured_image) {
        issues.push('Missing Open Graph / featured image');
        score -= 10;
      }

      // Alt text check
      if (page.type === 'blog_post' && page.featured_image && !page.featured_image_alt) {
        issues.push('Featured image missing alt text');
        score -= 5;
      }

      // Content depth — count text in CMS blocks (pages) and TipTap docs (blog posts)
      let wordCount = 0;
      let headingCount = 0;
      let imageCount = 0;
      let linkCount = 0;

      // Recursively walk any node tree (TipTap or CMS blocks)
      const walkNodes = (nodes: any[]) => {
        for (const node of nodes) {
          const nodeType = node.type || '';

          // Headings
          if (nodeType === 'heading' || node.level) headingCount++;

          // Images
          if (nodeType === 'image' || node.src) imageCount++;

          // Text leaf nodes (TipTap)
          if (nodeType === 'text' && typeof node.text === 'string') {
            wordCount += node.text.split(/\s+/).filter(Boolean).length;
            if (node.marks) {
              for (const mark of node.marks) {
                if (mark.type === 'link') linkCount++;
              }
            }
          }

          // CMS block data text fields
          const data = node.data || {};
          if (typeof data.text === 'string') {
            wordCount += data.text.split(/\s+/).filter(Boolean).length;
          }
          if (typeof data.content === 'string') {
            wordCount += data.content.split(/\s+/).filter(Boolean).length;
          }

          // Recurse into children/content arrays
          if (Array.isArray(node.content)) walkNodes(node.content);
          if (Array.isArray(node.children)) walkNodes(node.children);
        }
      };

      // content_json can be: array of CMS blocks (pages) or TipTap doc object (blog posts)
      const contentJson = page.content_json || blocks;
      if (Array.isArray(contentJson)) {
        walkNodes(contentJson);
      } else if (contentJson && typeof contentJson === 'object' && Array.isArray(contentJson.content)) {
        // TipTap doc: { type: "doc", content: [...] }
        walkNodes(contentJson.content);
      }

      if (wordCount < 300 && page.type === 'blog_post') {
        issues.push(`Content too thin (${wordCount} words, recommended 800+)`);
        score -= 15;
      } else if (wordCount < 100) {
        issues.push(`Very little content (${wordCount} words)`);
        score -= 10;
      }

      if (headingCount === 0 && wordCount > 200) {
        issues.push('No headings found — add H2/H3 structure');
        score -= 10;
      }

      if (imageCount === 0 && wordCount > 300) {
        suggestions.push('Consider adding images to improve engagement');
      }

      if (linkCount === 0 && page.type === 'blog_post') {
        suggestions.push('Add internal or external links for better SEO');
      }

      // Excerpt check (blog)
      if (page.type === 'blog_post' && !page.excerpt) {
        issues.push('Missing excerpt — important for search snippets');
        score -= 5;
      }

      // Status
      if (page.status !== 'published') {
        suggestions.push(`Page is currently '${page.status}' — publish to make it indexable`);
      }

      score = Math.max(0, Math.min(100, score));

      return {
        slug,
        type: page.type,
        title: page.title,
        seo_score: score,
        word_count: wordCount,
        heading_count: headingCount,
        image_count: imageCount,
        link_count: linkCount,
        issues,
        suggestions,
        meta_present: {
          title: !!page.title,
          description: !!metaDesc,
          og_image: !!(meta.ogImage || page.featured_image),
          alt_text: page.type === 'blog_post' ? !!page.featured_image_alt : null,
        },
      };
    }

    case 'kb_gap_analysis': {
      const { limit = 20 } = args as any;

      // 1. Get all chat messages from users (recent)
      const since = new Date();
      since.setDate(since.getDate() - 30);

      const { data: messages } = await supabase.from('chat_messages')
        .select('content, conversation_id, created_at')
        .eq('role', 'user')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(500);

      // 2. Get existing KB articles
      const { data: articles } = await supabase.from('kb_articles')
        .select('id, title, question, slug, views_count, helpful_count, not_helpful_count, needs_improvement')
        .eq('is_published', true);

      // 3. Get negative feedback
      const { data: negativeFeedback } = await supabase.from('chat_feedback')
        .select('user_question, ai_response, context_kb_articles')
        .eq('rating', 'negative')
        .gte('created_at', since.toISOString())
        .limit(100);

      const articleTitles = (articles || []).map((a: any) => a.title.toLowerCase());
      const articleQuestions = (articles || []).map((a: any) => a.question.toLowerCase());

      // 4. Extract unique user questions / topics
      const userQuestions = (messages || [])
        .map((m: any) => m.content.trim())
        .filter((q: any) => q.length > 10 && q.length < 500 && q.endsWith('?'));

      // 5. Find questions NOT covered by existing KB
      const uncoveredQuestions: string[] = [];
      for (const q of userQuestions) {
        const qLower = q.toLowerCase();
        const covered = articleTitles.some((t: string) => {
          const words = t.split(/\s+/).filter((w: string) => w.length > 3);
          const matching = words.filter((w: string) => qLower.includes(w));
          return matching.length >= Math.ceil(words.length * 0.5);
        }) || articleQuestions.some((aq: string) => {
          const words = aq.split(/\s+/).filter((w: string) => w.length > 3);
          const matching = words.filter((w: string) => qLower.includes(w));
          return matching.length >= Math.ceil(words.length * 0.5);
        });

        if (!covered && !uncoveredQuestions.some(uq => uq.toLowerCase() === qLower)) {
          uncoveredQuestions.push(q);
        }
      }

      // 6. Identify underperforming articles
      const underperforming = (articles || [])
        .filter((a: any) => (a.not_helpful_count || 0) > (a.helpful_count || 0) || a.needs_improvement)
        .map((a: any) => ({
          id: a.id,
          title: a.title,
          slug: a.slug,
          helpful: a.helpful_count || 0,
          not_helpful: a.not_helpful_count || 0,
          needs_improvement: a.needs_improvement,
        }));

      // 7. Negative feedback themes
      const negativeThemes = (negativeFeedback || []).map((f: any) => ({
        question: f.user_question,
        had_kb_context: (f.context_kb_articles || []).length > 0,
      }));

      return {
        period_days: 30,
        total_user_questions: userQuestions.length,
        total_kb_articles: (articles || []).length,
        uncovered_questions: uncoveredQuestions.slice(0, limit),
        uncovered_count: uncoveredQuestions.length,
        underperforming_articles: underperforming,
        negative_feedback_count: negativeThemes.length,
        negative_without_kb: negativeThemes.filter((n: any) => !n.had_kb_context).length,
        suggestions: [
          uncoveredQuestions.length > 5 ? `${uncoveredQuestions.length} user questions have no matching KB article — consider creating articles for the most common ones.` : null,
          underperforming.length > 0 ? `${underperforming.length} articles have more negative than positive feedback — review and improve them.` : null,
          negativeThemes.filter((n: any) => !n.had_kb_context).length > 0 ? `${negativeThemes.filter((n: any) => !n.had_kb_context).length} negative feedbacks had no KB context — the chat couldn't find relevant articles.` : null,
        ].filter(Boolean),
      };
    }

    case 'analyze_chat_feedback': {
      const { action = 'summary', period = 'month', limit = 50 } = args as any;
      const since = new Date();
      if (period === 'week') since.setDate(since.getDate() - 7);
      else if (period === 'month') since.setMonth(since.getMonth() - 1);
      else if (period === 'quarter') since.setMonth(since.getMonth() - 3);

      const { data: feedback } = await supabase.from('chat_feedback')
        .select('id, rating, user_question, ai_response, context_kb_articles, created_at')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(action === 'negative_only' ? limit : 500);

      const allFeedback = feedback || [];
      const positive = allFeedback.filter((f: any) => f.rating === 'positive');
      const negative = allFeedback.filter((f: any) => f.rating === 'negative');

      if (action === 'negative_only') {
        return {
          negative_feedback: negative.slice(0, limit).map((f: any) => ({
            question: f.user_question,
            response_preview: (f.ai_response || '').substring(0, 200),
            had_kb_context: (f.context_kb_articles || []).length > 0,
            date: f.created_at,
          })),
          count: negative.length,
        };
      }

      return {
        period,
        total: allFeedback.length,
        positive: positive.length,
        negative: negative.length,
        satisfaction_rate: allFeedback.length > 0
          ? Math.round((positive.length / allFeedback.length) * 100) : null,
        negative_without_kb: negative.filter((f: any) => !(f.context_kb_articles || []).length).length,
        top_negative_questions: negative.slice(0, 10).map((f: any) => f.user_question).filter(Boolean),
      };
    }

    default:
      return { error: `Unknown analytics skill: ${skillName}` };
  }
}


async function executeWebhook(
  supabase: any,
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
// OpenResponses — direct LLM calls to OpenClaw via POST /v1/responses
// Uses same peer credentials (url + outbound_token) from a2a_peers.
// This is the "boss → worker" channel for structured task delegation.
// =============================================================================

async function executeOpenResponsesRequest(
  peerName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const { prompt, message, system, response_format, model, timeout_ms, fire_and_forget, inject_mcp_credentials, peer_name, ...rest } = args as {
    prompt?: string; message?: string; system?: string;
    response_format?: string; model?: string; timeout_ms?: number;
    fire_and_forget?: boolean; inject_mcp_credentials?: boolean;
    peer_name?: string;
    [key: string]: unknown;
  };

  // Build the prompt from either explicit prompt, message, or remaining args
  const effectivePrompt = prompt || message || (Object.keys(rest).length > 0 ? JSON.stringify(rest) : 'status');

  // Use peer_name from args if provided (dispatch_claw_mission passes it), otherwise from handler
  const effectivePeerName = peer_name || peerName;

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/openclaw-responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        peer_name: effectivePeerName,
        prompt: effectivePrompt,
        system,
        response_format,
        model,
        timeout_ms,
        fire_and_forget: fire_and_forget ?? false,
        inject_mcp_credentials: inject_mcp_credentials ?? false,
      }),
    });

    if (response.status === 503 || response.status === 502) {
      const body = await response.json().catch(() => ({}));
      return {
        status: 'peer_unavailable',
        peer: effectivePeerName,
        message: `Peer '${effectivePeerName}' is currently unreachable via OpenResponses.`,
        detail: (body as any)?.error || 'No response',
      };
    }

    return await response.json();
  } catch (err: any) {
    return {
      status: 'peer_unavailable',
      peer: effectivePeerName,
      message: `OpenResponses call to '${effectivePeerName}' failed: ${err.message}`,
    };
  }
}

// =============================================================================
// A2A Federation — outbound requests to peer agents
// =============================================================================

async function executeA2ARequest(
  _supabase: any,
  peerName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  // Delegate to the dedicated a2a-outbound edge function
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const { skill, message, ...skillArgs } = args as { skill?: string; message?: string; [key: string]: unknown };

  // Allow either structured skill call OR raw message for natural language delegation
  if (!skill && !message) {
    // Auto-construct a message from the remaining args if neither is provided
    const fallbackMessage = Object.keys(skillArgs).length > 0
      ? JSON.stringify(skillArgs)
      : 'ping';
    return executeA2AOutbound(supabaseUrl, serviceKey, peerName, 'message', {}, fallbackMessage);
  }

  if (skill && skill !== 'message') {
    return executeA2AOutbound(supabaseUrl, serviceKey, peerName, skill, skillArgs, undefined);
  } else {
    // Text message — always send as rawMessage so it reaches the peer as plain text
    const textContent = message || (skillArgs as any)?.message || JSON.stringify(skillArgs);
    return executeA2AOutbound(supabaseUrl, serviceKey, peerName, 'message', {}, textContent);
  }
}

async function executeA2AOutbound(
  supabaseUrl: string,
  serviceKey: string,
  peerName: string,
  skill: string,
  skillArgs: Record<string, unknown>,
  rawMessage?: string,
): Promise<unknown> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/a2a-outbound`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        peer_name: peerName,
        skill,
        arguments: skillArgs,
        ...(rawMessage ? { message: rawMessage } : {}),
      }),
    });

    // Distinguish between "peer is down" and actual errors
    if (response.status === 502 || response.status === 503) {
      const body = await response.json().catch(() => ({}));
      return {
        status: 'peer_unavailable',
        peer: peerName,
        message: `Peer '${peerName}' is currently unreachable. This is not a system error — the peer may be offline or restarting. Try again later.`,
        detail: (body as any)?.error || 'No response from peer',
      };
    }

    if (response.status === 404) {
      return {
        status: 'peer_not_found',
        peer: peerName,
        message: `Peer '${peerName}' not found or not active in federation registry.`,
      };
    }

    return await response.json();
  } catch (err: any) {
    // Network-level failures (DNS, timeout) = peer unavailable, not a system bug
    return {
      status: 'peer_unavailable',
      peer: peerName,
      message: `Peer '${peerName}' is currently unreachable (${err.message}). This is expected if the peer is offline.`,
    };
  }
}

// =============================================================================
// Activity logging
// =============================================================================

async function logActivity(
  supabase: any,
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
  // Content & Pages
  write_blog_post: ['blog', 'content', 'publish', 'article'],
  manage_blog_posts: ['blog', 'content', 'publish', 'article', 'post'],
  manage_blog_categories: ['blog', 'category', 'tag', 'content'],
  browse_blog: ['blog', 'content'],
  manage_page: ['page', 'content', 'website', 'publish', 'landing'],
  manage_page_blocks: ['page', 'block', 'content', 'website', 'design', 'layout'],
  manage_global_blocks: ['header', 'footer', 'navigation', 'branding', 'global'],
  manage_kb_article: ['knowledge', 'support', 'faq', 'article', 'kb', 'help'],
  // Communication
  send_newsletter: ['newsletter', 'email', 'subscriber', 'engagement'],
  execute_newsletter_send: ['newsletter', 'email', 'campaign', 'engagement'],
  manage_newsletter_subscribers: ['newsletter', 'subscriber', 'email', 'list'],
  manage_webinar: ['webinar', 'event', 'presentation', 'training'],
  // CRM & Sales
  add_lead: ['lead', 'crm', 'sales', 'pipeline'],
  manage_leads: ['lead', 'crm', 'sales', 'pipeline', 'score'],
  qualify_lead: ['lead', 'qualify', 'score', 'crm', 'sales'],
  enrich_company: ['company', 'enrich', 'crm', 'data'],
  manage_company: ['company', 'crm', 'account', 'client'],
  manage_deal: ['deal', 'pipeline', 'sales', 'revenue', 'negotiation'],
  prospect_research: ['prospect', 'research', 'sales', 'lead'],
  prospect_fit_analysis: ['prospect', 'fit', 'sales', 'pipeline'],
  // Commerce
  browse_products: ['product', 'commerce', 'shop', 'catalog'],
  manage_product: ['product', 'commerce', 'pricing', 'catalog', 'shop'],
  manage_inventory: ['inventory', 'stock', 'product', 'commerce'],
  manage_orders: ['order', 'commerce', 'revenue', 'fulfillment'],
  manage_form_submissions: ['form', 'submission', 'lead', 'feedback'],
  // Booking
  book_appointment: ['booking', 'appointment', 'calendar'],
  check_availability: ['booking', 'availability', 'calendar'],
  browse_services: ['booking', 'service', 'catalog'],
  manage_booking_availability: ['booking', 'availability', 'schedule'],
  manage_bookings: ['booking', 'appointment', 'calendar', 'schedule'],
  // Analytics & Research
  analyze_analytics: ['analytics', 'traffic', 'performance', 'growth'],
  analyze_chat_feedback: ['chat', 'feedback', 'satisfaction', 'support'],
  weekly_business_digest: ['digest', 'report', 'overview'],
  search_web: ['research', 'content'],
  research_content: ['content', 'research', 'blog', 'topic'],
  generate_content_proposal: ['content', 'proposal', 'blog', 'newsletter', 'social'],
  publish_scheduled_content: ['publish', 'schedule', 'content', 'page'],
  scan_gmail_inbox: ['email', 'inbox', 'signal', 'lead'],
  learn_from_data: ['learn', 'insight', 'analytics', 'performance'],
  seo_audit_page: ['seo', 'content', 'page', 'traffic', 'search', 'performance'],
  kb_gap_analysis: ['knowledge', 'support', 'chat', 'content', 'article', 'kb'],
  // Resume & Talent
  manage_consultant_profile: ['resume', 'consultant', 'profile', 'talent'],
  match_consultant: ['resume', 'consultant', 'match', 'talent', 'recruitment'],
  // Media & System
  media_browse: ['media', 'image', 'file', 'storage', 'cleanup'],
  manage_site_settings: ['settings', 'config', 'module', 'system'],
  manage_automations: ['automation', 'cron', 'trigger', 'workflow'],
  // Utilities
  extract_pdf_text: ['pdf', 'document', 'extract', 'content', 'resume', 'report', 'contract'],
  competitor_monitor: ['competitor', 'market', 'positioning', 'content', 'intelligence'],
  generate_social_post: ['social', 'linkedin', 'content', 'authority', 'engagement', 'repurpose'],
};

async function trackObjectiveProgress(
  supabase: any,
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
