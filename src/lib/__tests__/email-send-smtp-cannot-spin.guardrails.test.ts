import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Found 2026-11-07 on the first SMTP instance (Zoho): every send through
 * email-send died with HTTP 546 "CPU Time exceeded" and left no
 * outbound_communications row, so neither the failure nor the server's reply
 * was visible anywhere. denomailer 1.6.0 answers a rejected command with
 * `#cleanup()` — a NOOP and `while (true)` until a 250 — and once the server
 * has closed the socket every read is an instant null, so the worker spins
 * until Supabase kills it. Reproduced against a fake SMTP server that replies
 * 553 to MAIL FROM and hangs up.
 *
 * The scan covers every edge function, so a second mail sender cannot bring
 * the library back.
 */
const functionsDir = resolve(__dirname, '../../../supabase/functions');

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'node_modules' ? [] : tsFiles(p);
    return p.endsWith('.ts') ? [p] : [];
  });
}

describe('an SMTP rejection is logged, not spun on', () => {
  it('no edge function imports denomailer', () => {
    const offenders = tsFiles(functionsDir)
      .filter((f) => /from\s+["'][^"']*denomailer/.test(readFileSync(f, 'utf-8')))
      .map((f) => relative(functionsDir, f));
    expect(offenders).toEqual([]);
  });

  it('email-send bounds a quiet server with timeouts', () => {
    const src = readFileSync(join(functionsDir, 'email-send/index.ts'), 'utf-8');
    expect(src).toMatch(/from\s+"npm:nodemailer@/);
    for (const t of ['connectionTimeout', 'greetingTimeout', 'socketTimeout']) {
      expect(src).toContain(t);
    }
  });
});
