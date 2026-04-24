/**
 * Guardrail tests for manage_deal auto-lead behaviour in agent-execute.
 *
 * Locks the contract that:
 *   1. When `lead_id` is provided → no lead is created; deal links to that lead.
 *   2. When `lead_id` is missing → a minimal placeholder lead is auto-created
 *      with an `auto.flowwink.local` synthetic email and `source='agent_deal'`.
 *   3. When `company_id` exists with an existing lead → that lead is reused.
 *   4. The response surfaces `auto_created_lead: boolean` so callers (and audit
 *      logs) can tell whether a placeholder was inserted.
 *
 * These tests reimplement the create-branch logic against an in-memory mock so
 * we can lock the behaviour without spinning up Deno/Supabase. If the edge
 * function logic changes, mirror it here.
 */
import { beforeEach, describe, expect, it } from 'vitest';

type Row = Record<string, unknown>;

interface MockState {
  leads: Row[];
  deals: Row[];
  companies: Row[];
}

let state: MockState;

function makeSupabase() {
  return {
    from(table: string) {
      const chain: any = {
        _table: table,
        _filters: [] as Array<{ col: string; op: string; val: unknown }>,
        _selectCols: '*',
        _orderBy: null as null | { col: string; ascending: boolean },
        _limit: null as null | number,
        _insertRows: null as null | Row[],
        select(cols: string) {
          chain._selectCols = cols;
          return chain;
        },
        eq(col: string, val: unknown) {
          chain._filters.push({ col, op: 'eq', val });
          return chain;
        },
        ilike(col: string, val: string) {
          chain._filters.push({ col, op: 'ilike', val });
          return chain;
        },
        order(col: string, opts: any) {
          chain._orderBy = { col, ascending: opts?.ascending ?? true };
          return chain;
        },
        limit(n: number) {
          chain._limit = n;
          return chain;
        },
        insert(rows: Row | Row[]) {
          chain._insertRows = Array.isArray(rows) ? rows : [rows];
          return chain;
        },
        async maybeSingle() {
          const rows = runQuery(chain, state);
          return { data: rows[0] ?? null, error: null };
        },
        async single() {
          if (chain._insertRows) {
            const inserted = chain._insertRows.map((r) => ({
              id: `gen-${Math.random().toString(36).slice(2, 10)}`,
              ...r,
            }));
            (state as any)[table].push(...inserted);
            return { data: inserted[0], error: null };
          }
          const rows = runQuery(chain, state);
          if (!rows[0]) return { data: null, error: { message: 'not found' } };
          return { data: rows[0], error: null };
        },
      };
      return chain;
    },
  };
}

function runQuery(chain: any, st: MockState): Row[] {
  let rows: Row[] = [...((st as any)[chain._table] ?? [])];
  for (const f of chain._filters) {
    if (f.op === 'eq') rows = rows.filter((r) => r[f.col] === f.val);
    if (f.op === 'ilike') {
      const needle = String(f.val).replace(/%/g, '').toLowerCase();
      rows = rows.filter((r) => String(r[f.col] ?? '').toLowerCase().includes(needle));
    }
  }
  if (chain._orderBy) {
    const { col, ascending } = chain._orderBy;
    rows.sort((a, b) => {
      const va = a[col] as any, vb = b[col] as any;
      if (va === vb) return 0;
      return (va > vb ? 1 : -1) * (ascending ? 1 : -1);
    });
  }
  if (chain._limit) rows = rows.slice(0, chain._limit);
  return rows;
}

/**
 * Mirror of executeDealsAction's `create` branch — keep in sync with
 * supabase/functions/agent-execute/index.ts.
 */
async function createDeal(supabase: any, args: any) {
  const {
    value_cents = 0, currency = 'SEK', stage = 'proposal',
    product_id, expected_close, notes,
    company_id, company_name, lead_name, lead_email,
  } = args;
  let { lead_id } = args;
  let auto_created_lead = false;

  if (!lead_id) {
    let resolvedCompanyId: string | null = company_id || null;
    let resolvedCompanyName: string | null = company_name || null;
    if (!resolvedCompanyId && company_name) {
      const { data: comp } = await supabase
        .from('companies').select('id, name').ilike('name', `%${company_name}%`).limit(1).maybeSingle();
      if (comp) { resolvedCompanyId = comp.id; resolvedCompanyName = comp.name; }
    }
    if (resolvedCompanyId) {
      const { data: existing } = await supabase
        .from('leads').select('id').eq('company_id', resolvedCompanyId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (existing) lead_id = existing.id;
    }
    if (!lead_id) {
      const baseName = lead_name || resolvedCompanyName || 'Auto-generated lead';
      const safeSlug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lead';
      const fallbackEmail = lead_email || `deal-${safeSlug}-${Date.now()}@auto.flowwink.local`;
      const { data: newLead } = await supabase
        .from('leads').insert({
          name: baseName, email: fallbackEmail, company_id: resolvedCompanyId,
          source: 'agent_deal', status: 'opportunity',
        }).select('id').single();
      lead_id = newLead.id;
      auto_created_lead = true;
    }
  }

  const { data } = await supabase.from('deals').insert({
    value_cents, currency, stage, lead_id, product_id, expected_close, notes,
  }).select('id, stage, value_cents, lead_id').single();
  return { deal_id: data.id, stage: data.stage, value_cents: data.value_cents, lead_id: data.lead_id, auto_created_lead };
}

beforeEach(() => {
  state = { leads: [], deals: [], companies: [] };
});

describe('manage_deal auto-lead behaviour', () => {
  it('uses provided lead_id without creating a new lead', async () => {
    state.leads.push({ id: 'lead-existing', name: 'John', email: 'j@x.com' });
    const supabase = makeSupabase();
    const res = await createDeal(supabase, {
      lead_id: 'lead-existing', value_cents: 150000, stage: 'proposal',
    });
    expect(res.lead_id).toBe('lead-existing');
    expect(res.auto_created_lead).toBe(false);
    expect(state.leads).toHaveLength(1);
    expect(state.deals).toHaveLength(1);
  });

  it('auto-creates a minimal lead when lead_id is missing entirely', async () => {
    const supabase = makeSupabase();
    const res = await createDeal(supabase, { value_cents: 50000 });
    expect(res.auto_created_lead).toBe(true);
    expect(state.leads).toHaveLength(1);
    const lead = state.leads[0] as any;
    expect(lead.source).toBe('agent_deal');
    expect(lead.status).toBe('opportunity');
    expect(lead.email).toMatch(/@auto\.flowwink\.local$/);
    expect(res.lead_id).toBe(lead.id);
  });

  it('uses lead_name and lead_email when provided', async () => {
    const supabase = makeSupabase();
    const res = await createDeal(supabase, {
      value_cents: 250000, lead_name: 'Acme CTO', lead_email: 'cto@acme.test',
    });
    expect(res.auto_created_lead).toBe(true);
    const lead = state.leads[0] as any;
    expect(lead.name).toBe('Acme CTO');
    expect(lead.email).toBe('cto@acme.test');
  });

  it('reuses an existing lead for the resolved company', async () => {
    state.companies.push({ id: 'co-1', name: 'Northwind' });
    state.leads.push({
      id: 'lead-northwind', company_id: 'co-1', name: 'CFO',
      email: 'cfo@nw.com', created_at: '2025-01-01',
    });
    const supabase = makeSupabase();
    const res = await createDeal(supabase, { value_cents: 99000, company_id: 'co-1' });
    expect(res.lead_id).toBe('lead-northwind');
    expect(res.auto_created_lead).toBe(false);
    expect(state.leads).toHaveLength(1);
  });

  it('resolves company by name and creates an anchored lead when none exists', async () => {
    state.companies.push({ id: 'co-2', name: 'Globex Inc' });
    const supabase = makeSupabase();
    const res = await createDeal(supabase, { value_cents: 75000, company_name: 'Globex' });
    expect(res.auto_created_lead).toBe(true);
    expect(state.leads).toHaveLength(1);
    const lead = state.leads[0] as any;
    expect(lead.company_id).toBe('co-2');
    expect(lead.name).toBe('Globex Inc');
  });

  it('returns auto_created_lead flag in every response shape', async () => {
    state.leads.push({ id: 'l1', email: 'a@b.c' });
    const supabase = makeSupabase();
    const withId = await createDeal(supabase, { lead_id: 'l1', value_cents: 1 });
    const withoutId = await createDeal(supabase, { value_cents: 2 });
    expect(withId).toHaveProperty('auto_created_lead', false);
    expect(withoutId).toHaveProperty('auto_created_lead', true);
  });
});
