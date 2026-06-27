import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guardrail: the global supabase fetch wrapper must NOT inject the
 * `x-chat-session` header into edge-function calls.
 *
 * Background: `x-chat-session` is consumed by PostgREST/RLS on chat tables
 * (anonymous visitor reads). It is NOT consumed by any edge function. If the
 * global wrapper attaches it to `/functions/v1/*` requests, CORS preflight
 * fails on every edge function that doesn't list it in
 * Access-Control-Allow-Headers — which is most of them. This bug detonated
 * one function at a time as users exercised them (composio-proxy, newsletter).
 *
 * See: mem/ops/cors-x-chat-session.md
 */
describe('supabase client CORS guardrails', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/integrations/supabase/client.ts'),
    'utf8',
  );

  it('excludes /functions/v1/ from x-chat-session header injection', () => {
    expect(
      source,
      'Global fetch wrapper must skip x-chat-session injection on /functions/v1/ requests. Add an isFunctionCall check before setting the header.',
    ).toMatch(/\/functions\/v1\//);
    expect(source).toMatch(/isFunctionCall/);
  });

  it('still injects x-chat-session for PostgREST/RLS requests', () => {
    expect(source).toMatch(/x-chat-session/);
    expect(source).toMatch(/chat-session-id/);
  });
});
