/**
 * English that a VISITOR reads, written into the code instead of the pack.
 *
 * The scattered-string problem, made countable. Visitor-facing copy lives in
 * seven places, and the only one with a language dimension is `ui_text`. Every
 * string still baked into a public component is a string that cannot follow the
 * visitor's language — and they were being found one at a time, by eye, on a
 * live site.
 *
 * This counts them so the number can only go down. The product's own INTERFACE
 * (everything under admin/) stays English on purpose and is never scanned.
 *
 * The heuristic is deliberately narrow: a JSX text node or a human-facing
 * attribute holding a capitalised multi-word phrase. It will miss some strings
 * and that is fine — a ratchet that undercounts still ratchets. What it must
 * never do is flag something that ISN'T visitor text, because then the number
 * stops meaning anything and people start adding exceptions.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src/components/public', 'src/pages'];
const JSX_TEXT = /> *([A-Z][A-Za-z][A-Za-z '’,!?.&—-]{6,70}) *</g;
const ATTR = /(?:placeholder|aria-label|alt)="([A-Z][A-Za-z][A-Za-z '’,!?.&—-]{4,70})"/g;

function isSkipped(path) {
  return path.includes('__tests__') || path.includes('/admin');
}

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const entry of entries) {
    const path = join(dir, entry);
    if (isSkipped(path)) continue;
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith('.tsx')) out.push(path);
  }
  return out;
}

/** @returns {Record<string, number>} file → count of hardcoded visitor strings */
export function scanHardcodedVisitorText(root = process.cwd()) {
  const counts = {};
  for (const rootDir of ROOTS) {
    for (const file of walk(join(root, rootDir))) {
      const source = readFileSync(file, 'utf8');
      const found = new Set();
      for (const re of [JSX_TEXT, ATTR]) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(source)) !== null) {
          const text = m[1].trim();
          // One word is usually a component name or an enum label, not copy.
          if (text.includes(' ')) found.add(text);
        }
      }
      if (found.size) counts[file.slice(root.length + 1)] = found.size;
    }
  }
  return counts;
}
