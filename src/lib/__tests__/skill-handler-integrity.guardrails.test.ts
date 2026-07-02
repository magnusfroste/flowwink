/**
 * Guardrail: every skill handler must resolve to a real execution target.
 *
 * This is the "silently dead skill" class found live by the OpenClaw sweeps
 * (2026-06/07). Each variant shipped without any test failing:
 *
 *  - `db:<table>` where the table is missing from agent-execute's
 *    GENERIC_CRUD_TABLES allowlist → "Unknown db table … Generic CRUD is not
 *    enabled" (list_winback_campaigns, voice_calls ×3, flowtable ×2).
 *  - `internal:<name>` with no dispatch branch in agent-execute → dead.
 *  - `ai-task:<name>` with no entry in the ai-task TASKS registry → the hub
 *    replies "Unknown task" (the stale-deploy symptom is ops, but a missing
 *    key is a code bug).
 *  - `module:<id>` with no case in agent-execute's module switch → dead.
 *  - `edge:<fn>` / `function:<fn>` pointing at a function directory that does
 *    not exist → 404 at runtime.
 *  - Embedded tool arrays (voice-ingest AI_TOOLS) declaring tools to a model
 *    where the name neither has a local implementation branch nor exists as
 *    a skill → every call 400s and the phone call drops (the Gemini Live
 *    booking bug).
 *
 * All checks are static — module seeds + edge-function sources on disk — so
 * a new module/skill/handler that doesn't fully land fails CI immediately.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as modules from '@/lib/modules';

const FUNCTIONS_DIR = join(process.cwd(), 'supabase', 'functions');
const AGENT_EXECUTE_SRC = readFileSync(
  join(FUNCTIONS_DIR, 'agent-execute', 'index.ts'),
  'utf-8',
);
const AI_TASKS_SRC = readFileSync(
  join(FUNCTIONS_DIR, 'ai-task', 'tasks.ts'),
  'utf-8',
);

interface SkillSeed {
  name: string;
  handler?: string;
}

function allSkillSeeds(): Array<SkillSeed & { moduleId: string }> {
  const out: Array<SkillSeed & { moduleId: string }> = [];
  for (const exported of Object.values(modules) as any[]) {
    if (!exported || typeof exported !== 'object') continue;
    const seeds: SkillSeed[] | undefined = exported.skillSeeds;
    if (!Array.isArray(seeds)) continue;
    for (const s of seeds) {
      if (s && typeof s === 'object' && typeof s.handler === 'string') {
        out.push({ ...s, moduleId: exported.id ?? 'unknown' });
      }
    }
  }
  return out;
}

const SEEDS = allSkillSeeds();
const SKILL_NAMES = new Set(SEEDS.map((s) => s.name));

/** Parse the GENERIC_CRUD_TABLES Set literal out of agent-execute. */
function genericCrudTables(): Set<string> {
  const m = AGENT_EXECUTE_SRC.match(
    /const GENERIC_CRUD_TABLES = new Set\(\[([\s\S]*?)\]\);/,
  );
  if (!m) throw new Error('GENERIC_CRUD_TABLES not found in agent-execute');
  return new Set(
    [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]),
  );
}

/** Parse the TABLE_ALIASES keys (aliases also resolve before the allowlist). */
function tableAliases(): Set<string> {
  const m = AGENT_EXECUTE_SRC.match(
    /const TABLE_ALIASES: Record<string, string> = \{([\s\S]*?)\};/,
  );
  if (!m) return new Set();
  return new Set([...m[1].matchAll(/^\s*([a-z0-9_]+):/gm)].map((x) => x[1]));
}

describe('Skill handler integrity guardrails', () => {
  it('collects skill seeds (sanity)', () => {
    expect(SEEDS.length).toBeGreaterThan(200);
  });

  // ── db:<table> must be reachable through the generic-CRUD allowlist ──────
  describe('db: handlers', () => {
    const allow = genericCrudTables();
    const aliases = tableAliases();
    const dbSkills = SEEDS.filter((s) => s.handler!.startsWith('db:'));

    for (const s of dbSkills) {
      const table = s.handler!.slice('db:'.length);
      it(`[${s.name}] table "${table}" is in GENERIC_CRUD_TABLES (or aliased)`, () => {
        expect(
          allow.has(table) || aliases.has(table),
          `Skill "${s.name}" (module ${s.moduleId}) uses db:${table} but the ` +
            `table is not in agent-execute's GENERIC_CRUD_TABLES allowlist — ` +
            `every call returns "Generic CRUD is not enabled". Add '${table}' ` +
            `to the allowlist in supabase/functions/agent-execute/index.ts.`,
        ).toBe(true);
      });
    }
  });

  // ── internal:<name> must have a dispatch branch in agent-execute ─────────
  describe('internal: handlers', () => {
    const internalSkills = SEEDS.filter((s) => s.handler!.startsWith('internal:'));
    for (const s of internalSkills) {
      it(`[${s.name}] "${s.handler}" has a dispatch branch in agent-execute`, () => {
        expect(
          AGENT_EXECUTE_SRC.includes(`'${s.handler}'`),
          `Handler ${s.handler} (skill "${s.name}") has no ` +
            `handler === '${s.handler}' branch in agent-execute — the skill is dead.`,
        ).toBe(true);
      });
    }
  });

  // ── ai-task:<name> must exist in the TASKS registry ─────────────────────
  describe('ai-task: handlers', () => {
    const taskKeys = new Set(
      [...AI_TASKS_SRC.matchAll(/^\s{2}([a-z0-9_]+):\s*[a-zA-Z0-9]+Task,/gm)].map(
        (m) => m[1],
      ),
    );
    const aiSkills = SEEDS.filter((s) => s.handler!.startsWith('ai-task:'));
    for (const s of aiSkills) {
      const task = s.handler!.slice('ai-task:'.length);
      it(`[${s.name}] task "${task}" exists in ai-task TASKS registry`, () => {
        expect(
          taskKeys.has(task),
          `Skill "${s.name}" points at ai-task:${task} but tasks.ts has no ` +
            `"${task}" key in TASKS — the hub replies "Unknown task".`,
        ).toBe(true);
      });
    }
  });

  // ── module:<id> must have a case in agent-execute's module switch ────────
  describe('module: handlers', () => {
    const moduleIds = new Set(
      SEEDS.filter((s) => s.handler!.startsWith('module:')).map((s) =>
        s.handler!.slice('module:'.length),
      ),
    );
    for (const id of moduleIds) {
      it(`module:${id} has a switch case in agent-execute`, () => {
        expect(
          new RegExp(`case '${id}':`).test(AGENT_EXECUTE_SRC),
          `Some skill uses module:${id} but agent-execute's module switch has ` +
            `no case '${id}' — those skills are dead.`,
        ).toBe(true);
      });
    }
  });

  // ── edge:/function: must point at an existing function directory ────────
  describe('edge:/function: handlers', () => {
    const fnDirs = new Set(readdirSync(FUNCTIONS_DIR));
    const edgeSkills = SEEDS.filter(
      (s) => s.handler!.startsWith('edge:') || s.handler!.startsWith('function:'),
    );
    const seen = new Set<string>();
    for (const s of edgeSkills) {
      // `edge:newsletter/send` → function dir `newsletter` (subpath routing)
      const fn = s.handler!.replace(/^(edge|function):/, '').split('/')[0];
      if (seen.has(fn)) continue;
      seen.add(fn);
      it(`edge function "${fn}" exists on disk`, () => {
        expect(
          fnDirs.has(fn) && existsSync(join(FUNCTIONS_DIR, fn, 'index.ts')),
          `A skill handler references edge function "${fn}" but ` +
            `supabase/functions/${fn}/index.ts does not exist.`,
        ).toBe(true);
      });
    }
  });

  // ── Embedded model-tool arrays must resolve (voice AI receptionist) ──────
  describe('embedded tool declarations (voice-ingest AI_TOOLS)', () => {
    const voiceSrc = readFileSync(
      join(FUNCTIONS_DIR, 'voice-ingest', 'index.ts'),
      'utf-8',
    );
    const aiToolsBlock = voiceSrc.match(/const AI_TOOLS = \[([\s\S]*?)\n\];/);
    const toolNames = aiToolsBlock
      ? [...aiToolsBlock[1].matchAll(/^\s*name: "([a-z0-9_]+)"/gm)].map((m) => m[1])
      : [];

    it('finds the AI_TOOLS declaration (sanity)', () => {
      expect(toolNames.length).toBeGreaterThan(0);
    });

    for (const tool of toolNames) {
      it(`AI tool "${tool}" has a local implementation or a real skill`, () => {
        const hasLocalImpl = voiceSrc.includes(`name === "${tool}"`);
        const isRealSkill = SKILL_NAMES.has(tool);
        expect(
          hasLocalImpl || isRealSkill,
          `voice-ingest declares tool "${tool}" to Gemini Live but there is ` +
            `neither an executeSkill branch for it nor a skill with that name — ` +
            `every call fails and the phone call drops.`,
        ).toBe(true);
      });
    }

    it('voice dispatch uses skill_name (agent-execute contract)', () => {
      expect(
        voiceSrc.includes('skill_name: name'),
        `voice-ingest's agent-execute dispatch must send skill_name — ` +
          `sending "skill" is silently rejected (400) and every tool call fails.`,
      ).toBe(true);
    });
  });
});
