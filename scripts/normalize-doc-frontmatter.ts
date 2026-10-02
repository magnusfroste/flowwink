#!/usr/bin/env bun
/**
 * Normalize docs frontmatter.
 *
 * The docs portal (Admin → Docs, fed by `_shared/handlers/docs-sync.ts`) reads
 * `title`, `description` and `category` from frontmatter. Files without it get an
 * auto-derived title from the filename, which is how the portal ended up listing
 * entries like "flowpilot-heartbeat-engine" with no summary.
 *
 * This script fills in what it can derive from the document itself:
 *   title       ← first `# H1`, else the filename humanised
 *   description ← first non-empty prose paragraph after the H1 (trimmed)
 *   category    ← the folder under docs/
 *
 * It never overwrites existing keys. Run after adding docs:
 *   bun run scripts/normalize-doc-frontmatter.ts          # report only
 *   bun run scripts/normalize-doc-frontmatter.ts --write
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, basename, dirname } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');
const DOCS = join(ROOT, 'docs');
const WRITE = process.argv.includes('--write');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (entry.endsWith('.md')) out.push(p);
  }
  return out;
}

function humanise(file: string): string {
  const base = basename(file, '.md');
  if (base.toLowerCase() === 'readme') {
    const folder = basename(dirname(file));
    return folder === 'docs' ? 'Documentation' : humaniseWords(folder);
  }
  return humaniseWords(base);
}

const humaniseWords = (s: string) =>
  s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Best available summary sentence, in preference order:
 *   1. a `**Problem it solves:**` line (process docs all carry one)
 *   2. the blockquote right under the H1 (this repo's de-facto summary line)
 *   3. the first prose paragraph
 * Falling straight to (3) produced fragments like a list of webhook names.
 */
function deriveDescription(body: string): string | null {
  const problem = body.match(/^\*\*Problem it solves:\*\*\s*(.+)$/m)?.[1];
  if (problem) return clean(problem);

  const quote: string[] = [];
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('>')) {
      const t = line.replace(/^>\s?/, '').trim();
      if (t.startsWith('**') && quote.length) break; // labelled callout, not a summary
      if (t) quote.push(t);
    } else if (quote.length) break;
  }
  if (quote.length) return clean(quote.join(' '));

  return firstParagraph(body);
}

function clean(text: string): string {
  let out = text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const stop = out.search(/(?<=[.!?])\s/);
  if (stop > 40) out = out.slice(0, stop + 1).trimEnd(); // the slice kept the space after the full stop (sla.md, 2026-10-02)
  if (out.length > 180) out = `${out.slice(0, 177).trimEnd()}…`;
  return out.replace(/"/g, "'");
}

/** First prose paragraph: skips headings, blockquotes, code fences, tables, lists. */
function firstParagraph(body: string): string | null {
  const lines = body.split('\n');
  let inFence = false;
  // Non-prose blocks are skipped whole. Skipping only the first line let wrapped
  // continuation lines of a blockquote or list leak in, which produced
  // descriptions starting mid-sentence ("production agents; FlowWink already…").
  let skippingBlock = false;
  const buf: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('```')) {
      inFence = !inFence;
      skippingBlock = false;
      continue;
    }
    if (inFence) continue;
    if (!line) {
      if (buf.length) break;
      skippingBlock = false;
      continue;
    }
    if (skippingBlock) continue;
    if (/^#/.test(line)) {
      // A heading ends the previous block but does not swallow the prose under it.
      if (buf.length) break;
      continue;
    }
    if (/^(>|\||-{3,}|\*|- |\d+\. |!\[|\()/.test(line)) {
      if (buf.length) break;
      skippingBlock = true;
      continue;
    }
    buf.push(line);
    if (buf.join(' ').length > 200) break;
  }
  if (!buf.length) return null;
  let text = buf.join(' ').replace(/\s+/g, ' ').trim();
  // Strip markdown emphasis / links / code ticks — frontmatter is plain text.
  text = text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .trim();
  const stop = text.search(/(?<=[.!?])\s/);
  if (stop > 40) text = text.slice(0, stop + 1);
  if (text.length > 180) text = `${text.slice(0, 177).trimEnd()}…`;
  return text.replace(/"/g, "'");
}

const changed: string[] = [];
const stillMissing: string[] = [];

for (const file of walk(DOCS)) {
  const src = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file);
  const fm = src.match(/^---\n([\s\S]*?)\n---\n?/);
  const existing = fm?.[1] ?? '';
  const body = fm ? src.slice(fm[0].length) : src;

  const has = (key: string) => new RegExp(`^${key}:`, 'm').test(existing);
  const additions: string[] = [];

  if (!has('title')) {
    const h1 = body.match(/^#\s+(.+)$/m)?.[1]?.replace(/[`*]/g, '').trim();
    additions.push(`title: "${(h1 ?? humanise(file)).replace(/"/g, "'")}"`);
  }
  if (!has('description')) {
    const desc = deriveDescription(body.replace(/^#\s+.+$/m, ''));
    if (desc) additions.push(`description: ${desc}`);
    else stillMissing.push(`${rel} (no prose paragraph to derive a description from)`);
  }
  if (!has('category')) {
    const folder = relative(DOCS, dirname(file)).split('/')[0];
    additions.push(`category: ${folder || 'general'}`);
  }

  if (!additions.length) continue;

  const nextFm = [existing, ...additions].filter(Boolean).join('\n');
  const next = `---\n${nextFm}\n---\n${body.startsWith('\n') ? '' : '\n'}${body}`;
  if (WRITE) writeFileSync(file, next, 'utf8');
  changed.push(`${rel}: +${additions.map((a) => a.split(':')[0]).join(', +')}`);
}

console.log(
  `${WRITE ? 'Updated' : 'Would update'} ${changed.length} file(s)${WRITE ? '' : ' (pass --write)'}`,
);
for (const c of changed) console.log(`   ${c}`);
if (stillMissing.length) {
  console.log(`\n${stillMissing.length} file(s) need a hand-written description:`);
  for (const m of stillMissing) console.log(`   ${m}`);
}
