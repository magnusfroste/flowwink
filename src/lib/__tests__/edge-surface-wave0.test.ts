import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../supabase/functions/_shared/ai-config.ts', () => ({ resolveAiConfig: async () => ({ provider: 'openai', model: 'm', apiUrl: 'u', apiKey: 'k' }) }));
vi.mock('../../../supabase/functions/_shared/ai-usage-logger.ts', () => ({ callAiCompletion: async () => ({}) }));

/**
 * Edge-surface refactor B1a, wave 0 — manage_service_order + contact-center
 * edge→internal. Pins the response contracts of the moved handlers.
 */
import { executeManageServiceOrder } from '../../../supabase/functions/_shared/handlers/field-service.ts';
import { executeContactCenter } from '../../../supabase/functions/_shared/handlers/contact-center.ts';

beforeEach(() => {
  (globalThis as any).Deno = { env: { get: () => undefined } };
});
afterEach(() => {
  delete (globalThis as any).Deno;
  vi.unstubAllGlobals();
});

/** Chainable supabase stub: every query resolves to the given result. */
function stubDb(result: { data?: any; error?: any } = { data: null }) {
  const q: any = {};
  for (const m of ['select', 'insert', 'update', 'eq', 'order', 'limit', 'maybeSingle', 'single', 'upsert']) {
    q[m] = vi.fn(() => q);
  }
  q.then = (res: any, rej: any) => Promise.resolve(result).then(res, rej);
  q.single = vi.fn(() => Promise.resolve(result));
  q.maybeSingle = vi.fn(() => Promise.resolve(result));
  return { from: vi.fn(() => q), rpc: vi.fn(() => Promise.resolve({})), _q: q } as any;
}

describe('manage_service_order internal handler — response contract', () => {
  it('unknown action → failed status listing the valid verbs (verb-inference guardrail)', async () => {
    const res = await executeManageServiceOrder(stubDb(), { action: 'frobnicate' });
    expect(res.status).toBe('failed');
    expect(String(res.error)).toMatch(/create, update, list, get, schedule, complete, cancel, add_line, list_visits/);
  });

  it('create without required fields → failed with the exact message', async () => {
    const res = await executeManageServiceOrder(stubDb(), { action: 'create' });
    expect(res).toEqual({ status: 'failed', error: 'title and customer_name are required' });
  });

  it('create happy path → { status: success, service_order }', async () => {
    const db = stubDb({ data: { id: 'so1', title: 'Fix pump' }, error: null });
    const res = await executeManageServiceOrder(db, { action: 'create', title: 'Fix pump', customer_name: 'ACME' });
    expect(res).toEqual({ status: 'success', service_order: { id: 'so1', title: 'Fix pump' } });
    expect(db.from).toHaveBeenCalledWith('service_orders');
  });

  it('DB error surfaces as failed, never a throw (edge parity)', async () => {
    const db = stubDb({ data: null, error: { message: 'boom' } });
    const res = await executeManageServiceOrder(db, { action: 'update', id: 'so1', title: 'x' });
    expect(res).toEqual({ status: 'failed', error: 'update failed: boom' });
  });
});

describe('contact-center internal router — dispatch + response contract', () => {
  it('dispatches on the skill NAME (replacing the _skill field the edge dispatch injected)', async () => {
    const res = await executeContactCenter(stubDb({ data: null }), {}, 'nonexistent_skill');
    expect(res).toEqual({ error: 'Unknown contact-center skill: nonexistent_skill' });
  });

  it('manage_channel without token → same soft-fail as the edge function', async () => {
    const db = stubDb({ data: { value: {} } });
    const res = await executeContactCenter(db, { action: 'test' }, 'manage_channel');
    expect(res).toEqual({ success: false, error: 'No bot_token provided or stored.' });
  });

  it('send_channel_message without text → validation error', async () => {
    const res = await executeContactCenter(stubDb(), {}, 'send_channel_message');
    expect(res).toEqual({ error: 'text is required' });
  });

  it('handle_voicemail without voicemail_id → validation error', async () => {
    const res = await executeContactCenter(stubDb(), {}, 'handle_voicemail');
    expect(res).toEqual({ error: 'voicemail_id is required' });
  });

  it('internal throw → { error } object, never a rejected promise (edge parity)', async () => {
    const db = { from: () => { throw new Error('db exploded'); } } as any;
    const res = await executeContactCenter(db, { action: 'list' }, 'manage_channel');
    expect(res).toEqual({ error: 'db exploded' });
  });
});
