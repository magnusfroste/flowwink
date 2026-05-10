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

export function extractTextFromBlock(block: any): string {
  if (!block) return '';
  const texts: string[] = [];
  const type = block.type;
  const data = block.data || block;

  switch (type) {
    case 'text': if (data.content) texts.push(extractTextFromTiptap(data.content)); break;
    case 'hero':
      if (data.title) texts.push(data.title);
      if (data.subtitle) texts.push(data.subtitle);
      break;
    case 'cta':
      if (data.title) texts.push(data.title);
      if (data.subtitle) texts.push(data.subtitle);
      break;
    case 'accordion':
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item: any) => {
          if (item.question) texts.push(item.question);
          if (item.answer) texts.push(extractTextFromTiptap(item.answer));
        });
      }
      break;
    case 'contact':
      if (data.phone) texts.push(`Phone: ${data.phone}`);
      if (data.email) texts.push(`Email: ${data.email}`);
      if (data.address) texts.push(`Address: ${data.address}`);
      break;
    case 'quote':
      if (data.quote) texts.push(data.quote);
      if (data.author) texts.push(`- ${data.author}`);
      break;
    case 'info-box': case 'infoBox':
      if (data.title) texts.push(data.title);
      if (data.content) texts.push(extractTextFromTiptap(data.content));
      break;
    case 'two-column': case 'twoColumn':
      if (data.leftContent) texts.push(extractTextFromTiptap(data.leftContent));
      if (data.rightContent) texts.push(extractTextFromTiptap(data.rightContent));
      break;
    case 'stats':
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item: any) => { if (item.value && item.label) texts.push(`${item.value} ${item.label}`); });
      }
      break;
    case 'article-grid': case 'articleGrid':
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item: any) => { if (item.title) texts.push(item.title); if (item.excerpt) texts.push(item.excerpt); });
      }
      break;
    case 'link-grid': case 'linkGrid':
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item: any) => { if (item.title) texts.push(item.title); if (item.description) texts.push(item.description); });
      }
      break;
  }
  return texts.join(' ');
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
  if (includedSlugs.length > 0) query = query.in('slug', includedSlugs);
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

  if (includeKbArticles) {
    const { data: kbArticles } = await supabase
      .from('kb_articles')
      .select('title, question, answer_json, answer_text')
      .eq('include_in_chat', true).eq('is_published', true);

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
