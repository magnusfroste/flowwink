import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { instanceIsNewborn, NEWBORN_HOURS } from '../../../supabase/functions/_shared/feedback/machine-room-reports';

/**
 * The same report is one post (2026-11-15).
 *
 * www's public board read 62 open bugs; 60 were three titles filed four times
 * a day from http://localhost:5173 by twenty instance ids — every CI stack is a
 * new instance, fails skills on purpose, and reported it upstream. The
 * sender's cadence is per instance and cannot hold against a new instance per
 * run. Three locks: a test stack sends nothing, a newborn instance files no
 * defect, and the receiver joins a report to the open post that already says it.
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf-8');

describe('a newborn instance files no defect', () => {
  const now = new Date('2026-11-15T12:00:00Z');
  it('is newborn for its first day, by its own birth', () => {
    expect(NEWBORN_HOURS).toBe(24);
    expect(instanceIsNewborn('2026-11-15T11:58:00Z', now)).toBe(true);
    expect(instanceIsNewborn('2026-11-14T12:30:00Z', now)).toBe(true);
    expect(instanceIsNewborn('2026-11-14T11:00:00Z', now)).toBe(false);
  });
  it('an instance whose birth is unknown is not held (an older install reports as before)', () => {
    expect(instanceIsNewborn(null, now)).toBe(false);
    expect(instanceIsNewborn('not a date', now)).toBe(false);
  });
  it('the check comes before anything is read or filed', () => {
    const src = read('supabase/functions/_shared/feedback/machine-room-reports.ts');
    const body = src.slice(src.indexOf('export async function fileMachineRoomReports'));
    expect(body.indexOf('instanceIsNewborn(bornAt)')).toBeGreaterThan(0);
    expect(body.indexOf('instanceIsNewborn(bornAt)')).toBeLessThan(body.indexOf("rpc('cron_health_report')"));
    expect(body.indexOf('instanceIsNewborn(bornAt)')).toBeLessThan(body.indexOf('await submit('));
  });
});

describe('a test stack tells the fleet nothing', () => {
  it('qa:prep switches sharing off on the instance — every battery runner, not one workflow', () => {
    const prep = read('scripts/process-battery/prep-local-stack.ts');
    expect(prep).toMatch(/'\{"share_usage": false\}'::jsonb/);
    // Merged into the setting, never replacing it.
    expect(prep).toMatch(/site_settings\.value \|\| '\{"share_usage": false\}'::jsonb/);
  });
  it('every workflow that serves the edge functions says so in their environment', () => {
    const dir = join(root, '.github/workflows');
    const serving = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).filter((f) => /^\s*(nohup\s+)?(npx\s+\S+\s+)?supabase functions serve/m.test(readFileSync(join(dir, f), 'utf-8')));
    expect(serving.length).toBeGreaterThan(0);
    for (const f of serving) {
      const src = readFileSync(join(dir, f), 'utf-8');
      expect(src, f).toMatch(/FEEDBACK_SHARE_USAGE=false/);
      for (const line of src.split('\n').filter((l) => /^\s*(nohup\s+)?(npx\s+\S+\s+)?supabase functions serve/.test(l))) {
        expect(line, f).toMatch(/--env-file/);
      }
    }
  });
});

describe('the receiver joins a report to the open post that says it', () => {
  const migration = read('supabase/migrations/20261115120000_lika-rapporter-ar-ett-inlagg.sql');
  const join_ = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.feedback_join_report'), migration.indexOf('REVOKE ALL ON FUNCTION public.feedback_join_report'));

  it('both doors ask before they write a post: the wire and the instance itself', () => {
    const api = read('supabase/functions/content-api/index.ts');
    const post = api.slice(api.indexOf("if (sub === '') {"), api.indexOf("if (sub === 'ping') {"));
    expect(post.indexOf("rpc('feedback_join_report'")).toBeGreaterThan(0);
    expect(post.indexOf("rpc('feedback_join_report'")).toBeLessThan(post.indexOf("from('feedback_posts').insert("));
    // Only a report from an instance: a person's post on the board is never merged.
    expect(post).toMatch(/if \(originUrl\) \{[\s\S]*?feedback_join_report/);

    const core = read('supabase/functions/_shared/execute/core.ts');
    const here = core.slice(core.indexOf('if (receiveHere) {'), core.indexOf("const r = await postTo('feedback', payload)"));
    expect(here.indexOf("rpc('feedback_join_report'")).toBeGreaterThan(0);
    expect(here.indexOf("rpc('feedback_join_report'")).toBeLessThan(here.indexOf("from('feedback_posts')"));
  });

  it('joins only open work filed by an instance or an agent', () => {
    expect(join_).toMatch(/status IN \('open', 'planned', 'in_progress'\)/);
    expect(join_).toMatch(/source IN \('instance', 'agent'\)/);
    expect(join_).toMatch(/FOR UPDATE/);
  });

  it('the join is the service role\'s; the key is the database\'s, on every post', () => {
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.feedback_join_report\(text, text, text, text\) FROM PUBLIC, anon, authenticated;/);
    expect(migration).toMatch(/BEFORE INSERT OR UPDATE OF title ON public\.feedback_posts/);
  });

  it('the board still answers where the migration lags the edge deploy', () => {
    const api = read('supabase/functions/content-api/index.ts');
    expect(api).toMatch(/if \(error && \/reports_count\/\.test\(String\(error\.message\)\)\) \(\{ data, error \} = await list\(BOARD_COLUMNS\)\);/);
    // …and a missing join function writes the post, as before.
    expect(api).toMatch(/if \(joinErr\) console\.warn\('\[feedback\] join skipped:'/);
  });

  it('existing duplicates are merged only where no person reacted', () => {
    const merge = migration.slice(migration.indexOf('DO $merge$'), migration.indexOf('END\n$merge$'));
    expect(merge).toMatch(/votes_count = 0 AND comments_count = 0/);
    expect(merge).toMatch(/source IN \('instance', 'agent'\)/);
  });
});

describe('the fleet forgets an instance that pinged once', () => {
  // www listed 35 instances; 27 were test stacks on localhost with one ping each.
  const sql = read('supabase/migrations/20261115150000_fleeten-glommer-engangsinstanser.sql');
  const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.feedback_forget_one_time_instances'), sql.indexOf('REVOKE ALL ON FUNCTION public.feedback_forget_one_time_instances'));

  it('one ping and unseen for a week — and nothing names localhost', () => {
    expect(fn).toMatch(/coalesce\(ping_count, 1\) <= 1 AND last_seen_at < now\(\) - interval '7 days'/);
    // A self-hoster on a laptop pings daily and stays: the rule is the evidence, never the address.
    expect(fn).not.toMatch(/localhost|127\.0\.0\.1/);
  });

  it('runs in the one nightly housekeeping job, after the thinning', () => {
    expect(sql).toMatch(/cron\.schedule\('prune-logs', '50 3 \* \* \*',\s*\$cmd\$SELECT public\.prune_logs\(\); SELECT public\.feedback_forget_one_time_instances\(\)\$cmd\$\)/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.feedback_forget_one_time_instances\(boolean\) FROM PUBLIC, anon, authenticated;/);
  });
});
