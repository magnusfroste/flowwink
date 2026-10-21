/**
 * The SHAPE scanner: public-site components that hard-code a form the
 * branding dials own — `rounded-full` (the radius dial says sharp or soft;
 * a pill ignores it) and `font-serif` (the heading font is a dial; a serif
 * class on a heading or a quote ignores it). Discovers, does not enumerate:
 * every file under src/components/public is scanned; the baseline is the
 * ratchet (counts may only shrink). A shape that is round or serif BY
 * DESIGN — an avatar, a dot on a timeline — carries the marker
 * `shape-by-design` on the same line or the line above, and is not counted.
 *
 * Synclair, 2026-10-21/22: quick-links drew pills on a sharp-cornered site
 * and a serif heading beside Inter Bold; the audit found the same shapes in
 * timeline, ai-faq and team.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const SHAPES = {
  roundedFull: /\brounded-full\b/g,
  fontSerif: /\bfont-serif\b/g,
};
export const MARKER = 'shape-by-design';
const ROOT = process.cwd();

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== '__tests__') yield* walk(p); }
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) yield p;
  }
}

/** { 'src/components/public/…': { roundedFull: n, fontSerif: n } } for files with any finding. */
export function scanHardcodedShapes(root = ROOT) {
  const out = {};
  for (const file of walk(join(root, 'src/components/public'))) {
    const lines = readFileSync(file, 'utf8').split('\n');
    const counts = { roundedFull: 0, fontSerif: 0 };
    lines.forEach((line, i) => {
      if (line.includes(MARKER) || (i > 0 && lines[i - 1].includes(MARKER))) return;
      for (const [key, re] of Object.entries(SHAPES)) counts[key] += (line.match(re) || []).length;
    });
    if (counts.roundedFull || counts.fontSerif) out[relative(root, file).split('\\').join('/')] = counts;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}
