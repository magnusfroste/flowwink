import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * "Needs attention" in the project view had one condition — an overdue open
 * task — computed in the browser. On optic 1 of 51 open tasks had a due date, so
 * it was always empty, while 7 tasks stood blocked by something unfinished and
 * project_portfolio_brief (what agents read first) already knew. One fact, two
 * readers that disagreed. Now: one definition of a task's signals, one rule,
 * read by the project view and the brief alike.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const migrations = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => read(`supabase/migrations/${f}`)).join('\n');

function latestFunctionBody(fn: string): string {
  const start = migrations.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
  expect(start, `${fn} is defined in a migration`).toBeGreaterThan(-1);
  return migrations.slice(start, migrations.indexOf('$function$;', start));
}

describe('one definition of a task\'s signals', () => {
  it('blocked, overdue in the platform\'s own day, urgent, and movement as the brief defines it', () => {
    const b = latestFunctionBody('project_task_signals');
    expect(b).toMatch(/o\.status::text <> 'done'\) AS is_blocked/);
    expect(b).toMatch(/t\.due_date < public\.platform_today\(\)\) AS is_overdue/);
    expect(b).toMatch(/t\.priority::text = 'urgent'\) AS is_urgent/);
    // an agent's own comment never counts as movement
    expect(b).toMatch(/c\.author_type::text = 'person'/);
    expect(b).not.toMatch(/CURRENT_DATE/);
  });

  it('reads with the caller\'s eyes — a private project is not revealed', () => {
    const start = migrations.lastIndexOf('CREATE OR REPLACE FUNCTION public.project_task_signals(');
    const header = migrations.slice(start, migrations.indexOf('AS $function$', start));
    expect(header).not.toMatch(/SECURITY DEFINER/);
    const view = migrations.slice(migrations.lastIndexOf('CREATE OR REPLACE FUNCTION public.project_attention('));
    expect(view.slice(0, view.indexOf('AS $function$'))).not.toMatch(/SECURITY DEFINER/);
  });
});

describe('one rule, read by the view and the brief', () => {
  it('the verdict weighs urgent, overdue, blocked, stalled and a passed deadline', () => {
    const v = latestFunctionBody('project_attention_verdict');
    for (const kind of ['urgent', 'overdue', 'blocked', 'stalled', 'deadline_passed']) expect(v).toContain(`'${kind}'`);
  });

  it('the project view and the brief both call the verdict over the same signals', () => {
    const view = latestFunctionBody('project_attention');
    const brief = latestFunctionBody('project_portfolio_brief');
    for (const b of [view, brief]) expect(b).toMatch(/public\.project_attention_verdict\(/);
    expect(view).toMatch(/public\.project_task_signals\(NULL, true\)/);
    expect(brief).toMatch(/SELECT \* FROM public\.project_task_signals\(p_project_id, false\)/);
    expect(brief).not.toMatch(/CURRENT_DATE/);
  });

  it('the browser no longer decides — it reads the verdict', () => {
    const hook = read('src/hooks/useProjects.ts');
    expect(hook).toMatch(/rpc\("project_attention" as never/);
    expect(hook).not.toMatch(/from\("project_tasks"\)\s*\.select\("project_id,status,due_date"\)/);
    const rail = read('src/components/admin/projects/ProjectRail.tsx');
    expect(rail).toMatch(/stats\?\.get\(p\.id\)\?\.needsAttention/);
    expect(rail).not.toMatch(/overdue \?\? 0\) === 0/);
  });
});

describe('the team order is shared, the sort is personal', () => {
  it('reorder_projects moves only what the caller can see — the same predicate as the read policy', () => {
    const b = latestFunctionBody('reorder_projects');
    expect(b).toMatch(/p\.visibility = 'shared' OR p\.created_by = v_uid OR has_role\(v_uid, 'admin'::app_role\)/);
    // The read policy's three ways to see a project; the reorder must accept exactly these.
    const policy = /CREATE POLICY "Shared or own projects are visible"[\s\S]*?USING \(([\s\S]*?)\);/.exec(migrations)?.[1] ?? '';
    expect(policy, 'the read policy is found').not.toBe('');
    for (const [inPolicy, inReorder] of [
      [/visibility = 'shared'/, /p\.visibility = 'shared'/],
      [/created_by = auth\.uid\(\)/, /p\.created_by = v_uid/],
      [/has_role\(auth\.uid\(\), 'admin'/, /has_role\(v_uid, 'admin'/],
    ] as const) {
      expect(policy).toMatch(inPolicy);
      expect(b).toMatch(inReorder);
    }
  });

  it('a new project lands on top, as it always did', () => {
    expect(latestFunctionBody('project_sort_order_on_insert')).toMatch(/min\(sort_order\)/);
  });

  it('the sort choice is kept per viewer and never written to the database', () => {
    const order = read('src/lib/project-order.ts');
    expect(order).toMatch(/localStorage\?\.setItem/);
    expect(order).not.toMatch(/supabase/);
  });
});
