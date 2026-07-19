import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../supabase/functions/_shared/ai-config.ts', () => ({
  resolveAiConfig: async () => ({ provider: 'openai', model: 'm', apiUrl: 'https://api.openai.com/v1/chat/completions', apiKey: 'k' }),
  isAnthropicProvider: (url: string) => url.includes('anthropic'),
}));

/**
 * Edge-surface refactor B1a, wave 2 — five larger skills edge→internal.
 * parse_resume, scan_gmail_inbox, prepare_vat_return, build_site_step
 * (copilot), get_customer_360. Pins response contracts.
 */
import { executeParseResume } from '../../../supabase/functions/_shared/handlers/parse-resume.ts';
import { executeGmailInboxScan } from '../../../supabase/functions/_shared/handlers/gmail-inbox-scan.ts';
import { executeVatReturnSe, resolvePeriod } from '../../../supabase/functions/_shared/handlers/accounting-vat-return-se.ts';
import { executeCopilotAction } from '../../../supabase/functions/_shared/handlers/copilot-action.ts';
import { executeCustomer360 } from '../../../supabase/functions/_shared/handlers/customer-360.ts';

const ctx = { supabaseUrl: 'http://local', serviceKey: 'sk' };

beforeEach(() => { (globalThis as any).Deno = { env: { get: () => undefined } }; });
afterEach(() => { delete (globalThis as any).Deno; vi.unstubAllGlobals(); });

function stubDb(result: { data?: any; error?: any } = { data: null }) {
  const q: any = {};
  for (const m of ['select', 'insert', 'update', 'upsert', 'eq', 'in', 'gte', 'lte', 'ilike', 'order', 'limit', 'range']) q[m] = vi.fn(() => q);
  q.then = (res: any, rej: any) => Promise.resolve(result).then(res, rej);
  q.single = vi.fn(() => Promise.resolve(result));
  q.maybeSingle = vi.fn(() => Promise.resolve(result));
  return { from: vi.fn(() => q), _q: q } as any;
}

describe('parse_resume internal handler', () => {
  it('short text → exact validation error', async () => {
    const res = await executeParseResume(stubDb(), { resume_text: 'kort' });
    expect(res).toEqual({ success: false, error: 'Resume text is required (min 20 chars)' });
  });

  it('happy path → { success, profile, provider_used } with markdown-fence stripping', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '```json\n{"name":"Ada Lovelace"}\n```' } }] }),
    })));
    const res = await executeParseResume(stubDb(), { resume_text: 'A'.repeat(40) });
    expect(res).toEqual({ success: true, profile: { name: 'Ada Lovelace' }, provider_used: 'openai' });
  });
});

describe('scan_gmail_inbox internal handler', () => {
  it('not connected → same soft error as the edge function', async () => {
    const res = await executeGmailInboxScan(stubDb({ data: null }), {}, ctx);
    expect(res).toEqual({ success: false, error: 'Gmail not connected' });
  });
});

describe('prepare_vat_return internal handler', () => {
  it('resolvePeriod: month, quarter, year, explicit range', () => {
    expect(resolvePeriod({ year: 2026, month: 2 })).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(resolvePeriod({ year: 2026, quarter: 2 })).toEqual({ from: '2026-04-01', to: '2026-06-30' });
    expect(resolvePeriod({ year: 2026 })).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(resolvePeriod({ from: '2026-01-01', to: '2026-03-31' })).toEqual({ from: '2026-01-01', to: '2026-03-31' });
  });

  it('missing period → contract error (also accepts p_-prefixed args)', async () => {
    const res = await executeVatReturnSe(stubDb(), {});
    expect(res).toEqual({ error: 'Provide {from,to} or {year,month|quarter}' });
    const ok = await executeVatReturnSe(stubDb({ data: [] }), { p_year: 2026, p_month: 1 });
    expect((ok as any).period).toEqual({ from: '2026-01-01', to: '2026-01-31' });
  });

  it('empty ledger → all boxes zero, box 49 integrity holds, SKV 4700 shape', async () => {
    const res: any = await executeVatReturnSe(stubDb({ data: [] }), { year: 2026, month: 6 });
    expect(res.form).toBe('SKV 4700');
    expect(res.boxes).toHaveLength(15);
    expect(res.net_to_pay_cents).toBe(0);
    expect(res.verification.matches_box_49).toBe(true);
  });
});

describe('build_site_step (copilot) internal handler', () => {
  it('missing messages → fail-fast contract error', async () => {
    const res = await executeCopilotAction(stubDb(), {});
    expect(res).toEqual({ error: 'messages is required (a non-empty array of chat messages).' });
  });

  it('create_block tool call → legacy create_*_block mapping preserved', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '', tool_calls: [{ function: { name: 'create_block', arguments: JSON.stringify({ type: 'trust-bar', data: { title: 'x' } }) } }] } }] }),
    })));
    const res: any = await executeCopilotAction(stubDb(), { messages: [{ role: 'user', content: 'hi' }] });
    expect(res.toolCall).toEqual({ name: 'create_trust_bar_block', arguments: { title: 'x' } });
    expect(res.message).toMatch(/trust-bar section/);
  });

  it('AI 429 → same rate-limit message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429, text: async () => 'rl' })));
    const res = await executeCopilotAction(stubDb(), { messages: [{ role: 'user', content: 'hi' }] });
    expect(res).toEqual({ error: 'Rate limit exceeded. Please try again in a moment.' });
  });
});

describe('get_customer_360 internal handler', () => {
  it('no identifier → contract error', async () => {
    const res = await executeCustomer360(stubDb(), {});
    expect(res).toEqual({ error: 'Provide lead_id or email' });
  });

  it('email-only lookup → full envelope (identity/kpis/counts/timeline/raw) even with no data', async () => {
    const res: any = await executeCustomer360(stubDb({ data: null }), { email: 'ghost@acme.se' });
    expect(res.success).toBe(true);
    expect(res.identity.email).toBe('ghost@acme.se');
    expect(res.identity.lead_id).toBeNull();
    expect(Object.keys(res.counts)).toEqual(
      ['deals','orders','invoices','quotes','tickets','bookings','subscriptions','activities','chats','webinars','tasks'],
    );
    expect(res.timeline).toEqual([]);
    expect(res.kpis.lifetime_value).toBe(0);
  });
});
