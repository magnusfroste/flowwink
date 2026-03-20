import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    const { skill_id, skill_name, arguments: args, agent_type, conversation_id, objective_context } = body;

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
      // Auto-activate module if not enabled
      await autoActivateModule(supabase, moduleName);
      result = await executeModuleAction(supabase, moduleName, skill.name, args);

    } else if (handler.startsWith('db:')) {
      // Direct DB operation
      const table = handler.replace('db:', '');
      result = await executeDbAction(supabase, table, skill.name, args);

    } else if (handler.startsWith('webhook:')) {
      // External webhook (N8N etc)
      result = await executeWebhook(supabase, args);

    } else if (handler.startsWith('a2a:')) {
      // A2A Federation — route to peer agent
      const peerName = handler.replace('a2a:', '');
      result = await executeA2ARequest(supabase, peerName, args);

    } else {
      result = { error: `Unknown handler type: ${handler}` };
    }

    // 5. Log activity (with objective context if provided)
    const activityInput = objective_context
      ? { ...args, _objective_context: objective_context }
      : args;
    const activityId = await logActivity(supabase, {
      agent: agent_type, skill_id: skill.id, skill_name: skill.name,
      input: activityInput, output: result as Record<string, unknown>,
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
      // add_lead — original handler
      const { email, name, source = 'chat', phone } = args as any;
      const { data, error } = await supabase.from('leads').insert({
        email, name, source, phone,
      }).select().single();
      if (error) throw new Error(`Lead insert failed: ${error.message}`);
      return { lead_id: data.id, email: data.email, status: data.status };
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

    default:
      return { error: `Unknown module: ${moduleName}` };
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
  switch (skillName) {
    case 'manage_page': {
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
        const { data, error } = await query.is('deleted_at', null).single();
        if (error) throw new Error(`Get page failed: ${error.message}`);
        const blockSummary = (data.content_json as any[] || []).map((b: any, i: number) => ({
          index: i, id: b.id, type: b.type, hidden: b.hidden || false,
        }));
        return { ...data, block_count: blockSummary.length, block_summary: blockSummary };
      }

      if (action === 'create') {
        if (!title) throw new Error('title is required');
        const pageSlug = slug || title.toLowerCase().replace(/[^a-z0-9åäö]+/g, '-').replace(/(^-|-$)/g, '');
        const { data, error } = await supabase.from('pages').insert({
          title,
          slug: pageSlug,
          status: 'draft',
          content_json: blocks || [],
          meta_json: meta || {},
        }).select('id, title, slug, status').single();
        if (error) throw new Error(`Create page failed: ${error.message}`);
        return { page_id: data.id, slug: data.slug, title: data.title, status: 'draft' };
      }

      if (action === 'update' && page_id) {
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (title !== undefined) updates.title = title;
        if (slug !== undefined) updates.slug = slug;
        if (meta !== undefined) updates.meta_json = meta;
        if (blocks !== undefined) updates.content_json = blocks;
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

      return { error: `Unknown page action: ${action}` };
    }

    case 'manage_page_blocks': {
      const { action = 'list', page_id } = args as any;
      if (!page_id) throw new Error('page_id is required');

      // Fetch current page blocks
      const { data: page, error: fetchErr } = await supabase.from('pages')
        .select('id, content_json').eq('id', page_id).is('deleted_at', null).single();
      if (fetchErr || !page) throw new Error(`Page not found: ${page_id}`);

      const blocks = (page.content_json as any[]) || [];

      if (action === 'list') {
        return {
          page_id,
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
        const newBlock = {
          id: crypto.randomUUID(),
          type: block_type,
          data: block_data,
          spacing: {},
          animation: { type: 'fade-up' },
        };
        const pos = position !== undefined ? Math.min(position, blocks.length) : blocks.length;
        blocks.splice(pos, 0, newBlock);
        await supabase.from('pages')
          .update({ content_json: blocks, updated_at: new Date().toISOString() })
          .eq('id', page_id);
        return { page_id, block_id: newBlock.id, type: block_type, position: pos, total_blocks: blocks.length };
      }

      if (action === 'update') {
        const { block_id, block_data } = args as any;
        if (!block_id || !block_data) throw new Error('block_id and block_data required');
        const idx = blocks.findIndex((b: any) => b.id === block_id);
        if (idx === -1) throw new Error(`Block not found: ${block_id}`);
        blocks[idx] = { ...blocks[idx], data: { ...blocks[idx].data, ...block_data } };
        await supabase.from('pages')
          .update({ content_json: blocks, updated_at: new Date().toISOString() })
          .eq('id', page_id);
        return { page_id, block_id, type: blocks[idx].type, status: 'updated' };
      }

      if (action === 'remove') {
        const { block_id } = args as any;
        if (!block_id) throw new Error('block_id is required');
        const idx = blocks.findIndex((b: any) => b.id === block_id);
        if (idx === -1) throw new Error(`Block not found: ${block_id}`);
        const removed = blocks.splice(idx, 1)[0];
        await supabase.from('pages')
          .update({ content_json: blocks, updated_at: new Date().toISOString() })
          .eq('id', page_id);
        return { page_id, removed_block_id: removed.id, removed_type: removed.type, remaining_blocks: blocks.length };
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
          .eq('id', page_id);
        return { page_id, new_order: reordered.map((b: any) => b.id), total_blocks: reordered.length };
      }

      if (action === 'toggle_visibility') {
        const { block_id } = args as any;
        if (!block_id) throw new Error('block_id is required');
        const idx = blocks.findIndex((b: any) => b.id === block_id);
        if (idx === -1) throw new Error(`Block not found: ${block_id}`);
        blocks[idx].hidden = !blocks[idx].hidden;
        await supabase.from('pages')
          .update({ content_json: blocks, updated_at: new Date().toISOString() })
          .eq('id', page_id);
        return { page_id, block_id, hidden: blocks[idx].hidden };
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
          .eq('id', page_id);
        return { page_id, original_block_id: block_id, new_block_id: clone.id, position: idx + 1 };
      }

      return { error: `Unknown block action: ${action}` };
    }

    default:
      return { error: `Unknown pages skill: ${skillName}` };
  }
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
    if (!categoryId) throw new Error('No KB categories found — create a KB category first');

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
      .select('id, name, slug, description, price_cents, currency, type, image_url, stock_quantity, track_inventory')
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
      .select('id, name, slug, description, price_cents, currency, type, is_active, stock_quantity, track_inventory, created_at')
      .order('created_at', { ascending: false }).limit(50);
    if (is_active !== undefined) query = query.eq('is_active', is_active);
    const { data, error } = await query;
    if (error) throw new Error(`List products failed: ${error.message}`);
    return { products: data || [] };
  }

  if (action === 'create') {
    const { name, description, price_cents, currency = 'SEK', type = 'one_time', slug, image_url, stripe_price_id } = args as any;
    if (!name || price_cents === undefined) throw new Error('name and price_cents required');
    const productSlug = slug || name.toLowerCase().replace(/[^a-z0-9åäö]+/g, '-').replace(/(^-|-$)/g, '');
    const { data, error } = await supabase.from('products').insert({
      name, slug: productSlug, description, price_cents, currency, type,
      image_url, stripe_price_id, is_active: true,
    }).select('id, name, slug, price_cents').single();
    if (error) throw new Error(`Create product failed: ${error.message}`);
    return { product_id: data.id, name: data.name, slug: data.slug, price_cents: data.price_cents };
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
  const { title, topic, tone = 'professional', language = 'en', content } = args as any;
  const slug = (title as string).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  let tiptapDoc: any = { type: 'doc', content: [{ type: 'paragraph' }] };
  let excerpt = `Blog post about: ${topic}`;
  let markdownContent = content as string | undefined;

  if (!markdownContent) {
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (geminiKey) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
        const genPrompt = `Write a comprehensive blog post about: "${topic}"\nTitle: "${title}"\nTone: ${tone}\nLanguage: ${language}\n\nWrite 600-1200 words. Use markdown with ## headings, paragraphs, and bullet points where appropriate. Do NOT include the title as an H1 — start with the first section. Output ONLY the markdown content, no preamble.`;
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
              { role: 'user', content: `Write a blog post about "${topic}" titled "${title}". 600-1200 words. Use markdown with ## headings. Do NOT include the title. Output ONLY markdown.` }
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
      const imgPrompt = `Generate a professional, modern blog header image for an article titled "${title}" about "${topic}". The image should be visually striking, landscape oriented, suitable as a blog featured image. No text in the image.`;
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
    title, slug, status: 'draft', excerpt, content_json: tiptapDoc,
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

  // send_newsletter — create draft
  const { subject, content, schedule_at } = args as any;
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

  if (action === 'update' && post_id) {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title;
    if (excerpt !== undefined) updates.excerpt = excerpt;
    if (featured_image !== undefined) updates.featured_image = featured_image;
    const { data, error } = await supabase.from('blog_posts')
      .update(updates).eq('id', post_id).select('id, title, status').single();
    if (error) throw new Error(`Update post failed: ${error.message}`);
    return { post_id: data.id, status: 'updated' };
  }

  if (action === 'publish' && post_id) {
    const { data, error } = await supabase.from('blog_posts')
      .update({ status: 'published', published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', post_id).select('id, title, slug, status').single();
    if (error) throw new Error(`Publish failed: ${error.message}`);
    return { post_id: data.id, slug: data.slug, status: 'published' };
  }

  if (action === 'unpublish' && post_id) {
    const { data, error } = await supabase.from('blog_posts')
      .update({ status: 'draft', updated_at: new Date().toISOString() })
      .eq('id', post_id).select('id, title, status').single();
    if (error) throw new Error(`Unpublish failed: ${error.message}`);
    return { post_id: data.id, status: 'draft' };
  }

  if (action === 'delete' && post_id) {
    const { error } = await supabase.from('blog_posts').delete().eq('id', post_id);
    if (error) throw new Error(`Delete post failed: ${error.message}`);
    return { post_id, status: 'deleted' };
  }

  return { error: `Unknown blog posts action: ${action}` };
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

    default:
      return { error: `Unknown db table: ${table}` };
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
      if (!slug) throw new Error('slug is required');

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

      // Content depth — count text blocks
      let wordCount = 0;
      let headingCount = 0;
      let imageCount = 0;
      let linkCount = 0;

      const walkBlocks = (items: any[]) => {
        for (const block of items) {
          const data = block.data || block;
          const blockType = block.type || '';
          if (blockType === 'heading' || data.level) headingCount++;
          if (blockType === 'image' || data.src) imageCount++;
          
          // Count text
          const text = data.text || data.content || '';
          if (typeof text === 'string') {
            wordCount += text.split(/\s+/).filter(Boolean).length;
          }

          // Tiptap JSON
          if (block.content && Array.isArray(block.content)) {
            for (const node of block.content) {
              if (node.type === 'text' && node.text) {
                wordCount += node.text.split(/\s+/).filter(Boolean).length;
              }
              if (node.marks) {
                for (const mark of node.marks) {
                  if (mark.type === 'link') linkCount++;
                }
              }
            }
          }

          if (block.children) walkBlocks(block.children);
        }
      };

      if (Array.isArray(blocks)) walkBlocks(blocks);

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
// A2A Federation — outbound requests to peer agents
// =============================================================================

async function executeA2ARequest(
  supabase: any,
  peerName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  // Look up the peer by name
  const { data: peer, error: peerError } = await supabase
    .from('a2a_peers')
    .select('*')
    .ilike('name', peerName)
    .eq('status', 'active')
    .single();

  if (peerError || !peer) {
    return { error: `A2A peer '${peerName}' not found or not active` };
  }

  const { skill, ...skillArgs } = args as { skill: string; [key: string]: unknown };
  if (!skill) {
    return { error: 'Missing "skill" field in arguments — specify which skill to call on the peer' };
  }

  // Log outbound activity
  const { data: activityRow } = await supabase
    .from('a2a_activity')
    .insert({
      peer_id: peer.id,
      direction: 'outbound',
      skill_name: skill,
      input: skillArgs,
      status: 'pending',
    })
    .select('id')
    .single();

  const startTime = Date.now();

  try {
    // Determine peer endpoint and body format from capabilities
    const peerUrl = peer.url.replace(/\/$/, '');
    const caps = peer.capabilities as Record<string, unknown> || {};
    const endpoint = (caps.endpoint as string) || '/functions/v1/a2a-negotiate';
    const protocol = (caps.protocol as string) || 'a2a-negotiate';

    // Build request body based on peer's protocol
    let requestBody: Record<string, unknown>;
    if (protocol === 'a2a-negotiate') {
      // Standard A2A negotiate protocol: { type: "task", skill_id, input }
      requestBody = {
        type: 'task',
        skill_id: skill,
        input: skillArgs,
      };
    } else {
      // Legacy/FlowWink protocol
      requestBody = { skill, arguments: skillArgs };
    }

    const response = await fetch(`${peerUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${peer.outbound_token}`,
      },
      body: JSON.stringify(requestBody),
    });

    const result = await response.json();
    const durationMs = Date.now() - startTime;
    const status = response.ok ? 'success' : 'error';

    // Update activity log
    if (activityRow?.id) {
      await supabase.from('a2a_activity').update({
        output: result,
        status,
        duration_ms: durationMs,
        error_message: response.ok ? null : (result?.error || `HTTP ${response.status}`),
      }).eq('id', activityRow.id);
    }

    // Update peer stats
    await supabase.from('a2a_peers').update({
      last_seen_at: new Date().toISOString(),
      request_count: (peer.request_count || 0) + 1,
    }).eq('id', peer.id);

    return result;
  } catch (err: any) {
    const durationMs = Date.now() - startTime;

    if (activityRow?.id) {
      await supabase.from('a2a_activity').update({
        status: 'error',
        duration_ms: durationMs,
        error_message: err.message || 'Network error',
      }).eq('id', activityRow.id);
    }

    return { error: `Failed to reach peer '${peerName}': ${err.message}` };
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
    log_type?: string;
    log_message?: string;
  },
): Promise<string | null> {
  const logType = activity.log_type ?? deriveLogType(activity.status);
  const logMessage = activity.log_message ?? deriveLogMessage(activity.skill_name, activity.output, activity.error_message);

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
    log_type: logType,
    log_message: logMessage,
  }).select('id').single();

  if (error) console.error('Failed to log activity:', error);
  return data?.id || null;
}

function deriveLogType(status: string): string {
  if (status === 'failed') return 'error';
  if (status === 'pending_approval') return 'tool_call';
  return 'tool_result';
}

function deriveLogMessage(
  skillName: string,
  output: Record<string, unknown>,
  errorMessage?: string,
): string {
  // Prefer explicit message fields from the skill output
  const msg = output?.message ?? output?.summary ?? output?.description ?? output?.result;
  if (typeof msg === 'string' && msg.length > 0) return msg;

  // For errors, use the error message
  if (errorMessage) return errorMessage;

  // Fallback: readable skill name
  return skillName.replace(/_/g, ' ');
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
