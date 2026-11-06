import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Two things Peter's backlog (optic) found in the Projects view, 2026-11-04/05,
 * pinned so they stay fixed:
 *
 * 1. The milestones panel reads progress from the milestone's OWN tasks
 *    (project_tasks.milestone_id) through milestoneProgress — not from a
 *    due-date heuristic that counted the whole project (0/35 on every one).
 * 2. The project rail scrolls on its own: the aside is a flex column with a
 *    bound height and the rail's ScrollArea may shrink (min-h-0). `h-full`
 *    against a max-height-only parent is auto, and the list then grew past
 *    the viewport, reachable only by zooming out.
 */
const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('milestone progress is the milestone\'s own tasks', () => {
  const panel = read('src/components/admin/projects/ProjectMilestonesPanel.tsx');
  it('the panel reads milestoneProgress', () => {
    expect(panel).toMatch(/import \{[^}]*milestoneProgress[^}]*\} from '@\/lib\/task-card'/);
    expect(panel).toMatch(/milestoneProgress\(m\.id, tasks\)/);
  });
  it('no due-date heuristic decides a milestone\'s progress', () => {
    expect(panel).not.toMatch(/t\.due_date\s*<=\s*m\.due_date/);
    expect(panel).not.toMatch(/Progress heuristic/);
  });
  it('a milestone without linked tasks shows no progress, not the project total', () => {
    expect(panel).toMatch(/pct === null \? '–'/);
  });
});

describe('the project rail scrolls on its own', () => {
  it('the aside is a flex column with a bound height', () => {
    const page = read('src/pages/admin/ProjectsPage.tsx');
    const aside = page.match(/<aside className="([^"]*)">\s*<ProjectRail/);
    expect(aside, 'the rail aside').toBeTruthy();
    const cls = aside![1].split(/\s+/);
    expect(cls).toContain('flex');
    expect(cls).toContain('flex-col');
    expect(cls.some((c) => c.startsWith('lg:max-h-['))).toBe(true);
  });
  it('the rail and its ScrollArea may shrink below their content', () => {
    const rail = read('src/components/admin/projects/ProjectRail.tsx');
    expect(rail).toMatch(/<div className="flex min-h-0 flex-col gap-3">/);
    expect(rail).toMatch(/<ScrollArea className="w-full flex-1 min-h-0" fitWidth>/);
    expect(rail).not.toMatch(/className="flex h-full flex-col/);
  });
});
