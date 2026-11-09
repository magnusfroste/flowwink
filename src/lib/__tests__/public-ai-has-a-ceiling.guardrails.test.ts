/**
 * The public AI endpoints have a ceiling (2026-11-09): every function that
 * answers a visitor with a paid model call asks publicAiLimit before the
 * model, and the counter is the service role's alone.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const PUBLIC_AI = ['chat-completion', 'docs-chat', 'consultant-match'];

describe('public AI has a ceiling', () => {
  for (const fn of PUBLIC_AI) {
    it(`${fn} asks the counter before anything else`, () => {
      const src = read(`supabase/functions/${fn}/index.ts`);
      const serve = src.search(/serve\(async \(req\)/);
      const ask = src.indexOf(`publicAiLimit(req, getServiceClient(), '${fn}', corsHeaders)`);
      expect(ask, `${fn}: call publicAiLimit right after OPTIONS`).toBeGreaterThan(serve);
      expect(src.slice(serve, ask)).not.toMatch(/await req\.json\(\)/);
    });
  }

  it('the counter is service-role only and every migration keeps it so', () => {
    const files = readdirSync(join(process.cwd(), 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
    const sql = files.map((f) => read(`supabase/migrations/${f}`)).join('\n');
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.public_ai_rate_check\([^)]*\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.public_rate_limits FROM PUBLIC, anon, authenticated/);
  });

  it('the platform is never counted and the address is never stored', () => {
    const helper = read('supabase/functions/_shared/rate-limit.ts');
    expect(helper).toMatch(/token === serviceKey\) return null/);
    expect(helper).toMatch(/p_visitor: await hashVisitor\(clientIp\(req\)\)/);
  });
});
