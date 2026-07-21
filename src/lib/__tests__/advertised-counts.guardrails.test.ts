import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Guardrail: the skill and module counts we advertise must track reality.
 *
 * Found 2026-07-21, the day clawable.org started sending traffic: the README,
 * CLAUDE.md, nine docs and both FlowWink templates all claimed "300+ skills"
 * (some "250+") while the platform shipped 512 across 68 modules. The figures
 * had been hand-written and hand-updated, so they aged silently — nothing
 * compared them to the artifact.
 *
 * Only the "N+" form is policed. A bare "28 skills" is almost always a subset
 * — the accounting module's count, the skills one process touches — and an
 * early draft of this test flagged five of those as stale. The "+" is what
 * marks a claim about the whole platform, and the "+" is what ages.
 *
 * A "N+" claim must be ≤ actual and no more than one bracket stale (100 for
 * skills, 10 for modules). So 500+ is correct at 512 and stays correct until
 * we pass 600 — then this fails and the copy gets a deliberate bump rather
 * than drifting for another six months.
 *
 * The canonical surfaces are pinned separately, because those are the ones a
 * visitor reads first.
 *
 * Dated reports are exempt: a QA status from June should keep saying what was
 * true in June.
 */

const root = process.cwd();

function artifactCounts(): { skills: number; modules: number } {
  const raw = JSON.parse(readFileSync(join(root, 'supabase/seed/module-skills.json'), 'utf8'));
  const mods = Array.isArray(raw) ? raw : (raw.modules ?? raw);
  if (Array.isArray(mods)) {
    return {
      modules: mods.length,
      skills: mods.reduce((n: number, m: any) => n + (m.skills?.length ?? 0), 0),
    };
  }
  const values = Object.values(mods) as any[];
  return {
    modules: values.length,
    skills: values.reduce(
      (n: number, v: any) => n + (Array.isArray(v) ? v.length : (v.skills?.length ?? 0)),
      0,
    ),
  };
}

/** Dated write-ups — history, not claims. */
const EXEMPT = [
  'docs/operators/openclaw-mcp-qa-status.md',
  'PROCESS-VALIDATION-REPORT.md',
  // This guardrail necessarily quotes the numbers it polices.
  'src/lib/__tests__/advertised-counts.guardrails.test.ts',
];

const SEARCH_DIRS = ['docs', 'src/data/templates', 'supabase/seed'];
const ROOT_FILES = ['README.md', 'CLAUDE.md'];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(md|ts|tsx)$/.test(entry)) out.push(p);
  }
  return out;
}

function claimFiles(): string[] {
  const files = [...ROOT_FILES.map((f) => join(root, f))];
  for (const d of SEARCH_DIRS) {
    try {
      files.push(...walk(join(root, d)));
    } catch {
      /* directory may not exist */
    }
  }
  return files.filter((f) => !EXEMPT.includes(relative(root, f)));
}

describe('advertised counts', () => {
  const { skills, modules } = artifactCounts();

  it('the artifact itself is sane', () => {
    expect(skills).toBeGreaterThan(100);
    expect(modules).toBeGreaterThan(10);
  });

  function staleClaims(pattern: RegExp, actual: number, bracketSize: number): string[] {
    const stale: string[] = [];
    for (const file of claimFiles()) {
      for (const m of readFileSync(file, 'utf8').matchAll(pattern)) {
        const claimed = Number(m[1]);
        const floor = Math.floor(actual / bracketSize) * bracketSize;
        if (claimed > actual || claimed < floor) {
          stale.push(`${relative(root, file)}: "${m[0].trim()}" (actual: ${actual})`);
        }
      }
    }
    return stale;
  }

  it('no "N+ skills" claim has been outgrown', () => {
    const stale = staleClaims(/\b(\d{2,4})\+[ -](?:MCP[ -]?(?:exposed )?)?skills\b/gi, skills, 100);
    expect(stale, `we ship ${skills} skills:\n${stale.join('\n')}`).toEqual([]);
  });

  it('no "N+ modules" claim has been outgrown', () => {
    const stale = staleClaims(/\b(\d{2,3})\+[ -](?:business )?modules\b/gi, modules, 10);
    expect(stale, `we ship ${modules} modules:\n${stale.join('\n')}`).toEqual([]);
  });

  it('the surfaces a visitor reads first carry the current numbers', () => {
    // README and CLAUDE.md are the repo's front door; the two FlowWink
    // templates are what every new install renders. These four had all gone
    // stale together, so pin them rather than trusting the pattern scan.
    const CANONICAL = [
      'README.md',
      'CLAUDE.md',
      'src/data/templates/demo-company.ts',
      'src/data/templates/flowwink-platform.ts',
    ];
    const wrong: string[] = [];
    for (const rel of CANONICAL) {
      const text = readFileSync(join(root, rel), 'utf8');
      // Any three-digit skill figure in these files must be the current one.
      for (const m of text.matchAll(/\b(\d{3})\+?[ -](?:MCP[ -]?(?:exposed )?)?skills\b/gi)) {
        const claimed = Number(m[1]);
        if (claimed > skills || claimed < Math.floor(skills / 100) * 100) {
          wrong.push(`${rel}: "${m[0].trim()}"`);
        }
      }
    }
    expect(wrong, `stale on a front-door surface (actual: ${skills}):\n${wrong.join('\n')}`).toEqual(
      [],
    );
  });
});
