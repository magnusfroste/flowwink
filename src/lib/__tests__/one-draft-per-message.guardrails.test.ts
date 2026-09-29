import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * One draft per inbound email — said in the database, not only in the code.
 * Resta (2026-09-04): two draft_email_reply runs three seconds apart both
 * passed the "already answered?" read and both filed a draft. A partial unique
 * index makes the second insert impossible; every path that files a draft
 * answers "already drafted" instead of failing.
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('one draft per inbound message', () => {
  const migrations = readdirSync(join(root, 'supabase/migrations'));
  const mig = migrations.find((f) => f.endsWith('_ett-utkast-per-mejl.sql'));

  it('the database refuses a second draft, after retiring existing duplicates', () => {
    expect(mig, 'the migration exists').toBeTruthy();
    const sql = read(`supabase/migrations/${mig}`);
    const retire = sql.indexOf("SET status = 'discarded'");
    const index = sql.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS outbound_communications_one_draft_per_message');
    expect(retire, 'existing duplicates are retired, never deleted').toBeGreaterThan(-1);
    expect(index).toBeGreaterThan(retire);
    expect(sql).not.toMatch(/DELETE FROM public\.outbound_communications/i);
  });

  it('every call that files a draft handles the duplicate', () => {
    const h = read('supabase/functions/_shared/handlers/draft-email-reply.ts');
    expect(h).toMatch(/res\.error\.code === '23505'/);
    const calls = [...h.matchAll(/const \{([^}]*)\} = await fileDraft\(/g)].map((m) => m[1]);
    expect(calls.length).toBeGreaterThanOrEqual(3);
    for (const c of calls) expect(c, `a fileDraft call ignores the duplicate: {${c}}`).toMatch(/\bduplicate\b/);
  });
});
