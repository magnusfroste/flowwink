import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * "What changed since last Tuesday?" (Peter, optic 2026-09-21) was answered
 * with a hand-made daily snapshot of every task, because the platform only
 * remembered the current state. Now the task ledger (project_task_events)
 * remembers every change, every writer feeds it through triggers, and
 * project_changes reads it. This guard keeps the three things that make the
 * answer trustworthy: every writer feeds it, nobody rewrites it, and the
 * reader admits where its history begins.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const migrations = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => read(`supabase/migrations/${f}`)).join('\n');

function latestFunctionBody(fn: string): string {
  const start = migrations.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
  expect(start, `${fn} is defined in a migration`).toBeGreaterThan(-1);
  const rest = migrations.slice(start + 1);
  const next = rest.search(/\n(CREATE OR REPLACE FUNCTION|CREATE TRIGGER|DROP TRIGGER|DO \$|CREATE TABLE|CREATE POLICY|DROP POLICY)/);
  return migrations.slice(start, next < 0 ? undefined : start + 1 + next);
}

describe('every writer feeds the ledger', () => {
  it('the task trigger fires on insert, update and delete — not on a chosen path', () => {
    expect(migrations).toMatch(/CREATE TRIGGER project_tasks_record_events\s+AFTER INSERT OR UPDATE OR DELETE ON public\.project_tasks/);
    expect(migrations).toMatch(/CREATE TRIGGER project_task_dependencies_record_events\s+AFTER INSERT OR DELETE ON public\.project_task_dependencies/);
    expect(migrations).toMatch(/CREATE TRIGGER project_milestones_record_events\s+AFTER UPDATE ON public\.project_milestones/);
  });

  it('the trigger records each field that a status meeting asks about', () => {
    const b = latestFunctionBody('project_tasks_record_events');
    for (const field of ['status', 'priority', 'assigned_to', 'due_date', 'title', 'milestone_id']) {
      expect(b, `${field} is compared`).toContain(`NEW.${field} IS DISTINCT FROM OLD.${field}`);
    }
    expect(b).toContain('public.checklist_done_count(OLD.checklist)');
    // A deleted task keeps its name: the title travels with the event.
    expect(b).toMatch(/OLD\.title, 'deleted'/);
  });

  it('only the trigger writes: no insert policy for people, and the trigger runs as definer', () => {
    const ledger = migrations.slice(migrations.indexOf('CREATE TABLE IF NOT EXISTS public.project_task_events'));
    expect(ledger).toMatch(/CREATE POLICY "project task events follow the project" ON public\.project_task_events\s+FOR SELECT TO authenticated/);
    expect(ledger).not.toMatch(/ON public\.project_task_events\s+FOR (ALL|INSERT|UPDATE|DELETE)/);
    expect(latestFunctionBody('project_tasks_record_events')).toMatch(/SECURITY DEFINER/);
  });
});

describe('nobody rewrites the ledger', () => {
  it('update is refused; delete only follows a deleted project', () => {
    const b = latestFunctionBody('project_task_events_are_a_ledger');
    expect(b).toMatch(/an event is never edited/);
    expect(b).toMatch(/an event is never deleted while its project exists/);
    expect(migrations).toMatch(/CREATE TRIGGER project_task_events_are_a_ledger\s+BEFORE UPDATE OR DELETE ON public\.project_task_events/);
  });

  it('no frontend or edge code writes the ledger by hand', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
        if (e.isDirectory()) { if (e.name !== 'node_modules') walk(join(dir, e.name)); }
        else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) files.push(join(dir, e.name));
      }
    };
    walk('src');
    walk('supabase/functions');
    const HAND_WRITE = /from\(['"]project_task_events['"]\)\s*\.\s*(insert|update|upsert|delete)/;
    // Negative test: the shape the scanner exists for.
    expect(HAND_WRITE.test(`await supabase.from('project_task_events').insert({ kind: 'status' })`)).toBe(true);
    expect(HAND_WRITE.test(`await supabase.from('project_task_events').select('*')`)).toBe(false);
    const writers = files.filter((f) => HAND_WRITE.test(read(f)));
    expect(writers).toEqual([]);
  });
});

describe('the reader admits where its history begins', () => {
  it('coverage is partial only when the window opens before the ledger and the project is older than it', () => {
    const b = latestFunctionBody('project_changes');
    expect(b).toMatch(/'coverage', CASE WHEN v_started IS NOT NULL AND v_since < v_started AND r\.project_created_at < v_started THEN 'partial' ELSE 'full' END/);
    expect(b).toMatch(/so an empty list there means "not recorded", not "nothing happened"/);
    // Quiet projects are named, not dropped — silence is an answer.
    expect(b).toMatch(/'quiet', v_quiet/);
    // Comments and hours are read from their own tables, never copied into the ledger.
    expect(b).toMatch(/FROM public\.project_task_comments c/);
    expect(b).toMatch(/FROM public\.time_entries te/);
    expect(latestFunctionBody('project_tasks_record_events')).not.toMatch(/project_task_comments|time_entries/);
  });

  it('the backfill claims only what is known: creation and completion', () => {
    const backfill = migrations.slice(migrations.indexOf('DO $backfill$'), migrations.indexOf('$backfill$;'));
    expect(backfill).toMatch(/'created', NULL, t\.created_by/);
    expect(backfill).toMatch(/'status', 'done', 'system', true, t\.completed_at/);
    expect(backfill).not.toMatch(/'priority'|'assignee'|'due_date'/);
    expect(backfill).toMatch(/VALUES \('ledger_started', 'system'\)/);
  });

  it('the UI shows the partial-coverage note and the agent is told the same', () => {
    expect(read('src/components/admin/projects/ProjectChangesPanel.tsx')).toMatch(/d\.coverage === "partial"/);
    const artifact = JSON.parse(read('supabase/seed/module-skills.json')) as { modules: Array<{ skills: Array<{ name: string; handler: string; instructions?: string; tool_definition: { function: { parameters: { properties: Record<string, unknown> } } } }> }> };
    const skill = artifact.modules.flatMap((m) => m.skills).find((s) => s.name === 'project_changes');
    expect(skill?.handler).toBe('rpc:project_changes');
    expect(skill?.instructions).toMatch(/"not recorded" rather than "nothing happened"/);
    const head = migrations.slice(migrations.lastIndexOf('CREATE OR REPLACE FUNCTION public.project_changes('));
    const signature = head.slice(0, head.indexOf('RETURNS'));
    for (const param of Object.keys(skill!.tool_definition.function.parameters.properties)) {
      expect(signature, `project_changes takes ${param}`).toContain(param);
    }
  });
});
