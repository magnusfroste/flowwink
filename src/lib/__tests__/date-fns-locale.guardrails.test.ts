import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setDefaultOptions, formatDistanceToNow, format } from 'date-fns';
import { resolveDateFnsLocale, applyDateFnsLocale } from '../date-fns-locale';

/**
 * Guardrail: relative time follows the platform locale.
 *
 * Absolute dates go through usePlatformFormat (Intl), but date-fns owns the
 * WORDS for relative time — `formatDistanceToNow` renders "3 days ago" from an
 * English list unless a locale is set. ~97 call sites; `setDefaultOptions`
 * fixes them all centrally, so the two mechanisms agree on one screen instead
 * of showing a Swedish date beside an English "3 days ago".
 */

describe('date-fns platform locale', () => {
  it('resolves BCP-47 tags, region-qualified first, then bare language', () => {
    expect(resolveDateFnsLocale('sv-SE').code).toBe('sv');
    expect(resolveDateFnsLocale('en-GB').code).toBe('en-GB');
    expect(resolveDateFnsLocale('en-US').code).toBe('en-US');
    expect(resolveDateFnsLocale('de').code).toBe('de');
  });

  it('falls back to en-US for unknown or missing tags — never throws', () => {
    expect(resolveDateFnsLocale('xx-YY').code).toBe('en-US');
    expect(resolveDateFnsLocale(null).code).toBe('en-US');
    expect(resolveDateFnsLocale(undefined).code).toBe('en-US');
    expect(resolveDateFnsLocale('').code).toBe('en-US');
  });

  it('actually changes relative time and localized tokens', () => {
    const past = new Date(Date.now() - 3 * 24 * 3600 * 1000);
    const d = new Date('2026-07-08T10:00:00Z');

    applyDateFnsLocale('en-US');
    expect(formatDistanceToNow(past, { addSuffix: true })).toMatch(/days ago/);
    expect(format(d, 'EEEE')).toBe('Wednesday');

    applyDateFnsLocale('sv-SE');
    expect(formatDistanceToNow(past, { addSuffix: true })).toMatch(/dagar sedan/);
    expect(format(d, 'EEEE')).toBe('onsdag');

    setDefaultOptions({ locale: undefined }); // leave no global state behind
  });

  it('is mounted at the app root, above the router', () => {
    const app = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8');
    expect(app, 'DateFnsLocaleSync must be mounted or relative time stays English')
      .toMatch(/<DateFnsLocaleSync\s*\/>/);
  });

  it('does not import the full date-fns locale set (bundle guard)', () => {
    const raw = readFileSync(join(process.cwd(), 'src/lib/date-fns-locale.ts'), 'utf8');
    // Strip comments first: the file explains WHY a namespace import is wrong by
    // quoting it, and that prose must not trip its own guard.
    const src = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('//'))
      .join('\n');
    expect(src, 'a namespace import pulls ~200 locales into the bundle')
      .not.toMatch(/import \* as \w+ from ['"]date-fns\/locale['"]/);
  });
});
