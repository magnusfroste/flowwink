/**
 * Intent-based skill scorer
 * 
 * Scores skills by relevance to the user's message using:
 * 1. Synonym expansion (multilingual)
 * 2. Skill name word matching
 * 3. "Use when:" trigger matching
 * 4. "NOT for:" negative signal
 * 5. Historical success rate boost
 * 
 * Always returns a bounded set of the most relevant skills.
 */

// ─── Synonym Map ─────────────────────────────────────────────────────────────
// Maps common user terms (including Swedish) to skill-related keywords
const SYNONYM_MAP: Record<string, string[]> = {
  // Email
  mail: ['gmail', 'email', 'inbox', 'send', 'composio_gmail'],
  email: ['gmail', 'mail', 'inbox', 'send', 'composio_gmail'],
  mejl: ['gmail', 'email', 'mail', 'inbox', 'composio_gmail'],
  inbox: ['gmail', 'email', 'mail', 'scan', 'composio_gmail'],
  // Blog / Content
  blog: ['blog', 'post', 'article', 'content', 'write', 'publish'],
  blogg: ['blog', 'post', 'article', 'content', 'write'],
  post: ['blog', 'post', 'article', 'publish'],
  inlägg: ['blog', 'post', 'article'],
  article: ['blog', 'post', 'article', 'content'],
  artikel: ['blog', 'post', 'article', 'content'],
  content: ['blog', 'content', 'proposal', 'research', 'write'],
  innehåll: ['blog', 'content', 'proposal', 'research'],
  // SEO
  seo: ['seo', 'audit', 'search', 'optimization', 'meta'],
  // CRM / Leads
  lead: ['lead', 'crm', 'prospect', 'contact', 'deal', 'pipeline'],
  leads: ['lead', 'crm', 'prospect', 'contact', 'deal'],
  kund: ['lead', 'crm', 'customer', 'contact', 'deal'],
  prospect: ['lead', 'prospect', 'enrich', 'qualify'],
  deal: ['deal', 'crm', 'pipeline', 'lead'],
  // Newsletter
  newsletter: ['newsletter', 'resend', 'subscriber', 'campaign'],
  nyhetsbrev: ['newsletter', 'resend', 'subscriber', 'campaign'],
  // Booking
  booking: ['booking', 'calendar', 'appointment', 'schedule'],
  bokning: ['booking', 'calendar', 'appointment'],
  // Analytics
  analytics: ['analytics', 'metrics', 'stats', 'report', 'traffic'],
  statistik: ['analytics', 'metrics', 'stats', 'report'],
  // Pages / Site
  page: ['page', 'site', 'block', 'landing'],
  sida: ['page', 'site', 'block', 'landing'],
  // Search
  search: ['search', 'find', 'lookup', 'firecrawl', 'web'],
  sök: ['search', 'find', 'lookup', 'web'],
  // Products / Orders
  product: ['product', 'order', 'shop', 'ecommerce'],
  produkt: ['product', 'order', 'shop'],
  order: ['order', 'product', 'shop', 'purchase'],
  beställning: ['order', 'product', 'shop'],
  // Knowledge base
  kb: ['kb', 'knowledge', 'faq', 'article'],
  faq: ['kb', 'knowledge', 'faq'],
  // Support
  support: ['support', 'chat', 'escalat', 'agent', 'ticket'],
  // Memory / Config
  memory: ['memory', 'remember', 'config', 'setting'],
  minne: ['memory', 'remember'],
  // Skills / Automation
  skill: ['skill', 'tool', 'automation', 'workflow'],
  automation: ['automation', 'workflow', 'schedule', 'cron'],
};

// ─── Scorer ──────────────────────────────────────────────────────────────────

export interface ScoredSkill {
  skill: any;
  score: number;
  name: string;
}

interface ScoreOptions {
  maxSkills?: number;        // Max skills to return (default: 25)
  alwaysInclude?: string[];  // Skill names to always include
  usageBoost?: Record<string, number>;  // skill_name → success count for historical boost
}

/**
 * Score and filter skills by relevance to user message.
 * Returns top-N skills sorted by relevance score.
 */
export function scoreSkillsByIntent(
  skills: any[],
  userMessage: string,
  options: ScoreOptions = {},
): any[] {
  const maxSkills = options.maxSkills ?? 25;
  const alwaysInclude = new Set(options.alwaysInclude || []);
  const usageBoost = options.usageBoost || {};

  if (skills.length <= maxSkills) return skills;

  const msg = userMessage.toLowerCase();
  const msgWords = msg.split(/\s+/).filter(w => w.length > 1);

  // Expand user message with synonyms
  const expandedTerms = new Set<string>();
  for (const word of msgWords) {
    expandedTerms.add(word);
    const synonyms = SYNONYM_MAP[word];
    if (synonyms) {
      for (const syn of synonyms) expandedTerms.add(syn);
    }
  }
  const expandedMsg = Array.from(expandedTerms).join(' ');

  const scored: ScoredSkill[] = skills.map(skill => {
    const functionName = (skill?.function?.name || '').toLowerCase();
    const name = functionName.replace(/_/g, ' ');
    const desc = (skill?.function?.description || '').toLowerCase();
    let score = 0;

    // Always-include gets max score
    if (alwaysInclude.has(functionName)) {
      return { skill, score: 1000, name: functionName };
    }

    // 1. Skill name word matching against expanded terms
    const nameWords = name.split(' ').filter(w => w.length > 1);
    for (const w of nameWords) {
      if (expandedMsg.includes(w)) score += 12;
    }

    // 2. Function name against expanded terms (underscore-separated)
    const fnParts = functionName.split('_').filter(w => w.length > 1);
    for (const w of fnParts) {
      if (expandedMsg.includes(w)) score += 8;
    }

    // 3. "Use when:" trigger matching
    const useWhenMatch = desc.match(/use when:\s*([^.]*?)(?:\.|not for:|$)/i);
    if (useWhenMatch) {
      const triggers = useWhenMatch[1].toLowerCase();
      const triggerWords = triggers.split(/[\s,]+/).filter(w => w.length > 3);
      for (const w of triggerWords) {
        if (expandedMsg.includes(w)) score += 7;
        // Partial match
        else if (msgWords.some(mw => mw.length > 3 && (w.includes(mw) || mw.includes(w)))) score += 3;
      }
    }

    // 4. "NOT for:" negative signal
    const notForMatch = desc.match(/not for:\s*([^.]*?)(?:\.|$)/i);
    if (notForMatch) {
      const negatives = notForMatch[1].toLowerCase();
      const negWords = negatives.split(/[\s,]+/).filter(w => w.length > 3);
      for (const w of negWords) {
        if (msg.includes(w)) score -= 15;
      }
    }

    // 5. General description word matching (low weight)
    const descWords = desc.split(/\s+/).filter(w => w.length > 5);
    for (const w of descWords) {
      if (expandedMsg.includes(w)) score += 1;
    }

    // 6. Historical success rate boost (capped)
    const usageCount = usageBoost[functionName] || 0;
    if (usageCount > 0) {
      score += Math.min(usageCount, 5); // Max +5 from history
    }

    return { skill, score, name: functionName };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Always include: top scored + any with positive intent match
  const positiveMatches = scored.filter(s => s.score > 0);
  const zeroMatches = scored.filter(s => s.score === 0);

  // If enough positive matches, use them; otherwise pad with zero-scored
  let result: any[];
  if (positiveMatches.length >= maxSkills) {
    result = positiveMatches.slice(0, maxSkills).map(s => s.skill);
  } else {
    // Include all positive + fill remaining from zero-scored (round-robin by category diversity)
    const remaining = maxSkills - positiveMatches.length;
    result = [
      ...positiveMatches.map(s => s.skill),
      ...zeroMatches.slice(0, remaining).map(s => s.skill),
    ];
  }

  const matchedCount = positiveMatches.length;
  if (skills.length > maxSkills) {
    console.log(`[intent-scorer] ${skills.length} skills → ${result.length} (${matchedCount} intent-matched, expanded: ${expandedTerms.size} terms)`);
  }

  return result;
}

/**
 * Load recent skill usage counts for boosting.
 */
export async function loadRecentUsageCounts(supabase: any, days = 14): Promise<Record<string, number>> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data } = await supabase
    .from('agent_activity')
    .select('skill_name')
    .gte('created_at', since.toISOString())
    .eq('status', 'success')
    .order('created_at', { ascending: false })
    .limit(300);

  const counts: Record<string, number> = {};
  for (const row of (data || [])) {
    if (row.skill_name) counts[row.skill_name] = (counts[row.skill_name] || 0) + 1;
  }
  return counts;
}
