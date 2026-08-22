#!/usr/bin/env bun
/**
 * Block field audit — find blocks ALREADY STORED with fields nothing renders.
 *
 * Why this exists. The write gate refuses a block whose fields no renderer
 * reads (see unknownFieldErrors in supabase/functions/_shared/normalize-blocks.ts).
 * That gate only closed on 2026-08-22; everything written before it is still in
 * the database, and the damage is invisible by construction: the page saved
 * "green", the block renders whatever it recognises, and the rest of the content
 * sits in content_json with nothing to display it.
 *
 * The incident that prompted it: a hero on optic /agentic written with
 * `primary_cta`, `secondary_cta` and `subheadline`. HeroBlock reads
 * primaryButton / secondaryButton / subtitle. Three pieces of copy — a whole
 * value proposition and both calls to action — stored and rendered by nothing.
 * The page merely looked thin.
 *
 * READ-ONLY. This tool has no --apply and issues no UPDATE, ever. Deciding what
 * a half-written block should say is the page owner's call, not a script's: the
 * right field is often obvious (primary_cta → primaryButton) but the right
 * VALUE is not (primaryButton needs { text, url } and the url was never sent).
 *
 * Usage:
 *   # Local corpus — our own seed templates, no database needed
 *   bun run scripts/audit-block-fields.ts --templates
 *
 *   # One live instance (SELECT only; use a read-capable connection string)
 *   DATABASE_URL=postgresql://… bun run scripts/audit-block-fields.ts
 *
 *   # Machine-readable, e.g. to diff two instances
 *   DATABASE_URL=… bun run scripts/audit-block-fields.ts --json
 *
 * Options:
 *   --templates   audit templates/*.json instead of a database
 *   --json        emit JSON instead of the human report
 *   --all         include drafts and soft-deleted pages (default: all pages,
 *                 including drafts — pass --published to narrow instead)
 *   --published   only pages with status = 'published'
 *
 * What it reports is exactly what manage_page would now refuse: the audit runs
 * the SAME normalizeBlocks() pipeline the edge function runs, on a copy, so the
 * aliases get their pass first (heading→title, subheadline→subtitle,
 * stats.items→stats, …) and only genuinely unreadable fields are reported.
 * There is no second field catalogue here and there must never be one.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { normalizeBlocks } from '../supabase/functions/_shared/normalize-blocks.ts';

const ROOT = resolve(import.meta.dir, '..');
const args = new Set(process.argv.slice(2));
const AS_JSON = args.has('--json');
const FROM_TEMPLATES = args.has('--templates');
const PUBLISHED_ONLY = args.has('--published');

interface Finding {
  source: string;        // page slug, or template id
  page_id?: string;
  status?: string;
  block_index: number;
  block_type: string;
  reason: string;
}

/** Run the real gate over one page's blocks and collect what it would refuse. */
function auditBlocks(source: string, blocks: unknown, extra: Partial<Finding> = {}): Finding[] {
  if (!Array.isArray(blocks)) return [];
  const findings: Finding[] = [];
  // The pipeline narrates every fold and refusal to the console — that is right
  // inside an edge function and useless here, where the report IS the output.
  const quiet = { warn: console.warn, log: console.log };
  console.warn = () => {};
  console.log = () => {};
  try {
  // Per block, so a reason can be tied to an index — normalizeBlocks strips as
  // it goes, which loses the position. Judging one block at a time is identical
  // in verdict: the gate has no cross-block rules.
    blocks.forEach((block, index) => {
      const copy = JSON.parse(JSON.stringify(block));
      const type = String((copy as Record<string, unknown>)?.type ?? '(missing)');
      for (const reason of normalizeBlocks([copy])) {
        findings.push({ source, block_index: index, block_type: type, reason, ...extra });
      }
    });
  } finally {
    console.warn = quiet.warn;
    console.log = quiet.log;
  }
  return findings;
}

async function fromTemplates(): Promise<Finding[]> {
  const dir = join(ROOT, 'templates');
  const findings: Finding[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const template = JSON.parse(readFileSync(join(dir, file), 'utf-8'));
    for (const page of template.pages ?? []) {
      findings.push(
        ...auditBlocks(`${file.replace(/\.json$/, '')}:${page.slug ?? page.title}`, page.content_json ?? page.blocks),
      );
    }
  }
  return findings;
}

async function fromDatabase(): Promise<Finding[]> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Either export it, or run with --templates.');
    process.exit(1);
  }
  const { Client } = await import('pg');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, slug, status, content_json
         FROM pages
        WHERE deleted_at IS NULL
          ${PUBLISHED_ONLY ? "AND status = 'published'" : ''}
        ORDER BY slug`,
    );
    const findings: Finding[] = [];
    for (const row of rows) {
      findings.push(
        ...auditBlocks(row.slug, row.content_json, { page_id: row.id, status: row.status }),
      );
    }
    return findings;
  } finally {
    await client.end();
  }
}

const findings = FROM_TEMPLATES ? await fromTemplates() : await fromDatabase();

if (AS_JSON) {
  console.log(JSON.stringify({ count: findings.length, findings }, null, 2));
} else if (findings.length === 0) {
  console.log('✅ No stored block carries a field the renderer cannot read.');
} else {
  const bySource = new Map<string, Finding[]>();
  for (const f of findings) {
    if (!bySource.has(f.source)) bySource.set(f.source, []);
    bySource.get(f.source)!.push(f);
  }
  console.log(`⚠️  ${findings.length} stored block(s) carry content nothing renders, across ${bySource.size} page(s):\n`);
  for (const [source, list] of bySource) {
    console.log(`  ${source}${list[0].status ? ` (${list[0].status})` : ''}`);
    for (const f of list) {
      console.log(`    [${f.block_index}] ${f.block_type}: ${f.reason.split(' — ')[0]}`);
    }
    console.log('');
  }
  console.log('Nothing was changed. Fix a page by rewriting the named fields with the');
  console.log('renderer\'s own names (describe_blocks gives the field list per type) —');
  console.log('the values are still in content_json until someone overwrites them.');
}
