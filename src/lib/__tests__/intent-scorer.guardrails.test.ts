/**
 * Guardrails: Skill Relevance Engine ranking quality
 * (supabase/functions/_shared/skills/intent-scorer.ts).
 *
 * OpenClaw's search_knowledge validation (2026-07-14) surfaced a ranking
 * class: a generic collision word in the query ("table" in "error codes
 * table", "page" in "which page covers…") floated every skill whose NAME
 * merely contained that word above the actually-relevant skill. The fix is
 * IDF weighting of name words (common words like table/page/manage barely
 * count) + suffix-based compound matching (table⊂flowtable, not
 * book⊂bookkeeping) — a corpus-derived scoring improvement, NOT intent→skill
 * routing (Law 1). These tripwires lock that behaviour.
 *
 * The scorer only ranks when skills.length > maxSkills, so fixtures pad past
 * the default 25.
 */
import { describe, expect, it } from 'vitest';
import { scoreSkillsByIntent, stemSwedish, stemEnglishPlural } from '../../../supabase/functions/_shared/skills/intent-scorer';
import artifact from '../../../supabase/seed/module-skills.json';

type Tool = { function: { name: string; description: string } };
const tool = (name: string, description = ''): Tool => ({ function: { name, description } });

// Padding so the scorer engages (needs > maxSkills skills).
const padding = Array.from({ length: 30 }, (_, i) => tool(`filler_skill_${i}`, `Unrelated filler skill ${i}.`));

const rankOf = (skills: Tool[], query: string, target: string, maxSkills = 25): number => {
  const ranked = scoreSkillsByIntent(skills, query, { maxSkills });
  const idx = ranked.findIndex((s: Tool) => s.function.name === target);
  return idx === -1 ? Infinity : idx + 1;
};

describe('Skill Relevance Engine ranking guardrails', () => {
  it('a generic collision word does not float name-only matches over the relevant skill', () => {
    const skills: Tool[] = [
      tool('query_flowtable', 'Query rows in a Flowtable base. Use when: looking up a value in a structured table, error codes, price lists, supplier registers.'),
      tool('manage_pos_table', 'Create or edit restaurant floor tables for point of sale.'),
      tool('manage_flowtable_table', 'Create or rename a Flowtable table (schema), not its rows.'),
      tool('manage_discount_code', 'Create a discount code for the shop.'),
      tool('manage_pricelist_table', 'Manage a price list table layout.'),
      ...padding,
    ];
    const q = 'look up error code E-1234 in our error codes table';
    // The structured-lookup skill must beat the irrelevant restaurant-table skill.
    expect(rankOf(skills, q, 'query_flowtable')).toBeLessThan(rankOf(skills, q, 'manage_pos_table'));
  });

  it('suffix compound match links table→flowtable without book→bookkeeping bleed', () => {
    const skills: Tool[] = [
      tool('book_appointment_slot', 'Book a calendar appointment slot. Use when: scheduling a meeting.'),
      tool('propose_bookkeeping', 'Propose a bookkeeping journal entry from a bank event.'),
      tool('run_bookkeeping_sweep', 'Run the bookkeeping auto-post sweep.'),
      ...padding,
    ];
    // A booking query must not be outranked by bookkeeping skills (the plain
    // substring bug did exactly that via "book" ⊂ "bookkeeping").
    const q = 'book a meeting next week';
    expect(rankOf(skills, q, 'book_appointment_slot'))
      .toBeLessThan(rankOf(skills, q, 'propose_bookkeeping'));
  });

  it('a knowledge-base intent surfaces search_knowledge over page-management skills', () => {
    const skills: Tool[] = [
      tool('search_knowledge', "Hybrid search over the site's knowledge. Use when: answering questions from company knowledge; finding which page or article covers a topic."),
      tool('manage_page', 'Create, update or delete a site page.'),
      tool('landing_page_compose', 'Compose a landing page from a brief.'),
      tool('create_page_block', 'Add a content block to a page.'),
      tool('manage_page_blocks', 'Reorder or edit page blocks.'),
      ...padding,
    ];
    const q = 'find which page covers refund policy';
    // search_knowledge should be within the returned set and ahead of at least
    // most page-management skills (was buried at #7 behind all of them).
    const r = rankOf(skills, q, 'search_knowledge');
    expect(r).toBeLessThanOrEqual(3);
  });

  it('known-good direct intents still rank top', () => {
    const skills: Tool[] = [
      tool('write_blog_post', 'Write and publish a blog post. Use when: creating blog content.'),
      tool('search_web', 'Search the web. Use when: researching a topic online.'),
      tool('send_email_to_lead', 'Send an email to a lead. Use when: emailing a prospect.'),
      ...padding,
    ];
    expect(rankOf(skills, 'write a blog post about our product', 'write_blog_post')).toBe(1);
    expect(rankOf(skills, 'search the web for competitor pricing', 'search_web')).toBe(1);
    expect(rankOf(skills, 'send an email to this lead', 'send_email_to_lead')).toBe(1);
  });
});

describe('small-pool ranking (OpenClaw finding, 2026-07-22)', () => {
  // The scorer used to short-circuit whenever the pool fit under maxSkills,
  // returning skills in SEED ORDER with no ranking at all. An external
  // operator calling search_skills against a small dispatch scope read the
  // top of that unranked list as "irrelevant skills ranked high" — correctly.
  // With a real query, ranking must happen regardless of pool size.
  it('ranks a small pool when a query is present', () => {
    const skills = [
      { function: { name: 'manage_pages', description: 'Manage site pages. Use when: editing pages.' } },
      { function: { name: 'manage_orders', description: 'Manage orders. Use when: handling orders.' } },
      { function: { name: 'write_blog_post', description: 'Write and publish a blog post. Use when: creating blog content.' } },
    ];
    const result = scoreSkillsByIntent(skills, 'write a blog post', { maxSkills: 25 });
    expect(result[0].function.name).toBe('write_blog_post');
  });

  it('still passes a small pool through untouched when there is no query', () => {
    const skills = [
      { function: { name: 'a_first', description: 'A.' } },
      { function: { name: 'b_second', description: 'B.' } },
    ];
    const result = scoreSkillsByIntent(skills, '', { maxSkills: 25 });
    expect(result.map((s: any) => s.function.name)).toEqual(['a_first', 'b_second']);
  });
});

describe('create-verb intent (OpenClaw sandbox smoke, 2026-07-22)', () => {
  // "create lead" ranked add_lead #5 behind manage_deal: the synonym map
  // expands lead → deal (giving manage_deal name points), while add_lead got
  // no credit for "create" — no create→add synonym, and its Use-when said
  // "capturing", not "create". Fix is metadata + a generic verb synonym,
  // never routing (Law 1).
  const crm = [
    tool('add_lead', "Create a new lead in the CRM. Use when: create or add a new lead; capture a new prospect; a visitor submits contact info; importing leads from external sources. NOT for: updating existing records (manage_leads); qualifying (qualify_lead)."),
    tool('manage_leads', 'Manage existing leads: list, get, update, delete. Use when: updating lead status; listing leads. NOT for: adding a new lead (add_lead).'),
    tool('manage_deal', 'Create and manage deals in the pipeline. Use when: creating a deal; moving a deal between stages. NOT for: leads (add_lead, manage_leads).'),
    tool('lead_pipeline_review', 'Review the lead pipeline with forecast. Use when: reviewing pipeline health; forecasting. NOT for: editing leads.'),
    tool('qualify_lead', 'AI-qualify an existing lead. Use when: scoring a lead. NOT for: creating leads (add_lead).'),
  ];

  it('"create lead" ranks add_lead first', () => {
    expect(rankOf([...crm, ...padding], 'create lead', 'add_lead')).toBe(1);
  });

  it('"create a deal" still ranks manage_deal first (no overcorrection)', () => {
    expect(rankOf([...crm, ...padding], 'create a deal for this customer', 'manage_deal')).toBe(1);
  });
});

describe('Swedish inflection reaches the catalog (FlowWork QA, 2026-08-20)', () => {
  // The catalog is English. Swedish inflects at the END of the word — the
  // definite article and the plural are suffixes — while the scorer's compound
  // matcher was built for English compounds, which carry their category in the
  // last morpheme. The two pull opposite ways: "retur"/"returen"/"returer"
  // never touched `return`, and the whole eftermarknad vocabulary was missing
  // from the synonym map besides. Six live QA questions came back with the
  // wrong module or nothing at all.
  //
  // These run against the REAL bundled catalog (537 skills), because the bug
  // was a corpus effect: the right skill lost to a plausible neighbour, and a
  // hand-built fixture of five skills cannot reproduce that.
  const catalog = (artifact as { modules: Array<{ skills: Array<{ name: string; description?: string }> }> })
    .modules.flatMap((m) => m.skills.map((s) => ({
      ...s,
      function: { name: s.name, description: s.description ?? '' },
    })));

  const rank = (query: string, target: string): number => {
    const ranked = scoreSkillsByIntent(catalog, query, { maxSkills: 8 });
    const idx = ranked.findIndex((s: { function: { name: string } }) => s.function.name === target);
    return idx === -1 ? Infinity : idx + 1;
  };

  it.each([
    ['skapa retur RMA för order 1042', 'create_return'],
    ['återbetala returen till kunden', 'refund_return'],
    ['registrera ett utlägg för taxiresan', 'manage_expenses'],
    ['attestera utläggsrapporten', 'approve_expense_report'],
    ['skicka påminnelse på förfallna fakturor', 'send_dunning_reminders'],
    ['skapa inköpsorder till leverantören', 'create_purchase_order'],
    ['varumottagning av inköpsorder', 'receive_purchase_order'],
  ])('"%s" ranks %s in the top 5', (query, target) => {
    expect(rank(query, target)).toBeLessThanOrEqual(5);
  });

  it('English intents are not traded away for Swedish ones', () => {
    expect(rank('write a blog post about our product', 'write_blog_post')).toBeLessThanOrEqual(3);
    expect(rank('search the web for competitor pricing', 'search_web')).toBeLessThanOrEqual(3);
  });
});

describe('the Swedish stemmer is conservative by construction', () => {
  it('strips the inflection off real nouns', () => {
    expect(stemSwedish('returen')).toBe('retur');
    expect(stemSwedish('returer')).toBe('retur');
    expect(stemSwedish('returerna')).toBe('retur');
    expect(stemSwedish('leverantören')).toBe('leverantör');
    expect(stemSwedish('fakturan')).toBe('faktura');
  });

  it('refuses to butcher short words — the 4-character floor IS the safety', () => {
    // "post" → "pos" would leak every blog question into the POS module, and
    // "error" → "err" would do the same to error-code lookups. Both null.
    expect(stemSwedish('post')).toBeNull();
    expect(stemSwedish('error')).toBeNull();
    expect(stemSwedish('order')).toBeNull();
    expect(stemSwedish('chat')).toBeNull();
  });

  it('leaves words with no Swedish ending alone', () => {
    expect(stemSwedish('invoice')).toBeNull();
    expect(stemSwedish('blog')).toBeNull();
  });
});

describe('the consultant roster is reachable (labs1100, 2026-09-02)', () => {
  // "kolla konsulter" in FlowChat found nothing, in a catalog with seven
  // consultant_* skills. Three separate causes, each general:
  //  1. English plural: "consultants" was only a half-weight substring hit on
  //     the name word `consultant`, so the seven tied and seed order chose
  //     which four survived the top-40 cut — the one with `list` lost.
  //  2. NOT-for self-harm: "NOT for: matching consultants to jobs" fined the
  //     listing skill -15 for the word that is its own subject.
  //  3. Swedish: the stem "konsult" had no path to `consultant`.
  const catalog = (artifact as { modules: Array<{ skills: Array<{ name: string; description?: string }> }> })
    .modules.flatMap((m) => m.skills.map((s) => ({
      ...s,
      function: { name: s.name, description: s.description ?? '' },
    })));
  const rank = (query: string, target: string, maxSkills = 40): number => {
    const ranked = scoreSkillsByIntent(catalog, query, { maxSkills });
    const idx = ranked.findIndex((s: { function: { name: string } }) => s.function.name === target);
    return idx === -1 ? Infinity : idx + 1;
  };

  it.each([
    ['list consultants', 'manage_consultant_profile'],
    ['show me our consultants', 'manage_consultant_profile'],
    ['which consultants are available', 'manage_consultant_profile'],
    ['kolla konsulter', 'manage_consultant_profile'],
    ['vilka konsulter har vi', 'manage_consultant_profile'],
    ['lista konsulterna', 'manage_consultant_profile'],
    ['hitta en konsult för ett Databricks-uppdrag', 'match_consultant'],
  ])('"%s" ranks %s in the top 5', (query, target) => {
    expect(rank(query, target)).toBeLessThanOrEqual(5);
  });

  it('a NOT-for clause never fines the skill for its own subject word', () => {
    const skills = [
      tool('manage_widget_profile', 'Manage widget profiles: list, create, update. Use when: adding a widget. NOT for: matching widgets to jobs (match_widget).'),
      tool('match_widget', 'Match widgets to a job. Use when: finding a widget for an opening. NOT for: editing widget profiles.'),
      ...padding,
    ];
    expect(rankOf(skills, 'list widgets', 'manage_widget_profile')).toBeLessThanOrEqual(2);
  });

  it('stemEnglishPlural: regular plurals only, never -ss/-us/-is', () => {
    expect(stemEnglishPlural('consultants')).toBe('consultant');
    expect(stemEnglishPlural('companies')).toBe('company');
    expect(stemEnglishPlural('invoices')).toBe('invoice');
    expect(stemEnglishPlural('address')).toBeNull();
    expect(stemEnglishPlural('status')).toBeNull();
    expect(stemEnglishPlural('analysis')).toBeNull();
  });
});
