import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLATFORM_SKILLS, PLATFORM_AUTOMATIONS } from '@/lib/platform-seeds';

/**
 * Guardrail: integration health is a first-class, scheduled platform sensor.
 *
 * Origin (Magnus, 2026-07-22): the fleet's SearXNG was misconfigured for
 * days — web search silently fell back to Firecrawl and the only trace was a
 * provider field deep inside agent_activity outputs. "Had we had tests on
 * every integration I'd have seen it earlier." A failing integration must be
 * one skill call away from visible, and probed daily without anyone asking.
 */

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('integration health', () => {
  const skill = PLATFORM_SKILLS.find((s) => s.name === 'check_integrations');

  it('check_integrations is a platform skill (module-toggle-independent)', () => {
    expect(skill, 'check_integrations missing from platform seeds').toBeTruthy();
    expect(skill?.handler).toBe('internal:check_integrations');
    // Read-only sensor — must not be gated behind approval.
    expect(skill?.trust_level).toBe('auto');
  });

  it('a daily automation runs it and labels the source', () => {
    const auto = PLATFORM_AUTOMATIONS.find((a) => a.skill_name === 'check_integrations');
    expect(auto, 'no automation schedules check_integrations').toBeTruthy();
    expect(auto?.trigger_type).toBe('cron');
    // source: 'automation' is what makes the handler notify admin FlowChat
    // on failure — without it the sweep would be silent, recreating the
    // original incident with extra steps.
    expect((auto?.skill_arguments as Record<string, unknown>)?.source).toBe('automation');
  });

  it('the dispatch in agent-execute is wired', () => {
    const ae = read('supabase/functions/agent-execute/index.ts');
    expect(ae).toContain("handler === 'internal:check_integrations'");
    expect(ae).toContain('executeCheckIntegrations(supabase');
  });

  it('probes are bounded and the known failure shapes carry their fix', () => {
    const h = read('supabase/functions/_shared/handlers/check-integrations.ts');
    // Every probe must time out — a hung endpoint is a diagnosis, not a hang.
    expect(h).toMatch(/PROBE_TIMEOUT_MS = \d+/);
    expect(h).toMatch(/AbortController/);
    // The two failure shapes from the founding incident are named diagnostics:
    expect(h).toContain('enable "json" under search.formats');
    expect(h).toMatch(/engines likely blocking this server's IP/);
    // Never a billable write: probes are GETs/auth checks only.
    expect(h, 'a probe issues a POST — probes must be reads').not.toMatch(/method:\s*'POST'/);
  });
});
