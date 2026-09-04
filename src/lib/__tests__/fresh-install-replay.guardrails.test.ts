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

const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'));
// The finalizer carries a REAL timestamp, not an all-nines sentinel: a
// sentinel above every future version makes every later migration read as
// back-dated — to the forward-dating CI guard and to any ledger comparing
// against head. The finalizer only needs to sort after the migrations that
// exist at its creation; migrations authored later legitimately sort after it
// (see the cron rule below for what that implies).
const FINALIZER = files.find((f) => f.endsWith('_fresh-install-finalizer.sql'))!;
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

  it('has exactly one finalizer, with a real timestamp, sorted after every quiescing migration', () => {
    const finalizers = files.filter((f) => f.endsWith('_fresh-install-finalizer.sql'));
    expect(finalizers).toEqual([FINALIZER]);
    expect(FINALIZER, 'finalizer must carry a real YYYYMMDDHHMMSS timestamp, not a sentinel')
      .toMatch(/^20\d{12}_/);
    // Every migration that quiesces cron relies on the finalizer running LATER
    // to re-activate the jobs — on a fresh replay that is filename order.
    const quiescersAfter = files.filter(
      (f) => f > FINALIZER && /active\s*=>\s*false/.test(stripComments(read(f))),
    );
    expect(
      quiescersAfter,
      `These quiescing migrations sort AFTER the finalizer — their jobs would never be re-activated on a fresh replay: ${quiescersAfter.join(', ')}`,
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
      // Både `=>` och `:=` är giltig namngiven-argument-syntax i PL/pgSQL.
      // Matchar vi bara den ena blir vakten blind för den andra — se
      // kommentaren vid quiescence-detektionen nedan för varför det är farligt.
      /cron\.alter_job\([^)]*active\s*(?:=>|:=)\s*true/i,
    );
  });

  it('cron.schedule BEFORE the finalizer quiesces; AFTER it must NOT (jobs would be stranded dark)', () => {
    // Before the finalizer (fresh-replay stream): jobs must not fire into a
    // half-built schema, so every scheduling migration ends quiesced and the
    // finalizer re-activates. AFTER the finalizer the rule INVERTS: on an
    // existing instance a later migration runs alone — a quiescence block
    // there would deactivate every job on a live site with nothing ever
    // turning them back on. (Its own new job is safe active: it only calls
    // objects from migrations ≤ its own timestamp.)
    // Undantag: RIKTAD deaktivering är inte blankettsläckning. De här två
    // stänger av cron-jobb vars kommando pekar på en FRÄMMANDE instans host
    // (giftkedjan: en klonad instans ärver den ursprungliga instansens URL:er
    // och skjuter trafik dit). Loopen är filtrerad på
    // `substring(command ...) IS DISTINCT FROM v_own_host` — den rör aldrig ett
    // jobb som pekar rätt. Regeln nedan finns för att hindra att någon släcker
    // ALLA jobb efter finalizern; den ska inte hindra att man släcker de jobb
    // som bevisligen är fel.
    const TARGETED_DEACTIVATION = new Set([
      '20260812190000_outbound-cron-follows-the-instance.sql',
      '20260814145336_ee7237cc-0e9c-42aa-9e5b-d0ab4e73e721.sql',
      // Samma registrar (register_knowledge_indexer_cron) omdefinierad i
      // pulsform — loopen mot främmande host är kvar ordagrant, fortfarande
      // filtrerad på `IS DISTINCT FROM v_own_host`.
      '20260906170000_pulsen-far-en-ratt.sql',
    ]);
    const mustQuiesce: string[] = [];
    const mustNotQuiesce: string[] = [];
    for (const f of files) {
      if (f === FINALIZER) continue;
      const sql = stripComments(read(f));
      const schedules = /cron\.schedule\s*\(/i.test(sql);
      // `=>` OCH `:=` — PL/pgSQL godtar båda för namngivna argument. Vakten
      // måste se båda, och den farliga riktningen är POST-finalizer: en
      // migration som skriver `active := false` slår i verkligheten av varje
      // cron-jobb på en levande instans, men matchar vi bara `=>` passerar den
      // tyst genom "must NOT quiesce"-kontrollen. Fleeten skulle gå mörk utan
      // att ett enda test blev rött.
      const quiesces = /cron\.alter_job\([^)]*active\s*(?:=>|:=)\s*false/i.test(sql);
      if (f < FINALIZER && schedules && !quiesces) mustQuiesce.push(f);
      if (f > FINALIZER && quiesces && !TARGETED_DEACTIVATION.has(f)) mustNotQuiesce.push(f);
    }
    expect(
      mustQuiesce,
      `Pre-finalizer migrations calling cron.schedule without quiescence — on a fresh replay ` +
        `their jobs fire into a half-built schema: ${mustQuiesce.join(', ')}`,
    ).toEqual([]);
    expect(
      mustNotQuiesce,
      `Post-finalizer migrations must NOT quiesce — on a live instance they would switch every ` +
        `cron job off permanently: ${mustNotQuiesce.join(', ')}`,
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
