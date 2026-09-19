import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Hire-to-retire, process battery 2026-09-19: vacation allocation crashed on an
 * ambiguous column as soon as one employee existed (and it is the only writer of
 * leave_allocations, so no leave could be approved); sick leave needed a quota it
 * never has; a Monday–Friday request charged one day; a new hire's salary landed
 * on the contract only, so payroll paid 0; a rejected application could be hired;
 * payroll paid a colleague who starts in 2040; and manage_leave / manage_employee
 * advertised verbs the generic handler did not know.
 */

const root = join(__dirname, '../../..');
const migration = readFileSync(join(root, 'supabase/migrations/20260919190000_anstallningen-hanger-ihop.sql'), 'utf8');
const agentExecute = readFileSync(join(root, 'supabase/functions/agent-execute/index.ts'), 'utf8');
const artifact = JSON.parse(readFileSync(join(root, 'supabase/seed/module-skills.json'), 'utf8')) as {
  modules: Array<{ skills: Array<{ name: string; handler?: string; tool_definition?: { function?: { parameters?: { properties?: { action?: { enum?: string[] } } } } } }> }>;
};

describe('the in-place patches fail closed and are proven in the live body', () => {
  it.each(['auto_allocate_vacation', 'hire_application', 'create_payroll_run'])('%s has an anchor that aborts the migration', (fn) => {
    expect(migration).toMatch(new RegExp(`anchor missing in ${fn}`));
  });
  it('the proof asserts the marker in all three', () => {
    expect(migration).toMatch(/does not carry the 20260919190000 change/);
  });
  it('the fixes are the ones the findings name', () => {
    expect(migration).toMatch(/#variable_conflict use_column/);
    expect(migration).toMatch(/IN \(''rejected'', ''withdrawn''\)/);
    expect(migration).toMatch(/created_by, monthly_salary_cents/);
    expect(migration).toMatch(/start_date IS NULL OR start_date <= /);
    expect(migration).toMatch(/NEW\.leave_type <> 'vacation'/);
    expect(migration).toMatch(/EXTRACT\(isodow FROM d\) < 6/);
  });
});

describe('every verb a generic-CRUD skill advertises is one the handler runs', () => {
  // Discovered from the artifact, not listed: a db:<table> skill whose action enum
  // names a verb must find it among the CRUD verbs, the aliases or the table's
  // status verbs — otherwise the agent is promised an action that answers
  // "Unknown action". (It was true of three HR skills for months.)
  const crud = new Set(['list', 'get', 'create', 'update', 'delete']);
  const aliasBlock = agentExecute.slice(agentExecute.indexOf('const ACTION_ALIASES'), agentExecute.indexOf('const aliasResolved'));
  const aliases = new Set([...aliasBlock.matchAll(/^\s+(\w+):\s+\{ action:/gm)].map((m) => m[1]));
  const verbBlock = agentExecute.slice(agentExecute.indexOf('const STATUS_VERBS'), agentExecute.indexOf('const VERB_ID_ALIASES'));
  const tableVerbs = new Map<string, Set<string>>();
  for (const m of verbBlock.matchAll(/^\s{4}(\w+): \{([\s\S]*?)^\s{4}\},/gm)) {
    tableVerbs.set(m[1], new Set([...m[2].matchAll(/^\s{6}(\w+):/gm)].map((v) => v[1])));
  }

  it('reads the handler\'s verb tables', () => {
    expect(aliases.has('list_pending')).toBe(true);
    expect(tableVerbs.get('leave_requests')?.has('approve')).toBe(true);
    expect(tableVerbs.get('employees')?.has('deactivate')).toBe(true);
  });

  it('the HR skills\' advertised verbs all run', () => {
    const dead: string[] = [];
    for (const s of artifact.modules.flatMap((m) => m.skills)) {
      if (!['manage_leave', 'manage_employee', 'manage_job_posting'].includes(s.name)) continue;
      const table = (s.handler ?? '').replace(/^db:/, '');
      for (const verb of s.tool_definition?.function?.parameters?.properties?.action?.enum ?? []) {
        if (crud.has(verb) || aliases.has(verb) || tableVerbs.get(table)?.has(verb)) continue;
        dead.push(`${s.name}.${verb}`);
      }
    }
    expect(dead).toEqual([]);
  });
});
