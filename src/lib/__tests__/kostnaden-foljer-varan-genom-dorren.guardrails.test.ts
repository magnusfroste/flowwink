/**
 * Kostnaden följer varan genom dörren — inte genom orderformuläret.
 *
 * Uppmätt på Nordbrygg 2026-08-25: orderläggningen konsumerade lager och
 * bokade COGS i samma transaktion som order_items-inserten. Facit: 62 936 kr
 * kostnad bokad för varor på hyllan, varav 29 500 för en MAKULERAD order.
 * Odoo-semantiken (referenssanningen): order reserverar; varan genom dörren
 * konsumerar och kostnadsför.
 *
 * Och under torrkörningen: 20260827200000 — fakturasidans fix — hade
 * definierat om process_stock_move_valuation från en äldre kopia och TAPPAT
 * COGS-blocket helt. En fix som skapade ett hål; två kopior av en
 * funktionskropp driver isär. Blocket är återinfört, byggt mot den levande
 * definitionen.
 *
 * Pinnarna nedan läser migrationen som text — samma mönster som
 * en-halv-flytt-utan-ett-ord: kontraktet ska synas i källan.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIG = readFileSync(
  join(__dirname, '../../../supabase/migrations/20260828140000_kostnaden-foljer-varan-genom-dorren.sql'),
  'utf-8',
);

/** Extract one CREATE OR REPLACE FUNCTION block by name. */
function fnBody(name: string): string {
  const re = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\b[\\s\\S]*?\\$function\\$;`,
    'm',
  );
  const m = MIG.match(re);
  expect(m, `${name} måste definieras i migrationen`).toBeTruthy();
  return m![0];
}

describe('ordertriggern: åtagande, aldrig konsumtion', () => {
  const body = fnBody('trigger_order_item_stock_decrement');

  it('behåller stock_quantity-avdraget — tillgänglighetssemantiken är oförändrad', () => {
    expect(body).toMatch(/stock_quantity\s*=\s*COALESCE\(stock_quantity,\s*0\)\s*-\s*NEW\.quantity/);
  });

  it('konsumerar INTE: ingen FEFO, inga moves i ordersekunden', () => {
    expect(body).not.toContain('consume_stock_fefo');
    expect(body).not.toMatch(/INSERT INTO public\.stock_moves/);
  });

  it('reservationen är bäst-möjliga, aldrig blockerande — ingen reserve_stock()-strikthet i checkoutens transaktion', () => {
    // reserve_stock kastar på otillräckligt saldo; en order dagens modell tar
    // emot ska den nya också ta emot. Pinnen gäller ANROP — kommentarer får
    // (och bör) nämna funktionen vid namn när de förklarar varför den inte
    // används.
    const code = body.replace(/--[^\n]*/g, '');
    expect(code).not.toContain('reserve_stock(');
    expect(code).toContain('stock_reservations');
  });
});

describe('konsumtionen: en funktion, vid dörren, exakt en gång', () => {
  const body = fnBody('consume_order_stock');

  it('vägrar dubbelkörning — och det är samma vakt som gör gamla ordrar arvssäkra', () => {
    expect(body).toContain("'already_consumed'");
    expect(body).toMatch(/IF EXISTS \(SELECT 1 FROM public\.stock_moves/);
  });

  it('gör FEFO-uttaget och skriver moves — flyttat, inte omskrivet', () => {
    expect(body).toContain('consume_stock_fefo');
    expect(body).toMatch(/INSERT INTO public\.stock_moves/);
  });
});

describe('utpasseringen triggar på tidsstämplarna, inte statuskolumnen', () => {
  const body = fnBody('trigger_order_stock_on_exit');

  it('första fysiska tecknet vinner: shipped_at eller delivered_at', () => {
    expect(body).toMatch(/OLD\.shipped_at IS NULL AND NEW\.shipped_at IS NOT NULL/);
    expect(body).toMatch(/OLD\.delivered_at IS NULL AND NEW\.delivered_at IS NOT NULL/);
    // Tvåaxelklassen: status har redan bevisats säga 'pending' om levererade
    // ordrar — den får inte vara signalen.
    expect(body).not.toMatch(/NEW\.status\s*=\s*'shipped'/);
  });
});

describe('makuleringen är en icke-händelse i böckerna', () => {
  const body = fnBody('trigger_order_stock_on_cancel');

  it('återlägger åtagandet och släpper reservationen', () => {
    expect(body).toMatch(/stock_quantity\s*=\s*COALESCE\(stock_quantity,\s*0\)\s*\+\s*v_item\.quantity/);
    expect(body).toMatch(/SET state = 'cancelled'/);
  });

  it('rör inget som redan passerat dörren — skeppad+makulerad är en RETUR', () => {
    expect(body).toMatch(/IF EXISTS \(SELECT 1 FROM public\.stock_moves[\s\S]*?RETURN NEW/);
  });
});

describe('COGS-blocket är återinfört i värderingsfunktionen', () => {
  const body = fnBody('process_stock_move_valuation');

  it('bokar inventory_cogs vid utflöde, via kontorollerna, med ordernyckeln som referens', () => {
    expect(body).toContain("'inventory_cogs'");
    expect(body).toContain("account_for('cogs')");
    expect(body).toContain("account_for('inventory')");
    // Referensen är det som gjorde GRNI-läkningen blind när den saknades —
    // COGS-verifikatet föds med sin nyckel.
    expect(body).toMatch(/NEW\.reference_id,\s*'inventory_cogs'/);
  });

  it("kontorollen 'cogs' seedas — kroppen bär inga kontonummer", () => {
    expect(MIG).toMatch(/INSERT INTO public\.account_roles[\s\S]*?'cogs'/);
    expect(body).not.toMatch(/'4990'/);
  });
});
