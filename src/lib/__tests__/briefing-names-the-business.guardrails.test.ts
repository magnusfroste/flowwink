/**
 * The daily briefing names the business it is about. Every instance's admins
 * got the same anonymous "FLOWPILOT · DAILY BRIEFING" mail — with several
 * instances in one inbox nothing said which company it concerned (Magnus,
 * 2026-10-30). The company leads (name, logo, colour, address — the same
 * email-shell branding every other mail uses); FlowPilot and FlowWink sign it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync('supabase/functions/flowpilot-lifecycle/briefing.ts', 'utf8');

describe('the daily briefing names the business', () => {
  it('reads the site branding the shared email shell reads', () => {
    expect(src).toMatch(/import \{ loadEmailShell, type EmailShell \} from "\.\.\/_shared\/email-shell\.ts"/);
    expect(src).toMatch(/const brand: EmailShell \| null = await loadEmailShell\(supabase\)\.catch/);
  });

  it('the subject and the From name start with the company', () => {
    expect(src).toMatch(/subject: `\$\{healthEmoji\} \$\{orgName \? `\$\{orgName\} — ` : ""\}\$\{title\}/);
    expect(src).toMatch(/\$\{orgName \? `\$\{orgName\} · FlowPilot` : "FlowPilot"\} <flowpilot@flowwink\.com>/);
  });

  it('the header carries the logo or the name, and the platform signs the footer', () => {
    expect(src).toMatch(/const headerBrand = brand\?\.logoUrl/);
    expect(src).toMatch(/Powered by <strong>FlowPilot<\/strong>, the autonomous operator on the <strong>FlowWink<\/strong> platform/);
    expect(src).not.toMatch(/Your autonomous business co-pilot/);
  });

  it('branding is decoration: a settings hiccup never stops the briefing', () => {
    expect(src).toMatch(/branding unavailable — the mail goes out unbranded/);
  });
});
