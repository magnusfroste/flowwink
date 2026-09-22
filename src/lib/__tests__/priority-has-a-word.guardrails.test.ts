import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A priority means what the team says it means — and it can be set on screen.
 *
 * Optic ran 66 of 70 tasks on medium and asked for "a standard scale with
 * meaning". The scale existed. The task dialog had no priority field, the
 * quick-add hard-coded medium, and "high" had no words anywhere a person
 * chooses. This guard keeps the words in ONE place (the database function,
 * defaults + the team's own), shown by the picker and carried to the agent.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const migrations = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => read(`supabase/migrations/${f}`)).join('\n');

describe('the words live in one place', () => {
  it('the guide function holds the defaults and layers the team\'s words on top', () => {
    const start = migrations.lastIndexOf('CREATE OR REPLACE FUNCTION public.project_priority_guide(');
    expect(start).toBeGreaterThan(-1);
    const body = migrations.slice(start, migrations.indexOf('$$;', start));
    expect(body).toMatch(/'urgent', 'Blocks something/);
    expect(body).toMatch(/\|\| COALESCE\(\(SELECT s\.value->'priority_guide' FROM public\.site_settings s WHERE s\.key = 'projects'\), '\{\}'::jsonb\)/);
  });

  it('no meaning is written in the browser', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
        if (e.isDirectory()) walk(join(dir, e.name));
        else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) files.push(join(dir, e.name));
      }
    };
    walk('src');
    const offenders = files.filter((f) => /Nice to have\. Nobody is waiting|Blocks something — a deadline/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it('both readers carry the guide, patched at their anchors with a marker', () => {
    expect(migrations).toMatch(/pg_get_functiondef\('public\.project_attention\(integer\)'::regprocedure\)/);
    expect(migrations).toMatch(/pg_get_functiondef\('public\.project_portfolio_brief\(uuid, integer\)'::regprocedure\)/);
    expect(migrations).toMatch(/RAISE EXCEPTION 'project_attention has no anchor/);
    expect(migrations).toMatch(/RAISE EXCEPTION 'project_portfolio_brief has no anchor/);
    expect((migrations.match(/priority-guide 20260922190000/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
});

describe('a person can set a priority', () => {
  it('the task dialog has the picker and saves the field', () => {
    const dialog = read('src/components/admin/projects/TaskEditDialog.tsx');
    expect(dialog).toMatch(/<PrioritySelect value=\{priority\} onChange=\{setPriority\} \/>/);
    expect(dialog).toMatch(/\n\s+priority,\n\s+checklist,/);
  });

  it('the picker shows the guide under each option and edits it where it is used', () => {
    const picker = read('src/components/admin/projects/PrioritySelect.tsx');
    expect(picker).toMatch(/usePriorityGuide\(\)/);
    expect(picker).toMatch(/guide\?\.\[p\] && /);
    expect(picker).toMatch(/useSetPriorityGuide\(\)/);
    expect(picker).toMatch(/What these mean/);
  });

  it('the skills are seeded with the names the functions take', () => {
    type Seed = { name: string; handler: string; instructions?: string; tool_definition: { function: { parameters: { properties: Record<string, unknown> } } } };
    const artifact = JSON.parse(read('supabase/seed/module-skills.json')) as { modules: Array<{ skills: Seed[] }> };
    const skills = artifact.modules.flatMap((m) => m.skills);
    expect(skills.find((s) => s.name === 'project_priority_guide')?.handler).toBe('rpc:project_priority_guide');
    const setter = skills.find((s) => s.name === 'set_project_priority_guide')!;
    expect(setter.handler).toBe('rpc:set_project_priority_guide');
    expect(Object.keys(setter.tool_definition.function.parameters.properties)).toEqual(['p_guide']);
    expect(migrations).toMatch(/FUNCTION public\.set_project_priority_guide\(p_guide jsonb\)/);
    expect(skills.find((s) => s.name === 'manage_project_task')?.instructions).toMatch(/read project_priority_guide/);
  });
});
