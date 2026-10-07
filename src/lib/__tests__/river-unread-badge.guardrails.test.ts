import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { riverModule } from '@/lib/modules/river-module';

/**
 * A signed-in user could not see that anyone had posted in River: no sidebar
 * badge, nothing in the bell. The smallest fix — a read mark per user and a
 * count of others' posts since it — lives here. No notification table, no
 * mentions, nothing new for the user to learn.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const migration = read('supabase/migrations/20261005130000_floden-sager-att-nagon-skrivit.sql');

describe('the River unread badge', () => {
  it('counts only OTHERS\' posts since the viewer\'s own read mark, and a week back for a newcomer', () => {
    expect(migration).toMatch(/p\.author_id <> auth\.uid\(\)/);
    expect(migration).toMatch(/river_read_marks m WHERE m\.user_id = auth\.uid\(\)/);
    expect(migration).toMatch(/now\(\) - interval '7 days'/);
    expect(migration).toMatch(/CASE WHEN auth\.uid\(\) IS NULL THEN 0/);
  });

  it('the read mark is the viewer\'s own row, nobody else\'s', () => {
    expect(migration).toMatch(/USING \(user_id = auth\.uid\(\)\) WITH CHECK \(user_id = auth\.uid\(\)\)/);
    expect(migration).toMatch(/ON CONFLICT \(user_id\) DO UPDATE SET last_seen_at/);
    expect(migration).not.toMatch(/has_role\(/);
  });

  it('the sidebar shows it on the River item, and the River page clears it when on screen', () => {
    const badge = read('src/components/admin/SidebarBadge.tsx');
    expect(badge).toMatch(/'\/admin\/river',/);
    expect(badge).toMatch(/if \(href === '\/admin\/river'\) return <RiverUnreadBadge \/>/);
    const page = read('src/pages/admin/RiverPage.tsx');
    expect(page).toMatch(/useMarkRiverSeen\(\)/);
    expect(page).toMatch(/\[enabled, isLoading, newestAt\]/);
  });

  it('the read mark belongs to the River module\'s data', () => {
    expect(riverModule.data?.tables).toContain('river_read_marks');
  });
});
