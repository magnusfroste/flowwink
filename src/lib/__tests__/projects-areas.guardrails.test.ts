import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The area is a field on the task, read by ONE rule (src/lib/task-area.ts),
 * and every surface that writes or shows a task carries it: the column, the
 * generated types, the skill's parameter, the edit dialog, the Areas tab.
 * Peter's backlog (optic, 2026-11-05): one level, derived, no maintenance —
 * a second reader of "what is this task's area" is where the sections and
 * the skill would start to disagree.
 */
const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('the area is a field on the task', () => {
  it('the column exists, nullable, with its comment', () => {
    const mig = read('supabase/migrations/20261107090000_omradet-ar-ett-falt-pa-uppgiften.sql');
    expect(mig).toMatch(/ALTER TABLE public\.project_tasks ADD COLUMN IF NOT EXISTS area text;/);
    expect(mig).toMatch(/COMMENT ON COLUMN public\.project_tasks\.area IS/);
    expect(mig).not.toMatch(/NOT NULL/);
  });

  it('the generated types and the hook type carry it', () => {
    const types = read('src/integrations/supabase/types.ts');
    const block = types.slice(types.indexOf('      project_tasks: {'), types.indexOf('      project_task_', types.indexOf('      project_tasks: {') + 30));
    expect(block).toMatch(/area: string \| null/);
    expect(block.match(/area\?: string \| null/g)?.length).toBe(2);
    expect(read('src/hooks/useProjects.ts')).toMatch(/area\?: string \| null;/);
  });

  it('manage_project_task takes area and says what it means', () => {
    const mod = read('src/lib/modules/projects-module.ts');
    const skill = mod.slice(mod.indexOf("name: 'manage_project_task'"), mod.indexOf("name: 'comment_on_task'"));
    expect(skill).toMatch(/area: \{ type: 'string', description: 'The task\\'s area/);
    expect(skill).toMatch(/AREA is one level of grouping/);
  });
});

describe('one rule reads the area', () => {
  it('the page and the dialog read task-area, nobody re-parses the title', () => {
    const page = read('src/pages/admin/ProjectsPage.tsx');
    const dialog = read('src/components/admin/projects/TaskEditDialog.tsx');
    expect(page).toMatch(/import \{ groupTasksByArea \} from "@\/lib\/task-area"/);
    expect(dialog).toMatch(/import \{ areaFromTitle, knownAreas \} from "@\/lib\/task-area"/);
    for (const src of [page, dialog]) {
      expect(src).not.toMatch(/title\.split\(['"][–—-]/);
      expect(src).not.toMatch(/\.split\(\/\s*[–—]/);
    }
  });

  it('the Areas tab exists and the dialog saves the field', () => {
    const page = read('src/pages/admin/ProjectsPage.tsx');
    expect(page).toMatch(/<TabsTrigger value="areas">Areas<\/TabsTrigger>/);
    expect(page).toMatch(/<TabsContent value="areas"[^>]*>\s*<TaskAreas projectId=\{selected\.id\} \/>/);
    const dialog = read('src/components/admin/projects/TaskEditDialog.tsx');
    expect(dialog).toMatch(/area: area\.trim\(\) \|\| null,/);
    expect(dialog).toMatch(/<Label>Area<\/Label>/);
  });

  it('the sections keep sort_order — no priority sort, no status sort — and fold per browser', () => {
    const page = read('src/pages/admin/ProjectsPage.tsx');
    const view = page.slice(page.indexOf('function TaskAreas('), page.indexOf('function ProjectCard('));
    expect(view).toMatch(/groupTasksByArea\(allTasks\)/);
    expect(view).not.toMatch(/sortByPriority/);
    expect(view).toMatch(/aria-expanded=\{open\}/);
    expect(view).toMatch(/\{section\.done\}\/\{section\.total\} done/);
    expect(view).toMatch(/localStorage\.setItem\(`\$\{AREAS_COLLAPSED_KEY\}:\$\{projectId\}`/);
    const rule = read('src/lib/task-area.ts');
    expect(rule).toMatch(/const top = tasks\.filter\(\(t\) => !t\.parent_task_id\)\.sort\(byStableOrder\)/);
    expect(rule).not.toMatch(/PRIORITY_RANK|sortByPriority/);
  });
});
