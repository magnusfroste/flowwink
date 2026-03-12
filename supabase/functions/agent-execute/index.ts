import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
  orders: 'orders',
  objectives: 'analytics',
  products: 'products',
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
      const { title, topic, tone = 'professional', language = 'en', content } = args as any;
      const slug = (title as string).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      // Build Tiptap content_json from provided content or generate via AI
      let tiptapDoc: any = { type: 'doc', content: [{ type: 'paragraph' }] };
      let excerpt = `Blog post about: ${topic}`;
      let markdownContent = content as string | undefined;

      // If no content provided, generate it with Gemini
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
            const finishReason = genData.candidates?.[0]?.finishReason;
            if (finishReason === 'MAX_TOKENS') {
              console.warn('[write_blog_post] Content truncated by token limit');
            }
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
                model: 'gpt-4o-mini',
                max_tokens: 4096,
                messages: [
                  { role: 'system', content: `You are a blog writer. Tone: ${tone}. Language: ${language}.` },
                  { role: 'user', content: `Write a blog post about "${topic}" titled "${title}". 600-1200 words. Use markdown with ## headings. Do NOT include the title. Output ONLY markdown.` }
                ],
              }),
            });
            const genData = await genResp.json();
            if (genData.choices?.[0]?.finish_reason === 'length') {
              console.warn('[write_blog_post] Content truncated by token limit');
            }
            markdownContent = genData.choices?.[0]?.message?.content || '';
          } catch (e) {
            console.error('[write_blog_post] OpenAI generation failed:', e);
          }
        }
      }

      // Convert markdown to Tiptap JSON
      if (markdownContent && markdownContent.trim()) {
        tiptapDoc = markdownToTiptap(markdownContent);
        // Generate excerpt from first ~160 chars of plain text
        const plainText = markdownContent.replace(/[#*_\[\]()>`-]/g, '').replace(/\n+/g, ' ').trim();
        excerpt = plainText.substring(0, 160) + (plainText.length > 160 ? '...' : '');
      }

      const { data, error } = await supabase.from('blog_posts').insert({
        title, slug, status: 'draft',
        excerpt,
        content_json: tiptapDoc,
        meta_json: { tone, language, generated_by: 'flowpilot', topic },
      }).select().single();
      if (error) throw new Error(`Blog insert failed: ${error.message}`);
      return { blog_post_id: data.id, slug: data.slug, title: data.title, status: 'draft', has_content: !!markdownContent };
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
        const { data, error } = await supabase.from('consultant_profiles')
          .update(profileData).eq('id', profile_id).select('id, name').single();
        if (error) throw new Error(`Update failed: ${error.message}`);
        return { profile_id: data.id, status: 'updated' };
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
      .select('id, title, slug, question, category, is_published, is_featured, views_count, helpful_count, not_helpful_count, created_at, updated_at')
      .order('updated_at', { ascending: false }).limit(50);
    if (category) query = query.eq('category', category);
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
    const { title, question, answer, category = 'general', include_in_chat = true, is_featured = false, content } = args as any;
    if (!title || !question) throw new Error('title and question are required');
    const articleSlug = title.toLowerCase().replace(/[^a-z0-9åäö]+/g, '-').replace(/(^-|-$)/g, '');

    // Convert markdown answer to Tiptap if needed
    let answerContent = answer;
    if (typeof answer === 'string' && !content) {
      answerContent = answer;
    }

    const { data, error } = await supabase.from('kb_articles').insert({
      title, question, answer: answerContent || '',
      slug: articleSlug, category,
      include_in_chat, is_featured,
      is_published: false,
      content_json: content || null,
    }).select('id, title, slug, category, is_published').single();
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
      .select('id, title, value_cents, currency, stage, lead_id, company_id, expected_close_date, created_at, updated_at')
      .order('updated_at', { ascending: false }).limit(50);
    if (stage) query = query.eq('stage', stage);
    if (lead_id) query = query.eq('lead_id', lead_id);
    const { data, error } = await query;
    if (error) throw new Error(`List deals failed: ${error.message}`);
    return { deals: data || [] };
  }

  if (action === 'create') {
    const { title, value_cents, currency = 'SEK', stage = 'proposal', lead_id, company_id, expected_close_date } = args as any;
    if (!title) throw new Error('title is required');
    const { data, error } = await supabase.from('deals').insert({
      title, value_cents, currency, stage, lead_id, company_id, expected_close_date,
    }).select('id, title, stage, value_cents').single();
    if (error) throw new Error(`Create deal failed: ${error.message}`);
    return { deal_id: data.id, title: data.title, stage: data.stage, value_cents: data.value_cents };
  }

  if (action === 'update') {
    const { deal_id, ...updateData } = args as any;
    if (!deal_id) throw new Error('deal_id is required');
    delete updateData.action;
    const { data, error } = await supabase.from('deals')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', deal_id).select('id, title, stage').single();
    if (error) throw new Error(`Update deal failed: ${error.message}`);
    return { deal_id: data.id, title: data.title, stage: data.stage, status: 'updated' };
  }

  if (action === 'move_stage') {
    const { deal_id, stage } = args as any;
    if (!deal_id || !stage) throw new Error('deal_id and stage required');
    const completed_at = ['closed_won', 'closed_lost'].includes(stage) ? new Date().toISOString() : null;
    const { data, error } = await supabase.from('deals')
      .update({ stage, completed_at, updated_at: new Date().toISOString() })
      .eq('id', deal_id).select('id, title, stage').single();
    if (error) throw new Error(`Move stage failed: ${error.message}`);
    return { deal_id: data.id, title: data.title, new_stage: data.stage };
  }

  return { error: `Unknown deals action: ${action}` };
}

// =============================================================================
// Products module handlers
// =============================================================================

async function executeProductsAction(
  supabase: SupabaseClient,
  _skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { action = 'list' } = args as any;

  if (action === 'list') {
    const { is_active } = args as any;
    let query = supabase.from('products')
      .select('id, name, slug, description, price_cents, currency, type, is_active, created_at')
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
      .select('id, name, domain, industry, size, city, country, created_at')
      .order('created_at', { ascending: false }).limit(50);
    if (error) throw new Error(`List companies failed: ${error.message}`);
    return { companies: data || [] };
  }

  if (action === 'create') {
    const { name, domain, industry, size, city, country, website, description } = args as any;
    if (!name) throw new Error('name is required');
    const { data, error } = await supabase.from('companies').insert({
      name, domain, industry, size, city, country, website, description,
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
    const { data, error } = await supabase.from('form_submissions')
      .select('id, form_name, data, page_slug, status, created_at')
      .order('created_at', { ascending: false }).limit(50);
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

  if (action === 'update_status') {
    const { submission_id, status } = args as any;
    if (!submission_id || !status) throw new Error('submission_id and status required');
    const { data, error } = await supabase.from('form_submissions')
      .update({ status }).eq('id', submission_id).select('id, status').single();
    if (error) throw new Error(`Update status failed: ${error.message}`);
    return { submission_id: data.id, status: data.status };
  }

  if (action === 'stats') {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const { data, error } = await supabase.from('form_submissions')
      .select('form_name, status, created_at')
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
  _skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { action = 'list' } = args as any;

  if (action === 'list') {
    const { data, error } = await supabase.from('webinars')
      .select('id, title, description, scheduled_at, platform, meeting_url, status, max_attendees, created_at')
      .order('scheduled_at', { ascending: false }).limit(50);
    if (error) throw new Error(`List webinars failed: ${error.message}`);
    return { webinars: data || [] };
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

async function executeDbAction(
  supabase: any,
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
      const uniqueSlugs = [...new Set(views.map((v: any) => v.page_slug))];
      const topPages = uniqueSlugs.map(slug => ({
        slug,
        title: views.find((v: any) => v.page_slug === slug)?.page_title || slug,
        views: views.filter((v: any) => v.page_slug === slug).length,
      })).sort((a, b) => b.views - a.views).slice(0, 10);

      return { period, total_views: totalViews, unique_pages: uniqueSlugs.length, top_pages: topPages };
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
      const negativeThemes = (negativeFeedback || []).map(f => ({
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
        negative_without_kb: negativeThemes.filter(n => !n.had_kb_context).length,
        suggestions: [
          uncoveredQuestions.length > 5 ? `${uncoveredQuestions.length} user questions have no matching KB article — consider creating articles for the most common ones.` : null,
          underperforming.length > 0 ? `${underperforming.length} articles have more negative than positive feedback — review and improve them.` : null,
          negativeThemes.filter(n => !n.had_kb_context).length > 0 ? `${negativeThemes.filter(n => !n.had_kb_context).length} negative feedbacks had no KB context — the chat couldn't find relevant articles.` : null,
        ].filter(Boolean),
      };
    }

    default:
      return { error: `Unknown analytics skill: ${skillName}` };
  }
}

    default:
      return { error: `Unknown table handler: ${table}` };
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
  manage_page: ['page', 'content', 'website', 'publish', 'landing'],
  manage_page_blocks: ['page', 'block', 'content', 'website', 'design', 'layout'],
  manage_global_blocks: ['header', 'footer', 'navigation', 'branding', 'global'],
  manage_kb_article: ['knowledge', 'support', 'faq', 'article', 'kb', 'help'],
  // Communication
  send_newsletter: ['newsletter', 'email', 'subscriber', 'engagement'],
  execute_newsletter_send: ['newsletter', 'email', 'campaign', 'engagement'],
  manage_webinar: ['webinar', 'event', 'presentation', 'training'],
  // CRM & Sales
  add_lead: ['lead', 'crm', 'sales', 'pipeline'],
  qualify_lead: ['lead', 'qualify', 'score', 'crm', 'sales'],
  enrich_company: ['company', 'enrich', 'crm', 'data'],
  manage_company: ['company', 'crm', 'account', 'client'],
  manage_deal: ['deal', 'pipeline', 'sales', 'revenue', 'negotiation'],
  prospect_research: ['prospect', 'research', 'sales', 'lead'],
  prospect_fit_analysis: ['prospect', 'fit', 'sales', 'pipeline'],
  // Commerce
  manage_product: ['product', 'commerce', 'pricing', 'catalog', 'shop'],
  manage_form_submissions: ['form', 'submission', 'lead', 'feedback'],
  create_campaign: ['campaign', 'marketing', 'engagement'],
  book_appointment: ['booking', 'appointment', 'calendar'],
  // Analytics & Research
  analyze_analytics: ['analytics', 'traffic', 'performance', 'growth'],
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
