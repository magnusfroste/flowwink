/**
 * Three "erroring" findings on optic's Automation Health and integration check
 * (2026-11-03), none of them a fault in what the instance does:
 *
 *  1. Ad Metrics Sync failed every night — Meta Ads is optional for Paid Growth
 *     and not connected; Composio answers a tool called without a connected
 *     account with "Tool … not found". Not connected is nothing to do.
 *  2. Re-engagement sequence failed every Monday — a newsletter flow was an
 *     automation running lead_nurture_sequence with fixed arguments, and that
 *     skill saves ONE written email for ONE lead. Flows are FlowPilot
 *     objectives now; the heartbeat picks the leads and writes the mails.
 *  3. check_integrations called the private system AI broken — it read
 *     local_llm.config.url, which nothing writes; everything else reads
 *     config.endpoint.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NEWSLETTER_FLOW_PRESETS, newsletterFlowConstraints } from '@/lib/newsletter-flows';

const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('sync_ad_metrics without Meta Ads is nothing to do, not a failure', () => {
  const edge = read('supabase/functions/_shared/execute/core.ts');
  const start = edge.indexOf('async function executeSyncAdMetrics(');
  const body = edge.slice(start, edge.indexOf('// ad_optimize —', start));

  it('asks Composio for a connected metaads account before calling a Meta tool', () => {
    const check = body.indexOf("composioToolkitConnected(supabaseUrl, serviceKey, 'metaads')");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(body.indexOf("exec('METAADS_GET_AD_ACCOUNTS'"));
  });

  it('answers a refusal with work_done 0 — no error, so the tick leaves no row', () => {
    const refusal = body.slice(body.indexOf('const notConnectedRefusal'), body.indexOf('if (await composioToolkitConnected'));
    expect(refusal).toMatch(/status: 'refused'/);
    expect(refusal).toMatch(/code: 'NOT_CONNECTED'/);
    expect(refusal).toMatch(/work_done: 0/);
    expect(refusal).not.toMatch(/\berror:/);
  });

  it('a connected account whose call fails still fails', () => {
    expect(body).toMatch(/return \{ error: `Meta Ads lookup failed: \$\{msg\}`, status: 'failed' \}/);
  });
});

describe('newsletter flows are FlowPilot objectives', () => {
  const page = read('src/pages/admin/NewsletterPage.tsx');
  const flows = page.slice(page.indexOf('function FlowsTab('));

  it('the Flows tab reads and writes agent_objectives, never automations', () => {
    expect(flows).toMatch(/from\("agent_objectives"\)/);
    expect(flows).not.toMatch(/agent_automations/);
    expect(flows).not.toMatch(/skill_name:\s*"lead_nurture_sequence"/);
  });

  it('a new flow is born paused with the flow constraints', () => {
    expect(flows).toMatch(/status: "paused"/);
    expect(flows).toMatch(/constraints: newsletterFlowConstraints\(key\)/);
  });

  it('every flow is standing, bounded by a cadence on lead_nurture_sequence, and uses the skill’s own sequence names', () => {
    for (const key of Object.keys(NEWSLETTER_FLOW_PRESETS) as Array<keyof typeof NEWSLETTER_FLOW_PRESETS>) {
      const c = newsletterFlowConstraints(key);
      expect(c.standing).toBe(true);
      expect(c.no_destructive_actions).toBe(true);
      expect(c.cadence.counts).toBe('lead_nurture_sequence');
      expect(c.cadence.max).toBeGreaterThan(0);
    }
    const skills = read('src/lib/modules/newsletter-module.ts');
    const enumBlock = skills.slice(skills.indexOf("name: 'lead_nurture_sequence'"));
    for (const p of Object.values(NEWSLETTER_FLOW_PRESETS)) {
      const seq = p.goal.match(/sequence_type ([a-z-]+)\)/)?.[1];
      expect(seq, p.name).toBeTruthy();
      expect(enumBlock).toContain(`'${seq}'`);
    }
  });

  it('the migration that converts old rows carries the same goals and rhythm', () => {
    const sql = read('supabase/migrations/20261103120000_newsletter-flows-become-objectives.sql');
    for (const [key, p] of Object.entries(NEWSLETTER_FLOW_PRESETS)) {
      expect(sql).toContain(`('${key}', '${p.goal.replace(/'/g, "''")}', ${p.cadence.max}, '${p.cadence.per}')`);
    }
    expect(sql).toMatch(/'paused'/);
    expect(sql).toMatch(/DELETE FROM public\.agent_automations WHERE id = r\.id/);
  });

  it('a standing objective cannot be completed', () => {
    const h = read('supabase/functions/_shared/pilot/handlers.ts');
    const fn = h.slice(h.indexOf('export async function handleObjectiveComplete('));
    const guard = fn.indexOf('standing === true');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(fn.indexOf("status: 'completed'"));
    expect(fn.slice(guard, guard + 300)).toMatch(/code: 'STANDING_OBJECTIVE'/);
  });
});

describe('the local LLM check reads what the admin writes', () => {
  it('probes config.endpoint, /v1-aware, like resolveAiConfig', () => {
    const src = read('supabase/functions/_shared/handlers/check-integrations.ts');
    const probe = src.slice(src.indexOf('local_llm: async (config)'));
    expect(probe).toMatch(/config\?\.endpoint/);
    expect(probe).toMatch(/base\.endsWith\('\/v1'\)/);
    expect(read('supabase/functions/_shared/ai-config.ts')).toMatch(/localConfig\.endpoint/);
  });
});
