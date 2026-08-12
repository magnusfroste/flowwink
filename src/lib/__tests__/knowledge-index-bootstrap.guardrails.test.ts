import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The knowledge index must be able to start without a human.
 *
 * INCIDENT (www.flowwink.com, 2026-08-12). The indexer registered its own cron
 * job on its first run — and on a CLI-free install nobody ever made that first
 * call. A self-registering cron that only registers when it runs cannot start.
 * The queue filled to 156 items, `knowledge_chunks` stayed empty, and the
 * visitor chat answered with no grounding at all: asked to list the site's
 * process pages it invented seven that do not exist.
 *
 * It cascaded, which is why it matters more than one broken feature: the
 * newsletter-cron fix (20260718090000) derives the instance's own URL from the
 * knowledge-indexer job's command. With no such job that fix silently did
 * nothing, so every fresh instance kept DEV's hardcoded newsletter URL and
 * POSTed its scheduled newsletters at the wrong project. One missing cron job,
 * two broken subsystems, zero error messages.
 *
 * Three properties keep it started, and each is pinned below:
 *   1. A migration registers the sweeper — SQL, not a first-run side effect.
 *   2. Retrieval returning nothing falls through to full-text grounding, so an
 *      index that is empty (new instance, page published a minute ago, no
 *      embedding key) still yields grounded answers.
 *   3. The admin surface shows the index state, so "empty" is visible rather
 *      than merely tasted in vaguer answers.
 */

const ROOT = join(__dirname, '../../..');
const MIGRATIONS = join(ROOT, 'supabase/migrations');
const CHAT_COMPLETION = join(ROOT, 'supabase/functions/chat-completion/index.ts');
const OBSERVABILITY = join(ROOT, 'src/components/admin/system/ObservabilityTab.tsx');

function migrationSources(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(MIGRATIONS, f), 'utf-8'));
}

describe('the sweeper is registered by SQL, not by its own first run', () => {
  it('a migration schedules the knowledge-indexer cron job', () => {
    const scheduling = migrationSources().filter(
      (sql) => /cron\.schedule\(\s*'knowledge-indexer'/.test(sql),
    );
    expect(
      scheduling.length,
      'no migration registers the knowledge-indexer cron — a fresh instance would never index anything',
    ).toBeGreaterThan(0);
  });

  it('does so without hardcoding a project ref (every instance is its own)', () => {
    const bootstrap = migrationSources().find((sql) =>
      /cron\.schedule\(\s*'knowledge-indexer'/.test(sql) && /derive|template|borrow/i.test(sql),
    );
    expect(bootstrap, 'the bootstrap migration must derive the URL, not hardcode one').toBeDefined();
    expect(
      bootstrap!,
      'a hardcoded supabase.co host would point every customer instance at one project — the exact newsletter-cron bug',
    ).not.toMatch(/https:\/\/[a-z0-9]{20}\.supabase\.co/);
  });

  it('seeds the queue with content that already exists', () => {
    // The original retrieval migration seeded on an EMPTY database — content
    // arrives later, with the template. Re-seeding at bootstrap covers it.
    const bootstrap = migrationSources().find((sql) =>
      /cron\.schedule\(\s*'knowledge-indexer'/.test(sql),
    )!;
    expect(bootstrap).toMatch(/INSERT INTO public\.knowledge_index_queue[\s\S]*FROM public\.pages/);
    expect(bootstrap).toMatch(/INSERT INTO public\.knowledge_index_queue[\s\S]*FROM public\.kb_articles/);
  });
});

describe('an empty index degrades to full-text grounding, never to no grounding', () => {
  const src = readFileSync(CHAT_COMPLETION, 'utf-8');

  it('treats "zero chunks" as a fallback trigger, not as an empty answer', () => {
    expect(
      src,
      'returning "" on zero chunks is what let the assistant answer from imagination',
    ).not.toMatch(/if\s*\(!chunks\.length\)\s*return\s*'';/);
    expect(src).toMatch(/if\s*\(!chunks\.length\)\s*throw new EmptyIndexError\(\)/);
  });

  it('routes that trigger into the full-text builder', () => {
    // Same catch that handles a thrown retrieval error — one fallback path.
    expect(src).toMatch(/buildRetrievedKnowledge\(\)\.catch\(/);
    expect(src).toMatch(/return buildKnowledgeBase\(/);
  });
});

describe('the index is visible in the admin surface', () => {
  const src = readFileSync(OBSERVABILITY, 'utf-8');

  it('renders a Knowledge Index card with a manual sweep', () => {
    expect(src).toMatch(/Knowledge Index/);
    expect(src).toMatch(/useKnowledgeIndexHealth/);
    expect(src).toMatch(/useRunKnowledgeIndexer/);
    expect(src).toMatch(/<KnowledgeIndexCard \/>/);
  });

  it('warns explicitly when nothing is indexed', () => {
    expect(
      src,
      'an empty index must announce itself — it is otherwise invisible except as vaguer answers',
    ).toMatch(/Nothing indexed yet/);
  });
});
