/**
 * Projekt får ägare, och "Mina" betyder samma sak överallt.
 *
 * Mätt före bygget (optic, 2026-08-29): 12 uppgifter, NOLL med ägare — därför
 * visade "Mine" i aktivitetsvyn ingenting. Filtret fungerade; det fanns ingen
 * data att filtrera på. Kontakterna räddades av ownership-on-create sedan
 * 2026-08-08; projekt och uppgifter hade aldrig fått motsvarande, och
 * ActivitiesView bar dessutom en EGEN All/Mine-växel vid sidan av CRM-linsen —
 * en tredje sanning om vad "mitt" betyder.
 *
 * Magnus definition (hans beslut, inte en teknisk bekvämlighet): tilldelade mig
 * PLUS otilldelat i projekt jag äger. Den strikta läsningen döljer just de
 * uppgifter ingen tagit — det arbete som är mest sannolikt att tappas.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OWNERSHIP } from '@/lib/ownership';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
const sql = read('supabase/migrations/20260829230000_projekt-far-agare-och-handavtryck.sql');
const view = read('src/components/admin/projects/ActivitiesView.tsx');
const page = read('src/pages/admin/ProjectsPage.tsx');
const crud = read('supabase/functions/agent-execute/index.ts');

describe('ägarskapet finns innan filtret får finnas', () => {
  it('projects står i ägarkartan med sin egen kolumn', () => {
    expect(OWNERSHIP).toHaveProperty('projects');
    expect(OWNERSHIP.projects.column).toBe('owner_id');
  });

  it('skaparen blir projektets ägare — men gissas aldrig åt en agent', () => {
    expect(sql).toMatch(/IF v_uid IS NULL THEN RETURN NEW; END IF;/);
  });

  it('fältet nämns bara i en sats som aldrig nås för uppgifter', () => {
    // #338 skrev `TG_TABLE_NAME = 'projects' AND NEW.owner_id IS NULL`. PL/pgSQL
    // skickar hela villkoret som ETT SQL-uttryck, så fältet slogs upp även när
    // project_tasks triggade — och tabellen saknar det. Ingen kortslutning
    // räddar en fältreferens som måste planeras; nästlad IF gör det, eftersom
    // varje sats planeras först när den NÅS. Live-reproducerat 2026-08-30.
    const raw = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260830130000_uppgiften-kunde-inte-skapas.sql'),
      'utf-8',
    );
    // Kommentaren CITERAR det trasiga villkoret för att förklara det, så mät på
    // koden. (Grinden fällde sig själv på sin egen förklaring först.)
    const fix = raw.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(fix).not.toMatch(/TG_TABLE_NAME = 'projects' AND NEW\.owner_id/);
    expect(fix).toMatch(/IF TG_TABLE_NAME = 'projects' THEN\s*\n\s*IF NEW\.owner_id IS NULL THEN/);
  });

  it('uppgifter tilldelas INTE automatiskt — annars finns ingen backlogg att fånga', () => {
    // Följer direkt av Magnus definition av "Mina": otilldelat i mina projekt.
    expect(sql).not.toMatch(/NEW\.assigned_to := v_uid/);
  });

  it('befintliga projekt får ägare ur created_by, men en satt ägare rörs inte', () => {
    expect(sql).toMatch(/SET owner_id = created_by\s*\n\s*WHERE owner_id IS NULL AND created_by IS NOT NULL/);
  });
});

describe('"Mina" betyder en sak, på alla tre ytorna', () => {
  it('aktivitetsvyn använder CRM-linsen, inte en egen växel', () => {
    expect(view).toMatch(/useOwnershipLens\(\)/);
    expect(view).toMatch(/<LensToggle \/>/);
    expect(view).not.toMatch(/setScope\(/);
  });

  it('och tolkningen är den generösa: tilldelat mig ELLER otilldelat i mitt projekt', () => {
    expect(view).toMatch(/if \(t\.assigned_to\) return mineUids\.has\(t\.assigned_to\)/);
    expect(view).toMatch(/const owner = byProject\.get\(t\.project_id\)\?\.owner_id/);
  });

  it('vyn får HELA projektlistan — en uppgift åt mig i någon annans projekt är min', () => {
    expect(page).toMatch(/<ActivitiesView\s*\n\s*projects=\{rawProjects \?\? \[\]\}/);
    // Projektlistan i rälsen ÄR däremot linsad — där betyder ägarskap urval.
    expect(page).toMatch(/<ProjectRail\s*\n\s*projects=\{projects\}/);
  });
});

describe('när en agent skriver syns det att det var en agent', () => {
  it('den generiska CRUD-motorn stämplar agentnamnet vid create och update', () => {
    expect(crud).toMatch(/cleanInsert\.created_by_agent = auditCtx\.agent_type/);
    expect(crud).toMatch(/cleanUpdate\.updated_by_agent = auditCtx\.agent_type/);
  });

  it('men attribution får aldrig fälla en skrivning på en tabell som saknar kolumnen', () => {
    expect(crud).toMatch(/\['created_by_agent', 'created_by'\]\.filter/);
    expect(crud).toMatch(/\['updated_by_agent', 'updated_at'\]\.filter/);
  });
});
