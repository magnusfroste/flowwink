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

describe('a person can do the quote by hand', () => {
  // Found by doing it in a browser as an admin (2026-11-17).
  const sheet = read('src/components/admin/quotes/QuoteDetailSheet.tsx');

  it('the editor writes what the customer page reads: title, introduction, terms', () => {
    for (const field of ['title', 'intro_text', 'terms_text']) {
      expect(sheet, field).toMatch(new RegExp(`${field}: \\w+\\.trim\\(\\) \\|\\| null`));
      expect(read('src/pages/PublicQuotePage.tsx'), field).toMatch(new RegExp(field));
    }
  });

  it('the line description has a row of its own', () => {
    const line = sheet.slice(sheet.indexOf('placeholder="Description"'), sheet.indexOf('placeholder="Qty"'));
    expect(line).toMatch(/className="basis-full"/);
  });

  it('the staff path runs in the night, in a browser', () => {
    expect(read('.github/workflows/fresh-install-nightly.yml')).toMatch(/run: npm run qa:staff-path/);
    expect(read('package.json')).toMatch(/"qa:staff-path": "bun run scripts\/staff-path\/index\.ts"/);
  });
});

describe('an invoice is born right whoever creates it', () => {
  // Found by creating one by hand in the admin (2026-11-18): no due date, no customer on the row.
  const sql = read('supabase/migrations/20261118090000_fakturan-fods-ratt-vem-som-an-skapar-den.sql');

  it('the rule is a trigger on the row, not a habit of one writer', () => {
    expect(sql).toMatch(/CREATE TRIGGER a_invoices_born_right\s+BEFORE INSERT OR UPDATE OF status ON public\.invoices/);
    expect(sql).toMatch(/NEW\.due_date := coalesce\(NEW\.issue_date, public\.platform_today\(\)\) \+ v_days/);
    expect(sql).toMatch(/NEW\.due_date IS NULL/);
    expect(sql).toMatch(/coalesce\(NEW\.invoice_type, 'invoice'\) = 'invoice'/);
  });

  it('the proof creates no customer of its own on an instance with history', () => {
    const proof = sql.slice(sql.indexOf('-- ── Proof'));
    expect(proof).not.toMatch(/INSERT INTO public\.leads/);
  });

  it('the invoice by hand is a step on the staff path', () => {
    expect(read('scripts/staff-path/index.ts')).toMatch(/\[quoteByHand, invoiceByHand, contactToDeal\]/);
  });
});

describe('a contact made by hand is where the person ends up', () => {
  it('the dialog opens the new contact instead of leaving it at the bottom of a score-ordered column', () => {
    const dialog = read('src/components/admin/CreateLeadDialog.tsx');
    expect(dialog).toMatch(/if \(!defaultCompanyId\) navigate\(`\/admin\/contacts\/\$\{newLead\.id\}`\)/);
  });
});

