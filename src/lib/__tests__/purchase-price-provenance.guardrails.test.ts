import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { purchasingModule } from '@/lib/modules/purchasing-module';
import { pricelistsModule } from '@/lib/modules/pricelists-module';
import { buildUnknownParameterBounce } from '../../../supabase/functions/_shared/skills/parameter-contract';

/**
 * Spärr: priset som föds vid inköp.
 *
 * Godsmottagningen är den enda plats där kostnaden kommer IN i systemet
 * (stock_valuation_layers.unit_cost_cents), och exakt den siffran går ut igen
 * som COGS. Tre mätta fel på Nordbrygg, alla i födelseögonblicket:
 *
 *   1 696,00  — Milano Uno föddes i lagret till EUR-beloppet läst som kronor,
 *               mot standardkostnaden 19 500,00. create_purchase_order hade
 *               ingen currency-parameter, så `currency: "EUR"` slängdes TYST.
 *   41 880,00 — förslagsordern på 120 kg Mellanrost prissattes till
 *               products.price_cents (kundpriset 349,00/kg) i stället för
 *               inköpspriset: 23 760,00 på baspriset, 22 440,00 med staffeln.
 *      600,00 — per Mörkrost-order, för att staffelraden (17,50 från 60 kg)
 *               aldrig kunde vinna över is_preferred-raden (18,50).
 *
 * Efter fixen, mätt genom gatewayn mot Nordbrygg: EUR-ordern föds i EUR med
 * kurs 11,40 och lagervärdet blir 19 334,40; förslaget på 120 kg blir
 * 22 440,00 med price_source "vendor_price"; 60 kg svarar 17 500 / tier 60.
 *
 * Den här filen pinnar de tre sömmarna i KODEN så de inte kan glida isär igen.
 */

const AGENT_EXECUTE = join(__dirname, '../../../supabase/functions/agent-execute/index.ts');
const MIGRATION = join(
  __dirname,
  '../../../supabase/migrations/20260827300000_c7d8e9f0-priset-som-foddes-i-fel-valuta.sql',
);

const agentExecute = readFileSync(AGENT_EXECUTE, 'utf8');
const migration = readFileSync(MIGRATION, 'utf8');

/** The `case 'purchase_orders':` block of executeDbAction. */
function purchaseOrderHandler(): string {
  const start = agentExecute.indexOf("case 'purchase_orders': {");
  const end = agentExecute.indexOf("case 'goods_receipts': {", start);
  expect(start, "case 'purchase_orders' hittades inte").toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  return agentExecute.slice(start, end);
}

const skill = (name: string) =>
  [...(purchasingModule.skillSeeds ?? []), ...(pricelistsModule.skillSeeds ?? [])]
    .find((s) => s.name === name);

interface ToolDefShape {
  function?: { parameters?: { properties?: Record<string, unknown> } };
}

const props = (name: string): Record<string, unknown> =>
  (skill(name)?.tool_definition as ToolDefShape | undefined)?.function?.parameters?.properties ?? {};

describe('A. valutan reser med ordern', () => {
  it('create_purchase_order deklarerar currency OCH exchange_rate', () => {
    const p = props('create_purchase_order');
    expect(Object.keys(p)).toContain('currency');
    expect(Object.keys(p)).toContain('exchange_rate');
  });

  it('handlern LÄSER currency och exchange_rate — inte bara schemat', () => {
    const h = purchaseOrderHandler();
    expect(h).toMatch(/const \{[^}]*\bcurrency\b[^}]*\bexchange_rate\b/s);
    expect(h).toContain('poInsert.currency');
    expect(h).toContain('poInsert.exchange_rate');
  });

  it('handlern hittar ALDRIG på en valuta vid skrivning', () => {
    // platform-fallbacks.ts: utelämna fältet, låt databasen (här: leverantören)
    // vara auktoriteten. Ett klientsidigt || 'SEK' är exakt den klassen.
    const h = purchaseOrderHandler();
    expect(h).not.toMatch(/currency:\s*'SEK'/);
    expect(h).not.toMatch(/currency\s*\|\|\s*'SEK'/);
  });

  it('databasen stämplar valuta och kurs för ALLA skrivare, inte bara handlern', () => {
    expect(migration).toContain('CREATE TRIGGER trg_stamp_purchase_order_fx');
    expect(migration).toMatch(/BEFORE INSERT OR UPDATE OF currency, exchange_rate/);
    // Utan att kolumndefaulten släpps går "ingen sa något" inte att skilja
    // från "någon sa SEK", och leverantörens valuta kan aldrig vinna.
    expect(migration).toContain('ALTER COLUMN currency DROP DEFAULT');
  });

  it('en främmande valuta utan känd kurs REFUSERAS — den bokas inte till 1', () => {
    expect(migration).toMatch(/has no exchange rate to .* refusing to book it at rate 1/);
    expect(migration).toContain('fx_rate_at');
  });

  it('värderingen räknar om vid mottagning — en gång, med orderns kurs', () => {
    const fn = migration.slice(migration.indexOf('FUNCTION public.resolve_inbound_unit_cost'));
    const body = fn.slice(0, fn.indexOf('$function$;') + 11);
    expect(body).toContain('po.exchange_rate');
    expect(body).toMatch(/round\(v_cost \* COALESCE\(NULLIF\(v_rate, 0\), 1\)\)/);
  });
});

describe('B. en okänd parameter slängs inte tyst', () => {
  it('handlerns parameterlista speglar de två skillarnas scheman', () => {
    const declared = new Set([
      ...Object.keys(props('create_purchase_order')),
      ...Object.keys(props('update_purchase_order')),
    ]);
    const block = agentExecute.slice(
      agentExecute.indexOf('const PURCHASE_ORDER_PARAMETERS'),
      agentExecute.indexOf('/** Agent-internal keys'),
    );
    const inHandler = new Set([...block.matchAll(/^\s{2}([a-z_]+):\s*\{/gm)].map((m) => m[1]));
    expect(inHandler.size).toBeGreaterThan(5);
    // Deklarerat men oläst är precis den tystnad bouncen finns för; läst men
    // odeklarerat gör att en giltig parameter bouncas.
    expect([...declared].filter((k) => !inHandler.has(k)), 'deklarerat i skillen men okänt för handlern').toEqual([]);
    expect([...inHandler].filter((k) => !declared.has(k)), 'läst av handlern men odeklarerat i skillen').toEqual([]);
  });

  it('bouncen körs för HELA purchase_orders-vägen, inte bara create', () => {
    const h = purchaseOrderHandler();
    const bounceAt = h.indexOf('bouncePurchaseOrderArgs');
    const createAt = h.indexOf("if (action === 'create'");
    expect(bounceAt).toBeGreaterThan(-1);
    expect(bounceAt).toBeLessThan(createAt);
  });

  it('bouncen namnger den närmaste giltiga parametern', () => {
    const bounce = buildUnknownParameterBounce({
      skillName: 'create_purchase_order',
      unknown: ['currency_code'],
      args: { vendor_id: 'x', currency_code: 'EUR', lines: [] },
      properties: props('create_purchase_order'),
      hasInstructions: true,
    });
    expect(bounce.body.did_you_mean.currency_code).toContain('currency');
    expect(bounce.body.valid_parameters).toContain('currency');
    expect(bounce.body.valid_parameters).toContain('exchange_rate');
    // Bouncen är en rättelse, inte en återvändsgränd — den ska inte skicka
    // anroparen till en annan skill.
    expect(bounce.body.hint).toMatch(/call this skill again/);
  });

  it('action:"update" vägrar rader i stället för att ignorera dem', () => {
    expect(purchaseOrderHandler()).toContain('does not rewrite purchase order lines');
  });
});

describe('C. 0 % är ett momsvärde, inte frånvaro', () => {
  it('inget || 25 eller || 0.25 i inköpsvägen', () => {
    const h = purchaseOrderHandler();
    expect(h).not.toMatch(/tax_rate\s*\|\|\s*25/);
    expect(h).toMatch(/line\.tax_rate \?\? 25/);
  });

  it('rad och huvud använder samma enhet — procent, inte bråkdel', () => {
    // purchase_order_lines.tax_rate är PROCENT (kolumndefault 25.00). 0.25 där
    // är en fjärdedels procent och skrevs på 25 levande rader.
    const reorder = agentExecute.slice(
      agentExecute.indexOf('Auto-generated by FlowPilot reorder check') - 3000,
      agentExecute.indexOf('Auto-generated by FlowPilot reorder check'),
    );
    expect(reorder).not.toMatch(/tax_rate:\s*0\.25/);
    expect(reorder).toContain('PURCHASE_TAX_RATE_PCT');
  });

  it('förslagsordern summerar huvudet UR raderna, så skrivarna inte kan bli oense', () => {
    const fn = migration.slice(migration.indexOf('FUNCTION public.approve_procurement_suggestion'));
    expect(fn).toMatch(/sum\(round\(total_cents \* tax_rate \/ 100\)\)/);
  });
});

describe('D. en inköpsorder bär ett inköpspris', () => {
  it('approve_procurement_suggestion läser aldrig products.price_cents', () => {
    const fn = migration
      .slice(
        migration.indexOf('FUNCTION public.approve_procurement_suggestion'),
        migration.indexOf('-- 5. Spärren'),
      )
      // Kommentarerna FÅR nämna kundpriset — det är koden som inte får läsa det.
      .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(fn).not.toMatch(/(?<!cost_)\bprice_cents\b/);
    expect(fn).toContain('pick_vendor_price');
    expect(fn).toContain('cost_cents');
  });

  it('utan känt inköpspris skapas ingen order alls', () => {
    const fn = migration.slice(migration.indexOf('FUNCTION public.approve_procurement_suggestion'));
    expect(fn).toMatch(/No purchase price for/);
  });

  it('spärren stoppar en rad som föds till försäljningspriset', () => {
    expect(migration).toContain('CREATE TRIGGER guard_po_line_purchase_price_trg');
    expect(migration).toMatch(/priced at the SALES price/);
    // Spärren tittar på PROVENIENS (finns ett lägre känt inköpspris?), inte på
    // ett magiskt tal — och utvägen är att göra priset bevisbart.
    expect(migration).toMatch(/register it first with manage_vendor_price/);
  });
});

describe('E. staffeln är levande data', () => {
  it('djupaste kvalificerande staffel först, priset därefter', () => {
    const fn = migration.slice(
      migration.indexOf('FUNCTION public.pick_vendor_price'),
      migration.indexOf('REVOKE ALL ON FUNCTION public.pick_vendor_price'),
    );
    expect(fn).toMatch(/vp\.price_tier_min_qty DESC,\s*\n\s*vp\.unit_price_cents ASC/);
    // is_preferred får inte längre sortera FÖRE staffeln — det var det som
    // gjorde staffelraden omöjlig att vinna med (unikindexet tillåter en enda
    // preferred-rad per produkt).
    expect(fn).not.toMatch(/is_preferred DESC,\s*\n?\s*vp\.price_tier_min_qty/);
    expect(fn).toContain('pref.is_preferred');
  });

  it('resolve_vendor_price har EN ordningsregel — den i pick_vendor_price', () => {
    const fn = migration.slice(
      migration.indexOf('FUNCTION public.resolve_vendor_price'),
      migration.indexOf('CREATE OR REPLACE FUNCTION public.manage_vendor_price'),
    );
    expect(fn).toContain('public.pick_vendor_price(');
  });

  it('skillens instruktion säger samma sak som koden gör', () => {
    const s = skill('resolve_vendor_price');
    expect(s?.instructions).toMatch(/deepest qualifying price_tier_min_qty/);
    expect(s?.description).toMatch(/DEEPEST qualifying quantity tier/);
  });

  it('en staffelrad går att registrera utan att ange staffeln', () => {
    // p_price_tier_min_qty är valfri i schemat men skickade NULL förbi
    // kolumnens default rakt in i NOT NULL.
    const fn = migration.slice(migration.indexOf('FUNCTION public.manage_vendor_price'));
    expect(fn).toMatch(/GREATEST\(COALESCE\(p_price_tier_min_qty,1\),1\)/);
  });

  it('upserten skriver bara över det anroparen faktiskt nämnde', () => {
    const fn = migration.slice(migration.indexOf('FUNCTION public.manage_vendor_price'));
    expect(fn).toMatch(/is_preferred = COALESCE\(p_is_preferred, public\.vendor_products\.is_preferred\)/);
    expect(fn).toMatch(/min_order_quantity = COALESCE\(p_min_order_quantity, public\.vendor_products\.min_order_quantity\)/);
  });
});

describe('F. migrationen är omkörbar och ligger i sitt intervall', () => {
  it('varje objekt skapas omkörbart', () => {
    const creates = [...migration.matchAll(/^CREATE (OR REPLACE )?(FUNCTION|TRIGGER)/gm)];
    expect(creates.length).toBeGreaterThan(5);
    for (const m of creates) {
      if (m[2] === 'FUNCTION') expect(m[1], `CREATE FUNCTION utan OR REPLACE: ${m[0]}`).toBeTruthy();
    }
    const triggers = [...migration.matchAll(/CREATE TRIGGER (\w+)/g)].map((m) => m[1]);
    for (const t of triggers) {
      expect(migration, `DROP TRIGGER IF EXISTS saknas för ${t}`).toContain(`DROP TRIGGER IF EXISTS ${t}`);
    }
  });
});
