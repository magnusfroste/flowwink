import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { leanBoardPosts, leanInstances } from '../../../supabase/functions/_shared/feedback/lean-board.ts';

/** manage_feedback list / instances answer without every instance's module list (www, 2026-11-27: 11–20k chars a call). */
const modules = Array.from({ length: 67 }, (_, i) => `module${i}`);

describe('a board listing', () => {
  it('a post keeps its origin but counts the modules', () => {
    const [p] = leanBoardPosts([{ id: 'p', title: 'Skill failing: x', origin: { instance_id: 'i', skills_sha: 's', migration_head: '20261114100000', modules_enabled: modules } }], false);
    expect(p.origin).toEqual({ instance_id: 'i', skills_sha: 's', migration_head: '20261114100000', module_count: 67 });
    expect(leanBoardPosts([{ id: 'p', origin: { modules_enabled: modules } }], true)[0].origin).toEqual({ modules_enabled: modules });
  });
  it('an instance keeps its versions and its module_count', () => {
    const [r] = leanInstances([{ instance_id: 'i', module_count: 67, modules_enabled: modules, migration_head: 'h' }], false);
    expect(r).toEqual({ instance_id: 'i', module_count: 67, migration_head: 'h' });
    expect(JSON.stringify(r).length).toBeLessThan(120);
  });
  it('the handler and the skill use it', () => {
    const core = readFileSync('supabase/functions/_shared/execute/core.ts', 'utf8');
    expect(core).toMatch(/instances: leanInstances\(/);
    expect(core).toMatch(/posts: leanBoardPosts\(/);
    expect(readFileSync('src/lib/modules/feedback-module.ts', 'utf8')).toMatch(/full: \{ type: 'boolean', description: 'list \/ instances/);
  });
});
