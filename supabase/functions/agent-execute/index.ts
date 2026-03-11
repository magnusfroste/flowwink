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
      const uniqueSlugs = [...new Set(views.map(v => v.page_slug))];
      const topPages = uniqueSlugs.map(slug => ({
        slug,
        title: views.find(v => v.page_slug === slug)?.page_title || slug,
        views: views.filter(v => v.page_slug === slug).length,
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

      const articleTitles = (articles || []).map(a => a.title.toLowerCase());
      const articleQuestions = (articles || []).map(a => a.question.toLowerCase());

      // 4. Extract unique user questions / topics
      const userQuestions = (messages || [])
        .map(m => m.content.trim())
        .filter(q => q.length > 10 && q.length < 500 && q.endsWith('?'));

      // 5. Find questions NOT covered by existing KB
      const uncoveredQuestions: string[] = [];
      for (const q of userQuestions) {
        const qLower = q.toLowerCase();
        const covered = articleTitles.some(t => {
          const words = t.split(/\s+/).filter(w => w.length > 3);
          const matching = words.filter(w => qLower.includes(w));
          return matching.length >= Math.ceil(words.length * 0.5);
        }) || articleQuestions.some(aq => {
          const words = aq.split(/\s+/).filter(w => w.length > 3);
          const matching = words.filter(w => qLower.includes(w));
          return matching.length >= Math.ceil(words.length * 0.5);
        });

        if (!covered && !uncoveredQuestions.some(uq => uq.toLowerCase() === qLower)) {
          uncoveredQuestions.push(q);
        }
      }

      // 6. Identify underperforming articles
      const underperforming = (articles || [])
        .filter(a => (a.not_helpful_count || 0) > (a.helpful_count || 0) || a.needs_improvement)
        .map(a => ({
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
  write_blog_post: ['blog', 'content', 'publish', 'article'],
  create_page_block: ['page', 'content', 'website'],
  send_newsletter: ['newsletter', 'email', 'subscriber', 'engagement'],
  execute_newsletter_send: ['newsletter', 'email', 'campaign', 'engagement'],
  add_lead: ['lead', 'crm', 'sales', 'pipeline'],
  qualify_lead: ['lead', 'qualify', 'score', 'crm', 'sales'],
  enrich_company: ['company', 'enrich', 'crm', 'data'],
  prospect_research: ['prospect', 'research', 'sales', 'lead'],
  prospect_fit_analysis: ['prospect', 'fit', 'sales', 'pipeline'],
  create_campaign: ['campaign', 'marketing', 'engagement'],
  book_appointment: ['booking', 'appointment', 'calendar'],
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
  manage_consultant_profile: ['resume', 'consultant', 'profile', 'talent'],
  match_consultant: ['resume', 'consultant', 'match', 'talent', 'recruitment'],
  extract_pdf_text: ['pdf', 'document', 'extract', 'content', 'resume', 'report', 'contract'],
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
