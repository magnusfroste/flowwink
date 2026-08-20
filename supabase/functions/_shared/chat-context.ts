/**
 * Chat context builders shared by chat-completion (visitor chat) and any
 * future surface that needs the same KB/visitor-profile injection
 * (workspace-chat already uses its own builder; this one is tuned for
 * public-facing visitor chat with token budget caps).
 *
 * Two responsibilities:
 *   1. Walk Tiptap docs / page blocks and extract searchable plain text
 *   2. Build a token-budgeted KB string + returning-visitor profile string
 */

export function extractTextFromTiptap(content: any): string {
  if (!content) return '';
  if (typeof content === 'string') return content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (typeof content === 'object') {
    const texts: string[] = [];
    if (content.text) texts.push(content.text);
    if (content.content && Array.isArray(content.content)) {
      for (const node of content.content) {
        const t = extractTextFromTiptap(node);
        if (t) texts.push(t);
      }
    }
    return texts.join(' ').replace(/\s+/g, ' ').trim();
  }
  return '';
}

/**
 * Extract the human-readable text a block renders, for grounding and indexing.
 *
 * GENERIC walker, not a per-type switch: the old fixed list (text/hero/cta/
 * accordion/…) silently skipped every other type — features, bento-grid,
 * timeline, testimonials, pricing, tabs — so whole product definitions never
 * reached the knowledge index (found live 2026-08-19: /product's Edge/Network
 * Colocation lived in a features block and was invisible to retrieval and the
 * chat). A new block type must be indexable the day it ships, without anyone
 * remembering this file exists — so we collect by FIELD SHAPE instead:
 * known text-bearing keys, Tiptap docs wherever they sit, and one level of
 * object arrays (items/features/steps/tiers/chapters/…).
 */
const TEXT_KEYS = new Set([
  'title', 'subtitle', 'eyebrow', 'description', 'question', 'label', 'quote',
  'author', 'source', 'role', 'note', 'message', 'body', 'excerpt', 'name',
  'bio', 'text', 'heading', 'caption', 'alt', 'company', 'value', 'date',
  'expiredMessage', 'accentText', 'address', 'phone', 'email',
]);

function isTiptapDoc(v: any): boolean {
  return !!v && typeof v === 'object' && !Array.isArray(v) && v.type === 'doc';
}

function collectTexts(obj: Record<string, any>, out: string[], depth: number): void {
  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith('_')) continue;
    if (typeof val === 'string') {
      // urls/ids/icons/enums are short config strings on non-text keys; the
      // include-list keeps them out without a per-type registry.
      if (TEXT_KEYS.has(key) && val.trim()) out.push(val.trim());
    } else if (isTiptapDoc(val)) {
      const t = extractTextFromTiptap(val);
      if (t) out.push(t);
    } else if (Array.isArray(val) && depth > 0) {
      for (const item of val) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          collectTexts(item, out, depth - 1);
        } else if (typeof item === 'string' && item.trim() && TEXT_KEYS.has(key.replace(/s$/, ''))) {
          // string arrays on text-ish keys (e.g. pricing tier `features: string[]`)
          out.push(item.trim());
        }
      }
    }
  }
}

export function extractTextFromBlock(block: any): string {
  if (!block) return '';
  const data = block.data || block;
  if (!data || typeof data !== 'object') return '';
  const texts: string[] = [];
  collectTexts(data, texts, 2);
  return texts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Does this page-slug allowlist mean "every published page"?
 *
 * `includedPageSlugs` has always had a wildcard: the frontend context
 * indicator reads `['*']` as "all pages", and every template ships it that way
 * so a site's chat is grounded in its own content from the moment it is
 * installed — including pages created later.
 *
 * Both EDGE readers used to treat `'*'` as a literal slug. `.in('slug', ['*'])`
 * matches nothing and the chunk filter dropped every page chunk, so a chat
 * configured for "all pages" received exactly zero of them — and answered from
 * the model's imagination instead (found live on www.flowwink.com 2026-08-12:
 * asked to list the site's process pages, it invented seven that do not
 * exist). KB articles travel a different path, which is why the failure looked
 * like "KB works, pages don't" rather than an outage.
 *
 * An empty list keeps its historical meaning: unrestricted.
 */
export function allowsAllPages(slugs: string[] | null | undefined): boolean {
  return !slugs?.length || slugs.includes('*');
}

/**
 * Build a token-budgeted knowledge base string from published pages
 * (optionally filtered by slug) and KB articles flagged include_in_chat.
 */
export async function buildKnowledgeBase(
  supabase: any,
  maxTokens: number,
  includedSlugs: string[],
  includeKbArticles: boolean,
): Promise<string> {
  const sections: string[] = [];
  let estimatedTokens = 0;

  let query = supabase.from('pages').select('title, slug, content_json').eq('status', 'published');
  if (!allowsAllPages(includedSlugs)) query = query.in('slug', includedSlugs);
  const { data: pages } = await query;

  if (pages) {
    for (const page of pages) {
      const pageTexts: string[] = [];
      if (page.content_json && Array.isArray(page.content_json)) {
        for (const block of page.content_json) {
          const text = extractTextFromBlock(block);
          if (text) pageTexts.push(text);
        }
      }
      if (pageTexts.length > 0) {
        const pageContent = `### ${page.title} (/${page.slug})\n${pageTexts.join('\n')}`;
        const contentTokens = Math.ceil(pageContent.length / 4);
        if (estimatedTokens + contentTokens > maxTokens) break;
        sections.push(pageContent);
        estimatedTokens += contentTokens;
      }
    }
  }

  // Active products ground the chat — the catalog IS public web content
  // (name, description, family), so the same publication-is-the-decision rule
  // applies. price_cents is DELIBERATELY not selected: pricing sits behind the
  // boundaries line ("tas i samtal") and a context that never contains the
  // number cannot leak it. Soft-fail like the rest.
  try {
    const { data: products } = await supabase
      .from('products')
      .select('name, description, type')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .limit(30);
    if (products?.length) {
      const text = `### Services and products\n` + products
        .map((pr: any) => `- ${pr.name}${pr.type ? ` (${pr.type})` : ''}: ${pr.description ?? ''}`)
        .join('\n');
      const contentTokens = Math.ceil(text.length / 4);
      if (estimatedTokens + contentTokens <= maxTokens) {
        sections.push(text);
        estimatedTokens += contentTokens;
      }
    }
  } catch { /* products module absent — other sources still ground */ }

  // Published blog posts ground the chat — no toggle, by design. Publication
  // IS the decision: a post visible to every anonymous visitor on the web has
  // no reason to be invisible to the same visitor in the chat, and the off
  // switch already exists (unpublish). This closes the knowledge-recycling
  // loop: campaign-born posts become answerable knowledge the moment they go
  // live. Soft-fail on any shape difference across the fleet.
  try {
    const { data: posts } = await supabase
      .from('blog_posts')
      .select('title, slug, excerpt, content_json')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(15);
    for (const post of posts ?? []) {
      // content_json is Tiptap; the same extractor pages use handles both
      // doc objects and strings (the optic incident's lesson).
      const body = extractTextFromBlock({ type: 'text', data: { content: post.content_json } });
      const text = `### Blog: ${post.title} (/blog/${post.slug})\n${post.excerpt ?? ''}\n${(body ?? '').slice(0, 2000)}`;
      const contentTokens = Math.ceil(text.length / 4);
      if (estimatedTokens + contentTokens > maxTokens) break;
      sections.push(text);
      estimatedTokens += contentTokens;
    }
  } catch { /* blog module absent or older schema — pages+KB still ground */ }

  if (includeKbArticles) {
    // This runs on the SERVICE client, which bypasses RLS — the policy that
    // protects visitors elsewhere protects nobody here. Without the visibility
    // filter the legacy fallback would dump the internal tier straight into an
    // anonymous visitor's chat context, and only once the chunk path had
    // already failed: a leak that appears exactly when something else is broken
    // and nobody is watching.
    //
    // Filtering on a column an un-migrated instance lacks is a PostgREST error,
    // and the fleet runs several schema versions at once. So ask for the strict
    // set first and fall back to the old shape — degrade, never gate (Law 4).
    // The fallback can only run where no article can be internal yet.
    let kbArticles: any[] | null = null;
    const strict = await supabase
      .from('kb_articles')
      .select('title, question, answer_json, answer_text')
      .eq('visibility', 'public')
      .eq('include_in_chat', true).eq('is_published', true);
    if (strict.error) {
      const { data } = await supabase
        .from('kb_articles')
        .select('title, question, answer_json, answer_text')
        .eq('include_in_chat', true).eq('is_published', true);
      kbArticles = data;
    } else {
      kbArticles = strict.data;
    }

    if (kbArticles?.length) {
      const faqSection: string[] = [];
      for (const article of kbArticles) {
        let answerText = article.answer_text || '';
        if (!answerText && article.answer_json) answerText = extractTextFromTiptap(article.answer_json);
        if (answerText) {
          const entry = `Q: ${article.question}\nA: ${answerText}`;
          const entryTokens = Math.ceil(entry.length / 4);
          if (estimatedTokens + entryTokens > maxTokens) break;
          faqSection.push(entry);
          estimatedTokens += entryTokens;
        }
      }
      if (faqSection.length > 0) sections.push(`\n## FAQ\n${faqSection.join('\n\n')}`);
    }
  }

  if (sections.length === 0) return '';
  return `\n\n## Website Content (Knowledge Base)\n${sections.join('\n\n')}`;
}

/**
 * Returning-visitor context (USER.md equivalent for the public chat).
 * Builds a compact profile from past conversation metadata + visitor_profile,
 * keyed on email or session id.
 */
export async function loadVisitorContext(
  supabase: any,
  identifier: string,
  currentConversationId?: string,
): Promise<string> {
  const { data: pastConversations } = await supabase
    .from('chat_conversations')
    .select('id, title, created_at, visitor_profile, customer_name, customer_email')
    .or(`customer_email.eq.${identifier},session_id.eq.${identifier}`)
    .order('created_at', { ascending: false })
    .limit(5);

  if (!pastConversations?.length) return '';

  const previous = currentConversationId
    ? pastConversations.filter((c: any) => c.id !== currentConversationId)
    : pastConversations;

  if (previous.length === 0) return '';

  const parts: string[] = ['\n\n## Returning Visitor Context'];

  const latestProfile = previous.find((c: any) => c.visitor_profile && Object.keys(c.visitor_profile).length > 0);
  if (latestProfile?.visitor_profile) {
    const profile = latestProfile.visitor_profile;
    if (profile.name) parts.push(`Name: ${profile.name}`);
    if (profile.preferences) parts.push(`Preferences: ${profile.preferences}`);
    if (profile.interests) parts.push(`Interests: ${profile.interests}`);
    if (profile.notes) parts.push(`Notes: ${profile.notes}`);
  }

  const convSummaries = previous.slice(0, 3).map((c: any) => {
    const date = new Date(c.created_at).toLocaleDateString();
    return `- ${date}: ${c.title || 'Untitled conversation'}`;
  });

  if (convSummaries.length > 0) {
    parts.push(`\nPrevious conversations (${previous.length} total):`);
    parts.push(convSummaries.join('\n'));
    parts.push('\nUse this context to provide personalized, continuity-aware responses. Reference past interactions naturally when relevant.');
  }

  return parts.join('\n');
}
