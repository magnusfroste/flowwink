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
  // Konsultdomänen (labs1100 2026-09-02: "kolla konsulter" fann ingenting —
  // stammen "konsult" hade ingen väg till `consultant`).
  konsult: ['consultant', 'consultants', 'profile', 'profiles'],
  konsulterna: ['consultants', 'consultant', 'profiles'],
  uppdrag: ['assignment', 'assignments', 'engagement'],
  tillgänglig: ['available', 'availability'],
  tillgängliga: ['available', 'availability'],
  kolla: ['check', 'list', 'show', 'view'],
  vilka: ['which', 'list'],
  // Swedish business nouns → catalog vocabulary (the catalog is English).
  // Query-side expansion feeding the general scorer — the corpus lever, not a
  // routing rule. Added 2026-08-11 when a Swedish FlowWork question ranked
  // manage_automations above manage_ticket for "supporttickets".
  fakturor: ['invoice', 'invoices', 'billing', 'payment', 'unpaid', 'overdue'],
  obetald: ['unpaid', 'overdue', 'due', 'invoice'],
  obetalda: ['unpaid', 'overdue', 'due', 'invoice'],
  förfallen: ['overdue', 'due', 'invoice'],
  betalning: ['payment', 'paid', 'invoice'],
  kunder: ['customer', 'customers', 'company', 'client'],
  ärende: ['ticket', 'support', 'case', 'issue'],
  ärenden: ['ticket', 'tickets', 'support', 'case'],
  supporttickets: ['ticket', 'tickets', 'support'],
  avtal: ['contract', 'agreement', 'renewal'],
  avtalet: ['contract', 'agreement', 'renewal'],
  offert: ['quote', 'proposal'],
  anställd: ['employee', 'staff', 'hr'],
  anställda: ['employee', 'employees', 'staff', 'hr'],
  semester: ['leave', 'vacation', 'absence'],
  prenumeration: ['subscription', 'recurring'],
  leverantör: ['vendor', 'supplier', 'purchase', 'purchasing'],
  omförhandla: ['renewal', 'contract', 'renegotiate'],
  omförhandlas: ['renewal', 'contract', 'renegotiate'],
  // ── Aftermarket (returns/RMA/refunds) ──────────────────────────────────
  // The whole eftermarknad vocabulary was missing: a Swedish "skapa retur för
  // order 1042" scored create_purchase_order/place_order top-8 and never saw
  // create_return at all (FlowWork QA, 2026-08-20). Query-side expansion into
  // the catalog's English vocabulary — the corpus lever, not routing (Law 1).
  retur: ['return', 'rma', 'refund', 'returns'],
  returer: ['return', 'returns', 'rma', 'refund'],
  returnera: ['return', 'rma', 'refund'],
  rma: ['return', 'rma', 'refund'],
  reklamation: ['return', 'rma', 'complaint', 'defective'],
  återbetalning: ['refund', 'return', 'credit', 'rma'],
  återbetala: ['refund', 'return', 'credit', 'rma'],
  kreditfaktura: ['credit', 'note', 'invoice', 'refund'],
  kreditnota: ['credit', 'note', 'invoice'],
  // ── Expenses / approvals ───────────────────────────────────────────────
  attestera: ['approve', 'approval', 'expense', 'report', 'sign'],
  attest: ['approve', 'approval', 'expense', 'report'],
  godkänna: ['approve', 'approval'],
  utläggsrapport: ['expense', 'report', 'reimburse', 'manage_expenses'],
  // ── Dunning / collections ──────────────────────────────────────────────
  // Both the singular and the plural English form: nameWordHit tests whole
  // name words, and "reminders" is not a substring of "reminder".
  påminnelse: ['dunning', 'reminder', 'reminders', 'overdue', 'invoice', 'unpaid'],
  påminnelser: ['dunning', 'reminder', 'reminders', 'overdue', 'invoice', 'unpaid'],
  krav: ['dunning', 'collection', 'overdue', 'reminder', 'unpaid'],
  inkasso: ['dunning', 'collection', 'overdue'],
  förfallna: ['overdue', 'due', 'invoice', 'unpaid', 'dunning'],
  // ── Purchasing / goods receipt / stock ─────────────────────────────────
  inköp: ['purchase', 'purchasing', 'procurement', 'vendor'],
  inköpsorder: ['purchase', 'order', 'purchasing', 'vendor'],
  varumottagning: ['receive', 'receipt', 'goods', 'purchase', 'purchasing'],
  mottagning: ['receive', 'receipt', 'goods', 'purchase'],
  motta: ['receive', 'receipt', 'goods'],
  lager: ['stock', 'inventory', 'warehouse', 'quant'],
  lagret: ['stock', 'inventory', 'warehouse', 'quant'],
  lagersaldo: ['stock', 'inventory', 'quantity', 'quant'],
  saldo: ['stock', 'balance', 'inventory'],
  frakt: ['shipping', 'shipment', 'carrier', 'delivery'],
  leverans: ['delivery', 'shipping', 'shipment', 'fulfill'],
  // ── Verbs ──────────────────────────────────────────────────────────────
  // The catalog names its skills verb-first (create_*, send_*, update_*).
  // A Swedish sentence carries the verb too — it just carries it in Swedish,
  // so every create_* skill scored as if the user had named no action at all.
  skapa: ['create', 'add', 'new'],
  skicka: ['send', 'dispatch'],
  uppdatera: ['update', 'edit', 'manage'],
  ändra: ['update', 'edit', 'manage'],
  registrera: ['create', 'register', 'record', 'add'],
  lista: ['list', 'browse', 'search'],
  visa: ['get', 'list', 'show', 'view'],
  hämta: ['get', 'fetch', 'list'],
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
  // Accounting / Bookkeeping
  bokföra: ['journal', 'accounting', 'entry', 'template', 'manage_journal_entry'],
  bokför: ['journal', 'accounting', 'entry', 'template', 'manage_journal_entry'],
  bokföring: ['journal', 'accounting', 'entry', 'ledger', 'report'],
  verifikation: ['journal', 'accounting', 'entry', 'manage_journal_entry'],
  kontera: ['journal', 'accounting', 'entry', 'template', 'manage_journal_entry'],
  kontering: ['journal', 'accounting', 'entry', 'template'],
  lön: ['journal', 'accounting', 'salary', 'template', 'manage_journal_entry'],
  löner: ['journal', 'accounting', 'salary', 'template'],
  salary: ['journal', 'accounting', 'salary', 'template', 'manage_journal_entry'],
  journal: ['journal', 'accounting', 'entry', 'manage_journal_entry'],
  accounting: ['journal', 'accounting', 'entry', 'ledger', 'report'],
  redovisning: ['journal', 'accounting', 'ledger', 'report'],
  resultaträkning: ['accounting', 'report', 'profit_loss', 'accounting_reports'],
  balansräkning: ['accounting', 'report', 'balance_sheet', 'accounting_reports'],
  huvudbok: ['accounting', 'ledger', 'report', 'accounting_reports'],
  moms: ['journal', 'accounting', 'vat', 'tax', 'manage_journal_entry'],
  faktura: ['journal', 'accounting', 'invoice', 'billing', 'unpaid', 'overdue', 'manage_journal_entry'],
  hyra: ['journal', 'accounting', 'rent', 'template', 'manage_journal_entry'],
  expense: ['expense', 'receipt', 'reimburse', 'manage_expenses'],
  utlägg: ['expense', 'receipt', 'reimburse', 'manage_expenses'],
  kvitto: ['expense', 'receipt', 'manage_expenses'],
  // Timesheets
  timesheets: ['time', 'hours', 'project', 'log_time', 'timesheet'],
  tidsrapport: ['time', 'hours', 'project', 'log_time', 'timesheet_summary'],
  timmar: ['time', 'hours', 'log_time', 'timesheet'],
  logga: ['time', 'log_time', 'log', 'hours'],
  jobbade: ['time', 'log_time', 'hours', 'worked'],
  timesheet: ['time', 'hours', 'log_time', 'timesheet_summary'],
  projekt: ['project', 'manage_projects', 'time', 'client'],
  fakturerbar: ['billable', 'time', 'timesheet_summary', 'revenue'],
};

// ─── Term normalization (corpus layer, not routing) ──────────────────────────

/**
 * Swedish inflects at the END of the word — the definite article and the
 * plural are SUFFIXES (retur → returen → returer → returerna). The scorer's
 * compound matcher (`nameWordHit`) matches on suffixes because ENGLISH
 * compounds carry their category in the last morpheme (flowtable → table).
 * The two pull in opposite directions: every Swedish inflection destroys the
 * suffix the English matcher and the synonym map are keyed on, so "returen"
 * matched nothing while "retur" would have.
 *
 * So: strip the inflectional ending before matching. This is a NORMALIZATION
 * of the query vocabulary — exactly the same class of thing as the synonym
 * map — and emphatically NOT intent detection (Law 1): no user phrase is
 * mapped to a skill here, and nothing branches on which skill is being scored.
 * The stem is ADDED alongside the raw word, never substituted, so an English
 * word that happens to end in a Swedish suffix loses nothing.
 *
 * The 4-character floor is what keeps it safe: "post" → "pos" and "error" →
 * "err" are rejected, so a blog question cannot leak into the POS module.
 */
const SV_SUFFIXES = ['erna', 'arna', 'orna', 'en', 'et', 'er', 'ar', 'or', 'na', 'n', 't'];
const SV_MIN_STEM = 4;

/**
 * English plural → singular for the common regular forms. Added alongside the
 * raw word (never substituted), like the Swedish stem: "consultants" →
 * "consultant", "companies" → "company", "invoices" → "invoice". Words that
 * end in -ss/-us/-is ("address", "status", "analysis") are left alone.
 */
export function stemEnglishPlural(word: string): string | null {
  const w = word.toLowerCase();
  if (w.length < 5) return null;
  if (/(ss|us|is)$/.test(w)) return null;
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (/(ches|shes|xes|ses)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s')) return w.slice(0, -1);
  return null;
}

export function stemSwedish(word: string): string | null {
  const w = word.toLowerCase();
  for (const suf of SV_SUFFIXES) {
    if (w.length > suf.length && w.endsWith(suf)) {
      const stem = w.slice(0, -suf.length);
      if (stem.length >= SV_MIN_STEM) return stem;
      return null; // too short to be evidence — fail quiet, keep the raw word
    }
  }
  return null;
}

// ─── Scorer ──────────────────────────────────────────────────────────────────

export interface ScoredSkill {
  skill: any;
  score: number;
  name: string;
}

/**
 * Discriminativeness of a skill-NAME word across the current skill set (IDF).
 * A word in many skill names (manage, get, table, page, code) barely narrows
 * the field, so a query hit on it should count for little; a rare word
 * (flowtable, refund, knowledge) is a strong signal. This is what stops a
 * generic collision word ("table" in "error codes table") from floating every
 * `*_table` skill above the actually-relevant one — WITHOUT hardcoding any
 * intent→skill routing (Law 1): the weights are derived from the corpus.
 */
function buildNameIdf(skills: any[]): (word: string) => number {
  const df = new Map<string, number>();
  const N = Math.max(skills.length, 1);
  for (const skill of skills) {
    const fnName = (skill?.function?.name || '').toLowerCase();
    const words = new Set<string>(fnName.split(/_+/).filter((w: string) => w.length > 1));
    for (const w of words) df.set(w, (df.get(w) || 0) + 1);
  }
  const denom = Math.log(N + 1);
  return (word: string): number => {
    const d = df.get(word) ?? 0;
    // log((N+1)/(df+1)) normalised to (0,1], floored so an exact name hit is
    // never fully cancelled — a rare word ≈1, a word in ~half the skills ≈0.1.
    const raw = Math.log((N + 1) / (d + 1)) / denom;
    return Math.max(0.15, Math.min(1, raw));
  };
}

/**
 * Does the query contain `w`, or a compound whose HEAD is `w`? English
 * compounds carry their category in the last morpheme: "flowtable" is a kind
 * of table, "workspace" a kind of space — so a query word matches a name word
 * when one is a suffix of the other. Suffix (not substring) is deliberate:
 * it catches table⊂flowtable while rejecting book⊂bookkeeping (a bookkeeping
 * skill is not a booking result), which a plain includes() got wrong.
 */
// 1.0 = the user literally typed the word (or a compound of it); 0.5 = only a
// SYNONYM expansion matched. Synonym hits used to count at full weight, which
// let multi-word names harvest expansion terms: "create lead" expands lead →
// pipeline, so lead_pipeline_review collected TWO full name hits and outranked
// add_lead — the skill the user actually meant (OpenClaw sandbox smoke,
// 2026-07-22). Direct evidence must beat associative evidence.
function nameWordHit(expandedMsg: string, msgWords: string[], w: string): number {
  const direct = msgWords.includes(w) ||
    (w.length > 3 && msgWords.some(mw => mw.length > 3 && (w.endsWith(mw) || mw.endsWith(w))));
  if (direct) return 1;
  if (expandedMsg.includes(w)) return 0.5;
  return 0;
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

  // Small pools skip scoring ONLY when there is no intent to rank by. With a
  // real query the caller (e.g. search_skills) expects relevance ORDER, not
  // seed order — an external operator reading the top of an unranked list saw
  // "irrelevant skills ranked high" (OpenClaw, 2026-07-22). Everything still
  // gets returned; ranking just has to actually happen.
  if (skills.length <= maxSkills && !userMessage.trim()) return skills;

  const msg = userMessage.toLowerCase();
  const rawWords = msg.split(/\s+/).filter(w => w.length > 1);

  // Expand user message with synonyms. Each word is looked up BOTH as typed
  // and as its Swedish stem, so "returen"/"returer"/"returerna" all reach the
  // `retur` entry — otherwise the map only ever fires on the dictionary form,
  // which is not how anyone writes.
  const expandedTerms = new Set<string>();
  const msgWords: string[] = [];
  for (const word of rawWords) {
    msgWords.push(word);
    expandedTerms.add(word);
    const stem = stemSwedish(word);
    if (stem && stem !== word) {
      msgWords.push(stem);
      expandedTerms.add(stem);
    }
    // English plural → singular, the same way: "consultants" must be a DIRECT
    // hit on the name word `consultant`, not the half-weight substring hit it
    // was — with seven consultant_* skills tied at half weight, seed order
    // decided which four of them survived the cut, and the one with `list`
    // (manage_consultant_profile) was not among them (labs1100, 2026-09-02).
    const en = stemEnglishPlural(word);
    if (en && en !== word) {
      msgWords.push(en);
      expandedTerms.add(en);
    }
    for (const key of stem ? [word, stem] : [word]) {
      const synonyms = SYNONYM_MAP[key];
      if (synonyms) {
        for (const syn of synonyms) expandedTerms.add(syn);
      }
    }
  }
  const expandedMsg = Array.from(expandedTerms).join(' ');

  // IDF weighting of name words — computed once over the corpus so common
  // words (manage/get/table/page) can't outrank a rare, discriminative hit.
  const idf = buildNameIdf(skills);

  const scored: ScoredSkill[] = skills.map(skill => {
    const functionName = (skill?.function?.name || '').toLowerCase();
    const name = functionName.replace(/_/g, ' ');
    const desc = (skill?.function?.description || '').toLowerCase();
    let score = 0;

    // Always-include gets max score
    if (alwaysInclude.has(functionName)) {
      return { skill, score: 1000, name: functionName };
    }

    // 1. Skill name word matching against expanded terms, IDF-weighted.
    const nameWords = name.split(' ').filter(w => w.length > 1);
    for (const w of nameWords) {
      score += 12 * idf(w) * nameWordHit(expandedMsg, msgWords, w);
    }

    // 2. Function name parts (underscore-separated), IDF-weighted.
    const fnParts = functionName.split('_').filter(w => w.length > 1);
    for (const w of fnParts) {
      score += 8 * idf(w) * nameWordHit(expandedMsg, msgWords, w);
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

    // 4. "NOT for:" negative signal — but never on the skill's OWN subject.
    //    "NOT for: matching consultants to jobs" names the subject the skill
    //    is about; a query that says "consultants" was being fined -15 by the
    //    very skill that lists them (manage_consultant_profile fell out of the
    //    top 40 for "list consultants", labs1100 2026-09-02). A negative word
    //    counts only when it is NOT also part of the name or the "Use when:"
    //    triggers — those are what the clause contrasts against.
    const notForMatch = desc.match(/not for:\s*([^.]*?)(?:\.|$)/i);
    if (notForMatch) {
      const ownVocab = new Set<string>();
      for (const w of [...nameWords, ...fnParts]) {
        ownVocab.add(w);
        const p = stemEnglishPlural(w); if (p) ownVocab.add(p);
        ownVocab.add(w + 's');
      }
      if (useWhenMatch) {
        for (const w of useWhenMatch[1].toLowerCase().split(/[\s,;]+/)) {
          if (w.length > 3) { ownVocab.add(w); const p = stemEnglishPlural(w); if (p) ownVocab.add(p); }
        }
      }
      const negatives = notForMatch[1].toLowerCase();
      const negWords = negatives.split(/[\s,;()]+/).filter(w => w.length > 3);
      for (const w of negWords) {
        if (ownVocab.has(w) || ownVocab.has(stemEnglishPlural(w) ?? '')) continue;
        if (msg.includes(w)) score -= 15;
      }
    }

    // 5. General description word matching (low weight)
    const descWords = desc.split(/\s+/).filter(w => w.length > 5);
    for (const w of descWords) {
      if (expandedMsg.includes(w)) score += 1;
    }

    // 5b. The skill's own action words. A description opens with what the
    //     skill DOES ("Manage consultant profiles: list, create, update…") and
    //     those verbs are short — under the length-5 floor above, so "list"
    //     and "show" in a query never counted for the skill that lists, while
    //     `list` did count as a NAME hit for every *pricelist* skill via the
    //     compound rule. Whole-word, head of the description only, small.
    const head = desc.split(/use when:/i)[0];
    for (const mw of msgWords) {
      if (mw.length >= 4 && mw.length <= 5 && new RegExp(`\\b${mw}\\b`).test(head)) score += 3;
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
