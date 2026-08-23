import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * NULL krockar aldrig med NULL.
 *
 * `SELECT adjust_quant(<spårad produkt>, <plats>, 3)` föll på varje instans så
 * snart produkten redan hade ett saldo på platsen:
 *
 *     ERROR: duplicate key value violates unique constraint
 *            "stock_quants_product_location_nolot_uq"
 *
 * `_upsert_quant` gjorde en upsert med skiljedomaren
 * `ON CONFLICT (product_id, location_id, lot_id)` — det vanliga UNIQUE-villkoret
 * från baselinen, där NULL <> NULL. För partilöst lager (`lot_id IS NULL`)
 * upptäcktes konflikten därför aldrig, `DO UPDATE` fyrade inte, och INSERT:en
 * gick vidare rakt in i det PARTIELLA indexet som 20260820210002 lade just för
 * att stänga det hålet. Andra lagerjusteringen på samma produkt och plats var
 * omöjlig; det tog med sig `transfer_stock` och `consume_reservation`
 * (ship_picking) på vägen.
 *
 * Syskonet `upsert_stock_quant` — lagt i samma migration som indexen, med
 * kommentaren "The one place a stock balance changes" — grenade på lot_id och
 * hade aldrig buggen. Två primitiv för samma sak var felet under felet: det ena
 * lagades när indexen kom, det andra glömdes.
 *
 * Rättningen lägger inte en tredje kopia av grenlogiken. `_upsert_quant`
 * delegerar, så "den enda plats ett lagersaldo ändras" blir sant i bokstavlig
 * mening. De här testerna låser den regeln — inte SQL:en.
 */

const ROOT = join(__dirname, '../../..');
const MIGRATIONS = join(ROOT, 'supabase/migrations');
const FILE = '20260825090000_c0d1e2f3-null-krockar-aldrig-med-null.sql';
const sql = readFileSync(join(MIGRATIONS, FILE), 'utf8');

const upsertQuantBody = (() => {
  const start = sql.indexOf('FUNCTION public._upsert_quant(');
  expect(start, '_upsert_quant måste redefinieras i migrationen').toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf('$function$;', start));
})();

describe('_upsert_quant äger ingen egen upsert längre', () => {
  it('delegerar till upsert_stock_quant i stället för att skriva quanten själv', () => {
    expect(upsertQuantBody).toMatch(/PERFORM\s+public\.upsert_stock_quant\(/i);
    expect(
      /INSERT\s+INTO\s+public\.stock_quants/i.test(upsertQuantBody),
      '_upsert_quant får inte skriva stock_quants själv — det var den andra kopian av upsert-logiken',
    ).toBe(false);
  });

  it('bär ingen ON CONFLICT alls — det var där buggen bodde', () => {
    // Skiljedomaren (product_id, location_id, lot_id) pekar på det vanliga
    // UNIQUE-villkoret, där NULL <> NULL. En ny ON CONFLICT här skulle vara
    // samma val en gång till.
    expect(/ON\s+CONFLICT/i.test(upsertQuantBody)).toBe(false);
  });

  it('anropar med namngivna argument — de två signaturerna är omkastade', () => {
    // _upsert_quant(_product_id, _location_id, _lot_id, _delta)
    // upsert_stock_quant(p_product_id, p_location_id, p_qty_delta, p_lot_id)
    // Ett positionellt anrop skulle tyst posta ett parti-id som ett antal.
    expect(upsertQuantBody).toMatch(/p_qty_delta\s*=>\s*_delta/);
    expect(upsertQuantBody).toMatch(/p_lot_id\s*=>\s*_lot_id/);
    expect(upsertQuantBody).toMatch(/p_product_id\s*=>\s*_product_id/);
    expect(upsertQuantBody).toMatch(/p_location_id\s*=>\s*_location_id/);
  });

  it('vägrar högt för NULL produkt eller plats i stället för att tiga', () => {
    // upsert_stock_quant returnerar tyst för NULL. Tystnad här vore en
    // regression: transfer_stock med en NULL-plats skulle hoppa över quanten
    // men ändå skriva sin stock_moves-rad — en halv flytt, utan ett ord.
    expect(upsertQuantBody).toMatch(
      /_product_id\s+IS\s+NULL\s+OR\s+_location_id\s+IS\s+NULL[\s\S]*RAISE\s+EXCEPTION/i,
    );
    const guardEnd = upsertQuantBody.indexOf('END IF;');
    const delegation = upsertQuantBody.indexOf('PERFORM public.upsert_stock_quant');
    expect(guardEnd, 'NULL-vakten måste ligga före delegeringen').toBeLessThan(delegation);
  });

  it('behåller signaturen — funktionen är GRANT:ad och anropas från tre håll', () => {
    // adjust_quant, transfer_stock och consume_reservation anropar den, och
    // 20260822020000 revokade anon på just det här namnet. Ett DROP skulle
    // återöppna den grants-ytan när namnet skapas på nytt.
    expect(upsertQuantBody).toMatch(
      /_upsert_quant\(_product_id\s+uuid,\s*_location_id\s+uuid,\s*_lot_id\s+uuid,\s*_delta\s+numeric\)/i,
    );
    expect(
      /DROP\s+FUNCTION[\s\S]*_upsert_quant/i.test(sql),
      '_upsert_quant får inte droppas — CREATE OR REPLACE behåller grants, DROP + CREATE ger PUBLIC EXECUTE igen',
    ).toBe(false);
  });

  it('lämnar de tre anroparna orörda', () => {
    // Hela poängen med att laga primitivet: adjust_quant, transfer_stock och
    // consume_reservation blir korrekta utan en rad ändrad kod. Om de börjar
    // patchas en och en är vi tillbaka i två kopior av samma logik.
    for (const fn of ['adjust_quant', 'transfer_stock', 'consume_reservation']) {
      expect(
        new RegExp(`FUNCTION\\s+public\\.${fn}\\(`, 'i').test(sql),
        `${fn} ska inte behöva patchas — fixen sitter i primitivet`,
      ).toBe(false);
    }
  });
});

describe('skiljedomarens index måste finnas för att kunna pekas på', () => {
  const ensure = sql.slice(sql.indexOf('DO $ensure_indexes$'), sql.indexOf('$ensure_indexes$;'));

  it('säkrar båda partiella indexen som upsert_stock_quant sluter sig till', () => {
    // De kom i 20260820210002, som ligger under HEAD på varje managerad instans
    // och kan ha hoppats över där. Utan indexet har ON CONFLICT … WHERE lot_id
    // IS NULL inget att sluta sig till: "no unique or exclusion constraint
    // matching the ON CONFLICT specification".
    expect(ensure).toMatch(
      /CREATE\s+UNIQUE\s+INDEX\s+stock_quants_product_location_nolot_uq\s+ON\s+public\.stock_quants\s*\(product_id,\s*location_id\)\s+WHERE\s+lot_id\s+IS\s+NULL/i,
    );
    expect(ensure).toMatch(
      /CREATE\s+UNIQUE\s+INDEX\s+stock_quants_product_location_lot_uq\s+ON\s+public\.stock_quants\s*\(product_id,\s*location_id,\s*lot_id\)\s+WHERE\s+lot_id\s+IS\s+NOT\s+NULL/i,
    );
  });

  it('skapar bara när indexet saknas — annars är det en no-op', () => {
    expect(ensure).toMatch(/to_regclass\('public\.stock_quants_product_location_nolot_uq'\)\s+IS\s+NULL/i);
    expect(ensure).toMatch(/to_regclass\('public\.stock_quants_product_location_lot_uq'\)\s+IS\s+NULL/i);
  });

  it('slår ihop partilösa dubbletter innan indexet kan avvisa dem', () => {
    // Ett CREATE UNIQUE INDEX rakt på en tabell som redan bär dubbletter
    // stoppar hela migrationen. Summan måste överleva kollapsen, inte kapas.
    const collapse = ensure.slice(0, ensure.indexOf('CREATE UNIQUE INDEX'));
    expect(collapse).toMatch(/sum\(quantity\)\s+OVER\s*\(PARTITION BY product_id, location_id\)/i);
    expect(collapse).toMatch(/sum\(reserved_quantity\)\s+OVER\s*\(PARTITION BY product_id, location_id\)/i);
    expect(collapse).toMatch(/DELETE FROM public\.stock_quants[\s\S]*rn\s*>\s*1/i);
  });

  it('rör aldrig en rad med parti — den unikheten har alltid hållit', () => {
    // Det vanliga UNIQUE-villkoret jämför tre icke-null-kolumner för partirader,
    // så de kan inte vara dubblerade. Att städa dem vore att röra saldon utan skäl.
    const collapse = ensure.slice(0, ensure.indexOf('CREATE UNIQUE INDEX'));
    // Varje skrivning tillsammans med mängden den drivs av — CTE:n respektive
    // USING-subfrågan är det som avgör vilka rader som kan träffas.
    const statements = collapse
      .split(/(?=\bWITH\s+ranked\b|\bDELETE\s+FROM\b)/i)
      .filter((s) => /\b(UPDATE|DELETE)\s+/i.test(s));
    expect(statements.length, 'kollapsen ska bestå av en UPDATE och en DELETE').toBe(2);
    for (const s of statements) {
      expect(s, 'varje skrivning i kollapsen måste drivas av en mängd låst till lot_id IS NULL').toMatch(
        /WHERE\s+lot_id\s+IS\s+NULL/i,
      );
      expect(s, 'ingen skrivning i kollapsen får kunna nå en partirad').not.toMatch(
        /lot_id\s+IS\s+NOT\s+NULL/i,
      );
    }
  });
});

describe('migrationen når instanser som redan passerat HEAD', () => {
  it('är framåtdaterad förbi varje migration som fanns när den landade', () => {
    // Ledgern hoppar tyst över allt under sin HEAD. Att påstå "nyast av alla"
    // vore ett annat test — ett som varje kommande migration bryter; den
    // bevakningen gör scripts/check-migration-forward-dated.ts mot merge-basen.
    const HEAD_AT_AUTHORING = '20260824150000';
    const stamps = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql') && /^\d{14}_/.test(f))
      .map((f) => f.slice(0, 14));
    expect(FILE.slice(0, 14) > HEAD_AT_AUTHORING).toBe(true);
    expect(
      stamps.filter((t) => t === FILE.slice(0, 14)).length,
      'två migrationer på samma stämpel ger odefinierad ordning',
    ).toBe(1);
  });

  it('är omkörbar — funktionen ersätts, indexen skapas bara om de saknas', () => {
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\._upsert_quant/i);
    const bareCreates = sql.match(/^CREATE\s+(?!OR REPLACE)(FUNCTION|TABLE|TRIGGER|INDEX|UNIQUE INDEX)/gim) ?? [];
    expect(bareCreates, 'varje oskyddad CREATE på toppnivå måste vara villkorad').toEqual([]);
  });
});
