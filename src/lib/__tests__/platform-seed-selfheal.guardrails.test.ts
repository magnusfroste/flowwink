/**
 * Guardrail: the platform-layer self-heal must stay ALIVE.
 *
 * History this locks down. A self-provisioned instance receives three of its
 * four deploy layers automatically (schema via migrations, edge functions via
 * the Supabase GitHub integration, frontend via Vercel). The fourth —
 * `agent_skills`, table DATA born from TypeScript seeds — has no deploy layer,
 * so `useFlowPilotBootstrap` is the only automatic path to it.
 *
 * That path was structurally dead for months:
 *   - the platform branch fired only when `run_daily_briefing` was ABSENT, but
 *     that skill is migration-seeded and is therefore present from birth;
 *   - the FlowPilot branch required `modules.flowpilot.enabled === true`, and
 *     FlowPilot is off by default.
 * Measured on a fresh replay: 6 skills / 6 cron jobs, versus 537 / 15 on a
 * mature instance — and nothing errored anywhere.
 *
 * The class of bug: a self-heal whose trigger is the ABSENCE of one thing that
 * is in fact always present. These tests fail if that shape comes back.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PLATFORM_SKILLS,
  PLATFORM_SKILL_NAMES,
  isPlatformLayerComplete,
  missingPlatformSkills,
} from '@/lib/platform-seeds';
import artifact from '../../../supabase/seed/module-skills.json';

/**
 * The platform skills a fresh install is actually born with — verified against
 * a locally fresh-replayed database (2026-08-22): `agent_skills` held exactly
 * six rows, three of which belong to the platform layer. These are seeded by
 * migrations, so their PRESENCE is guaranteed and can never be the trigger.
 */
const FRESH_INSTALL_PLATFORM_SKILLS = [
  'run_daily_briefing',
  'cron_health_report',
  'sync_skills_from_code',
];

const HOOK_SOURCE = readFileSync(
  join(process.cwd(), 'src/hooks/useFlowPilotBootstrap.ts'),
  'utf8',
);

describe('platform self-heal condition', () => {
  it('is TRUE (work to do) for the fresh-install baseline', () => {
    expect(isPlatformLayerComplete(FRESH_INSTALL_PLATFORM_SKILLS)).toBe(false);
    expect(missingPlatformSkills(FRESH_INSTALL_PLATFORM_SKILLS).length).toBeGreaterThan(0);
  });

  it('is FALSE (nothing to do) once the whole platform layer is present', () => {
    expect(isPlatformLayerComplete(PLATFORM_SKILL_NAMES)).toBe(true);
    expect(missingPlatformSkills(PLATFORM_SKILL_NAMES)).toEqual([]);
  });

  it('stays FALSE on a mature instance carrying extra module skills', () => {
    const mature = [...PLATFORM_SKILL_NAMES, 'browse_blog', 'manage_company', 'refund_return'];
    expect(isPlatformLayerComplete(mature)).toBe(true);
  });

  it('cannot be satisfied by any single skill — no one-skill probe may stand in for it', () => {
    // This is the exact regression: `run_daily_briefing` present => "healthy".
    for (const name of PLATFORM_SKILL_NAMES) {
      expect(
        isPlatformLayerComplete([name]),
        `The self-heal condition must not be satisfiable by "${name}" alone — that is how the previous guard died.`,
      ).toBe(false);
    }
  });

  it('re-arms when a release adds a platform skill', () => {
    // A mature instance that predates a new platform skill must read incomplete.
    const beforeRelease = PLATFORM_SKILL_NAMES.slice(1);
    expect(isPlatformLayerComplete(beforeRelease)).toBe(false);
    expect(missingPlatformSkills(beforeRelease)).toEqual([PLATFORM_SKILL_NAMES[0]]);
  });

  it('the floor is derived from PLATFORM_SKILLS and matches the deploy artifact', () => {
    expect(PLATFORM_SKILL_NAMES).toEqual(PLATFORM_SKILLS.map((s) => s.name));
    const platformModule = (artifact as { modules: Array<{ moduleId: string; skills: Array<{ name: string }> }> })
      .modules.find((m) => m.moduleId === 'platform');
    expect(platformModule, 'artifact must carry the `platform` pseudo-module').toBeTruthy();
    expect(platformModule!.skills.map((s) => s.name)).toEqual([...PLATFORM_SKILL_NAMES]);
  });
});

describe('heals wait for an admin session', () => {
  /**
   * 2026-08-24, www.flowwink.com: a destructive toast on the LOGIN SCREEN read
   * "Module settings not stored — 67 module(s) are missing". Nothing was
   * missing. AdminLayout mounts this hook before its auth redirect runs, so the
   * first ensureModulesRow() went out as anon; ensure_modules_settings
   * correctly refused (42501); and the catch path counted a refusal as
   * "all 67 modules absent". A guard's refusal is not absence.
   *
   * The RPCs these heals end in are admin-gated, so the gate is
   * user + rolesReady + isAdmin — rolesReady because roles resolve a beat after
   * the session, and gating on isAdmin before they land would skip the heal for
   * real admins on every login.
   */
  const hook = readFileSync(join(__dirname, '../../hooks/useFlowPilotBootstrap.ts'), 'utf-8');

  it('derives canHeal from an authenticated admin with roles resolved', () => {
    expect(hook).toMatch(/const\s+canHeal\s*=\s*!!user\s*&&\s*rolesReady\s*&&\s*isAdmin/);
  });

  it('every heal effect returns early without canHeal', () => {
    const gates = hook.match(/if \(!canHeal\) return;/g) ?? [];
    // Three heal effects: modules-row + skill coverage, platform heal, soul repair.
    expect(gates.length).toBeGreaterThanOrEqual(3);
  });

  it('the gated effects re-run when the admin session lands', () => {
    // The gate must not strand the heal: canHeal flips true AFTER mount, so it
    // has to sit in the dependency arrays or login never triggers the heal.
    expect(hook.match(/\[canHeal\]/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(hook).toContain('[canHeal, isFlowPilotEnabled, modules]');
  });
});

describe('useFlowPilotBootstrap wiring', () => {
  it('uses the completeness condition, not a single-skill absence probe', () => {
    expect(HOOK_SOURCE).toContain('missingPlatformSkills');
    expect(HOOK_SOURCE).toContain('PLATFORM_SKILL_NAMES');
    // The dead shape: .eq('name', '<one skill>') as the platform trigger.
    expect(
      /\.eq\(\s*['"]name['"]\s*,\s*['"]run_daily_briefing['"]\s*\)/.test(HOOK_SOURCE),
      'Platform self-heal must not key on the absence of a single migration-seeded skill.',
    ).toBe(false);
  });

  it('seeds the platform layer AND the platform cron', () => {
    // Skills without the cron tick is the other half of the silent half-install:
    // automations exist but sit at run_count 0 forever.
    expect(HOOK_SOURCE).toContain('bootstrapPlatform');
    expect(HOOK_SOURCE).toContain('ensurePlatformCron');
    expect(HOOK_SOURCE).toContain('ensureSkillRegistry');
  });

  it('does not gate the platform branch on the FlowPilot module', () => {
    // FlowPilot is OFF by default, so anything behind it cannot heal a fresh
    // install. The platform effect must not read the flowpilot toggle.
    const platformEffect = HOOK_SOURCE.slice(
      HOOK_SOURCE.indexOf('Platform layer self-heal'),
      HOOK_SOURCE.indexOf('if (!isFlowPilotEnabled'),
    );
    expect(platformEffect.length).toBeGreaterThan(0);
    expect(platformEffect).not.toContain('isFlowPilotEnabled');
    expect(platformEffect).not.toContain('flowpilot?.enabled');
  });

  it('surfaces failure instead of swallowing it', () => {
    expect(HOOK_SOURCE).toContain("variant: 'destructive'");
    expect(HOOK_SOURCE).toContain('logger.error');
  });
});
