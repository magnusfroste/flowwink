/**
 * Content Memory — the guard against a recurring content objective re-writing
 * the same article forever.
 *
 * Regression corpus: the real flowwink.com titles published 8 Jun – 23 Jul 2026,
 * two a day, from one cron automation carrying a static topic. Any change to the
 * similarity measure must still see these as the same article.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  normalizeTitle,
  titleSimilarity,
  findSimilarTitles,
  formatContentMemory,
  loadRecentContent,
} from '../../../supabase/functions/_shared/domains/content-memory.ts';

// findSimilarTitles' default. Kept in one place so the corpus below documents
// the actual margin: real duplicates land at 0.67-1.0, false positives at 0.17.
const DUPLICATE_THRESHOLD = 0.6;

// The actual duplicates, from the live RSS feed.
const REAL_DUPLICATES = [
  'Why MCP and Open Source AI Agents Are Key to the Future of Business Operating Systems',
  'The Future of Business Operating Systems: Why MCP, Open Source AI Agents, and Open-Weights Models Matter',
  'Why MCP and Open Source AI Agents Are Shaping the Future of Business Operating Systems',
  'Why MCP is the Future of Business Operating Systems with AI Agents',
  'Why Open Source and Open Weights Make MCP the Future of AI Agents for Business Operating Systems',
];

const REAL_SWEDISH_DUPLICATES = [
  'AI Agents och Business Operating Systems: Varför MCP och Öppna Vikters Modeller Är Framtiden',
  'AI Agenter, Business Operating Systems och MCP: Varför Öppna Vikters Modeller Är Framtiden',
  'Framtidens Business Operating Systems: Varför AI-agenter, Open Source och Öppna Vikters MCP leder Vägen',
];

describe('normalizeTitle', () => {
  it('folds Swedish diacritics so å/ä/ö compare as a/a/o', () => {
    expect(normalizeTitle('Öppna Vikters Modeller')).toBe('oppna vikters modeller');
    expect(normalizeTitle('Varför MCP är Framtiden')).toBe('varfor mcp ar framtiden');
  });

  it('drops punctuation and collapses whitespace', () => {
    expect(normalizeTitle('AI-agenter,  Open Source & MCP: Varför?')).toBe(
      'ai agenter open source mcp varfor',
    );
  });

  it('survives null/undefined titles', () => {
    expect(normalizeTitle(undefined as unknown as string)).toBe('');
    expect(normalizeTitle(null as unknown as string)).toBe('');
  });
});

describe('titleSimilarity', () => {
  it('scores the real English duplicates as the same article', () => {
    for (let i = 0; i < REAL_DUPLICATES.length; i++) {
      for (let j = i + 1; j < REAL_DUPLICATES.length; j++) {
        const sim = titleSimilarity(REAL_DUPLICATES[i], REAL_DUPLICATES[j]);
        expect(
          sim,
          `"${REAL_DUPLICATES[i]}" vs "${REAL_DUPLICATES[j]}" scored ${sim.toFixed(2)}`,
        ).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLD);
      }
    }
  });

  it('scores the real Swedish duplicates as the same article', () => {
    for (let i = 0; i < REAL_SWEDISH_DUPLICATES.length; i++) {
      for (let j = i + 1; j < REAL_SWEDISH_DUPLICATES.length; j++) {
        const sim = titleSimilarity(REAL_SWEDISH_DUPLICATES[i], REAL_SWEDISH_DUPLICATES[j]);
        expect(
          sim,
          `"${REAL_SWEDISH_DUPLICATES[i]}" vs "${REAL_SWEDISH_DUPLICATES[j]}" scored ${sim.toFixed(2)}`,
        ).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLD);
      }
    }
  });

  it('does NOT flag genuinely different articles on the same site', () => {
    const distinct: Array<[string, string]> = [
      [
        'Why MCP is the Future of Business Operating Systems with AI Agents',
        'Bygg ett Content Marketing-maskineri med AI, Open Source och MCP',
      ],
      [
        'Why MCP and Open Source AI Agents Are Key to the Future of Business Operating Systems',
        'How we cut invoice reconciliation time by 80% with a single automation',
      ],
      ['Five ways to shorten your sales cycle', 'A field guide to payroll in Sweden'],
    ];
    for (const [a, b] of distinct) {
      const sim = titleSimilarity(a, b);
      expect(sim, `"${a}" vs "${b}" scored ${sim.toFixed(2)}`).toBeLessThan(DUPLICATE_THRESHOLD);
    }
  });

  it('is symmetric and self-identical', () => {
    const [a, b] = REAL_DUPLICATES;
    expect(titleSimilarity(a, b)).toBeCloseTo(titleSimilarity(b, a));
    expect(titleSimilarity(a, a)).toBe(1);
  });

  it('returns 0 rather than throwing on empty or stopword-only titles', () => {
    expect(titleSimilarity('', 'anything')).toBe(0);
    expect(titleSimilarity('the and of', 'a to in')).toBe(0);
  });
});

describe('findSimilarTitles', () => {
  const existing = REAL_DUPLICATES.map((title) => ({ title, status: 'published' }));

  it('finds prior coverage for a would-be 6th duplicate, most similar first', () => {
    const hits = findSimilarTitles(
      'Why MCP, Open Source and AI Agents Are the Future of Business Operating Systems',
      existing,
    );
    expect(hits.length).toBeGreaterThan(0);
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1].similarity).toBeGreaterThanOrEqual(hits[i].similarity);
    }
  });

  it('returns nothing for a genuinely new topic', () => {
    expect(findSimilarTitles('Our Q3 pricing changes, explained', existing)).toHaveLength(0);
  });

  it('handles an empty or missing back-catalogue', () => {
    expect(findSimilarTitles('anything', [])).toHaveLength(0);
    expect(findSimilarTitles('anything', undefined as never)).toHaveLength(0);
  });
});

describe('formatContentMemory', () => {
  it('is empty for a site with no posts, so callers can concatenate blindly', () => {
    expect(formatContentMemory([])).toBe('');
    expect(formatContentMemory(undefined as never)).toBe('');
  });

  it('lists every title and tells the model not to re-word or translate one', () => {
    const block = formatContentMemory(REAL_DUPLICATES.map((title) => ({ title })));
    for (const t of REAL_DUPLICATES) expect(block).toContain(t.slice(0, 100));
    expect(block).toMatch(/different angle/i);
    expect(block).toMatch(/another language/i);
  });

  it('truncates a runaway title instead of blowing the prompt budget', () => {
    const block = formatContentMemory([{ title: 'x'.repeat(400) }]);
    expect(block).toContain('x'.repeat(100));
    expect(block).not.toContain('x'.repeat(101));
  });
});

describe('loadRecentContent', () => {
  const stubClient = (rows: unknown, throws = false) => ({
    from: () => ({
      select: () => ({
        order: () => ({
          limit: () => {
            if (throws) throw new Error('relation "blog_posts" does not exist');
            return Promise.resolve({ data: rows });
          },
        }),
      }),
    }),
  });

  it('drops rows without a title', async () => {
    const rows = await loadRecentContent(
      stubClient([{ title: 'Real post' }, { title: '' }, { title: null }, {}]),
    );
    expect(rows.map((r) => r.title)).toEqual(['Real post']);
  });

  it('degrades to empty rather than failing the whole generation', async () => {
    expect(await loadRecentContent(stubClient(null, true))).toEqual([]);
    expect(await loadRecentContent(stubClient(null))).toEqual([]);
  });
});

// ─── Wiring guardrail ───────────────────────────────────────────────────────
// The 12 Jul fix put content memory in the heartbeat prompt only, while the
// duplicates were coming from the cron → automation-dispatcher → ai-task path.
// Duplicates kept landing for 11 more days. Assert every generative content
// task actually loads the memory, so the next fix can't be half-wired again.
describe('every generative content task loads content memory', () => {
  const tasksSrc = readFileSync(
    join(process.cwd(), 'supabase/functions/ai-task/tasks.ts'),
    'utf-8',
  );

  const CONTENT_TASKS = ['content_research', 'content_proposal', 'seo_content_brief'];

  it.each(CONTENT_TASKS)('%s calls loadContentMemoryBlock', (taskName) => {
    const start = tasksSrc.indexOf(`name: "${taskName}"`);
    expect(start, `task ${taskName} not found in tasks.ts`).toBeGreaterThan(-1);
    // Scan to the next task definition (or EOF) — the whole TaskSpec body.
    const rest = tasksSrc.slice(start + 1);
    const nextIdx = rest.search(/\n(?:const \w+Task: TaskSpec|export const TASKS)/);
    const body = nextIdx === -1 ? rest : rest.slice(0, nextIdx);
    expect(body).toContain('loadContentMemoryBlock');
    expect(body).toContain('existing_coverage');
  });

  it('injects existing_coverage into the prompt, not just the load step', () => {
    for (const taskName of CONTENT_TASKS) {
      const start = tasksSrc.indexOf(`name: "${taskName}"`);
      const rest = tasksSrc.slice(start + 1);
      const nextIdx = rest.search(/\n(?:const \w+Task: TaskSpec|export const TASKS)/);
      const body = nextIdx === -1 ? rest : rest.slice(0, nextIdx);
      const systemIdx = body.indexOf('system:');
      expect(systemIdx, `${taskName} has no system prompt`).toBeGreaterThan(-1);
      expect(
        body.slice(systemIdx).includes('existing_coverage'),
        `${taskName} loads content memory but never puts it in the system prompt`,
      ).toBe(true);
    }
  });

  it('the heartbeat uses the shared helper rather than its own copy', () => {
    const heartbeat = readFileSync(
      join(process.cwd(), 'supabase/functions/flowpilot-heartbeat/index.ts'),
      'utf-8',
    );
    expect(heartbeat).toContain('loadContentMemoryBlock');
    expect(
      heartbeat.includes('.from("blog_posts")\n    .select("title'),
      'heartbeat re-grew a private recent-titles query — use content-memory.ts',
    ).toBe(false);
  });
});
