/**
 * Uppgifter heter tasks — i projektmodulen, hela vägen.
 *
 * Fyndet (Magnus 2026-08-30): "eller task — vi kallar det både och tror jag".
 * Precis: tabellen heter project_tasks, kanban säger task, dialogen heter
 * TaskEditDialog — men tvärprojektvyn jag byggde hette Activities, i filnamn,
 * i etikett och i URL:en.
 *
 * Ordet spelar roll utöver konsekvens: `lead_activities` i CRM:et ÄR en
 * aktivitetslogg — en liggare över vad som hänt. Att låta samma ord betyda
 * "sak att göra" i en modul och "sak som hänt" i en annan gör varje samtal
 * mellan dem tvetydigt, för människor och för agenter.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
const page = read('src/pages/admin/ProjectsPage.tsx');

describe('projektmodulen säger task', () => {
  it('vyn heter TasksView, och den gamla filen är borta', () => {
    expect(existsSync(join(process.cwd(), 'src/components/admin/projects/TasksView.tsx'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/components/admin/projects/ActivitiesView.tsx'))).toBe(false);
  });

  it('etiketten och läget säger task', () => {
    expect(page).toMatch(/<ListTodo className="mr-2 h-3\.5 w-3\.5" \/> Tasks/);
    expect(page).toMatch(/mode === "tasks"/);
    expect(page).not.toMatch(/setMode\("activities"\)/);
  });

  it('men en sparad ?mode=activities landar rätt', () => {
    // Vyn hette så i två dagar. En länk ska visa det den pekade på.
    expect(page).toMatch(/rawMode === "activities" \? "tasks" : rawMode/);
  });
});

describe('CRM:ets aktiviteter är något annat och behåller sitt ord', () => {
  it('lead_activities är en logg över vad som HÄNT, inte saker att göra', () => {
    const timeline = read('src/hooks/useUnifiedTimeline.ts');
    expect(timeline).toMatch(/from\('lead_activities'\)/);
    // Om projektmodulen någon gång återinför ordet ska det synas som en kollision.
    expect(read('src/components/admin/projects/TasksView.tsx')).not.toMatch(/Activities/);
  });
});

describe('timesheets ligger där arbetet finns', () => {
  it('bredvid Projects i Operations, inte under Finance', () => {
    const nav = read('src/components/admin/adminNavigation.ts');
    const ops = nav.slice(nav.indexOf('label: "Operations"'), nav.indexOf('label: "Admin"'));
    const fin = nav.slice(nav.indexOf('label: "Finance"'), nav.indexOf('label: "Commerce"'));
    expect(ops).toMatch(/name: "Timesheets"/);
    expect(fin).not.toMatch(/name: "Timesheets"/);
  });

  it('och står omedelbart efter Projects', () => {
    const nav = read('src/components/admin/adminNavigation.ts');
    const ops = nav.slice(nav.indexOf('label: "Operations"'), nav.indexOf('label: "Admin"'));
    expect(ops.indexOf('name: "Projects"')).toBeLessThan(ops.indexOf('name: "Timesheets"'));
    expect(ops.indexOf('name: "Timesheets"')).toBeLessThan(ops.indexOf('name: "HR & Employees"'));
  });
});
