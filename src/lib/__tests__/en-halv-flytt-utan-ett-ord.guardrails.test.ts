import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * En halv flytt, utan ett ord.
 *
 * `20260825140000_e2f3a4b5-null-is-not-equal-to-null` lagade huvudsaken: den
 * predikatlösa skiljedomaren i `_upsert_quant` som gjorde att en partilös quant
 * aldrig kunde räknas upp. Omslaget delegerar sedan dess till
 * `upsert_stock_quant` — ett primitiv i stället för två. Den lagningen står
 * kvar orörd; de här testerna rör inte den.
 *
 * Delegeringen lämnade två hål öppna, båda tysta, båda mätta på en replika av
 * live-schemat med enbart 20260825140000 applicerad:
 *
 * ETT — `upsert_stock_quant` returnerar tyst för NULL produkt eller plats, där
 * `_upsert_quant` förut träffade NOT NULL-kolumnerna och kastade. Benen i
 * `transfer_stock` är inte symmetriska: FRÅN-benet har en giltig plats och dras
 * av, TILL-benet är NULL och hoppas över, och `stock_moves`-raden skrivs ändå.
 * Saldo 8, flytt av 2 till NULL → anropet lyckades, en 'transfer'-rad skrevs,
 * källan står på 6 och målet finns inte. Två enheter upphörde att existera.
 *
 * TVÅ — delegeringen sluter sig till två PARTIELLA index från `20260820210002`,
 * en migration som ligger under ledgerns HEAD och därför kan ha hoppats över på
 * en managerad instans. Droppa `stock_quants_product_location_nolot_uq` och
 * `adjust_quant` faller på "there is no unique or exclusion constraint matching
 * the ON CONFLICT specification". Före delegeringen pekade funktionen på det
 * vanliga UNIQUE-villkoret, som finns överallt — beroendet flyttades från något
 * som alltid finns till något som kanske inte gör det.
 *
 * De här testerna låser de två svaren, inte SQL:en.
 */

const ROOT = join(__dirname, '../../..');
const MIGRATIONS = join(ROOT, 'supabase/migrations');
const FILE = '20260827800000_f6a7b8c0-en-halv-flytt-utan-ett-ord.sql';
const sql = readFileSync(join(MIGRATIONS, FILE), 'utf8');

const UPSTREAM = '20260825140000_e2f3a4b5-null-is-not-equal-to-null.sql';

const body = (() => {
  const start = sql.indexOf('FUNCTION public._upsert_quant(');
  expect(start, '_upsert_quant måste redefinieras i migrationen').toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf('$function$;', start));
})();

describe('bygger på 20260825140000 i stället för att göra om den', () => {
  it('den migrationen finns kvar och rörs inte', () => {
    // Delegeringen är dess beslut. Om den försvinner har någon rullat tillbaka
    // huvudlagningen och det här tillägget står och pekar på ingenting.
    expect(readdirSync(MIGRATIONS)).toContain(UPSTREAM);
    const upstream = readFileSync(join(MIGRATIONS, UPSTREAM), 'utf8');
    expect(upstream).toMatch(/PERFORM\s+public\.upsert_stock_quant\(/i);
  });

  it('är framåtdaterad förbi den — annars hoppas den över där den behövs', () => {
    // Under HEAD betyder tyst överhoppad. Den här måste ligga ÖVER 140000,
    // annars vinner den äldre kroppen på varje instans som redan tagit den.
    expect(FILE.slice(0, 14) > UPSTREAM.slice(0, 14)).toBe(true);
    const own = FILE.slice(0, 14);
    const stamps = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql') && /^\d{14}_/.test(f))
      .map((f) => f.slice(0, 14));
    const earlier = stamps.filter((t) => t < own).sort();
    expect(earlier.length, 'hittade inga tidigare migrationer alls').toBeGreaterThan(0);
    expect(own > earlier[earlier.length - 1]).toBe(true);
    expect(
      stamps.filter((t) => t === own).length,
      'två migrationer på samma stämpel ger odefinierad ordning',
    ).toBe(1);
  });

  it('behåller delegeringen — ingen egen konfliktmålsklausul kommer tillbaka', () => {
    expect(body).toMatch(/PERFORM\s+public\.upsert_stock_quant\(/i);
    expect(
      /ON\s+CONFLICT/i.test(body),
      'en tredje kopia av grenlogiken är precis vad 140000 tog bort',
    ).toBe(false);
    expect(
      /INSERT\s+INTO\s+public\.stock_quants/i.test(body),
      '_upsert_quant får inte skriva stock_quants själv',
    ).toBe(false);
  });

  it('anropar med namngivna argument — de två signaturerna är omkastade', () => {
    // _upsert_quant(_product_id, _location_id, _lot_id, _delta)
    // upsert_stock_quant(p_product_id, p_location_id, p_qty_delta, p_lot_id)
    expect(body).toMatch(/p_qty_delta\s*=>\s*_delta/);
    expect(body).toMatch(/p_lot_id\s*=>\s*_lot_id/);
  });

  it('rör inte noll-delta — den tystnaden är 140000:s medvetna val', () => {
    // En rörelse av ingenting är ingen rörelse, och en 0-rad är vad en senare
    // läsare misstar för "räknat, tomt". Bara NULL-fallet får ett svar här.
    expect(/_delta\s*=\s*0/.test(body)).toBe(false);
    expect(/COALESCE\(_delta/.test(body)).toBe(false);
  });
});

describe('hål ett: en flytt till ingenstans säger ifrån', () => {
  it('kastar för NULL produkt eller plats i stället för att tiga', () => {
    expect(body).toMatch(
      /_product_id\s+IS\s+NULL\s+OR\s+_location_id\s+IS\s+NULL[\s\S]*RAISE\s+EXCEPTION/i,
    );
    expect(body).toMatch(/ERRCODE\s*=\s*'not_null_violation'/i);
  });

  it('vakten ligger före delegeringen, annars hinner det tysta svaret först', () => {
    const guard = body.indexOf('RAISE EXCEPTION');
    const delegation = body.indexOf('PERFORM public.upsert_stock_quant');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(delegation);
  });

  it('efterkontrollen fäller en framtida kropp som tappar vakten', () => {
    // Kroppen läses ur pg_proc efteråt, inte ur filen: det är den LEVANDE
    // definitionen som räknas, oavsett vem som skriver om den härnäst.
    const proof = sql.slice(sql.indexOf('DO $proof$'));
    expect(proof).toMatch(/pg_get_functiondef/i);
    expect(proof).toMatch(/NOT\s+ILIKE\s+'%not_null_violation%'[\s\S]*RAISE\s+EXCEPTION/i);
    expect(proof).toMatch(/ILIKE\s+'%ON CONFLICT%'[\s\S]*RAISE\s+EXCEPTION/i);
  });
});

describe('hål två: indexen delegeringen sluter sig till måste finnas', () => {
  const ensure = sql.slice(sql.indexOf('DO $ensure_indexes$'), sql.indexOf('$ensure_indexes$;'));

  it('säkrar båda partiella indexen', () => {
    expect(ensure).toMatch(
      /CREATE\s+UNIQUE\s+INDEX\s+stock_quants_product_location_nolot_uq\s+ON\s+public\.stock_quants\s*\(product_id,\s*location_id\)\s+WHERE\s+lot_id\s+IS\s+NULL/i,
    );
    expect(ensure).toMatch(
      /CREATE\s+UNIQUE\s+INDEX\s+stock_quants_product_location_lot_uq\s+ON\s+public\.stock_quants\s*\(product_id,\s*location_id,\s*lot_id\)\s+WHERE\s+lot_id\s+IS\s+NOT\s+NULL/i,
    );
  });

  it('skapar bara när indexet saknas — annars en no-op', () => {
    expect(ensure).toMatch(/to_regclass\('public\.stock_quants_product_location_nolot_uq'\)\s+IS\s+NULL/i);
    expect(ensure).toMatch(/to_regclass\('public\.stock_quants_product_location_lot_uq'\)\s+IS\s+NULL/i);
  });

  it('slår ihop partilösa dubbletter innan indexet kan avvisa dem', () => {
    // CREATE UNIQUE INDEX rakt på en tabell med dubbletter stoppar hela
    // migrationen. Summan måste överleva kollapsen, inte kapas.
    const collapse = ensure.slice(0, ensure.indexOf('CREATE UNIQUE INDEX'));
    expect(collapse).toMatch(/sum\(quantity\)\s+OVER\s*\(PARTITION BY product_id, location_id\)/i);
    expect(collapse).toMatch(/sum\(reserved_quantity\)\s+OVER\s*\(PARTITION BY product_id, location_id\)/i);
    expect(collapse).toMatch(/DELETE FROM public\.stock_quants[\s\S]*rn\s*>\s*1/i);
  });

  it('rör aldrig en rad med parti — den unikheten har alltid hållit', () => {
    const collapse = ensure.slice(0, ensure.indexOf('CREATE UNIQUE INDEX'));
    const statements = collapse
      .split(/(?=\bWITH\s+ranked\b|\bDELETE\s+FROM\b)/i)
      .filter((s) => /\b(UPDATE|DELETE)\s+/i.test(s));
    expect(statements.length, 'kollapsen ska bestå av en UPDATE och en DELETE').toBe(2);
    for (const s of statements) {
      expect(s, 'varje skrivning måste drivas av en mängd låst till lot_id IS NULL').toMatch(
        /WHERE\s+lot_id\s+IS\s+NULL/i,
      );
      expect(s, 'ingen skrivning får kunna nå en partirad').not.toMatch(/lot_id\s+IS\s+NOT\s+NULL/i);
    }
  });
});

describe('migrationen är omkörbar', () => {
  it('inga oskyddade CREATE på toppnivå', () => {
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\._upsert_quant/i);
    const bare = sql.match(/^CREATE\s+(?!OR REPLACE)(FUNCTION|TABLE|TRIGGER|INDEX|UNIQUE INDEX)/gim) ?? [];
    expect(bare, 'varje oskyddad CREATE måste vara villkorad').toEqual([]);
  });
});
