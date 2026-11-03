import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Found 2026-11-02 on a B2B shop's first live sale: Stripe charged the card,
 * the order stayed "pending" and the success page waited forever. Every
 * delivery to stripe-webhook was answered 401 "Invalid signature" — with the
 * right secret. In Deno the Stripe SDK verifies with SubtleCrypto, which is
 * async only; the synchronous `constructEvent` always throws, and the catch
 * reported it as a bad signature. No instance had ever had an order marked
 * paid by Stripe.
 *
 * The scan covers every edge function, not just stripe-webhook, so a second
 * Stripe consumer cannot reintroduce the synchronous call.
 */
const functionsDir = resolve(__dirname, '../../../supabase/functions');

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'node_modules' ? [] : tsFiles(p);
    return p.endsWith('.ts') ? [p] : [];
  });
}

describe('Stripe webhook signatures are verified the way Deno can', () => {
  it('no edge function calls the synchronous constructEvent', () => {
    const offenders = tsFiles(functionsDir)
      .filter((f) => /\.constructEvent\s*\(/.test(readFileSync(f, 'utf-8')))
      .map((f) => relative(functionsDir, f));
    expect(offenders).toEqual([]);
  });

  it('stripe-webhook awaits constructEventAsync with the SubtleCrypto provider', () => {
    const src = readFileSync(join(functionsDir, 'stripe-webhook/index.ts'), 'utf-8');
    expect(src).toMatch(/await stripe\.webhooks\.constructEventAsync\(/);
    expect(src).toContain('Stripe.createSubtleCryptoProvider()');
  });

  it('a missing secret is reported as missing, not as a bad signature', () => {
    const src = readFileSync(join(functionsDir, 'stripe-webhook/index.ts'), 'utf-8');
    const missing = src.indexOf('if (!webhookSecret)');
    expect(missing).toBeGreaterThan(-1);
    expect(missing).toBeLessThan(src.indexOf('constructEventAsync('));
  });
});
