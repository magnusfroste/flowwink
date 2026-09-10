/**
 * Guardrail: every action a skill seed advertises has a branch that answers it.
 *
 * `manage_product` listed `delete` in its action enum for months while
 * executeProductsAction had no delete branch. The seed is the contract an
 * external operator reads, so the contract itself sent callers into
 * "Unknown products action: delete" (nordbrygg, 2026-09-08, via the MCP
 * gateway). `get` was missing the same way. The earlier fix for the identical
 * bug on manage_inventory (`low_stock`) pinned ONE skill by name — an allowlist
 * that protected only what someone had already thought of.
 *
 * This test discovers instead of enumerating: it takes every seed whose
 * tool_definition carries an `action` enum and whose handler is code we ship
 * (`module:` / `internal:` in agent-execute, `edge:` functions), resolves the
 * code that handler dispatches to — following the calls out of the dispatch
 * block so a skill routed through three helpers is still found — and requires
 * each enum literal to appear as a quoted string inside that code. A quoted
 * literal is a coarse witness for a branch, but it is exactly the witness that
 * was absent in both real cases, and it cannot be fooled by the literal
 * appearing somewhere else in a 13 000-line file: the scope is the handler's
 * own call graph, not the file.
 *
 * Pre-existing drift is recorded in KNOWN_DRIFT. That list may only shrink.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import artifact from '../../../supabase/seed/module-skills.json';

interface Seed {
  name: string;
  handler: string;
  tool_definition?: {
    function?: { parameters?: { properties?: Record<string, { enum?: string[] }> } };
  };
}

const ROOT = process.cwd();
const AGENT_EXECUTE = join(ROOT, 'supabase/functions/agent-execute/index.ts');
const agentExecute = readFileSync(AGENT_EXECUTE, 'utf8');

const seeds: Seed[] = (artifact as { modules: Array<{ skills: Seed[] }> })
  .modules.flatMap((m) => m.skills);

/** Seeds this guard can reach: an action enum, and a handler that is our code. */
const inScope = seeds
  .map((s) => ({
    name: s.name,
    handler: s.handler,
    actions: s.tool_definition?.function?.parameters?.properties?.action?.enum ?? [],
  }))
  .filter((s) => s.actions.length > 0 && /^(module|internal|edge):/.test(s.handler));

// ---------------------------------------------------------------------------
// Source resolution
// ---------------------------------------------------------------------------

interface SourceFile { path: string; src: string }
const fileCache = new Map<string, SourceFile>();
const loadFile = (path: string): SourceFile => {
  let f = fileCache.get(path);
  if (!f) {
    f = { path, src: readFileSync(path, 'utf8') };
    fileCache.set(path, f);
  }
  return f;
};

/** The top-level `function NAME(` … `\n}\n` slice of a file, if NAME is declared there. */
function topLevelFunction(file: SourceFile, name: string): string | null {
  const m = file.src.match(
    new RegExp(`\\n(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`),
  );
  if (!m || m.index === undefined) return null;
  const end = file.src.indexOf('\n}\n', m.index);
  return file.src.slice(m.index, end === -1 ? undefined : end + 3);
}

/** The file a relative `import { NAME } from './x'` in FILE points at, if any. */
function importedFrom(file: SourceFile, name: string): SourceFile | null {
  for (const m of file.src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]/g)) {
    const names = m[1].split(',').map((n) => n.trim().split(/\s+as\s+/).pop());
    if (!names.includes(name)) continue;
    let p = resolve(dirname(file.path), m[2]);
    if (!existsSync(p)) p += '.ts';
    if (existsSync(p)) return loadFile(p);
  }
  return null;
}

/**
 * Everything the handler can reach: the starting block plus the body of every
 * function it calls, transitively, across relative imports. Depth-limited so a
 * runaway graph (utilities calling utilities) cannot swallow the whole tree —
 * three hops is deeper than any dispatch chain in agent-execute today.
 */
function reachableSource(start: string, file: SourceFile, depth = 3): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  const walk = (block: string, from: SourceFile, d: number) => {
    parts.push(block);
    if (d === 0) return;
    for (const m of block.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)) {
      const name = m[1];
      const key = `${from.path}#${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      let body = topLevelFunction(from, name);
      let owner = from;
      if (!body) {
        const imp = importedFrom(from, name);
        if (imp) { owner = imp; body = topLevelFunction(imp, name); }
      }
      if (body) walk(body, owner, d - 1);
    }
  };
  walk(start, file, depth);
  return parts.join('\n');
}

/** The dispatch block for one handler string, and the file it lives in. */
function dispatchBlock(handler: string): { block: string; file: SourceFile } | null {
  const ae = loadFile(AGENT_EXECUTE);

  if (handler.startsWith('edge:')) {
    const path = join(ROOT, 'supabase/functions', handler.slice('edge:'.length), 'index.ts');
    if (!existsSync(path)) return null;
    const file = loadFile(path);
    return { block: file.src, file };
  }

  if (handler.startsWith('module:')) {
    const mod = handler.slice('module:'.length);
    const router = topLevelFunction(ae, 'executeModuleAction') ?? '';
    // `case 'mod': { … }` up to the next case at the same indentation, or the
    // router's default.
    const m = router.match(
      new RegExp(`\\n    case '${mod}':([^]*?)(?=\\n    case '|\\n    default:)`),
    );
    return m ? { block: m[1], file: ae } : null;
  }

  if (handler.startsWith('internal:')) {
    const esc = handler.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // RESPONSE_HANDLERS map entry: 'internal:x': hSomething,
    const mapped = ae.src.match(new RegExp(`'${esc}':\\s*(\\w+)`));
    if (mapped) return { block: `${mapped[1]}(`, file: ae };
    // if/else chain: handler === 'internal:x' or handler.startsWith('internal:x')
    const branch = ae.src.match(
      new RegExp(`handler(?:\\s*===\\s*|\\.startsWith\\()'${esc}[^']*'\\)?\\s*\\)\\s*\\{([^]*?)\\n      \\}`),
    );
    return branch ? { block: branch[1], file: ae } : null;
  }

  return null;
}

function missingActions(s: { handler: string; actions: string[] }): string[] | null {
  const d = dispatchBlock(s.handler);
  if (!d) return null;
  const scope = reachableSource(d.block, d.file);
  return s.actions.filter((a) => !scope.includes(`'${a}'`) && !scope.includes(`"${a}"`));
}

// ---------------------------------------------------------------------------
// The ratchet
// ---------------------------------------------------------------------------

/**
 * Drift that predates this guard. Each line is `skill: action, action`. The
 * list may SHRINK freely (fix the handler or the seed, remove the line) and
 * must never grow. A stale line — one whose drift is gone — fails too, so the
 * list stays a truthful inventory rather than a graveyard.
 */
const KNOWN_DRIFT: Record<string, string[]> = {
  // Handler ignores `action` entirely — the enum is decoration.
  list_templates: ['list'],
  // Handler runs one fixed analysis; none of the four modes is dispatched.
  ad_optimize: ['analyze', 'pause_underperformers', 'scale_winners', 'rebalance_budget'],
  // migrate-page answers survey/read (and analyze-site); compose is not there.
  migrate_url: ['compose'],
  // executeCompaniesAction has list/create/update/delete — no get.
  manage_company: ['get'],
};

describe('every advertised skill action has a branch that answers it', () => {
  it('the guard can see every action-enum seed it claims to cover', () => {
    const blind = inScope.filter((s) => dispatchBlock(s.handler) === null).map((s) => `${s.name} (${s.handler})`);
    expect(
      blind,
      'These seeds have an action enum and a code handler, but the scanner could not find ' +
        'their dispatch. Teach dispatchBlock() the new shape rather than exempting the skill.',
    ).toEqual([]);
    // Sanity: the scan is not vacuous.
    expect(inScope.length).toBeGreaterThan(30);
  });

  it('no NEW action without a handler branch', () => {
    const drift: string[] = [];
    for (const s of inScope) {
      const missing = missingActions(s) ?? [];
      const known = new Set(KNOWN_DRIFT[s.name] ?? []);
      const fresh = missing.filter((a) => !known.has(a));
      if (fresh.length) drift.push(`${s.name} (${s.handler}): ${fresh.join(', ')}`);
    }
    expect(
      drift,
      'A skill seed advertises an action its handler never answers — the contract ' +
        'itself sends callers into "Unknown action". Add the branch or drop the enum value:\n' +
        drift.join('\n'),
    ).toEqual([]);
  });

  it('KNOWN_DRIFT only shrinks — a fixed line must be removed', () => {
    const stale: string[] = [];
    for (const [name, actions] of Object.entries(KNOWN_DRIFT)) {
      const s = inScope.find((x) => x.name === name);
      const missing = new Set(s ? (missingActions(s) ?? []) : []);
      for (const a of actions) if (!missing.has(a)) stale.push(`${name}: ${a}`);
    }
    expect(stale, 'These KNOWN_DRIFT entries no longer drift — remove them:\n' + stale.join('\n')).toEqual([]);
  });

  it('manage_product answers every action it advertises, including delete', () => {
    const s = inScope.find((x) => x.name === 'manage_product');
    expect(s?.actions).toEqual(['list', 'get', 'create', 'update', 'archive', 'delete']);
    expect(missingActions(s!)).toEqual([]);
    expect(KNOWN_DRIFT.manage_product).toBeUndefined();
  });
});

describe('manage_product delete keeps the ledger whole', () => {
  const body = agentExecute.slice(
    agentExecute.indexOf('async function executeProductsAction('),
    agentExecute.indexOf('// Companies module handlers'),
  );

  it('refuses a hard delete once the product has history, and points at archive', () => {
    expect(body).toMatch(/const history = await productHistoryCounts\(supabase, product_id\);/);
    expect(body).toMatch(/was not deleted — a hard delete would orphan/);
    expect(body).toMatch(/hint: "Use action 'archive' instead/);
  });

  it('the history check covers the two ledgers that bit first', () => {
    for (const t of ['order_items', 'stock_moves']) {
      expect(body, `PRODUCT_HISTORY_TABLES must include ${t}`).toMatch(new RegExp(`PRODUCT_HISTORY_TABLES = \\[[^\\]]*'${t}'`));
    }
  });

  it('archive is the audit-preserving retirement: is_active=false, nothing removed', () => {
    const archive = body.slice(body.indexOf("if (action === 'archive')"), body.indexOf("if (action === 'delete')"));
    expect(archive).toMatch(/\.update\(\{ is_active: false/);
    expect(archive).not.toMatch(/\.delete\(/);
  });

  it('the unknown-action fallback names what is valid', () => {
    expect(body).toMatch(/valid_actions: \['list', 'get', 'create', 'update', 'archive', 'delete'\]/);
  });
});
