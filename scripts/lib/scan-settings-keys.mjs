/**
 * Every `site_settings` key the code reads or writes — found, not listed.
 *
 * The settings catalogue (supabase/functions/_shared/settings/catalog.ts) is
 * what an agent is told about the platform's settings. A key the code uses
 * and the catalogue does not describe is a setting an agent cannot find; a
 * catalogue entry no code uses is a description of nothing. The guard
 * `settings-catalog-covers-every-key` compares the two both ways.
 *
 * Shapes it reads, within a short window after the word `site_settings`:
 *   .eq('key', 'seo')   .eq('key', KEY)   .in('key', ['a', 'b'])   { key: 'x', value … }
 * and the app's two generic hooks: useSiteSettings<T>('seo', …), useUpdateSiteSettings<T>('seo', …).
 * A constant (`const KEY = 'dunning'`) is resolved inside its own file.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src', 'supabase/functions', 'api'];
const SKIP = /node_modules|__tests__|\.test\.|\/fixtures\//;

function walk(dir, out) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (SKIP.test(p)) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
}

/** @returns {Record<string, string[]>} key → files that use it */
export function scanSettingsKeys(root = process.cwd()) {
  const keys = new Map();
  const add = (k, f) => {
    if (!/^[a-z][a-z0-9_]*$/.test(k)) return;
    if (!keys.has(k)) keys.set(k, new Set());
    keys.get(k).add(f);
  };
  for (const rootDir of ROOTS) {
    for (const file of walk(join(root, rootDir), [])) {
      const src = readFileSync(file, 'utf8');
      const rel = file.slice(root.length + 1);
      const consts = new Map([...src.matchAll(/\bconst\s+([A-Z_][A-Z0-9_]*)\s*=\s*['"]([a-z0-9_]+)['"]/g)].map((m) => [m[1], m[2]]));
      let i = -1;
      while ((i = src.indexOf('site_settings', i + 1)) !== -1) {
        // The window ends where the next table is named: `.from('agent_memory')`
        // a few lines on is not a settings read.
        let w = src.slice(i, i + 400);
        const next = w.slice(14).search(/\.from\(/);
        if (next !== -1) w = w.slice(0, next + 14);
        for (const m of w.matchAll(/\.eq\(\s*['"]key['"]\s*,\s*(?:['"]([a-z0-9_]+)['"]|([A-Z_][A-Z0-9_]*))\s*\)/g)) {
          if (m[1]) add(m[1], rel); else if (consts.has(m[2])) add(consts.get(m[2]), rel);
        }
        for (const m of w.matchAll(/\.in\(\s*['"]key['"]\s*,\s*\[([^\]]+)\]/g)) {
          for (const k of m[1].matchAll(/['"]([a-z0-9_]+)['"]/g)) add(k[1], rel);
        }
        for (const m of w.matchAll(/\{\s*key:\s*(?:['"]([a-z0-9_]+)['"]|([A-Z_][A-Z0-9_]*))\s*,/g)) {
          if (m[1]) add(m[1], rel); else if (consts.has(m[2])) add(consts.get(m[2]), rel);
        }
      }
      // A row written as { key, value } in a file that writes site_settings:
      // the reset's and the export's lists sit far from the word itself.
      if (src.includes('site_settings')) {
        // An agent_memory row has the same shape plus a `category`.
        for (const m of src.matchAll(/\{\s*key:\s*['"]([a-z0-9_]+)['"]\s*,\s*value\b([^}\n]*)/g)) {
          if (!/\bcategory\s*:/.test(m[2] + src.slice(m.index + m[0].length, m.index + m[0].length + 80))) add(m[1], rel);
        }
      }
      for (const m of src.matchAll(/use(?:Update)?SiteSettings(?:<[^>()]*>)?\(\s*(?:['"]([a-z0-9_]+)['"]|([A-Z_][A-Z0-9_]*))/g)) {
        if (m[1]) add(m[1], rel); else if (consts.has(m[2])) add(consts.get(m[2]), rel);
      }
    }
  }
  return Object.fromEntries([...keys].sort().map(([k, v]) => [k, [...v].sort()]));
}
