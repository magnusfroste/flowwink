import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrail: every "(use X)" pointer in a skill seed's metadata must name a
 * skill that actually exists in the catalog.
 *
 * Skill descriptions carry Use-when / NOT-for markers with "(use X)" cross
 * references — that is how the Skill Relevance Engine steers an agent from the
 * wrong skill to the right one (Law 2: skills are self-describing, so what
 * they describe must be true). A pointer to a skill that does not exist sends
 * the agent to nothing, which is worse than no hint: the agent burns a turn
 * discovering the target is phantom, then has to fall back to search anyway.
 *
 * Live finding (2026-08-20): 29 seed descriptions pointed at phantoms —
 * renamed skills (manage_projects → manage_project, check_order →
 * check_order_status), never-built skills (seo_audit, openclaw_test), and
 * module-noun shorthand (use expenses, use bills). All repointed to real
 * skills or dropped.
 *
 * This test is a RATCHET: KNOWN_DANGLING pins the accepted debt. It blocks
 * NEW dangling pointers, and the set may only shrink — fix a pointer, remove
 * its entry. A stale entry (pinned but no longer dangling) also fails, so the
 * set cannot rot.
 */

const root = process.cwd();

/** Seed sources: module seed files + platform seeds (same set as the
 * declared-skills snapshot — platform primitives live outside modules
 * BY POLICY, so both must be scanned). */
function seedFiles(): string[] {
  const modulesDir = join(root, 'src/lib/modules');
  return [
    ...readdirSync(modulesDir)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => join(modulesDir, f)),
    join(root, 'src/lib/platform-seeds.ts'),
  ];
}

/** Mirrors scripts/snapshot-declared-skills.ts — same sources, same patterns. */
function skillCatalog(): Set<string> {
  const out = new Set<string>();
  for (const path of seedFiles()) {
    const src = readFileSync(path, 'utf8');
    for (const m of src.matchAll(/name:\s*'([a-z_][a-z0-9_]*)'/g)) {
      const win = src.slice(m.index! + m[0].length, m.index! + m[0].length + 3000);
      if (win.includes('tool_definition') && win.includes('handler')) out.add(m[1]);
    }
    for (const s of src.matchAll(/skills:\s*\[([\s\S]*?)\]/g)) {
      for (const n of s[1].matchAll(/'([a-z_][a-z0-9_]*)'/g)) out.add(n[1]);
    }
  }
  return out;
}

/**
 * Extract skill-name candidates from "(use …)" parentheticals.
 *
 * Only underscore-shaped tokens count as skill references — prose words
 * ("use the admin UI"), module nouns ("use newsletter module") and single
 * words are not checkable claims. `key=value` fragments are stripped first
 * so parameter hints ("use manage_orders with fulfillment_status=shipped")
 * are not read as skill names.
 */
function danglingPointers(catalog: Set<string>): string[] {
  const out = new Set<string>();
  for (const path of seedFiles()) {
    const src = readFileSync(path, 'utf8');
    const file = path.slice(root.length + 1);
    for (const m of src.matchAll(/\(use ([^)]*)\)/g)) {
      const inner = m[1].replace(/\S+=\S+/g, ' ');
      for (const name of inner.match(/[a-z][a-z0-9]*(?:_[a-z0-9]+)+/g) ?? []) {
        if (!catalog.has(name)) out.add(`${file} → ${name}`);
      }
    }
  }
  return [...out].sort();
}

/**
 * Accepted debt, as `<file> → <phantom skill name>`. May only SHRINK:
 * remove entries as you fix them. Never add — repoint the text to a real
 * skill (grep `name: '` across src/lib/modules/ and src/lib/platform-seeds.ts)
 * or drop the parenthetical rather than pinning a new phantom.
 */
const KNOWN_DANGLING = new Set<string>([]);

describe('skill metadata truth — "(use X)" pointers resolve', () => {
  const catalog = skillCatalog();
  const dangling = danglingPointers(catalog);

  it('sanity: the scan actually sees the catalog and the pointers', () => {
    // Guards against regex rot silently turning the suite into a no-op.
    expect(catalog.size).toBeGreaterThan(400);
    expect(catalog.has('manage_invoice')).toBe(true);
    expect(catalog.has('post_to_river')).toBe(true);
  });

  it('no NEW dangling pointer — every "(use X)" names a real skill', () => {
    const fresh = dangling.filter((d) => !KNOWN_DANGLING.has(d));
    expect(
      fresh,
      `${fresh.length} "(use X)" pointer(s) name a skill that does not exist. ` +
      'Repoint the description to a real skill or drop the parenthetical — ' +
      'do NOT add to KNOWN_DANGLING.',
    ).toEqual([]);
  });

  it('KNOWN_DANGLING only shrinks — no stale entries', () => {
    const stale = [...KNOWN_DANGLING].filter((k) => !dangling.includes(k));
    expect(
      stale,
      `${stale.length} KNOWN_DANGLING entr(ies) are fixed — remove them so the ratchet tightens.`,
    ).toEqual([]);
  });
});
