import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrail: a generative skill can never be wired as a static automation.
 *
 * Proof week, 2026-07-23: two live instances had write_blog_post as a cron
 * automation. write_blog_post is a pure sink — it does NOT generate; a
 * reasoning loop must produce title+content first, and the automation
 * dispatcher runs NO loop on any executor. Result: liteit's daily automation
 * errored at 07:00 every day ("title is required"); www's weekly one had a
 * frozen 284-char body and republished the same post. The correct pattern for
 * recurring generative work is an OBJECTIVE with constraints.cadence (the loop
 * generates fresh content), never an automation.
 *
 * Fix is deterministic + Law-1-safe: the create branch rejects a cron/manual
 * automation whose skill_arguments omit a REQUIRED param of the target skill,
 * and the skill instructions steer generative work to a cadenced objective.
 */

const root = process.cwd();
const ae = readFileSync(join(root, 'supabase/functions/agent-execute/index.ts'), 'utf8');
const seed = readFileSync(join(root, 'src/lib/modules/flowpilot-module.ts'), 'utf8');

describe('automation cannot host a generative skill', () => {
  it('the create branch validates required params against the target skill', () => {
    const block = ae.slice(ae.indexOf("action === 'create' && (trigger_type === 'cron'"), ae.indexOf("const { data, error } = await supabase.from('agent_automations').insert"));
    expect(block, 'required-param validation missing from automation create').toMatch(
      /parameters\?\.required/,
    );
    expect(block).toMatch(/const missing = req\.filter/);
    // Signal/event automations are exempt — their payload fills args at runtime.
    expect(block).toMatch(/trigger_type === 'cron' \|\| trigger_type === 'manual'/);
    // The error steers to the right pattern.
    expect(block).toMatch(/recurring OBJECTIVE with constraints\.cadence/);
  });

  it('the create branch fetches tool_definition to know the required params', () => {
    expect(ae).toMatch(/\.select\('id, tool_definition'\)\.eq\('name', targetSkill\)/);
  });

  it('manage_automations instructions steer generative work to an objective', () => {
    const block = seed.slice(seed.indexOf("name: 'manage_automations'"), seed.indexOf("name: 'users_list'"));
    expect(block).toMatch(/Generative skills are NOT automations/);
    expect(block).toMatch(/recurring OBJECTIVE with .{0,2}constraints\.cadence/);
  });
});
