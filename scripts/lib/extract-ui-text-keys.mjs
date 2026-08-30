/**
 * The visitor-text catalogue, read out of the code that actually uses it.
 *
 * `site_settings.ui_text` stores only what somebody has already translated. An
 * editor built on the stored map alone can therefore show a site's Swedish
 * strings and nothing else — it can never reveal the eleven keys nobody has
 * touched yet, which are exactly the ones still showing English on a Swedish
 * site. The keys live at the call sites (`t('kb.noResults', 'No results')`),
 * so that is where the catalogue must come from.
 *
 * Only files that import `useUiText` are scanned. A bare `t(...)` elsewhere is
 * somebody else's variable, and a catalogue that swept those in would offer an
 * editor keys that nothing reads.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SINGLE = /\bt\(\s*'([A-Za-z0-9_.]+)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)/g;
const DOUBLE = /\bt\(\s*"([A-Za-z0-9_.]+)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\)/g;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__') continue;
      walk(path, out);
    } else if (/\.(tsx|ts)$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

/**
 * @param {string} root repository root
 * @returns {{key: string, group: string, fallback: string}[]} sorted by key
 */
export function extractUiTextKeys(root) {
  const found = new Map();
  for (const file of walk(join(root, 'src'))) {
    const source = readFileSync(file, 'utf8');
    // The hook is the marker. Without it, `t` is not this `t`.
    if (!source.includes('useUiText')) continue;
    if (relative(root, file).includes('__tests__')) continue;
    for (const re of [SINGLE, DOUBLE]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(source)) !== null) {
        const [, key, fallback] = m;
        // First definition wins, and a later one that DISAGREES is a real
        // problem: two call sites promising different English for one key.
        const prior = found.get(key);
        if (!prior) {
          found.set(key, { key, group: key.split('.')[0], fallback });
        } else if (prior.fallback !== fallback) {
          prior.conflicts = prior.conflicts ?? [];
          if (!prior.conflicts.includes(fallback)) prior.conflicts.push(fallback);
        }
      }
    }
  }
  return [...found.values()].sort((a, b) => a.key.localeCompare(b.key));
}
