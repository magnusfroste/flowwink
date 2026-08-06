import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Tailwind Typography colours `strong`, headings and links itself, and those
 * colours win over an inherited `text-muted-foreground`. A `prose` container
 * without `dark:prose-invert` therefore renders bold text near-black — visible
 * on a light page, invisible on a dark one.
 *
 * It surfaced the moment KB answers gained real <strong> elements: before the
 * Markdown fix the asterisks were literal characters, so the styling bug had
 * nothing to style and nobody could see it. Two of the three KB render paths
 * were missing it; the third had it right all along.
 */

// Admin included: the guard originally covered only the public surfaces, and
// the same bug re-appeared in every Tiptap EDITOR — a salesperson reading
// prepped KB material saw near-black bold on dark. Consumption and authoring
// surfaces get the same rule.
const roots = ['src/components/public', 'src/components/admin', 'src/pages'];
const repo = resolve(__dirname, '../../..');

// Forced-light surfaces: these imitate an always-light medium (an email
// client, a social channel card) on a bg-white container — prose-invert there
// would render light text on the white card. Each entry must keep its
// hardcoded light background to stay exempt.
const FORCED_LIGHT = ['content-hub/ChannelMockup.tsx'];

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(p)) out.push(p);
  }
  return out;
}

const offenders: { file: string; line: number; cls: string }[] = [];
for (const root of roots) {
  for (const file of walk(resolve(repo, root))) {
    // className can span several lines — matching line by line missed
    // TextBlock's multi-line class entirely and would have called it clean
    // whether or not it inverted. Scan the whole file and count newlines to
    // report a useful position.
    const src = readFileSync(file, 'utf-8');
    if (FORCED_LIGHT.some((f) => file.endsWith(f))) continue;
    // Two ways a prose class reaches the DOM: className props, and Tiptap's
    // editorProps.attributes `class:` — the KB editor's bold-on-dark bug hid
    // in the second for weeks because every sweep only greppped the first.
    const patterns = [
      /className="([^"]*\bprose\b[^"]*)"/gs,
      /class:\s*"([^"]*\bprose\b[^"]*)"/gs,
    ];
    for (const pat of patterns) {
      for (const m of src.matchAll(pat)) {
        const cls = m[1].replace(/\s+/g, ' ').trim();
        if (cls.includes('prose-invert')) continue;
        offenders.push({
          file: file.replace(repo + '/', ''),
          line: src.slice(0, m.index).split('\n').length,
          cls,
        });
      }
    }
  }
}

describe('rich text stays readable in dark mode', () => {
  it('every public prose container inverts for dark', () => {
    expect(
      offenders,
      'these containers colour bold text near-black regardless of theme — ' +
        'add dark:prose-invert:\n' +
        offenders.map((o) => `  ${o.file}:${o.line}  ${o.cls}`).join('\n'),
    ).toEqual([]);
  });
});
