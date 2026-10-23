import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Security sweep 2026-10-22, the hygiene half.
 *
 * www and sandbox answered with HSTS alone — the Docker nginx has set
 * X-Content-Type-Options, X-Frame-Options and Referrer-Policy since day one,
 * Vercel set none of them. And capture_chat_lead, an anon RPC, answered
 * `is_new`: an oracle for "is this email already in the CRM?".
 */
const root = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');
const REQUIRED = ['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Permissions-Policy'];

describe('every Vercel response carries the browser-hardening headers', () => {
  it('vercel.json sets them on a continue route before everything else', () => {
    const cfg = JSON.parse(read('vercel.json')) as { routes: Array<{ src?: string; headers?: Record<string, string>; continue?: boolean }> };
    const first = cfg.routes[0];
    expect(first.src).toBe('/(.*)');
    expect(first.continue).toBe(true);
    for (const h of REQUIRED) expect(first.headers?.[h], h).toBeTruthy();
    expect(first.headers?.['Permissions-Policy']).toMatch(/camera=\(self\)/); // WebMeet needs the camera
  });
  it('the HTML handler sets the same four on the documents it builds', () => {
    const src = read('api/html.ts');
    for (const h of REQUIRED.map((h) => h.toLowerCase())) expect(src).toContain(`'${h}'`);
    expect(src).toMatch(/\.\.\.SECURITY_HEADERS,/);
  });
});

describe('capture_chat_lead tells an anonymous caller nothing but success', () => {
  it('the latest definition narrows the return for anon', () => {
    const sql = read('supabase/migrations/20261022020000_chattens-leadfangst-sager-bara-tack.sql');
    expect(sql).toMatch(/IF auth\.role\(\) IS DISTINCT FROM 'service_role' AND auth\.uid\(\) IS NULL THEN\s*RETURN jsonb_build_object\('success', true\);/);
  });
  it('has one signature — two overloads made PostgREST answer 300 to the widget', () => {
    expect(read('supabase/migrations/20261022030000_chattens-leadfangst-en-signatur.sql')).toMatch(/DROP FUNCTION IF EXISTS public\.capture_chat_lead\(text, uuid, text\);/);
  });
  it('the widget reads only success', () => {
    const widget = read('src/components/chat/ChatLeadCapture.tsx');
    expect(widget).not.toMatch(/\bis_new\b|\blead_id\b/);
  });
});

describe('no instance default in the tree', () => {
  it('the process simulation script requires its key from the environment', () => {
    const src = read('test-process-simulation.js');
    expect(src).not.toMatch(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\./);
    expect(src).toMatch(/if \(!SUPABASE_KEY\)/);
  });
});
