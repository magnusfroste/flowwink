import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { purchasingModule } from '@/lib/modules/purchasing-module';

/**
 * An order is created once, however many times the call is retried.
 *
 * The battery's second pass (2026-10-07) found a vendor with four orders for
 * three creates: the first call wrote header and lines, the edge runtime shed
 * the response, and the harness's retry created the order again. Nothing in
 * the create could see it had already happened. Now the caller's key rides on
 * the order and a repeat returns it.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const handler = read('supabase/functions/agent-execute/index.ts');
const createStart = handler.indexOf("const { vendor_id, order_date, expected_delivery, notes, currency, exchange_rate, lines: poLines");
const createBlock = handler.slice(createStart, handler.indexOf("if (action === 'update') {", createStart));

describe('create_purchase_order is idempotent on a caller key', () => {
  it('the key is unique on the order, when set', () => {
    const migration = read('supabase/migrations/20261007172903_ordern-som-skapades-tva-ganger.sql');
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS idempotency_key text/);
    expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_idempotency_key_idx[\s\S]*WHERE idempotency_key IS NOT NULL/);
  });

  it('the handler reads the declared key or the transport key, replays before writing, and on a race', () => {
    expect(createBlock).toMatch(/idemArgs\.idempotency_key/);
    expect(createBlock).toMatch(/idemArgs\._idempotency_key/);
    expect(createBlock.indexOf('const replayed = await replayExisting()')).toBeLessThan(createBlock.indexOf("from('purchase_orders')\n          .insert(poInsert)"));
    expect(createBlock).toMatch(/poError\.code === '23505' && idemKey/);
    expect(createBlock).toMatch(/replayed: true/);
  });

  it('prices are resolved before the header is written — a missing price leaves no orphan draft', () => {
    expect(createBlock.indexOf('No purchase price known for')).toBeLessThan(createBlock.indexOf('const poInsert: Record<string, unknown>'));
  });

  it('the key is declared on the skill (so the parameter contract lets it through) and explained', () => {
    const skill = purchasingModule.skillSeeds?.find((s) => s.name === 'create_purchase_order');
    const props = (skill?.tool_definition as { function: { parameters: { properties: Record<string, unknown> } } }).function.parameters.properties;
    expect(props).toHaveProperty('idempotency_key');
    expect(skill?.instructions).toMatch(/same idempotency_key/);
  });

  it('the harness stamps one transport key per logical call, kept across its retries', () => {
    const lib = read('scripts/process-battery/lib.ts');
    expect(lib).toMatch(/const callArgs = \{ \.\.\.args, _idempotency_key: randomUUID\(\) \};\n\s+for \(let attempt = 0/);
    const scenario = read('scripts/process-battery/scenarios/procure-to-pay.ts');
    expect(scenario).toMatch(/idempotency_key: idem/);
    expect(scenario).toMatch(/replayed/);
  });
});
