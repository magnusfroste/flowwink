/**
 * A read never switches a module on; a write that does is visible.
 *
 * synclair, 2026-10-20..22: a connected ChatGPT ran manage_orders
 * {action:'list'} every morning; agent-execute's auto-activation switched the
 * e-commerce module back on each time, and the header cart reappeared on a
 * site that sells nothing — with nothing in any log saying why.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  callWakesModule,
  moduleWakeAuditRow,
  moduleWakeNote,
} from '../../../supabase/functions/_shared/modules/module-wake';

const AGENT_EXECUTE = readFileSync(join(process.cwd(), 'supabase/functions/agent-execute/index.ts'), 'utf8');

describe('reads never wake a module', () => {
  it.each([
    ['manage_orders', { action: 'list' }],
    ['manage_orders', { action: 'get', order_id: 'x' }],
    ['manage_product', { action: 'search', query: 'moss' }],
    ['browse_products', {}],
    ['check_order_status', { order_id: 'x' }],
  ])('%s %j is a read', (name, args) => {
    expect(callWakesModule(name, args as Record<string, unknown>)).toBe(false);
  });
});

describe('writes — and anything not provably a read — still wake it', () => {
  it.each([
    ['manage_product', { action: 'create', name: 'MOSS One' }],
    ['manage_orders', { action: 'update' }],
    ['place_order', {}],
    ['manage_orders', {}],
    ['cart_recovery_check', {}],
  ])('%s %j wakes', (name, args) => {
    expect(callWakesModule(name, args as Record<string, unknown>)).toBe(true);
  });
});

describe('a wake is visible', () => {
  it('the audit row names the module, the skill, the handler and the action', () => {
    const row = moduleWakeAuditRow('ecommerce', { skillName: 'manage_product', handler: 'module:products', args: { action: 'create' } });
    expect(row).toMatchObject({ entity_type: 'module', entity_id: 'ecommerce', action: 'module.auto_enabled' });
    expect(row.metadata).toMatchObject({ skill: 'manage_product', handler: 'module:products', skill_action: 'create' });
  });

  it('the note tells the agent what changed, the public side effect, and how to undo it', () => {
    const note = moduleWakeNote('ecommerce', 'manage_product');
    expect(note).toMatch(/ecommerce module was off and has been switched on/);
    expect(note).toMatch(/store\.storefront/);
    expect(note).toMatch(/tell the operator/);
  });
});

describe('agent-execute routes the auto-activation through the rule', () => {
  const fn = AGENT_EXECUTE.slice(
    AGENT_EXECUTE.indexOf('async function autoActivateModule'),
    AGENT_EXECUTE.indexOf('async function executeModuleAction'),
  );

  it('the read gate comes before any settings read or write', () => {
    const gate = fn.indexOf('if (!callWakesModule(ctx.skillName, ctx.args)) return null;');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(fn.indexOf(".from('site_settings')"));
  });

  it('an activation writes the audit row and reports which module woke', () => {
    expect(fn).toMatch(/from\('audit_logs'\)\.insert\(\s*moduleWakeAuditRow\(/);
    expect(fn).toMatch(/return settingKey;/);
  });

  it('the call site passes the call and attaches the note to the result', () => {
    expect(AGENT_EXECUTE).toMatch(/autoActivateModule\(supabase, moduleName, \{ skillName: skill\.name, args \}\)/);
    expect(AGENT_EXECUTE).toMatch(/module_activated: \{ module: woke, note: moduleWakeNote\(woke, skill\.name\) \}/);
  });
});
