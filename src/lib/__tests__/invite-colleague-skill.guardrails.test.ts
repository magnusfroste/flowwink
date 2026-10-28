import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLATFORM_SKILLS } from '../platform-seeds';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Hermes on Nordbrygg found ten open tickets and nobody to assign them to, and
 * could only report it: the invite edge function existed, no skill reached it.
 * Now an agent can ask — and a person approves — before anyone joins.
 */
describe('invite_colleague — an agent can ask, a person decides', () => {
  const seed = PLATFORM_SKILLS.find((s) => s.name === 'invite_colleague')!;
  it('is a platform skill gated on human approval, declared high-risk and reversible', () => {
    expect(seed).toBeTruthy();
    expect(seed.handler).toBe('edge:invite-colleague');
    expect(seed.trust_level).toBe('approve');
    expect(seed.tool_definition).toMatchObject({ risk: 'high', reversible: true });
    expect(String(seed.instructions)).toMatch(/_approved_operation_id/);
  });
  it('offers exactly the roles the edge function accepts', () => {
    const fn = read('supabase/functions/invite-colleague/index.ts');
    const list = fn.match(/const INVITABLE_ROLES = \[([\s\S]*?)\];/)![1].match(/"([a-z]+)"/g)!.map((x) => x.replace(/"/g, ''));
    const params = (seed.tool_definition as { function: { parameters: { properties: { role: { enum: string[] } } } } }).function.parameters.properties.role.enum;
    expect([...params].sort()).toEqual([...list].sort());
  });
  it('the edge function admits the platform call only with the service key and a _skill marker', () => {
    const fn = read('supabase/functions/invite-colleague/index.ts');
    expect(fn).toMatch(/const platformCall = typeof body\._skill === "string" && bearer\.length > 0/);
    expect(fn).toMatch(/bearer === \(Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\) \?\? "__unset__"\)/);
    expect(fn).toMatch(/if \(!platformCall\) \{/);
  });
  it('check_operations and users_list point at it', () => {
    const ops = PLATFORM_SKILLS.find((s) => s.name === 'check_operations')!;
    expect(String(ops.instructions)).toMatch(/invite_colleague/);
    expect(read('src/lib/modules/flowpilot-module.ts')).toMatch(/inviting a new colleague \(invite_colleague, approval required\)/);
  });
});
