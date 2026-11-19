import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrail: the core customer mails exist in Swedish (2026-11-19).
 *
 * A live instance whose site language is Swedish had the invoice, the quote,
 * the agreement, their reminders and the booking confirmation in English only,
 * so the template ladder landed on English for a Swedish customer. The seed
 * must carry the same placeholders as the English mail — a variable the code
 * fills and the template lacks is a figure the customer never sees.
 */
const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261119200000_karnmejlen-finns-pa-svenska.sql'), 'utf-8');
const KINDS = ['booking_confirmation', 'quote_email', 'quote_reminder', 'contract_email', 'contract_reminder', 'invoice_email', 'invoice_reminder', 'order_confirmation'];

function seed(kind: string): { html: string; vars: string[] } {
  const at = sql.indexOf(`SELECT '${kind}', 'sv',`);
  expect(at, kind).toBeGreaterThan(-1);
  const block = sql.slice(at, sql.indexOf('WHERE NOT EXISTS', at));
  const html = block.slice(block.indexOf('$tpl$') + 5, block.lastIndexOf('$tpl$'));
  const vars = JSON.parse(block.slice(block.indexOf('$var$') + 5, block.lastIndexOf('$var$'))) as string[];
  return { html, vars };
}

describe('the core customer mails exist in Swedish', () => {
  it.each(KINDS)('%s is seeded as sv, only where it is missing', (kind) => {
    const at = sql.indexOf(`SELECT '${kind}', 'sv',`);
    const end = sql.indexOf(';', sql.indexOf('WHERE NOT EXISTS', at));
    expect(sql.slice(at, end)).toMatch(new RegExp(`WHERE NOT EXISTS \\(SELECT 1 FROM public\\.email_templates WHERE name = '${kind}' AND locale = 'sv'\\)`));
  });

  it.each(KINDS)('%s uses every variable it declares, and no English sentence is left', (kind) => {
    const { html, vars } = seed(kind);
    for (const v of vars) {
      // site_name may live in the shell the router wraps a fragment in.
      if (v === 'site_name') continue;
      expect(html, `${kind} never prints {{${v}}}`).toMatch(new RegExp(`\\{\\{[#/]?${v}\\}\\}`));
    }
    const visible = html.replace(/<[^>]+>/g, ' ').replace(/\{\{[^}]+\}\}/g, ' ');
    expect(visible, kind).not.toMatch(/\b(Please|Thank you|Hello|Reminder|Invoice|Quote|Agreement|Subtotal|Amount|Your)\b/);
  });

  it('never rewrites an English row or an instance\'s own Swedish one', () => {
    expect(sql).not.toMatch(/UPDATE public\.email_templates/);
    expect(sql).not.toMatch(/DELETE FROM public\.email_templates/);
  });
});
