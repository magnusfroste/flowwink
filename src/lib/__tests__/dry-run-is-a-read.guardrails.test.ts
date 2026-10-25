import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDryRunRead, isReadCall, classifyCall } from '../../../supabase/functions/_shared/skills/read-surface';

/**
 * Guardrail: a dry run that writes nothing is a READ, so an approve-level
 * skill's plan can be read without a human click — and a live run still waits.
 * optic, 2026-10-25: convert_translation_groups' dry run came back
 * pending_approval; the step the design says to run first cost a click each time.
 */
describe('dry_run is a read — for skills whose contract says so', () => {
  it('convert_translation_groups: a dry run (explicit or by default) is a read; a live run is not', () => {
    expect(isDryRunRead('convert_translation_groups', { dry_run: true })).toBe(true);
    expect(isDryRunRead('convert_translation_groups', {})).toBe(true);
    expect(isDryRunRead('convert_translation_groups', { slug: 'home' })).toBe(true);
    expect(isDryRunRead('convert_translation_groups', { dry_run: false })).toBe(false);
    expect(classifyCall('convert_translation_groups', { dry_run: false })).toBe('stage');
  });

  it('explicit-only skills need dry_run: true — an absent flag is their live default', () => {
    expect(isDryRunRead('enable_language', { locale: 'sv', dry_run: true })).toBe(true);
    expect(isDryRunRead('enable_language', { locale: 'sv' })).toBe(false);
    expect(isDryRunRead('translate_page', { slug: 'x', locale: 'sv' })).toBe(false);
  });

  it('a skill not listed never becomes a read through dry_run — fail closed', () => {
    expect(isDryRunRead('process_payroll_run', { dry_run: true })).toBe(false);
    expect(isReadCall('process_payroll_run', { dry_run: true })).toBe(false);
  });

  it('the agent-execute approval gate consults it', () => {
    const src = readFileSync(join(process.cwd(), 'supabase/functions/agent-execute/index.ts'), 'utf8');
    const at = src.indexOf('const planOnly = isDryRunRead(');
    const gateAt = src.indexOf("if (trustLevel === 'approve' && !bypassApproval) {");
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(gateAt);
    expect(src.slice(at, gateAt)).toContain("if (planOnly && trustLevel === 'approve') trustLevel = 'notify';");
  });
});
