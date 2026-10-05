import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { audienceReach, normalizeListName } from '@/hooks/useNewsletterLists';

/**
 * Newsletter mailing lists (Odoo parity newsletter#lists_segments, 2026-10-05).
 * One model on both surfaces: newsletter_subscribers.lists + newsletters.audience_lists,
 * empty audience = every confirmed subscriber. The send filters on it, the skills read and
 * write it, the admin UI picks it — and the process battery proves a list-targeted send
 * reaches the list and nobody else.
 */
const read = (p: string) => readFileSync(join(__dirname, '../../..', p), 'utf8');

describe('the send honours the audience', () => {
  it('newsletter/send filters confirmed subscribers by audience_lists overlap, and only when there is one', () => {
    const send = read('supabase/functions/newsletter/send.ts');
    expect(send).toMatch(/audience_lists/);
    expect(send).toMatch(/overlaps\("lists", audience\)/);
    expect(send).toMatch(/q\.eq\("status", "confirmed"\)/);
  });

  it('the migration normalises list names on both tables', () => {
    const sql = read('supabase/migrations/20261005020000_nyhetsbrevet-far-listor.sql');
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS lists text\[\] NOT NULL DEFAULT '\{\}'/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS audience_lists text\[\] NOT NULL DEFAULT '\{\}'/);
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE OF lists ON public\.newsletter_subscribers/);
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE OF audience_lists ON public\.newsletters/);
  });
});

describe('both surfaces', () => {
  it('the skills declare the list actions and the audience', () => {
    const mod = read('src/lib/modules/newsletter-module.ts');
    for (const a of ["'lists'", "'add_to_list'", "'remove_from_list'"]) expect(mod).toContain(a);
    expect(mod).toMatch(/audience_lists: \{/);
    const edge = read('supabase/functions/agent-execute/index.ts');
    expect(edge).toMatch(/action === 'add_to_list' \|\| action === 'remove_from_list'/);
    expect(edge).toMatch(/updates\.audience_lists = audience/);
  });

  it('the admin page picks an audience and edits a subscriber\'s lists', () => {
    const page = read('src/pages/admin/NewsletterPage.tsx');
    expect(page.match(/<AudienceListsField/g)?.length).toBe(2);
    expect(page).toMatch(/<SubscriberListsCell/);
    expect(page).toMatch(/audienceReach\(newsletter\.audience_lists/);
  });

  it('a public signup can join a list, capped', () => {
    const sub = read('supabase/functions/newsletter/subscribe.ts');
    expect(sub).toMatch(/lists: requestedLists/);
    expect(sub).toMatch(/\.slice\(0, 5\)/);
  });
});

describe('reach text', () => {
  it('says who gets it', () => {
    expect(normalizeListName('  Kunder ')).toBe('kunder');
    expect(audienceReach([], [], 12)).toBe('Everyone confirmed (12)');
    expect(audienceReach(['kunder'], [{ list: 'kunder', subscribers: 5, confirmed: 3 }], 12)).toBe('kunder — up to 3 confirmed');
  });
});
