/**
 * CMS Domain Pack — FlowWink-specific context for FlowPilot
 * 
 * This module contains all CMS/FlowWink-specific logic that was extracted
 * from the generic Pilot core. It provides:
 * - CMS schema awareness (data counts, modules, integrations)
 * - Cross-module insights (deals, leads, bookings, page views)
 * - Site maturity detection (fresh site vs established)
 * - Day 1 Playbook for fresh installations
 */

import type { SiteMaturity } from '../types.ts';
import { BLOCK_TYPES_SCHEMA } from '../block-schema.ts';

// ─── CMS Schema Awareness ─────────────────────────────────────────────────────

export async function loadCMSSchema(supabase: any): Promise<string> {
  try {
    const [modulesRes, countsRes] = await Promise.all([
      supabase.from('site_settings').select('key, value').in('key', ['modules', 'integrations', 'system_ai']),
      Promise.all([
        supabase.from('pages').select('id', { count: 'exact', head: true }),
        supabase.from('blog_posts').select('id', { count: 'exact', head: true }),
        supabase.from('leads').select('id', { count: 'exact', head: true }),
        supabase.from('products').select('id', { count: 'exact', head: true }),
        supabase.from('bookings').select('id', { count: 'exact', head: true }),
        supabase.from('newsletter_subscribers').select('id', { count: 'exact', head: true }).eq('status', 'confirmed'),
        supabase.from('kb_articles').select('id', { count: 'exact', head: true }),
        supabase.from('agent_skills').select('id', { count: 'exact', head: true }).eq('enabled', true),
      ]),
    ]);

    const settings = modulesRes.data || [];
    const modules = settings.find((s: any) => s.key === 'modules')?.value || {};

    const [pages, posts, leads, products, bookings, subscribers, kbArticles, skills] = countsRes;

    const enabledModules = Object.entries(modules)
      .filter(([, v]: [string, any]) => v?.enabled)
      .map(([k]) => k);

    const activeIntegrations: string[] = [];
    if (Deno.env.get('STRIPE_SECRET_KEY')) activeIntegrations.push('Stripe');
    if (Deno.env.get('RESEND_API_KEY')) activeIntegrations.push('Resend');
    if (Deno.env.get('FIRECRAWL_API_KEY')) activeIntegrations.push('Firecrawl');
    if (Deno.env.get('UNSPLASH_ACCESS_KEY')) activeIntegrations.push('Unsplash');
    if (Deno.env.get('OPENAI_API_KEY')) activeIntegrations.push('OpenAI');
    if (Deno.env.get('GEMINI_API_KEY')) activeIntegrations.push('Gemini');

    return `\n\nCMS SCHEMA AWARENESS:
Enabled modules: ${enabledModules.length > 0 ? enabledModules.join(', ') : 'none configured'}
Active integrations: ${activeIntegrations.length > 0 ? activeIntegrations.join(', ') : 'none'}
Data counts: ${pages.count ?? 0} pages, ${posts.count ?? 0} blog posts, ${leads.count ?? 0} leads, ${products.count ?? 0} products, ${bookings.count ?? 0} bookings, ${subscribers.count ?? 0} subscribers, ${kbArticles.count ?? 0} KB articles, ${skills.count ?? 0} active skills

BLOCK TYPE REFERENCE (use EXACT field names when creating blocks):
${BLOCK_TYPES_SCHEMA}

CRITICAL — TipTap JSON format for rich text fields (type "tiptap"):
Fields marked "tiptap" MUST use this JSON structure, NEVER raw HTML strings:
{ "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Your text here" }] }] }
For headings: { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "Heading" }] }
For bullet lists: { "type": "bulletList", "content": [{ "type": "listItem", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Item" }] }] }] }

COMPLEX BLOCK EXAMPLES (use exact structure):

features — icon is REQUIRED on every item, use PascalCase Lucide names:
{ "type": "features", "data": { "title": "Why choose us", "features": [{ "id": "f1", "icon": "ShieldCheck", "title": "Secure", "description": "Enterprise-grade security" }, { "id": "f2", "icon": "Zap", "title": "Fast", "description": "Sub-second response times" }, { "id": "f3", "icon": "Globe", "title": "Global", "description": "Available worldwide" }], "columns": "3", "variant": "cards" } }

tabs — content field inside each tab MUST be Tiptap JSON, never a string:
{ "type": "tabs", "data": { "title": "How it works", "tabs": [{ "id": "tab-1", "title": "Setup", "icon": "Settings", "content": { "type": "doc", "content": [{ "type": "heading", "attrs": { "level": 3 }, "content": [{ "type": "text", "text": "Get started in minutes" }] }, { "type": "paragraph", "content": [{ "type": "text", "text": "Connect your account and configure your preferences." }] }] } }, { "id": "tab-2", "title": "Monitor", "icon": "Activity", "content": { "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Track everything in real time from your dashboard." }] }] } }], "variant": "underline", "defaultTab": "tab-1" } }

accordion — answer field MUST be Tiptap JSON, never a string:
{ "type": "accordion", "data": { "title": "FAQ", "items": [{ "question": "How does it work?", "answer": { "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Our platform connects to your existing systems and provides real-time insights." }] }] } }, { "question": "What does it cost?", "answer": { "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Plans start from €49/month. No setup fee." }] }] } }] } }

bento-grid — span controls card size: "normal" (1×1), "wide" (2×1), "tall" (1×2), "large" (2×2):
{ "type": "bento-grid", "data": { "title": "Everything you need", "items": [{ "id": "b1", "title": "Real-time monitoring", "description": "Track all sensors live from one dashboard", "icon": "Activity", "span": "wide" }, { "id": "b2", "title": "Smart alerts", "description": "Instant notifications", "icon": "Bell", "span": "normal" }, { "id": "b3", "title": "Analytics", "description": "Deep insights into your data", "icon": "BarChart3", "span": "normal" }, { "id": "b4", "title": "API access", "description": "Connect any system", "icon": "Plug", "span": "large" }], "columns": 3, "variant": "default" } }

two-column — content MUST be Tiptap JSON:
{ "type": "two-column", "data": { "content": { "type": "doc", "content": [{ "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "About us" }] }, { "type": "paragraph", "content": [{ "type": "text", "text": "We help businesses grow with smart technology and data." }] }] }, "imageSrc": "https://example.com/image.jpg", "imageAlt": "Team at work", "imagePosition": "right" } }`;
  } catch (err) {
    console.error('[cms-schema] Failed to load:', err);
    return '';
  }
}

// ─── Cross-Module Insights ────────────────────────────────────────────────────

export async function loadCrossModuleInsights(supabase: any): Promise<string> {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  try {
    const [
      dealsByStage, hotLeads, recentBookings,
      topPages, newsletterPerf, formSubs, recentOutcomes,
    ] = await Promise.all([
      supabase.from('deals').select('stage, value_cents, currency')
        .in('stage', ['proposal', 'negotiation', 'qualification']),
      supabase.from('leads').select('name, email, score, status, updated_at')
        .gte('score', 30).eq('status', 'lead').order('score', { ascending: false }).limit(5),
      supabase.from('bookings').select('status, start_time, customer_name')
        .gte('start_time', new Date().toISOString()).order('start_time').limit(10),
      supabase.from('page_views').select('page_slug, page_title')
        .gte('created_at', weekAgo.toISOString()).limit(500),
      supabase.from('newsletter_email_opens').select('id', { count: 'exact', head: true })
        .gte('created_at', weekAgo.toISOString()),
      supabase.from('form_submissions').select('form_name, created_at')
        .gte('created_at', weekAgo.toISOString()).order('created_at', { ascending: false }).limit(10),
      supabase.from('agent_activity').select('skill_name, outcome_status, outcome_data')
        .not('outcome_status', 'is', null).gte('created_at', weekAgo.toISOString())
        .order('created_at', { ascending: false }).limit(20),
    ]);

    const parts: string[] = ['\n\nCROSS-MODULE INSIGHTS (7 days):'];

    if (dealsByStage.data?.length) {
      const pipeline: Record<string, { count: number; value: number }> = {};
      for (const d of dealsByStage.data) {
        if (!pipeline[d.stage]) pipeline[d.stage] = { count: 0, value: 0 };
        pipeline[d.stage].count++;
        pipeline[d.stage].value += d.value_cents;
      }
      parts.push('📊 CRM Pipeline:');
      for (const [stage, info] of Object.entries(pipeline)) {
        parts.push(`  - ${stage}: ${info.count} deals (${(info.value / 100).toFixed(0)} total value)`);
      }
    }

    if (hotLeads.data?.length) {
      parts.push(`🔥 Hot leads (score≥30): ${hotLeads.data.map((l: any) => `${l.name || l.email} (${l.score}pts)`).join(', ')}`);
    }

    if (recentBookings.data?.length) {
      const upcoming = recentBookings.data.filter((b: any) => b.status === 'confirmed');
      parts.push(`📅 Upcoming bookings: ${upcoming.length} confirmed`);
    }

    if (topPages.data?.length) {
      const pageCounts: Record<string, number> = {};
      for (const pv of topPages.data) {
        pageCounts[pv.page_slug] = (pageCounts[pv.page_slug] || 0) + 1;
      }
      const sorted = Object.entries(pageCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
      if (sorted.length) {
        parts.push(`📈 Top pages: ${sorted.map(([slug, count]) => `${slug} (${count})`).join(', ')}`);
      }
    }

    parts.push(`📧 Newsletter opens (7d): ${newsletterPerf.count ?? 0}`);

    if (formSubs.data?.length) {
      parts.push(`📝 Form submissions (7d): ${formSubs.data.length}`);
    }

    if (recentOutcomes.data?.length) {
      const outcomes: Record<string, number> = {};
      const skillPerf: Record<string, { total: number; good: number }> = {};
      for (const o of recentOutcomes.data) {
        outcomes[o.outcome_status] = (outcomes[o.outcome_status] || 0) + 1;
        const sk = o.skill_name || 'unknown';
        if (!skillPerf[sk]) skillPerf[sk] = { total: 0, good: 0 };
        skillPerf[sk].total++;
        if (o.outcome_status === 'success' || o.outcome_status === 'partial') skillPerf[sk].good++;
      }
      parts.push(`🎯 Action outcomes: ${Object.entries(outcomes).map(([s, c]) => `${s}:${c}`).join(', ')}`);
      const perfEntries = Object.entries(skillPerf).filter(([, v]) => v.total >= 2);
      if (perfEntries.length) {
        const sorted = perfEntries.sort((a, b) => (b[1].good / b[1].total) - (a[1].good / a[1].total));
        const best = sorted.slice(0, 3).map(([name, v]) => `${name}(${Math.round(v.good / v.total * 100)}%)`);
        parts.push(`📊 Skill performance (7d): ${best.join(', ')}`);
        const worst = sorted.filter(([, v]) => v.good / v.total < 0.5);
        if (worst.length) parts.push(`⚠️ Underperforming: ${worst.map(([n]) => n).join(', ')} — check learnings`);
      }
    }

    return parts.join('\n');
  } catch (err) {
    console.error('[cross-module] Failed to load insights:', err);
    return '';
  }
}

// ─── Site Maturity Detection ──────────────────────────────────────────────────

export async function detectSiteMaturity(supabase: any): Promise<SiteMaturity> {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [posts, leads, subscribers, views, research, proposals] = await Promise.all([
    supabase.from('blog_posts').select('id', { count: 'exact', head: true }).eq('status', 'published'),
    supabase.from('leads').select('id', { count: 'exact', head: true }),
    supabase.from('newsletter_subscribers').select('id', { count: 'exact', head: true }).eq('status', 'confirmed'),
    supabase.from('page_views').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo.toISOString()),
    supabase.from('content_research').select('id', { count: 'exact', head: true }),
    supabase.from('content_proposals').select('id', { count: 'exact', head: true }),
  ]);

  const blogPosts = posts.count ?? 0;
  const leadsCount = leads.count ?? 0;
  const subscribersCount = subscribers.count ?? 0;
  const pageViews = views.count ?? 0;
  const contentResearch = research.count ?? 0;
  const contentProposals = proposals.count ?? 0;

  const isFresh = blogPosts <= 2 && leadsCount === 0 && contentResearch === 0 && contentProposals === 0;

  return {
    isFresh,
    blogPosts,
    leads: leadsCount,
    subscribers: subscribersCount,
    pageViews,
    contentResearch,
    contentProposals,
  };
}

// ─── Day 1 Playbook (Fresh CMS Sites) ────────────────────────────────────────

export const CMS_DAY_1_PLAYBOOK = `
🚀 FRESH SITE DETECTED — DAY 1 PLAYBOOK ACTIVE
This site was just installed. There is almost no content, no leads, no research. Your job is to PRODUCE TANGIBLE OUTPUT that demonstrates value immediately. Do NOT just plan — EXECUTE.

PRIORITY ORDER (complete each before moving to next):

1. RESEARCH & INTELLIGENCE (use available web search/scrape skills)
   - Read and understand ALL published pages to learn what this company does
   - Use search_web to research the company's industry, competitors, and market trends
   - Use memory_write to save key findings: ICP definition, competitor list, industry trends
   - Store a structured company profile in memory with key 'company_research'

2. SEO AUDIT (use seo_audit_page skill if available)
   - Audit every published page for SEO issues
   - Fix meta titles and descriptions where possible
   - Save findings to memory with key 'seo_audit_results'

3. CONTENT CAMPAIGN (use blog_write, content proposal skills)
   - Based on research, identify 3-5 blog topics that would attract the company's ICP
   - Write at least 1 full blog post draft (status: draft, ready for human review)
   - Create content proposals for remaining topics
   - Save content strategy to memory with key 'content_strategy'

4. SALES PROSPECTING (use search_web + memory_write)
   - Based on ICP, research 5-10 companies that match the ideal customer profile
   - For each: company name, website, industry, why they're a good fit
   - Save prospect list to memory with key 'prospect_pipeline'
   - Create leads for the most promising prospects if add_lead skill is available

EXECUTION RULES:
- Spend 60% of token budget on research + content, 20% on SEO, 20% on prospecting
- ALWAYS save results to memory — this persists between heartbeats
- If a step fails, log it and move on. Don't get stuck in loops.
- Write REAL content, not placeholders. Quality matters for the showcase.
- After completing tasks, update objective progress with specific deliverables
- Flag the heartbeat state with day1_completed: true when done
`;

// ─── CMS Domain Pack (aggregate export) ──────────────────────────────────────

export const cmsDomainPack = {
  loadSchema: loadCMSSchema,
  loadInsights: loadCrossModuleInsights,
  detectMaturity: detectSiteMaturity,
  freshSitePlaybook: CMS_DAY_1_PLAYBOOK,
};
