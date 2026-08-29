// Förbudet mot svalda fel.
//
// supabase-js kastar inte. `const { data } = await supabase.from(...)` med ett
// fel ger `data: null` — vilket ser exakt ut som "inga rader". Det är därför 31
// obefintliga kolumnnamn kunde stå i selects i månader utan att någon märkte
// något: varje anrop svarade artigt "inga träffar" i stället för "den kolumnen
// finns inte". Samma tystnad i en SKRIVNING betyder "sparat" när ingenting
// sparades — därför är skrivningar förbjudna, medan läsningarna spärras på en
// baslinje som bara får krympa.
//
// Grinden greppar inte efter en sträng: den kör samma klassificerare som
// burndown-skriptet (scripts/lib/scan-swallowed-errors.mjs). En grind som bara
// letar text överlever sitt eget sabotage — det bevisade mutationsrevisionen
// 2026-08-30 på båda auktorisationsgrindarna.
//
// Ett fel räknas som HANTERAT när det både bundits till ett namn OCH namnet
// används igen. Att destrukturera `error` och aldrig läsa det är samma svalg,
// bara mer välklätt.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { scanRepo, scanFile } from '../../../scripts/lib/scan-swallowed-errors.mjs';

const BASELINE: Record<string, number> = JSON.parse(
  readFileSync('src/lib/__tests__/fixtures/swallowed-reads-baseline.json', 'utf-8'),
);

describe('inga svalda fel', () => {
  const hits = scanRepo();

  it('ingen skrivning sväljer sitt fel', () => {
    const writes = hits.filter((h: { kind: string }) => h.kind === 'write');
    expect(
      writes.map((w: { file: string; line: number; snippet: string }) => `${w.file}:${w.line}  ${w.snippet}`),
      'En skrivning vars fel försvinner rapporterar "sparat" när inget sparades.\n' +
        'Bind felet och använd det: kasta där anropets syfte faller, logga där raden är telemetri.',
    ).toEqual([]);
  });

  it('svalda läsningar krymper — aldrig växer', () => {
    const perFile: Record<string, number> = {};
    for (const h of hits.filter((x: { kind: string }) => x.kind === 'read')) {
      perFile[h.file] = (perFile[h.file] ?? 0) + 1;
    }
    const worse: string[] = [];
    for (const [file, n] of Object.entries(perFile)) {
      const allowed = BASELINE[file] ?? 0;
      if (n > allowed) worse.push(`${file}: ${n} svalda läsningar, baslinjen tillåter ${allowed}`);
    }
    expect(
      worse,
      'Nya svalda läsningar. Bind felet och använd det.\n' +
        'Har du i stället FÄRRE: kör `node scripts/regen-swallowed-reads-baseline.mjs`.',
    ).toEqual([]);
  });

  // Negativtest: en klassificerare som inte känner igen ett svalg är en grind
  // som alltid är grön. De här fallen fejkas i minnet, inte på disk.
  describe('klassificeraren känner igen formerna', () => {
    const scan = (src: string) => scanFile('fake.ts', src);

    it('ser en skrivning utan bundet fel', () => {
      const hits = scan(`const { data } = await supabase.from('leads').insert({ a: 1 }).select('id').single();\nuse(data);`);
      expect(hits).toHaveLength(1);
      expect(hits[0].kind).toBe('write');
    });

    it('ser ett fel som bundits men aldrig lästs', () => {
      const hits = scan(`const { data, error: e } = await supabase.from('leads').insert({ a: 1 });\nreturn data;`);
      expect(hits).toHaveLength(1);
    });

    it('godtar ett fel som faktiskt används', () => {
      expect(scan(`const { data, error: e } = await supabase.from('leads').insert({ a: 1 });\nif (e) throw e;`)).toHaveLength(0);
    });

    it('klassar en insert som skrivning även när kedjan bryts över rader', () => {
      const hits = scan(
        `const { data: obj } = await supabase\n  .from('agent_objectives')\n  .insert({ goal: 'x' })\n  .select('id')\n  .single();\nuse(obj);`,
      );
      expect(hits[0]?.kind, 'en insert två rader ned måste räknas som skrivning').toBe('write');
    });

    it('spiller inte över i nästa sats i filer utan semikolon', () => {
      // `await req.json()` är inte supabase — den får inte dra med sig
      // .from() från en senare sats och bli ett falsklarm.
      const hits = scan(`const { event, data } = await req.json()\n\nconst rows = await supabase.from('x').select('id')`);
      expect(hits).toHaveLength(0);
    });

    it('ser en läsning och skiljer den från en skrivning', () => {
      const hits = scan(`const { data } = await supabase.from('leads').select('id, name');\nuse(data);`);
      expect(hits).toHaveLength(1);
      expect(hits[0].kind).toBe('read');
    });
  });
});
