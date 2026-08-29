/**
 * Vem bad om researchen, vem gjorde jobbet, och vems blir kontakten.
 *
 * Fyndet (Magnus 2026-08-29): "när jag körde en research och fick Lisa som lead
 * — så står hon inte på admin som körde researchen. Är det systemet som kör
 * researchen? Och isåfall, hur lägger jag kontakten på mig?"
 *
 * Nej, det är inte systemet. En människa bad om den, agenten utförde den. Tre
 * fakta, tre kolumner:
 *   created_by        vem som bad (proveniens, oföränderlig)
 *   created_by_agent  vilken agent som gjorde jobbet
 *   assigned_to       ansvar — och det BÖRJAR vid befordran
 *
 * Att låta researchen sätta ägare vore att upphäva triagen (#330): ett fynd är
 * ingens tills någon väljer att gå vidare. Men den som väljer är den självklara
 * ägaren — så "hur lägger jag kontakten på mig" blir ett klick.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
const handler = read('supabase/functions/_shared/handlers/prospect-research.ts');
const page = read('src/pages/admin/LeadsPage.tsx');
const sql = read('supabase/migrations/20260830090000_prospektets-proveniens.sql');

describe('researchen stämplar vem som bad och vem som gjorde', () => {
  it('båda fälten sätts på prospektet', () => {
    const insert = handler.slice(handler.indexOf('const leadPayload'));
    expect(insert).toMatch(/created_by: \(args as any\)\._caller_user_id \?\? null/);
    expect(insert).toMatch(/created_by_agent: \(args as any\)\._effective_agent \?\? null/);
  });

  it('men ingen ägare — triagen upphävs inte', () => {
    const insert = handler.slice(handler.indexOf('const leadPayload'), handler.indexOf('const contactMeta'));
    expect(insert).not.toMatch(/assigned_to:/);
  });

  it('och en instans utan kolumnerna tappar inte sina kontakter', () => {
    // Attribution är en bonus, aldrig en grind: strippa och skriv om.
    expect(handler).toMatch(/\['created_by_agent', 'created_by'\]\.filter/);
    expect(handler).toMatch(/lead insert failed after stripping provenance/);
  });

  it('kolumnerna finns i schemat', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS created_by_agent text/);
  });
});

describe('befordran gör kontakten till min', () => {
  it('otilldelat prospekt hamnar på den som befordrar', () => {
    expect(page).toMatch(/if \(!current\?\.assigned_to && uid\) patch\.assigned_to = uid;/);
  });

  it('men en redan tilldelad kontakt kapas inte', () => {
    expect(page).toMatch(/\.select\('assigned_to'\)\.eq\('id', id\)/);
  });

  it('och besked ges bara när något faktiskt togs över', () => {
    expect(page).toMatch(/claimed \? ' — assigned to you' : ''/);
  });
});
