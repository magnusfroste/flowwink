/**
 * The Content API's business data (orders, CRM, support, invoicing, media)
 * runs as the caller's own session, never as anon. It used to run as anon,
 * where every such query failed with "Unknown error" — and a public 60 s cache
 * header sat on the answer (2026-10-31).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync('supabase/functions/content-api/index.ts', 'utf8');

describe('content-api business data', () => {
  it('GraphQL gates business queries on a user session before the first one', () => {
    const gate = src.indexOf('if (!staff) return { errors: [{ message: BUSINESS_DATA_NEEDS_A_SESSION }] };');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(src.indexOf("// ============= Orders Queries ============="));
  });
  it('REST gates the same resources with a 401', () => {
    expect(src).toMatch(/\['orders', 'order', 'leads', 'lead', 'deals', 'companies', 'tickets', 'invoices', 'media'\]\.includes\(pathParts\[0\]/);
    expect(src).toMatch(/BUSINESS_DATA_NEEDS_A_SESSION \}\), \{ status: 401/);
  });
  it('only a JWT with role authenticated counts, and its answer is never cached publicly', () => {
    expect(src).toMatch(/return json\?\.role === 'authenticated';/);
    expect(src).toMatch(/'Cache-Control': staff \? 'private, no-store' : 'public, max-age=60'/);
  });
  it('reads the tables that exist', () => {
    expect(src).not.toMatch(/from\('support_tickets'\)|from\('media'\)/);
  });
});
