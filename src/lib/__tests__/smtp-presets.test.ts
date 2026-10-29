import { describe, it, expect } from 'vitest';
import {
  SMTP_PRESETS,
  applySmtpPreset,
  matchSmtpPreset,
  smtpPresetById,
} from '../smtp-presets';

/**
 * The SMTP card asks "which server?" and fills the rest. These pin the facts a
 * preset carries, because a wrong port or username here is a 2026-10-29
 * evening of guessing for the next admin.
 */
describe('SMTP presets', () => {
  it('every preset names a port, a TLS mode and what the password is', () => {
    for (const p of SMTP_PRESETS) {
      expect(p.id).toMatch(/^[a-z]+$/);
      expect(p.port).toBeGreaterThan(0);
      expect(typeof p.secure).toBe('boolean');
      expect(p.passwordHint.length).toBeGreaterThan(20);
      // Implicit TLS is 465; STARTTLS is 587 (or 1025 for a local sink).
      if (p.secure) expect(p.port).toBe(465);
      else expect([587, 25, 1025]).toContain(p.port);
    }
  });

  it('Cloudflare: 465 implicit TLS, username is the literal api_token, password is a token', () => {
    const cf = smtpPresetById('cloudflare')!;
    expect(cf.host).toBe('smtp.mx.cloudflare.net');
    expect(cf.port).toBe(465);
    expect(cf.secure).toBe(true);
    expect(cf.user).toBe('api_token');
    expect(cf.passwordHint).toMatch(/Email Sending: Edit/);
    expect(cf.passwordOptional).toBeFalsy();
  });

  it('applying a preset replaces the server fields and keeps the From identity', () => {
    const next = applySmtpPreset(
      { host: 'old.example', port: 25, secure: false, user: 'me', fromEmail: 'info@nordbrygg.flowwink.com', fromName: 'Nordbrygg' },
      smtpPresetById('cloudflare')!,
    );
    expect(next).toMatchObject({
      host: 'smtp.mx.cloudflare.net', port: 465, secure: true, user: 'api_token',
      fromEmail: 'info@nordbrygg.flowwink.com', fromName: 'Nordbrygg',
    });
  });

  it('a preset without a fixed username keeps the one the admin typed', () => {
    const next = applySmtpPreset({ user: 'postmaster@mg.acme.se' }, smtpPresetById('mailgun')!);
    expect(next.user).toBe('postmaster@mg.acme.se');
  });

  it('matches a stored config back to its preset by host, and a hand-typed host to none', () => {
    expect(matchSmtpPreset({ host: 'SMTP.MX.CLOUDFLARE.NET' })?.id).toBe('cloudflare');
    expect(matchSmtpPreset({ host: 'mail.internal.acme.se' })).toBeNull();
    expect(matchSmtpPreset({ host: '' })).toBeNull();
    expect(matchSmtpPreset(undefined)).toBeNull();
  });
});
