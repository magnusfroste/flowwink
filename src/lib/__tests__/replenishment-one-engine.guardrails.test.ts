import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Påfyllningen, och spårbarheten på vägen ut.
 *
 * Tre fynd på Nordbrygg, alla i samma familj som resten av dygnet: två
 * funktioner för samma sak där den mindre använda är fel.
 *
 *  1. Med fyra öppna inköpsordrar svarade procurement_run 0 nya förslag
 *     (rätt — allt var redan beställt) medan list_reorder_candidates svarade
 *     22, och auto_generate_purchase_orders torrkörde 3 order / 22 rader /
 *     306 963,75 kr ovanpå det som redan var på väg. Den ena räknade
 *     virtuellt lager, den andra bara products.stock_quantity — och de läste
 *     dessutom olika leverantörsfält.
 *
 *  2. Godsmottagningen la partiet ROST-2026-W34 (bäst före 2027-02-28) på
 *     quanten. Försäljningen skrev en ANDRA, partilös quant-rad: WH/MAIN 60
 *     plus WH/MAIN −10. Nettot 50 var rätt, men partiets saldo sa 60. För en
 *     färskvaruhandel betyder det att en återkallelse inte går att genomföra
 *     och att FEFO-plockning är omöjlig.
 *
 *  3. reorder_rules — Odoos allra första steg i procure-to-pay — hade admin-UI
 *     men ingen skill alls, och två skillinstruktioner sa uttryckligen att
 *     reglerna sätts i UI:t.
 */

const migrationsDir = resolve(__dirname, '../../../supabase/migrations');
const read = (f: string) => readFileSync(resolve(migrationsDir, f), 'utf-8');

const oneEngine = read('20260827400000_a1b2c3d4-tva-pafyllningsmotorer-en-sanning.sql');
const lotOnTheWayOut = read('20260827410000_b2c3d4e5-partiet-tappades-pa-vagen-ut.sql');
const ruleSurface = read('20260827420000_c3d4e5f6-pafyllningsregeln-fick-en-agentyta.sql');

const agentExecute = readFileSync(
  resolve(__dirname, '../../../supabase/functions/agent-execute/index.ts'),
  'utf-8',
);
const inventoryModule = readFileSync(resolve(__dirname, '../modules/inventory-module.ts'), 'utf-8');
const purchasingModule = readFileSync(resolve(__dirname, '../modules/purchasing-module.ts'), 'utf-8');
const manufacturingModule = readFileSync(resolve(__dirname, '../modules/manufacturing-module.ts'), 'utf-8');

/** Kroppen mellan `CREATE ... FUNCTION public.<name>` och nästa CREATE FUNCTION. */
function fnBody(sql: string, name: string): string {
  const start = sql.indexOf(`FUNCTION public.${name}(`);
  expect(start, `${name} saknas i migrationen`).toBeGreaterThan(-1);
  const rest = sql.slice(start + 1);
  const next = rest.indexOf('CREATE OR REPLACE FUNCTION');
  return next === -1 ? rest : rest.slice(0, next);
}

describe('en tillgänglighetsberäkning, inte en per motor', () => {
  it('stock_virtual_available räknar Odoo-formen: på hand − reserverat + inkommande', () => {
    const fn = fnBody(oneEngine, 'stock_virtual_available');
    expect(fn).toMatch(/oh\.v - q\.res \+ inc\.qty/);
    expect(fn).toMatch(/reserved_quantity/);
    expect(fn).toMatch(/po\.status IN \('draft', 'sent', 'confirmed', 'partially_received'\)/);
  });

  it('den skiljer "noll i hyllan" från "ingen lagerrad alls"', () => {
    // Utan den skillnaden blir en produkt som aldrig tagits emot omöjlig att
    // skilja från en som är slut — och det var precis det som gav 22 falska
    // kandidater på ett lager där allt redan var beställt.
    const fn = fnBody(oneEngine, 'stock_virtual_available');
    expect(fn).toMatch(/quant_rows/);
    expect(fn).toMatch(/WHEN q\.quant_rows > 0 THEN q\.qty/);
  });

  it('en överleverans kan inte bli negativt inkommande', () => {
    const fn = fnBody(oneEngine, 'stock_virtual_available');
    expect(fn).toMatch(/GREATEST\(pol\.quantity - COALESCE\(pol\.received_quantity, 0\), 0\)/);
  });

  it('båda motorerna läser den, ingen räknar själv', () => {
    for (const name of ['list_reorder_candidates', 'procurement_run', 'mrp_reorder_run']) {
      expect(fnBody(oneEngine, name), name).toMatch(/stock_virtual_available/);
    }
    // Det gamla uttrycket får inte finnas kvar som lagerkälla i någon motor.
    const candidates = fnBody(oneEngine, 'list_reorder_candidates');
    expect(candidates).not.toMatch(/COALESCE\(ps\.quantity_on_hand, p\.stock_quantity, 0\)/);
  });

  it('kandidatlistan triggar på virtuellt lager, inte på hyllan', () => {
    const fn = fnBody(oneEngine, 'list_reorder_candidates');
    expect(fn).toMatch(/WHEN c\.has_rule THEN c\.virtual < c\.rp/);
    expect(fn).toMatch(/c\.virtual <= c\.rp/);
    // Och kvantiteten fylls upp från virtuellt lager — annars beställs
    // skillnaden mot hyllan igen, ovanpå det som redan är på väg.
    expect(fn).toMatch(/GREATEST\(r\.max_qty - a\.virtual, 0\)/);
  });

  it('svaret bär sin egen proveniens', () => {
    const fn = fnBody(oneEngine, 'list_reorder_candidates');
    for (const col of ['reserved_qty', 'incoming_qty', 'virtual_qty', 'vendor_source']) {
      expect(fn, col).toContain(col);
    }
  });

  it('leverantören löses upp på ETT ställe, med regeln före flaggan', () => {
    const fn = fnBody(oneEngine, 'reorder_preferred_vendor');
    expect(fn).toMatch(/reorder_rules[\s\S]{0,400}preferred_vendor_id/);
    expect(fn).toMatch(/vendor_products[\s\S]{0,200}is_preferred = true/);
    expect(fn).toMatch(/COALESCE\(\(SELECT vid FROM ruled\), \(SELECT vid FROM flagged\)\)/);
    // Ingen motor får ha kvar sin egen åsikt om leverantören.
    expect(fnBody(oneEngine, 'procurement_run')).toMatch(/reorder_preferred_vendor/);
    expect(fnBody(oneEngine, 'list_reorder_candidates')).toMatch(/reorder_preferred_vendor/);
  });

  it('auto_generate_purchase_orders är ett verb, inte en tredje motor', () => {
    const fn = fnBody(oneEngine, 'auto_generate_purchase_orders');
    expect(fn).toMatch(/list_reorder_candidates\(\)/);
    // Ingen egen lager- eller leverantörsläsning.
    expect(fn).not.toMatch(/stock_quantity|quantity_on_hand|vendor_products|stock_quants/);
  });

  it('purchase_reorder_check delegerar i stället för att räkna om', () => {
    const handler = agentExecute.slice(agentExecute.indexOf("if (skillName === 'purchase_reorder_check')"));
    const body = handler.slice(0, handler.indexOf('// Create one PO per vendor'));
    expect(body).toMatch(/supabase\.rpc\('list_reorder_candidates'/);
    // Den tredje motorn: egen tröskelslinga, eget lagerläsande, egen
    // leverantörsuppslagning. Ingen av delarna får komma tillbaka.
    expect(body).not.toMatch(/from\('product_stock'\)/);
    expect(body).not.toMatch(/from\('reorder_rules'\)/);
    expect(body).not.toMatch(/\.eq\('is_preferred', true\)/);
    // Proveniensen följer med ut till agenten.
    for (const field of ['reserved', 'incoming', 'virtual_stock', 'vendor_source']) {
      expect(body, field).toContain(field);
    }
  });

  it('spärren står kvar i funktionens egen docstring, med talen', () => {
    expect(oneEngine).toMatch(/COMMENT ON FUNCTION public\.stock_virtual_available/);
    expect(oneEngine).toContain('306 963,75');
    expect(oneEngine).toContain('0 respektive 22 förslag');
  });
});

describe('partiet följer med på vägen ut', () => {
  it('en ospårad vara går exakt samma väg som förut', () => {
    const fn = fnBody(lotOnTheWayOut, 'consume_stock_fefo');
    expect(fn).toMatch(/IF NOT public\.product_is_lot_tracked\(p_product_id\) THEN/);
    expect(fn).toMatch(/upsert_stock_quant\(p_product_id, p_location_id, -v_left, NULL\)/);
  });

  it('partispårad = produkten HAR partier — ingen ny flagga att glömma sätta', () => {
    const fn = fnBody(lotOnTheWayOut, 'product_is_lot_tracked');
    expect(fn).toMatch(/EXISTS \(SELECT 1 FROM public\.stock_lots WHERE product_id = p_product_id\)/);
  });

  it('FEFO: tidigast bäst före först, partier utan datum sist', () => {
    const fn = fnBody(lotOnTheWayOut, 'consume_stock_fefo');
    expect(fn).toMatch(/ORDER BY l\.expiry_date ASC NULLS LAST/);
    expect(fn).toMatch(/l\.manufactured_at ASC NULLS LAST/);
    // Splittas över flera partier när ett inte räcker.
    expect(fn).toMatch(/v_take := LEAST\(v_left, v_lot\.quantity\)/);
  });

  it('ett utpekat parti gäller före FEFO', () => {
    const fn = fnBody(lotOnTheWayOut, 'consume_stock_fefo');
    expect(fn).toMatch(/IF p_lot_id IS NOT NULL THEN/);
  });

  it('en rest som inget parti kan bära bokas partilöst och SÄGS vara det', () => {
    const fn = fnBody(lotOnTheWayOut, 'consume_stock_fefo');
    expect(fn).toMatch(/IF v_left > 0 THEN[\s\S]{0,200}upsert_stock_quant\(p_product_id, p_location_id, -v_left, NULL\)/);
    expect(lotOnTheWayOut).toContain('NO LOT COULD COVER THIS QUANTITY');
  });

  it('båda utgående banorna drar av via samma funktion', () => {
    for (const name of ['trigger_order_item_stock_decrement', 'apply_stock_movement_event']) {
      expect(fnBody(lotOnTheWayOut, name), name).toMatch(/consume_stock_fefo/);
    }
    // Och ingen av dem får skriva den partilösa raden på egen hand igen.
    const order = fnBody(lotOnTheWayOut, 'trigger_order_item_stock_decrement');
    expect(order).not.toMatch(/upsert_stock_quant\(NEW\.product_id, v_loc, -\(NEW\.quantity\), NULL\)/);
  });

  it('rörelseliggaren får partiet — annars finns inget att återkalla på', () => {
    const order = fnBody(lotOnTheWayOut, 'trigger_order_item_stock_decrement');
    expect(order).toMatch(/lot_id/);
    expect(order).toMatch(/jsonb_array_elements\(COALESCE\(v_result->'allocated'/);
  });

  it('inleveransen är orörd — bara negativa delta går genom FEFO', () => {
    const fn = fnBody(lotOnTheWayOut, 'apply_stock_movement_event');
    expect(fn).toMatch(/IF v_qty_delta > 0 THEN[\s\S]{0,400}upsert_stock_quant\(v_product_id, v_location_id, v_qty_delta, v_lot_id\)/);
  });

  it('reparationen är omkörbar och rör bara partispårade varor', () => {
    const fn = fnBody(lotOnTheWayOut, 'reconcile_lotless_outgoing');
    expect(fn).toMatch(/sq\.lot_id IS NULL/);
    expect(fn).toMatch(/sq\.quantity < 0/);
    expect(fn).toMatch(/public\.product_is_lot_tracked\(sq\.product_id\)/);
    // Migrationen kör den en gång; funktionen finns kvar att köra om.
    expect(lotOnTheWayOut).toMatch(/PERFORM public\.reconcile_lotless_outgoing\(\);/);
  });

  it('spärren står i docstringen, med de verkliga partierna', () => {
    expect(lotOnTheWayOut).toContain('ROST-2026-W34');
    expect(lotOnTheWayOut).toContain('CM-UNO-SN-884213');
  });
});

describe('påfyllningsregeln går att sätta från agentytan', () => {
  it('manage_reorder_rule finns som RPC med alla rattar UI:t har', () => {
    expect(ruleSurface).toMatch(/CREATE OR REPLACE FUNCTION public\.manage_reorder_rule\(/);
    for (const arg of ['p_action', 'p_product', 'p_location', 'p_min_qty', 'p_max_qty',
                       'p_reorder_qty', 'p_lead_time_days', 'p_procurement_method',
                       'p_preferred_vendor', 'p_is_active', 'p_rule_id']) {
      expect(ruleSurface, arg).toContain(arg);
    }
  });

  it('den tar emot namn, inte bara UUID — och räknar upp vid tvetydighet', () => {
    expect(ruleSurface).toMatch(/is ambiguous — % candidates/);
    expect(ruleSurface).toMatch(/Known codes/);
    expect(ruleSurface).toMatch(/Known vendors/);
  });

  it('den vägrar det som aldrig kan fungera, med skälet i felet', () => {
    expect(ruleSurface).toMatch(/max_qty \(%\) must be at least min_qty/);
    expect(ruleSurface).toMatch(/not stock-tracked \(track_inventory = false\)/);
    expect(ruleSurface).toMatch(/must be "buy" \(purchased\) or "manufacture"/);
  });

  it('den läser tillbaka raden efter skrivning', () => {
    // project_silent_noop_alias_bug: ett "updated: true" utan återläsning är
    // exakt hur ett tyst no-op ser ut inifrån.
    expect(ruleSurface).toMatch(/ON CONFLICT \(product_id, location_id\) DO UPDATE SET/);
    expect(ruleSurface).toMatch(/-- Läs tillbaka raden/);
  });

  it('svaret visar vad regeln kommer att göra', () => {
    expect(ruleSurface).toMatch(/will_trigger_now/);
    expect(ruleSurface).toMatch(/stock_virtual_available/);
  });

  it('skillen är registrerad och synlig för externa agenter', () => {
    expect(inventoryModule).toMatch(/name: 'manage_reorder_rule'/);
    expect(inventoryModule).toMatch(/handler: 'rpc:manage_reorder_rule'/);
    const seed = inventoryModule.slice(
      inventoryModule.indexOf("name: 'manage_reorder_rule'"),
      inventoryModule.indexOf("name: 'procurement_run'"),
    );
    expect(seed).toMatch(/scope: 'both'/);
    // Law 2: description = valet, instructions = utförandet.
    expect(seed).toMatch(/Use when:/);
    expect(seed).toMatch(/NOT for:/);
    expect(seed).toMatch(/instructions:/);
    // Och den ligger i modulens skills-lista, annars bootstrappas den aldrig.
    expect(inventoryModule).toMatch(/'manage_reorder_rule',/);
  });

  it('ingen skill hänvisar längre till inventory-UI:t för reglerna', () => {
    for (const [name, src] of [['purchasing', purchasingModule], ['manufacturing', manufacturingModule]] as const) {
      expect(src, name).not.toMatch(/set in the inventory UI/);
      expect(src, name).toMatch(/manage_reorder_rule/);
    }
  });
});

describe('ingen ny påfyllningsmotor smyger in', () => {
  it('inga migrationer i intervallet lär sig räkna lager själva', () => {
    const ours = readdirSync(migrationsDir).filter((f) => /^202608274\d{5}_/.test(f));
    expect(ours.length).toBeGreaterThanOrEqual(3);
    for (const f of ours) {
      const sql = read(f).split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
      if (!/reorder|procurement|replenish/i.test(sql)) continue;
      // Den gamla lagerkällan får inte återuppstå som beslutsunderlag.
      expect(sql, f).not.toMatch(/COALESCE\(ps\.quantity_on_hand, p\.stock_quantity, 0\)/);
    }
  });
});
