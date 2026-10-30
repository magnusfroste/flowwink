import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * FlowPilot review 2026-10-29, step 1 — the security and "broken on arrival"
 * findings. Each test pins one of them so it cannot quietly return.
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('the heartbeat authenticates its caller', () => {
  const hb = read('supabase/functions/flowpilot-heartbeat/index.ts');
  it('gates on the service role or an admin before any work', () => {
    expect(hb).toMatch(/requireServiceOrRole\(req, supabase\)/);
    const gate = hb.indexOf('requireServiceOrRole(req, supabase)');
    const moduleGate = hb.indexOf("eq('key', 'modules')");
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(moduleGate);
  });
  it('a refused scheduled tick re-registers the cron jobs with the service key', () => {
    expect(hb).toMatch(/rescheduleAutonomyCron\(new Request\(/);
    expect(hb).toMatch(/Array\.isArray\(schedule\?\.local_hours\)/);
  });
  it('the cron registrar hands the jobs the service key, not the publishable one', () => {
    const cron = read('supabase/functions/_shared/handlers/update-autonomy-cron.ts');
    expect(cron).toMatch(/const serviceKey = Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/);
    expect(cron).toMatch(/const anonKey = serviceKey \|\|/);
  });
  it('a migration moves existing jobs onto the vault key, idempotently and without failing the deploy', () => {
    const files = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.includes('flowpilot-cron-carries-the-service-key'));
    expect(files).toHaveLength(1);
    const sql = read(`supabase/migrations/${files[0]}`);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.flowpilot_cron_use_service_key\(\)/);
    expect(sql).toMatch(/cron\.alter_job/);
    expect(sql).toMatch(/EXCEPTION WHEN OTHERS THEN/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.flowpilot_cron_use_service_key\(\) FROM PUBLIC, anon/);
  });
  it('the heartbeat row carries its trace id in the column the Trace tab groups by', () => {
    expect(hb).toMatch(/skill_name: "heartbeat",[\s\S]{0,400}trace_id: traceId,/);
  });
});

describe('the ReAct loop', () => {
  const r = read('supabase/functions/_shared/pilot/reason.ts');
  it('refuses a built-in the run was not granted, through execute_skill or by name', () => {
    expect(r).toMatch(/const grantedBuiltIns = new Set<string>\(\s*builtInTools\.map/);
    expect(r).toMatch(/isBuiltInTool\(fnName\) && fnName !== 'search_skills' && !grantedBuiltIns\.has\(fnName\)/);
  });
  it('retries a failed call only when the envelope says retryable: true', () => {
    expect(r).toMatch(/if \(result\?\.retryable !== true\) \{[\s\S]{0,900}break;/);
  });
  it('keeps the body of a non-2xx from agent-execute and never retries it', () => {
    expect(r).toMatch(/let parsed: Record<string, unknown> = \{\};[\s\S]{0,200}JSON\.parse\(errText\)/);
    expect(r).toMatch(/http_status: response\.status,\s*retryable: false,/);
  });
  it('a pending approval or a staged operation is not a success', () => {
    expect(r).toMatch(/status: failed \? 'failed' : refused \? 'refused' : pending \? 'pending' : 'success'/);
  });
});

describe('the cockpit shows what exists', () => {
  it('the Overview reads the real briefing table and the heartbeat summary', () => {
    const o = read('src/components/admin/copilot/FlowPilotOverviewTab.tsx');
    expect(o).toMatch(/from '@\/hooks\/useFlowPilotBriefings'/);
    expect(o).not.toMatch(/'morning_briefing'/);
    expect(o).toMatch(/heartbeatSummary/);
  });
  it('no cockpit link points at the removed Developer → MCP Activity tab', () => {
    for (const f of ['src/pages/admin/CopilotPage.tsx', 'src/components/admin/copilot/FlowPilotOverviewTab.tsx', 'src/components/admin/copilot/FlowPilotStatusBar.tsx']) {
      expect(read(f), f).not.toMatch(/tab=mcp-activity/);
    }
  });
  it('the status bar Behaviour link opens the tab that holds voice and rules (was Persona, then Memory by mistake)', () => {
    expect(read('src/components/admin/copilot/FlowPilotStatusBar.tsx')).toMatch(/to="\/admin\/flowpilot\?tab=behaviour"/);
  });
  it('"Try in FlowChat" opens the chat that exists and the chat reads the prompt', () => {
    expect(read('src/components/admin/modules/ModuleSkillsSection.tsx')).toMatch(/\/admin\/flowchat\?prompt=/);
    expect(read('src/pages/admin/FlowChatPage.tsx')).toMatch(/searchParams\.get\('prompt'\)/);
    expect(read('src/components/admin/copilot/OperateChat.tsx')).toMatch(/initialInput\?: string/);
  });
});
