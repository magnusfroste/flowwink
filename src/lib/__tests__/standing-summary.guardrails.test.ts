/**
 * Lägesbilden är saldot till liggaren — och den säger vad den vilar på.
 *
 * Aktiviteterna är huvudboken; ingen läser huvudboken, man läser saldot. En
 * säljare med tjugo leads orkar tjugo stycken prosa, inte sextio anteckningar.
 * `leads.ai_summary` fanns redan på tre ytor men skrevs av ingenting (0 av 4
 * rader på optic, mätt 2026-08-29) — den här funktionen är fältets skrivare.
 *
 * Två fällor pinnas här, båda självförvållade om de inte hålls:
 *
 * 1. En sammanfattning som hittar på ett läge eller ett nästa steg är värre än
 *    ingen alls, eftersom den läser exakt som en äkta. Därför: grundad ENBART
 *    i loggade poster, och tom logg ger {skipped}, aldrig en påhittad paragraf.
 * 2. En säljhuvudbok är per definition ofullständig — samtal sker i korridorer.
 *    Ett saldo som ser auktoritativt ut men saknar poster är farligare än inget
 *    saldo, så texten bär alltid sin grund (antal poster, t.o.m. vilken dag)
 *    och ytan visar den.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
const handler = read('supabase/functions/_shared/handlers/contact-state.ts');
const ui = read('src/pages/admin/LeadDetailPage.tsx');
const skills = read('src/lib/modules/crm-module.ts');
const dispatch = read('supabase/functions/agent-execute/index.ts');

describe('den hittar aldrig på', () => {
  it('prompten förbjuder påhittat läge och påhittat nästa steg', () => {
    // Strängen är radbruten i källan — matcha fragmenten, inte formateringen.
    expect(handler).toMatch(/Never infer a/);
    expect(handler).toMatch(/situation that the entries do not show/);
    expect(handler).toMatch(/never invent a next step/);
  });

  it('tom logg ger skipped, inte en genererad paragraf', () => {
    expect(handler).toMatch(/if \(entries\.length === 0\)/);
    expect(handler).toMatch(/skipped: 'the ledger is empty/);
  });

  it('den läser hela liggaren, oavsett vilken textnyckel skrivaren använde', () => {
    // #334: note är kanon, description och text finns i drift sedan tidigare.
    expect(handler).toMatch(/m\.note \?\? m\.description \?\? m\.text/);
  });
});

describe('den säger vad den vilar på', () => {
  it('grunden sparas med texten', () => {
    expect(handler).toMatch(/ai_summary_basis: \{ entries: entries\.length, through, model: ai\.model \}/);
  });

  it('och ytan visar den — inklusive att loggen inte är allt', () => {
    expect(ui).toMatch(/based on \{lead\.ai_summary_basis\.entries\}/);
    expect(ui).toMatch(/Anything that never reached the log is not in here/);
  });

  it('skrivningen läses tillbaka — en träfflös uppdatering får inte rapporteras som färsk', () => {
    expect(handler).toMatch(/\.select\('id'\)/);
    expect(handler).toMatch(/if \(!written\?\.length\)/);
  });
});

describe('den ersätter sig själv och når agenterna', () => {
  it('lägesbilden är tillstånd, inte historik — historiken ligger i liggaren', () => {
    expect(handler).toMatch(/Write the CURRENT state, not a chronicle/);
    expect(skills).toMatch(/Replaces the previous summary — it is state, not history/);
  });

  it('skillen är seedad och kopplad till en handler som finns', () => {
    expect(skills).toMatch(/name: 'summarize_contact_state'/);
    expect(skills).toMatch(/handler: 'internal:distill_contact_state'/);
    expect(dispatch).toMatch(/handler === 'internal:distill_contact_state'/);
    expect(dispatch).toMatch(/executeDistillContactState/);
  });

  it('svepet är bundet — en omskrivning av hela basen per körning är en faktura', () => {
    expect(handler).toMatch(/Math\.min\(Number\(args\.limit\) \|\| 10, 25\)/);
  });
});
