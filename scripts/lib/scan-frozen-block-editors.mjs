/**
 * Block editors that copy their props into one-shot state.
 *
 * `useState(data)` freezes whatever the FIRST render passed. The parent handing
 * over new content afterwards changes nothing, so the editor shows the wrong
 * thing and — worse — the next Save writes the frozen copy back over the real
 * content.
 *
 * It has now bitten twice for different reasons:
 *   2026-08-18  a tab mounted before its query resolved; the saved footer
 *               variant lost to the defaults, and Save reverted the user's own
 *               earlier edits
 *   2026-08-31  switching the page editor between language versions kept the
 *               hero and CTA on the previous page's text — the component stays
 *               mounted across the route change
 *
 * The repair existed after the first one (useBlockEditor: prop-sync with an
 * equality guard) and nothing made the editors adopt it. Three had not, and a
 * person found two of them by hand. This is what makes the rail mandatory.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** A one-shot copy of the `data` prop, in any of its spellings. */
const FROZEN = [
  /useState\s*<[^>]*>\s*\(\s*data\s*\)/,
  /useState\s*\(\s*data\s*\)/,
  /useState\s*<[^>]*>\s*\(\s*\{\s*\.\.\.data\s*\}\s*\)/,
  /useState\s*\(\s*\{\s*\.\.\.data\s*\}\s*\)/,
];

/**
 * Comments out. A guard that reads PROSE can be fooled by prose — this one
 * flagged three files for the sentence explaining the bug it looks for, which
 * is the same weakness as a guard that only greps a string.
 */
function codeOnly(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/([^:])\/\/.*$/gm, '$1');
}

export function scanFrozenBlockEditors(root) {
  const dir = join(root, 'src/components/admin/blocks');
  const offenders = [];
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.tsx')) continue;
    const source = readFileSync(join(dir, file), 'utf8');
    // No file-level exemption. Skipping any file that MENTIONS useBlockEditor
    // would let an editor use the rail for one piece of state and freeze
    // another — and it hid a deliberate re-freeze during mutation testing,
    // which is how this hole was found. The patterns below are specific to a
    // one-shot copy of the `data` prop; the hook itself lives in src/hooks and
    // is never scanned.
    if (FROZEN.some((re) => re.test(codeOnly(source)))) offenders.push(file);
  }
  return offenders;
}
