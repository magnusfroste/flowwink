import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { join } from 'path';

/**
 * Deals on a Swedish instance were born in dollars: the deals column default
 * was SEK, but a client-side `|| 'USD'` overrode it at insert. That was one of
 * a dozen scattered USD fallbacks — each one a place where an instance's own
 * currency configuration silently loses to a hardcoded literal.
 *
 * The rule this enforces:
 * - Writes omit the currency field and let the column default decide.
 * - Display fallbacks go through src/lib/platform-fallbacks.ts, which mirrors
 *   the platform_locale defaults.
 * - 'USD' as a *fallback expression* is forbidden. 'USD' as data (currency
 *   pickers, seed templates) is fine.
 */

const ROOT = join(__dirname, '../../..');

const grep = (pattern: string, dirs: string[]): string[] => {
  try {
    const out = execSync(
      `grep -rnE "${pattern}" ${dirs.join(' ')} --include='*.ts' --include='*.tsx' || true`,
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    );
    return out.split('\n').filter(Boolean);
  } catch {
    return [];
  }
};

/** Comment lines describing the bug are not the bug — the invite-link guard
 *  taught us that a guard matching its own explanation fails forever. */
const isComment = (line: string): boolean => {
  const code = line.split(':').slice(2).join(':').trimStart();
  return code.startsWith('//') || code.startsWith('*') || code.startsWith('/*');
};

const ALLOWED = [
  // The currency PICKER — 'USD' as a selectable option is data, not a fallback.
  'src/components/admin/StoreSettingsPanel.tsx',
  // A country's own currency (US → USD) is data: it applies only to a
  // business that said it is in the US.
  'supabase/functions/_shared/locale/home.ts',
  // Seed templates carry currency as literal template data.
  'src/data/templates/',
  // Tests may assert on the literal.
  '__tests__/', '.test.',
];

describe('currency fallback discipline', () => {
  it("no '|| USD' / '?? USD' fallback expressions in src or edge functions", () => {
    const hits = grep(
      String.raw`(\|\||\?\?)\s*'USD'`,
      ['src', 'supabase/functions'],
    ).filter((line) => !ALLOWED.some((a) => line.includes(a)) && !isComment(line));
    expect(hits, `Hardcoded USD fallbacks found:\n${hits.join('\n')}`).toEqual([]);
  });

  it("no 'currency: USD' literals outside pickers, seed data and tests", () => {
    const hits = grep(
      String.raw`currency:\s*'USD'`,
      ['src', 'supabase/functions'],
    ).filter((line) => !ALLOWED.some((a) => line.includes(a)) && !isComment(line));
    expect(hits, `Hardcoded USD literals found:\n${hits.join('\n')}`).toEqual([]);
  });

  it('the shared fallbacks match the platform_locale defaults', () => {
    // Two definitions of "the platform fallback" must never drift apart.
    const fallbacks = grep("FALLBACK_CURRENCY = ", ['src/lib/platform-fallbacks.ts']);
    const hookDefault = grep("default_currency: 'SEK'", ['src/hooks']);
    expect(fallbacks.join('')).toContain("'SEK'");
    expect(hookDefault.length).toBeGreaterThan(0);
  });
});
