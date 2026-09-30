#!/usr/bin/env bun
/**
 * docs/reference/edge-functions.md — every edge function, generated.
 *
 * The count in the docs drifted ("100+", "75", "~100") because no page was
 * built from the source. This one is: the function directories on disk, the
 * tier from supabase/seed/edge-function-map.json (core = always deployed,
 * module-bound = deployed when an owning module is enabled), the JWT setting
 * from supabase/config.toml, and each function's own header comment as its
 * one-line purpose. Re-run after adding, removing or re-homing a function:
 *
 *   bun run scripts/generate-edge-function-docs.ts
 *
 * A guard (edge-function-reference-covers-every-function) fails when a
 * function on disk is missing from the page.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const FN_DIR = join(ROOT, 'supabase/functions');
const OUT = join(ROOT, 'docs/reference/edge-functions.md');
/** Directories under supabase/functions that are not functions. */
const NOT_FUNCTIONS = new Set(['_shared', 'shared', 'tests']);

interface EdgeMap {
  core: string[];
  modules: Record<string, string[]>;
  total?: number;
}

const map = JSON.parse(readFileSync(join(ROOT, 'supabase/seed/edge-function-map.json'), 'utf-8')) as EdgeMap;
const coreSet = new Set(map.core);
const ownersOf = new Map<string, string[]>();
for (const [mod, fns] of Object.entries(map.modules)) {
  for (const fn of fns) ownersOf.set(fn, [...(ownersOf.get(fn) ?? []), mod]);
}

const configToml = readFileSync(join(ROOT, 'supabase/config.toml'), 'utf-8');
const verifyJwt = new Map<string, boolean>();
for (const m of configToml.matchAll(/\[functions\.([a-z0-9-]+)\]\s*\nverify_jwt\s*=\s*(true|false)/g)) {
  verifyJwt.set(m[1], m[2] === 'true');
}

/**
 * The function's purpose, from its own header — and only from its header.
 * First choice: a comment line that names the function ("media-optimize —
 * server-side image resize"). Second: the first line of the comment block
 * that precedes the first import. Anything else is an implementation note and
 * would mislead, so it stays empty rather than wrong.
 */
function purposeOf(fn: string): string {
  let src = '';
  try { src = readFileSync(join(FN_DIR, fn, 'index.ts'), 'utf-8'); } catch { return ''; }
  const lines = src.split('\n');
  const isComment = (raw: string) => /^\s*(\/\/|\/\*\*?|\*)/.test(raw);
  const strip = (raw: string) => raw.replace(/^\s*(\/\/|\/\*\*?|\*\/?|\*)\s?/, '').trim();
  const noise = (line: string) =>
    !line || /^(deno-lint|eslint|@ts-|@deno|Copyright)/i.test(line) || /^[a-z0-9-]+\s+v?20\d\d-\d\d-\d\d/i.test(line) || /^[-=─]{3,}$/.test(line);
  const clean = (line: string) => line.replace(/\|/g, '/').slice(0, 140);
  const spaced = fn.replace(/-/g, ' ');
  for (const raw of lines.slice(0, 80)) {
    if (!isComment(raw)) continue;
    const line = strip(raw);
    if (noise(line)) continue;
    if (line.includes(fn) || line.toLowerCase().includes(spaced)) return clean(line);
  }
  for (const raw of lines) {
    if (/^\s*import\s/.test(raw)) break;
    if (!isComment(raw)) continue;
    const line = strip(raw);
    if (noise(line)) continue;
    return clean(line);
  }
  // A title-style line ("Name — what it does") in the first doc block, even
  // after the imports.
  for (const raw of lines.slice(0, 60)) {
    if (!isComment(raw)) continue;
    const line = strip(raw);
    if (noise(line)) continue;
    if (/^[A-Z][^.]{2,60} — /.test(line)) return clean(line);
  }
  return PURPOSE_OVERRIDES[fn] ?? '';
}

/**
 * Hand-written one-liners for functions whose header does not name them.
 * Remove an entry once the function's own header comment says what it is —
 * that is the better home, and the generator prefers it.
 */
const PURPOSE_OVERRIDES: Record<string, string> = {
  'agent-card': 'A2A agent card — the instance\'s identity and external-facing skills for federation peers.',
  'agent-execute': 'Skill executor — runs one skill (db/rpc/module/internal/edge handlers) with trust, staging and the agent audit trail.',
  'blog-rss': 'RSS feed of the 20 most recent published blog posts.',
  'check-secrets': 'Reports which provider secrets (AI, email, payments…) are configured, for the admin setup screens.',
  'composio-proxy': 'Proxy to Composio-connected accounts (Gmail and other integrations) for the inbox and outbound mail.',
  'content-api': 'Programmatic content access — pages, posts and KB as JSON or Markdown for headless consumers.',
  'create-checkout': 'Creates the shop checkout (Stripe, or a recorded order in sandbox mode).',
  'generate-invoice-pdf': 'Renders an invoice as PDF — by public token for the customer, or as staff.',
  'get-page': 'Serves a published page by slug with caching; PublicPage falls back to the database if it fails.',
  'instance-health': 'Health report for the instance — cron jobs, database pulse, edge surface — for the fleet and the admin.',
  'invite-employee': 'Invites an employee to a portal account over the instance\'s own email rail.',
  'llms-txt': 'Serves /llms.txt — the site as plain text for LLM crawlers.',
  'mcp-server': 'The outward MCP gateway (Streamable HTTP + /rest/*) — exposes skills to external agents with groups and dispatch mode.',
  'migrate-page': 'Site migration — fetches an external page or site and maps it to FlowWink blocks.',
  'process-image': 'Server-side image processing for the media library (fetch, convert, store).',
  'run-autonomy-tests': 'Runs the autonomy test suites against this instance and reports per test.',
  'setup-database': 'Fresh-install bootstrap — applies the core schema and seeds so a new project can start.',
  'stripe-webhook': 'Receives Stripe events — checkout completed, refunds, subscription changes — and updates orders and subscriptions.',
  'system-integrity-check': 'Checks and (on request) repairs platform integrity — schema, seeds, buckets, cron.',
  'track-auth-event': 'Records sign-in and other auth events for the login-activity view.',
  'track-page-view': 'Records a page view (with coarse geo) for analytics.',
};

const fns = readdirSync(FN_DIR)
  .filter((d) => !NOT_FUNCTIONS.has(d) && statSync(join(FN_DIR, d)).isDirectory())
  .sort();

const rows = fns.map((fn) => {
  const tier = coreSet.has(fn) ? 'core' : (ownersOf.get(fn) ?? []).length ? `module: ${ownersOf.get(fn)!.join(', ')}` : 'unmapped';
  const jwt = verifyJwt.has(fn) ? (verifyJwt.get(fn) ? 'JWT' : 'public') : 'default (JWT)';
  return `| \`${fn}\` | ${tier} | ${jwt} | ${purposeOf(fn)} |`;
});

const core = fns.filter((f) => coreSet.has(f)).length;
const bound = fns.filter((f) => !coreSet.has(f) && ownersOf.has(f)).length;
const unmapped = fns.length - core - bound;

const md = `---
title: "Edge functions — the full surface"
description: Every Deno edge function under supabase/functions, with its deploy tier (core vs module-bound), JWT setting and one-line purpose. Generated from code — do not edit by hand.
category: reference
generated: true
---

# Edge functions — the full surface

> **Generated** by \`scripts/generate-edge-function-docs.ts\`. ${fns.length} functions: ${core} core (always deployed), ${bound} module-bound (deployed when an owning module is enabled)${unmapped ? `, ${unmapped} unmapped` : ''}. The deploy map is \`supabase/seed/edge-function-map.json\`; the operator's mental model is [\`../operators/edge-function-tiers.md\`](../operators/edge-function-tiers.md).

**Audience column:** \`public\` = \`verify_jwt = false\` in \`config.toml\` — the function verifies its caller itself (see the guard \`public-functions-verify-their-caller\`); \`JWT\` = the gateway requires a signed-in caller.

| Function | Tier | Audience | Purpose |
|---|---|---|---|
${rows.join('\n')}

## Runtime notes

- All functions are Deno on Supabase Edge; the transport for MCP is Streamable HTTP.
- Public-facing functions are deployed with \`--no-verify-jwt\`; the rest use default JWT verification.
- Shared code lives in \`supabase/functions/_shared/\` (the FlowPilot engine under \`pilot/\`, the Skill Relevance Engine under \`skills/\`, MCP schema under \`mcp/\`).
`;

writeFileSync(OUT, md);
console.log(`✅ Wrote docs/reference/edge-functions.md — ${fns.length} functions (${core} core, ${bound} module-bound${unmapped ? `, ${unmapped} unmapped` : ''})`);
