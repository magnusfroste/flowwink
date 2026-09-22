import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Edge-surface refactor B1a, wave 1 — six CRM/sales/FX skills edge→internal.
 * Pins response contracts + the auth-semantics delta in sales_profile_setup.
 */
import { executeFetchFxRates, parseEcbXml } from '../../../supabase/functions/_shared/handlers/fetch-fx-rates.ts';
import { executeQualifyLead } from '../../../supabase/functions/_shared/handlers/qualify-lead.ts';
import { executeEnrichCompany } from '../../../supabase/functions/_shared/handlers/enrich-company.ts';
import { executeProspectFitAnalysis } from '../../../supabase/functions/_shared/handlers/prospect-fit-analysis.ts';
import { executeSalesProfileSetup } from '../../../supabase/functions/_shared/handlers/sales-profile-setup.ts';
import { executeProspectResearch } from '../../../supabase/functions/_shared/handlers/prospect-research.ts';
import { loadSalesContext } from '../../../supabase/functions/_shared/sales-context.ts';

const ctx = { supabaseUrl: 'http://local', serviceKey: 'sk', callerUserId: null as string | null };

beforeEach(() => {
  (globalThis as any).Deno = { env: { get: () => undefined } };
});
afterEach(() => {
  delete (globalThis as any).Deno;
  vi.unstubAllGlobals();
});

/** Chainable supabase stub resolving every query to `result`. */
function stubDb(result: { data?: any; error?: any } = { data: null }) {
  const q: any = {};
  for (const m of ['select', 'insert', 'update', 'upsert', 'eq', 'ilike', 'order', 'limit']) q[m] = vi.fn(() => q);
  q.then = (res: any, rej: any) => Promise.resolve(result).then(res, rej);
  q.single = vi.fn(() => Promise.resolve(result));
  q.maybeSingle = vi.fn(() => Promise.resolve(result));
  return { from: vi.fn(() => q), _q: q } as any;
}

describe('fetch_ecb_rates internal handler', () => {
  it('parses ECB XML with both quote styles', () => {
    const xml = `<Cube time='2026-07-17'><Cube currency='USD' rate='1.09'/><Cube currency="SEK" rate="11.2"/></Cube>`;
    const { date, rates } = parseEcbXml(xml);
    expect(date).toBe('2026-07-17');
    expect(rates).toEqual([{ currency: 'USD', rate: 1.09 }, { currency: 'SEK', rate: 11.2 }]);
  });

  it('ECB HTTP error → { success: false, error: "ECB <status>" } (edge parity)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })));
    const res = await executeFetchFxRates(stubDb());
    expect(res).toEqual({ success: false, error: 'ECB 503' });
  });

  it('happy path → upserts EUR + cross rates from SEK base, same summary shape', async () => {
    const xml = `<Cube time='2026-07-17'><Cube currency='USD' rate='1.0'/><Cube currency='SEK' rate='10.0'/></Cube>`;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => xml })));
    const db = stubDb({ data: [{ code: 'USD' }, { code: 'SEK' }, { code: 'EUR' }], error: null });
    // base-currency query uses maybeSingle → SEK
    db._q.maybeSingle = vi.fn(() => Promise.resolve({ data: { code: 'SEK' } }));
    const res = await executeFetchFxRates(db);
    expect(res).toMatchObject({ success: true, rate_date: '2026-07-17', base_currency: 'SEK', source: 'ecb' });
    // EUR→USD, EUR→SEK, SEK→EUR, SEK→USD
    expect(res.rows_upserted).toBe(4);
  });
});

describe('qualify_lead internal handler', () => {
  it('missing id → sweep mode over pending leads, not an error', async () => {
    // The contract changed on purpose: no id no longer rejects — it sweeps
    // leads where ai_qualified_at is null. Browser-side qualification never
    // ran for actual visitors (internal skill, anon key), so the scheduled
    // sweep is the path that makes form leads get scored at all.
    const db = stubDb({ data: [] });
    (db._q as any).is = vi.fn(() => db._q);
    const res = await executeQualifyLead(db, {}, ctx);
    // work_done: 0 is the declared idle signal — a scheduled sweep that found
    // nothing leaves no agent_activity row (see the work-done contract).
    expect(res).toEqual({ swept: 0, work_done: 0, message: 'No unqualified leads.' });
  });

  it('accepts snake_case lead_id (MCP-agent alias) and reports not-found', async () => {
    const db = stubDb({ data: null, error: { message: 'nope' } });
    const res = await executeQualifyLead(db, { lead_id: 'x' }, ctx);
    expect(res).toEqual({ error: 'Lead not found' });
  });
});

describe('enrich_company internal handler', () => {
  it('no domain and no companyId → validation error', async () => {
    const res = await executeEnrichCompany(stubDb(), {}, ctx);
    expect(res).toEqual({ error: 'Domain or companyId is required' });
  });

  it('COMPLETE enrichment (industry/size/web_summary present) → skips', async () => {
    const db = stubDb({ data: { id: 'c1', domain: 'a.se', enriched_at: '2026-01-01', industry: 'Legal' }, error: null });
    const res = await executeEnrichCompany(db, { companyId: 'c1' }, ctx);
    expect(res).toMatchObject({ success: true, skipped: true });
  });

  it('enriched_at stamped but NO firmographics → proceeds past the guard', async () => {
    // The seam Magnus hit live: prospect_research stamped enriched_at without
    // ever filling industry/size, and the Enrich button answered every press
    // with a silent "Already enriched". An incomplete enrichment must re-run.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, text: async () => 'scrape down' })));
    const db = stubDb({ data: { id: 'c1', domain: 'a.se', enriched_at: '2026-01-01' }, error: null });
    const res = await executeEnrichCompany(db, { companyId: 'c1' }, ctx);
    // Reaching the scrape (and failing on our stub) proves the skip-guard let it through.
    expect(res).toMatchObject({ error: 'Failed to scrape website' });
  });
});

describe('loadSalesContext (the our_context loader)', () => {
  it('survives Tiptap DOC OBJECTS in page blocks — the optic incident', async () => {
    // Four Tiptap text blocks on optic threw TypeError in the old
    // `(content as string).replace(...)`, which killed the whole context load:
    // every fit analysis ran with our_context null ("ICP undefined") while the
    // ICP sat in site_settings. Doc objects and strings must both survive.
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Fiber i tunnlar' }] }] };
    const pages = [{ title: 'Home', slug: 'home', content_json: [
      { type: 'text', data: { content: doc } },
      { type: 'text', data: { content: '<p>HTML-sträng</p>' } },
      { type: 'hero', data: { title: 'Optic Tunnels', subtitle: doc } },
    ], meta_json: {} }];
    const settings = [{ key: 'company_profile', value: { company_name: 'Optic Tunnels', icp: 'Vård, försvar, bank' } }];

    const q = (result: unknown) => {
      const chain: any = {};
      for (const m of ['select', 'eq', 'in', 'order', 'limit']) chain[m] = () => chain;
      chain.maybeSingle = () => Promise.resolve({ data: null });
      chain.then = (res: any, rej: any) => Promise.resolve({ data: result }).then(res, rej);
      return chain;
    };
    const db: any = { from: (table: string) => q(table === 'pages' ? pages : table === 'site_settings' ? settings : []) };

    const ctx = await loadSalesContext(db, { includePages: true });
    expect(ctx.companyProfile.icp).toBe('Vård, försvar, bank');
    expect(ctx.pagesSummary).toContain('Fiber i tunnlar');
    expect(ctx.pagesSummary).toContain('HTML-sträng');
    expect(ctx.formatted).toContain('Ideal Customer Profile');
  });
});

describe('prospect_fit_analysis internal handler', () => {
  it('no identifier → validation error', async () => {
    const res = await executeProspectFitAnalysis(stubDb(), {});
    expect(res).toEqual({ error: 'company_id or company_name is required' });
  });

  it('unknown company → Not-found note + empty completeness (edge parity)', async () => {
    const res = await executeProspectFitAnalysis(stubDb({ data: null }), { company_name: 'Ghost AB' });
    expect(res.success).toBe(true);
    expect(res.company).toEqual({ name: 'Ghost AB', note: 'Not found in CRM' });
    expect((res.data_completeness as any).lead_count).toBe(0);
  });
});

describe('sales_profile_setup internal handler — auth semantics', () => {
  it('type user WITHOUT resolved caller → same 401-message as the edge function gave agents', async () => {
    const res = await executeSalesProfileSetup(stubDb(), { type: 'user', data: { icp: 'x' } }, { ...ctx, callerUserId: null });
    expect(res).toEqual({ error: 'Authentication required for user profile' });
  });

  it('type user WITH resolved caller → saves under that user id', async () => {
    const db = stubDb({ data: { id: 'p1' }, error: null });
    const res = await executeSalesProfileSetup(db, { type: 'user', data: { icp: 'x' } }, { ...ctx, callerUserId: 'u1' });
    expect(res).toMatchObject({ success: true, message: 'user profile saved successfully' });
    expect(db._q.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'user', user_id: 'u1' }),
      { onConflict: 'type,user_id' },
    );
  });

  it('flat payload (no data wrapper) is accepted — MCP/FlowChat tolerance kept', async () => {
    const db = stubDb({ data: { id: 'p2' }, error: null });
    const res = await executeSalesProfileSetup(
      db,
      { type: 'user', title: 'AE', personal_pitch: 'v' },
      { ...ctx, callerUserId: 'u1' },
    );
    expect(res).toMatchObject({ success: true });
    expect(db._q.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ data: { title: 'AE', personal_pitch: 'v' } }),
      expect.anything(),
    );
  });

  it('type company is REFUSED and points at Business Identity — it wrote a row nobody reads', async () => {
    const db = stubDb({ data: { id: 'p3' }, error: null });
    const res = await executeSalesProfileSetup(db, { type: 'company', data: { icp: 'SMBs' } }, ctx);
    expect(res).toMatchObject({ wrote_nothing: true });
    expect(String(res.error)).toContain('company_profile');
    // The point of refusing: nothing may be written on this path.
    expect(db._q.upsert).not.toHaveBeenCalled();
  });

  it('bad type → exact validation message', async () => {
    const res = await executeSalesProfileSetup(stubDb(), { type: 'x' }, ctx);
    expect(res).toEqual({ error: 'type must be "company" or "user"' });
  });
});

describe('prospect_research internal handler', () => {
  it('company_name required', async () => {
    const res = await executeProspectResearch(stubDb(), {}, ctx);
    expect(res).toEqual({ error: 'company_name is required' });
  });

  it('degrades gracefully when search/scrape fail — contact-finder is a LIBRARY call, no HTTP hop', async () => {
    // web-search + web-scrape (HTTP) fail; the handler must still persist the
    // company and return the ResearchResult shape.
    const fetchSpy = vi.fn(async () => ({ ok: false, text: async () => 'down' }));
    vi.stubGlobal('fetch', fetchSpy);
    const db = stubDb({ data: { id: 'co1' }, error: null });
    const res = await executeProspectResearch(db, { company_name: 'ACME' }, ctx);
    expect(res).toMatchObject({ success: true, company: { id: 'co1', name: 'ACME' } });
    expect((res as any).data_sources).toEqual({ search: false, scrape: false, contacts: false });
    // Only the two HTTP utility calls — proves contact-finder wasn't fetched over HTTP
    const urls = fetchSpy.mock.calls.map((c: any[]) => String(c[0]));
    expect(urls.every((u: string) => u.includes('web-search') || u.includes('web-scrape'))).toBe(true);
  });
});

describe('approve_content_campaign fan-out', () => {
  it('materializes linkedin + blog variants and stamps approval', async () => {
    const proposal = {
      id: 'prop-1', status: 'pending_review', featured_image: 'https://img/x.png',
      scheduled_for: '2026-08-20T09:00:00Z',
      channel_variants: {
        linkedin: { text: 'Hello LinkedIn', hashtags: ['flowwink'] },
        blog: { title: 'Vår resa', excerpt: 'kort', body: 'Stycke ett.\n\nStycke två.', seo_keywords: ['bos'] },
        print: {},
      },
    };
    const inserted: Record<string, any[]> = { social_posts: [], blog_posts: [] };
    const updates: any[] = [];
    const db: any = {
      from(table: string) {
        const chain: any = {
          select: () => chain, eq: () => chain, maybeSingle: () =>
            Promise.resolve({ data: table === 'content_proposals' ? proposal : null }),
          insert: (row: any) => {
            inserted[table]?.push(row);
            return { select: () => ({ single: () => Promise.resolve({ data: { id: `${table}-id`, status: row.status } }) }) };
          },
          update: (row: any) => { updates.push({ table, row }); return { eq: () => Promise.resolve({ error: null }) }; },
        };
        return chain;
      },
    };
    const { executeApproveCampaign } = await import('../../../supabase/functions/_shared/handlers/campaign-fanout.ts');
    const res = await executeApproveCampaign(db, { proposal_id: 'prop-1' }, ctx as any);
    expect(res.success).toBe(true);
    expect(inserted.social_posts).toHaveLength(1);
    expect(inserted.social_posts[0]).toMatchObject({
      channel: 'linkedin', campaign_id: 'prop-1', status: 'scheduled',
      media_url: 'https://img/x.png', scheduled_at: '2026-08-20T09:00:00Z',
    });
    expect(inserted.social_posts[0].content).toContain('#flowwink');
    expect(inserted.blog_posts[0]).toMatchObject({ slug: 'var-resa', status: 'draft' });
    expect(inserted.blog_posts[0].content_json.content).toHaveLength(2);
    expect((res.skipped as any[]).some((s) => s.channel === 'print')).toBe(true);
    expect(updates.some((u) => u.table === 'content_proposals' && u.row.status === 'approved')).toBe(true);
  });
});
