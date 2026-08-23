import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Ett serviceavtal har ingen hylla.
 *
 * Nordbrygg AB säljer kaffemaskiner MED service. Nio av produkterna är tjänster
 * — installation, serviceavtal Bas/Plus/Prio, servicebesök, utryckning,
 * barista-utbildning, vattenanalys, bönabonnemang — och alla nio bär korrekt
 * `track_inventory = false`. Ändå stod det i liggaren den 23 augusti 2026:
 * Installation −2, Serviceavtal Prio −1, och tre `stock_moves`-rader med
 * notisen 'Auto-decrement from order item'.
 *
 * Spöksaldot var inte ens det värsta. Det BLOCKERADE leveransen:
 * `allocate_picking` försökte reservera lager för tjänsteraden, `reserve_stock`
 * svarade "Insufficient available stock to reserve (free -1, need 1)", raden
 * blev `short` — och en order som innehöll installation eller ett serviceavtal
 * kunde aldrig plockas färdigt. Order-to-delivery stod stilla på lagerbrist i
 * något som per definition inte har lager.
 *
 * Vakten fanns, men satt på fel sats. `trigger_order_item_stock_decrement`
 * skyddade `products.stock_quantity` — den gamla spegeln, NULL för en tjänst,
 * som därför korrekt gjorde ingenting — medan den nya liggaren
 * (`stock_moves` + `stock_quants`) stod helt oskyddad. Vakten sattes på
 * kolumnen som fasades ut, inte på liggaren som ersatte den. Svepet fann
 * arton skrivare till liggaren; noll av dem läste flaggan.
 *
 * Rättningen lägger vakten EN gång, på liggaren själv, i stället för arton
 * gånger i arton skrivare. De här testerna låser den regeln — inte SQL:en.
 */

const ROOT = join(__dirname, '../../..');
const MIGRATIONS = join(ROOT, 'supabase/migrations');
const FILE = '20260824150000_b9c0d1e2-a-service-has-no-shelf.sql';
const sql = readFileSync(join(MIGRATIONS, FILE), 'utf8');

describe('vakten sitter på liggaren, inte i skrivarna', () => {
  it('avvisar liggarrader för ospårade produkter FÖRE insert, på båda tabellerna', () => {
    // stock_moves ensamt räcker inte: trigger_order_item_stock_decrement
    // anropar upsert_stock_quant DIREKT, och det var det anropet som skrev −2.
    expect(sql).toMatch(
      /CREATE\s+TRIGGER\s+trg_stock_moves_untracked_guard\s+BEFORE\s+INSERT\s+ON\s+public\.stock_moves/i,
    );
    expect(sql).toMatch(
      /CREATE\s+TRIGGER\s+trg_stock_quants_untracked_guard\s+BEFORE\s+INSERT\s+ON\s+public\.stock_quants/i,
    );
    expect(sql).toMatch(/DROP\s+TRIGGER\s+IF\s+EXISTS\s+trg_stock_moves_untracked_guard/i);
    expect(sql).toMatch(/DROP\s+TRIGGER\s+IF\s+EXISTS\s+trg_stock_quants_untracked_guard/i);
  });

  it('läser flaggan och släpper igenom bara en spårad produkt', () => {
    const guard = sql.slice(
      sql.indexOf('FUNCTION public.stock_ledger_untracked_guard'),
      sql.indexOf('COMMENT ON FUNCTION public.stock_ledger_untracked_guard'),
    );
    expect(guard).toMatch(/SELECT\s+track_inventory\s+INTO/i);
    // IS NOT TRUE, inte "= false": NULL får aldrig tolkas som spårad.
    expect(guard).toMatch(/IS\s+NOT\s+TRUE[\s\S]*RETURN\s+NULL/i);
  });

  it('avvisar tyst i stället för att kasta — annars faller ordern, inte rörelsen', () => {
    // Ett fel i en BEFORE INSERT-trigger på stock_moves rullar tillbaka
    // INSERT:en på order_items. "Vi säljer tjänster" skulle bli "vi kan inte ta
    // emot ordern" — en sämre bugg än den som lagas.
    const guard = sql.slice(
      sql.indexOf('FUNCTION public.stock_ledger_untracked_guard'),
      sql.indexOf('COMMENT ON FUNCTION public.stock_ledger_untracked_guard'),
    );
    expect(
      /RAISE\s+EXCEPTION/i.test(guard),
      'vakten på liggaren får inte kasta — den skulle rulla tillbaka hela ordern',
    ).toBe(false);
  });

  it('lagar de bevisade skrivarna UTAN att röra dem', () => {
    // Hela poängen med att lägga vakten på liggaren: de två skrivare Magnus
    // mätte upp live blir korrekta utan en rad ändrad kod. Om någon börjar
    // patcha dem en och en är vi tillbaka i arton-vakter-att-komma-ihåg.
    expect(
      /FUNCTION\s+public\.trigger_order_item_stock_decrement/i.test(sql),
      'trigger_order_item_stock_decrement ska inte behöva patchas — vakten på liggaren täcker den',
    ).toBe(false);
    expect(
      /FUNCTION\s+public\.apply_stock_movement_event/i.test(sql),
      'apply_stock_movement_event ska inte behöva patchas — vakten på liggaren täcker den',
    ).toBe(false);
  });
});

describe('den som siktade på lagret får ett svar, inte tystnad', () => {
  // Tystnad är rätt när ingenting borde hända ändå (en orderrad som säljer en
  // tjänst). Den som uttryckligen bad lagret om något har däremot bett om något
  // omöjligt, och tystnad där vore en lögn — dessutom skriver två av dem den
  // ANDRA liggaren, products.stock_quantity, som en trigger på stock_moves
  // omöjligt kan skydda.
  const bodyOf = (fn: string) => {
    const start = sql.indexOf(`FUNCTION public.${fn}(`);
    expect(start, `${fn} måste redefinieras i migrationen`).toBeGreaterThan(-1);
    return sql.slice(start, sql.indexOf('$function$;', start));
  };

  it.each(['adjust_quant', 'transfer_stock', 'reserve_stock'])(
    '%s vägrar högt för en ospårad produkt',
    (fn) => {
      const body = bodyOf(fn);
      expect(body).toMatch(/track_inventory\s+INTO/i);
      expect(body).toMatch(/v_tracked\s+IS\s+NOT\s+TRUE[\s\S]*RAISE\s+EXCEPTION/i);
      expect(body).toMatch(/is not stock-tracked/i);
    },
  );

  it('reserve_stock slutar kalla en tjänst för lagerbrist', () => {
    // "Insufficient available stock to reserve (free -1, need 1)" var meningen
    // som stoppade plockningen. Det är inte lagerbrist, det är fel fråga.
    const body = bodyOf('reserve_stock');
    const untrackedBranch = body.slice(body.indexOf('v_tracked IS NOT TRUE'));
    expect(untrackedBranch.indexOf('is not stock-tracked')).toBeLessThan(
      untrackedBranch.indexOf('Insufficient available stock'),
    );
  });

  it('apply_goods_receipt_stock bokar ingenting — och rör inte heller spegeln', () => {
    // Att ta emot en tjänst på en inköpsorder bokar ingenting; Odoo gör ingen
    // mottagningsrad för en servicerad. Men den tidiga returen måste ligga FÖRE
    // UPDATE products SET stock_quantity, annars ger vakten ett nytt glapp:
    // spegeln flyttas medan quanten avvisas.
    const body = bodyOf('apply_goods_receipt_stock');
    const earlyReturn = body.indexOf('track_inventory = true');
    const mirror = body.indexOf('SET stock_quantity');
    expect(earlyReturn).toBeGreaterThan(-1);
    expect(mirror).toBeGreaterThan(-1);
    expect(earlyReturn).toBeLessThan(mirror);
  });
});

describe('allocate_picking begär inte lager för något som inte har lager', () => {
  const body = sql.slice(
    sql.indexOf('FUNCTION public.allocate_picking('),
    sql.indexOf('GRANT EXECUTE ON FUNCTION public.allocate_picking'),
  );

  it('reserverar bara rader som faktiskt har ett saldo', () => {
    expect(body).toMatch(/track_inventory[\s\S]*AS\s+p_tracked/i);
    expect(body).toMatch(/v_needs_stock\s*:=\s*\(v_item\.product_id\s+IS\s+NOT\s+NULL\s+AND\s+v_item\.p_tracked\)/i);
    // reserve_stock får bara nås inifrån den grinden.
    const call = body.indexOf('public.reserve_stock(');
    const gate = body.indexOf('IF v_needs_stock THEN');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(call);
  });

  it('en tjänsterad är tillgänglig, aldrig slut', () => {
    // 'short' betyder "vi saknar varan". En tjänst saknas aldrig — och att
    // räkna den som slut var precis det som blockerade leveransen.
    expect(body).toMatch(/WHEN\s+NOT\s+v_needs_stock\s+THEN\s+'reserved'/i);
    expect(body).toMatch(/'reserved',\s*\(v_reservation_id\s+IS\s+NOT\s+NULL\s+OR\s+NOT\s+v_needs_stock\)/i);
  });

  it('plockar med raden i stället för att hoppa över den', () => {
    // Teknikern som kommer ut ska se att installationen ingår; en plocklista
    // som tiger om halva ordern är en lögn om ordern.
    expect(body).toMatch(/v_total_count\s*:=\s*v_total_count\s*\+\s*1/);
    expect(body).toMatch(/INSERT INTO public\.picking_lines/i);
  });

  it('säger i svaret vilka rader som inte behövde lager', () => {
    // Ingen tyst halv-framgång: anroparen ska kunna skilja "reserverad ur
    // lagret" från "behövde inget lager".
    expect(body).toMatch(/'stock_tracked',\s*v_needs_stock/);
    expect(body).toMatch(/'lines_untracked',\s*v_untracked_count/);
  });

  it('ökar inte korträkningen för en tjänsterad', () => {
    const shortBump = body.indexOf('v_short_count := v_short_count + 1');
    const gate = body.indexOf('IF v_needs_stock THEN');
    expect(shortBump).toBeGreaterThan(gate);
  });
});

describe('läkningen är konservativ och villkorad', () => {
  const heal = sql.slice(sql.indexOf('DO $heal$'));

  it('rör bara produkter med track_inventory = false', () => {
    const deletes = heal.match(/DELETE FROM public\.stock_(quants|moves)[\s\S]*?;/g) ?? [];
    expect(deletes.length).toBe(2);
    for (const d of deletes) {
      expect(d, 'varje DELETE måste vara låst till en ospårad produkt').toMatch(
        /p\.track_inventory\s*=\s*false/i,
      );
    }
  });

  it('rör aldrig ett positivt saldo — det kan vara verkliga varor', () => {
    // En produkt vars flagga vändes kan ha riktigt lager kvar. Ett felaktigt
    // lagat lagersaldo är värre än ett synligt fel.
    expect(heal).toMatch(/DELETE FROM public\.stock_quants[\s\S]*?q\.quantity\s*<=\s*0[\s\S]*?;/i);
    expect(heal).toMatch(/COALESCE\(q\.reserved_quantity,\s*0\)\s*=\s*0/i);
  });

  it('rör aldrig en rörelse som nått böckerna', () => {
    const moveDelete = heal.slice(heal.indexOf('DELETE FROM public.stock_moves'));
    expect(moveDelete).toMatch(/COALESCE\(m\.value_cents,\s*0\)\s*=\s*0/i);
    expect(moveDelete).toMatch(/COALESCE\(m\.unit_cost_cents,\s*0\)\s*=\s*0/i);
    expect(moveDelete).toMatch(/NOT EXISTS[\s\S]*stock_valuation_layers/i);
  });

  it('rör aldrig värderingslager, verifikat eller spegeln', () => {
    expect(/DELETE FROM public\.stock_valuation_layers/i.test(heal)).toBe(false);
    expect(/DELETE FROM public\.journal_entr/i.test(heal)).toBe(false);
    expect(/UPDATE public\.products/i.test(heal)).toBe(false);
  });

  it('loggar vad som läktes — och vad som med flit lämnades kvar', () => {
    expect(heal).toMatch(/INSERT INTO public\.audit_logs/i);
    expect(heal).toMatch(/inventory\.untracked_ledger_healed/);
    expect(heal).toMatch(/'moves_left_valued'/);
    expect(heal).toMatch(/'quants_left_positive_or_reserved'/);
  });

  it('loggar ingenting när det inte fanns något att läka', () => {
    // Andra körningen ska vara helt stum, annars är migrationen inte idempotent
    // i observerbar mening.
    expect(heal).toMatch(/IF\s+v_moves\s*>\s*0\s+OR\s+v_quants\s*>\s*0\s+THEN/i);
  });
});

describe('migrationen når instanser som redan passerat HEAD', () => {
  it('är framåtdaterad förbi varje tidigare migration', () => {
    const stamps = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql') && /^\d{14}_/.test(f))
      .map((f) => f.slice(0, 14))
      .filter((t) => t !== FILE.slice(0, 14))
      .sort();
    expect(FILE.slice(0, 14) > stamps[stamps.length - 1]).toBe(true);
  });

  it('är omkörbar — inga skapelser utan IF EXISTS/OR REPLACE', () => {
    const creates = sql.match(/^CREATE\s+(?!OR REPLACE)(TRIGGER|FUNCTION)/gim) ?? [];
    // CREATE TRIGGER stödjer inte OR REPLACE i PG15; varje sådan måste föregås
    // av DROP TRIGGER IF EXISTS.
    for (const c of creates) {
      expect(c.toUpperCase()).toContain('TRIGGER');
    }
    const triggerNames = [...sql.matchAll(/CREATE\s+TRIGGER\s+(\w+)/gi)].map((m) => m[1]);
    for (const name of triggerNames) {
      expect(sql).toMatch(new RegExp(`DROP\\s+TRIGGER\\s+IF\\s+EXISTS\\s+${name}\\b`, 'i'));
    }
  });
});
