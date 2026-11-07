import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Found 2026-11-07 on LiteIT (Zoho SMTP, sender order@liteit.se on the SMTP
 * card): the order confirmation failed with "550 5.7.1 Sender is not allowed
 * to relay emails". comms-send's order, booking and calendar mails read the
 * Resend card's emailConfig, fell back to `onboarding@resend.dev`, and passed
 * it as a fromOverride, which beats every sender the operator configured. The
 * daily briefing did the same with `flowpilot@flowwink.com`.
 *
 * The sender is email-send's to choose (chooseSender: carrier card, Email page,
 * SMTP_FROM, the caller's `fallbackFrom`, placeholder). A system mail may hint
 * a fallback; it may not override. The scan covers every edge function.
 */
const functionsDir = resolve(__dirname, '../../../supabase/functions');
const SENDER_OWNERS = new Set(['email-send/index.ts', '_shared/email/provider-choice.ts']);

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'node_modules' ? [] : tsFiles(p);
    return p.endsWith('.ts') ? [p] : [];
  });
}

const files = tsFiles(functionsDir).map((f) => ({ rel: relative(functionsDir, f), src: readFileSync(f, 'utf-8') }));

describe('a system mail never overrides the configured sender', () => {
  it("no edge function falls back to Resend's test sender", () => {
    expect(files.filter((f) => f.src.includes('resend.dev')).map((f) => f.rel)).toEqual([]);
  });

  it('no edge function turns the Email page sender into a fromOverride', () => {
    const offenders = files
      .filter((f) => !SENDER_OWNERS.has(f.rel))
      .filter((f) => /emailConfig/.test(f.src) && /fromOverride\s*:/.test(f.src))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('a flowwink.com address reaches email-send only as a fallback', () => {
    const offenders = files
      .filter((f) => !SENDER_OWNERS.has(f.rel))
      .filter((f) => /@flowwink\.com>/.test(f.src) && /fromOverride\s*:/.test(f.src))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });
});
