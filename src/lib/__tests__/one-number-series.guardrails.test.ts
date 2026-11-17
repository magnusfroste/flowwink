import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * One number series per document, whoever creates it (2026-11-17).
 *
 * Found by creating a quote by hand in the admin: it was numbered QUO-0001 on
 * an instance whose series stood at QUO-0033. The admin asked the database's
 * counter; every skill read "the highest number so far, plus one" from the
 * table and never told the counter. For invoices the two even wrote different
 * shapes (INV-0007 and INV-2026-00007).
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf-8');

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(root, dir))) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) files(rel, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}

describe('a quote or invoice number has one source', () => {
  it('no code builds a QUO- or INV- number itself — discovered, not listed', () => {
    // The shape of a home-made number: a template literal that starts the series' prefix.
    const homeMade = /`(QUO|INV)-\$\{/;
    const offenders = [...files('supabase/functions'), ...files('src')]
      .filter((f) => !f.includes('/__tests__/') && !f.startsWith('src/data/'))
      .filter((f) => read(f).split('\n').some((line) => homeMade.test(line) && !/^\s*(\/\/|\*)/.test(line)));
    expect(offenders, 'build the number with next_document_number (nextDocumentNumber in core.ts), never from the table').toEqual([]);
  });

  it('the skills ask the counter the admin asks', () => {
    const core = read('supabase/functions/_shared/execute/core.ts');
    expect(core).toMatch(/rpc\('next_document_number', \{ p_kind: kind, p_prefix: prefix \}\)/);
    expect(core.match(/nextDocumentNumber\(supabase, 'invoice', 'INV'\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(core.match(/nextDocumentNumber\(supabase, 'quote', 'QUO'\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(read('src/hooks/useQuotes.ts')).toMatch(/rpc\('next_document_number', \{ p_kind: 'quote', p_prefix: 'QUO' \}\)/);
    expect(read('src/hooks/useInvoices.ts')).toMatch(/rpc\('next_document_number', \{ p_kind: 'invoice', p_prefix: 'INV' \}\)/);
  });

  it('the counter is never behind the table, and invoices are numbered per year', () => {
    const sql = read('supabase/migrations/20261117180000_en-nummerserie-per-dokument.sql');
    expect(sql).toMatch(/greatest\(document_counters\.last_value, v_floor\) \+ 1/);
    expect(sql).toMatch(/v_key := 'invoice:' \|\| v_year/);
    expect(sql).toMatch(/to_char\(public\.platform_today\(\), 'YYYY'\)/);
    // Not for a visitor.
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.next_document_number\(text, text\) FROM anon/);
  });
});
