import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * skill-actions-have-a-branch reaches skills whose handler is our own code
 * (module:, internal:, edge:). Skills handled by the GENERIC table handler (db:)
 * were outside it — and there a schema could advertise any action at all.
 * manage_project_task advertised `complete` and `move` and answered "Unknown
 * action"; manage_project advertised `close`; and the aliases that did exist
 * (search, list_by_employee) mapped to a list that threw every field but
 * `filters` away, so a search returned everything (process battery, 2026-09-22).
 *
 * This guard reads every db: skill's action enum and demands that each action is
 * answered: a generic CRUD verb, an ACTION_ALIASES entry, a STATUS_VERBS entry for
 * that table, or a branch in the table's own case. Pre-existing drift is recorded
 * in KNOWN_DRIFT, which may only shrink.
 */

const root = join(__dirname, '../../..');
const src = readFileSync(join(root, 'supabase/functions/agent-execute/index.ts'), 'utf8');
type Seed = { name: string; handler?: string; tool_definition?: { function?: { parameters?: { properties?: { action?: { enum?: string[] } } } } } };
const artifact = JSON.parse(readFileSync(join(root, 'supabase/seed/module-skills.json'), 'utf8')) as { modules: Array<{ skills: Seed[] }> };

const GENERIC = ['list', 'get', 'create', 'update', 'delete'];
const aliasBlock = src.slice(src.indexOf('const ACTION_ALIASES'), src.indexOf('const aliasResolved'));
const ALIASES = [...aliasBlock.matchAll(/^\s+(\w+):\s+\{ action:/gm)].map((m) => m[1]);
const verbBlock = src.slice(src.indexOf('const STATUS_VERBS'), src.indexOf('const VERB_ID_ALIASES'));
const VERBS: Record<string, string[]> = {};
for (const m of verbBlock.matchAll(/^\s{4}(\w+): \{([\s\S]*?)^\s{4}\},?/gm)) {
  VERBS[m[1]] = [...m[2].matchAll(/^\s+(\w+): \{/gm)].map((x) => x[1]);
}
const branchActions = (table: string): string[] => {
  const i = src.indexOf(`case '${table}': {`);
  if (i < 0) return [];
  const next = src.indexOf("\n    case '", i + 10);
  return [...src.slice(i, next < 0 ? i + 40000 : next).matchAll(/action === '(\w+)'/g)].map((m) => m[1]);
};

/** Advertised actions nobody answers yet. May only shrink. */
const KNOWN_DRIFT: Record<string, string[]> = {
  manage_document: ['categorize'],
  onboarding_checklist: ['update_item', 'get_status'],
};

function unanswered(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const s of artifact.modules.flatMap((m) => m.skills)) {
    if (!/^db:/.test(s.handler ?? '')) continue;
    const table = s.handler!.slice(3);
    const actions = s.tool_definition?.function?.parameters?.properties?.action?.enum;
    if (!Array.isArray(actions)) continue;
    const answered = new Set([...GENERIC, ...ALIASES, ...(VERBS[table] ?? []), ...branchActions(table)]);
    const missing = actions.filter((a) => !answered.has(a));
    if (missing.length) out[s.name] = missing;
  }
  return out;
}

describe('every action a db: skill advertises is answered', () => {
  it('the scan reads the rails it depends on', () => {
    expect(ALIASES).toContain('search');
    expect(VERBS.project_tasks).toEqual(expect.arrayContaining(['complete', 'move']));
    expect(VERBS.projects).toContain('close');
    expect(artifact.modules.flatMap((m) => m.skills).filter((s) => /^db:/.test(s.handler ?? '')).length).toBeGreaterThan(50);
  });

  it('no new unanswered action — and the known list only shrinks', () => {
    const now = unanswered();
    const fresh = Object.entries(now).flatMap(([skill, acts]) => acts.filter((a) => !(KNOWN_DRIFT[skill] ?? []).includes(a)).map((a) => `${skill}.${a}`));
    expect(fresh, 'an advertised action that no code answers').toEqual([]);
    const healed = Object.entries(KNOWN_DRIFT).flatMap(([skill, acts]) => acts.filter((a) => !(now[skill] ?? []).includes(a)).map((a) => `${skill}.${a}`));
    expect(healed, 'fixed — remove it from KNOWN_DRIFT').toEqual([]);
  });
});

describe('the generic list keeps the promises its aliases make', () => {
  const list = src.slice(src.indexOf("      case 'list': {"), src.indexOf("      case 'get': {"));

  it('every field handed to a list is a filter, not thrown away', () => {
    expect(list).toMatch(/const \{ limit = 50, offset = 0, order_by = 'created_at', ascending = false, filters, search, \.\.\.rest \} = fields;/);
    expect(list).toMatch(/Object\.entries\(rest\)\.filter/);
    expect(list).toMatch(/query = query\.eq\(col, val as string\)/);
  });

  it('a field that is not a column is named in the answer, never silently dropped', () => {
    expect(list).toMatch(/ignored_filters: ignored/);
    expect(list).toMatch(/does not exist/);
  });

  it('a search searches — and a table without a search column refuses instead of returning everything', () => {
    expect(list).toMatch(/query\.ilike\(SEARCH_COLUMNS\[table\]/);
    expect(list).toMatch(/search is not supported for \$\{table\}/);
  });

  it('a row is found under the id name the skill schema gives it', () => {
    expect(src).toMatch(/project_tasks: \['task_id'\]/);
    expect(src).toMatch(/for \(const key of \[naturalKey, \.\.\.\(TABLE_ID_ALIASES\[table\] \?\? \[\]\)\]\)/);
  });
});
