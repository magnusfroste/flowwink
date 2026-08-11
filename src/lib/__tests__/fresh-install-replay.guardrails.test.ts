import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Fresh-install replay guardrails.
 *
 * The first GitHub-integration provisioning of a brand-new Supabase project
 * replays every migration from scratch — and died on the very first attempt
 * (2026-08-10, project ypkh): MIGRATIONS_FAILED after 5 files. Root causes,
 * each of which is a rule below:
 *
 *  1. DEADLOCK (SQLSTATE 40P01) on storage.buckets: the platform's own storage
 *     service runs its internal migrator concurrently at project birth, and
 *     any mid-stream migration touching storage.* races it. Fix: ALL storage
 *     DDL lives in one always-last finalizer that retries on deadlock.
 *  2. Duplicate version prefixes: two files sharing a timestamp break the
 *     ledger (version is the key) — one silently wins.
 *  3. Cron jobs firing into a half-built schema: replay-time cron.schedule
 *     creates ACTIVE jobs mid-replay. Fix: every scheduling migration ends by
 *     quiescing all jobs; the finalizer activates them once the schema is
 *     complete.
 *  4. `UPDATE cron.job` needs a table privilege the postgres role does NOT
 *     have on fresh (PG17) projects — cron.alter_job() is the portable path
 *     (verified live: the UPDATE form failed, alter_job succeeded).
 *
 * A new customer's instance has no agent watching the first replay — it must
 * go through on Supabase without a single error. These rules keep it that way.
 */

const MIGRATIONS = join(__dirname, '../../../supabase/migrations');
const FINALIZER = '99999999999999_fresh-install-finalizer.sql';

const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'));
const read = (f: string) => readFileSync(join(MIGRATIONS, f), 'utf8');
/** SQL with `--` line comments removed, so prose about storage.* doesn't trip rules. */
const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, '');

describe('fresh-install replay guardrails', () => {
  it('has no duplicate version prefixes (version is the ledger key)', () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const f of files) {
      const version = f.split('_')[0];
      const prev = seen.get(version);
      if (prev) dupes.push(`${version}: ${prev} + ${f}`);
      seen.set(version, f);
    }
    expect(dupes, `Duplicate migration versions break the ledger:\n${dupes.join('\n')}`).toEqual([]);
  });

  it('has exactly one finalizer, and it sorts after every other migration forever', () => {
    const finalizers = files.filter((f) => f.startsWith('99999999999999_'));
    expect(finalizers).toEqual([FINALIZER]);
    // Timestamps are 14-digit YYYYMMDDHHMMSS — every real one starts with a
    // year (2…), so the all-nines version sorts last for the next ~7970 years.
    const after = files.filter((f) => f > FINALIZER);
    expect(
      after,
      `These migrations sort AFTER the finalizer — storage/cron bootstrap would run before them: ${after.join(', ')}`,
    ).toEqual([]);
  });

  it('keeps ALL storage DDL inside the finalizer (mid-stream storage.* deadlocks at project birth)', () => {
    const violations: string[] = [];
    for (const f of files) {
      if (f === FINALIZER) continue;
      const sql = stripComments(read(f));
      if (/INSERT\s+INTO\s+storage\.|ON\s+storage\.(objects|buckets)|UPDATE\s+storage\.|DELETE\s+FROM\s+storage\./i.test(sql)) {
        violations.push(f);
      }
    }
    expect(
      violations,
      `storage.* DDL outside the finalizer races the storage service's own migrator ` +
        `on fresh projects (deadlock 40P01). Move it into ${FINALIZER}: ${violations.join(', ')}`,
    ).toEqual([]);
  });

  it('finalizer creates the buckets, retries on deadlock, and activates cron', () => {
    const sql = read(FINALIZER);
    // The five buckets the code writes to — losing one from the finalizer
    // means a fresh install is born with an upload path that 404s.
    for (const bucket of ['cms-images', 'documents', 'form-uploads', 'river-media', 'cowork-uploads']) {
      expect(sql, `finalizer must create bucket ${bucket}`).toContain(`'${bucket}'`);
    }
    expect(sql, 'finalizer must retry on deadlock_detected').toMatch(/WHEN\s+deadlock_detected/i);
    expect(sql, 'finalizer must re-activate the jobs the stream quiesced').toMatch(
      /cron\.alter_job\([^)]*active\s*=>\s*true/i,
    );
  });

  it('every migration that schedules cron jobs ends quiesced (jobs must not fire into a half-built schema)', () => {
    const violations: string[] = [];
    for (const f of files) {
      if (f === FINALIZER) continue;
      const sql = stripComments(read(f));
      if (!/cron\.schedule\s*\(/i.test(sql)) continue;
      if (!/cron\.alter_job\([^)]*active\s*=>\s*false/i.test(sql)) violations.push(f);
    }
    expect(
      violations,
      `These migrations call cron.schedule without the quiescence block — on a fresh replay ` +
        `their jobs fire into a half-built schema: ${violations.join(', ')}`,
    ).toEqual([]);
  });

  it('never touches cron.job with plain UPDATE (no table privilege on fresh PG17 projects)', () => {
    const violations = files.filter((f) => /UPDATE\s+cron\.job\b/i.test(stripComments(read(f))));
    expect(
      violations,
      `UPDATE cron.job fails with "permission denied" on fresh projects — use cron.alter_job(): ${violations.join(', ')}`,
    ).toEqual([]);
  });
});
