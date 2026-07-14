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
import { scoreSkillsByIntent } from '../../../supabase/functions/_shared/skills/intent-scorer';

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
