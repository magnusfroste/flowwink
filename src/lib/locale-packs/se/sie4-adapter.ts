/**
 * SIE 4 export adapter (Swedish standard).
 * SIE = Standard Import Export, the de facto file format used by Swedish
 * accounting software, auditors and Skatteverket for system handoff.
 * Spec: https://sie.se/format/
 *
 * SIE 4 is the "complete" variant containing chart, balances and all journal
 * entries. Encoded as Latin-1 (CP437) historically, but most modern tools
 * accept UTF-8 — we emit UTF-8 since browser downloads are UTF-8 native.
 */
import type { AccountingExportAdapter, AccountingExportPayload, AccountingExportOptions } from '../types';

function fmtAmount(cents: number): string {
  // SIE expects amounts as decimal with dot, e.g. 1234.56
  return (cents / 100).toFixed(2);
}

function fmtDate(iso: string): string {
  // SIE uses YYYYMMDD
  return iso.replace(/-/g, '').slice(0, 8);
}

function quote(s: string | null | undefined): string {
  return `"${(s ?? '').replace(/"/g, '\\"')}"`;
}

function inDateRange(date: string, from?: string, to?: string): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function generate(payload: AccountingExportPayload, opts: AccountingExportOptions = {}): string {
  const lines: string[] = [];
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const program = opts.generated_by ?? 'FlowWink';

  // Header
  lines.push('#FLAGGA 0');
  lines.push(`#PROGRAM ${quote(program)} ${quote('1.0')}`);
  lines.push('#FORMAT PC8');
  lines.push(`#GEN ${today}`);
  lines.push('#SIETYP 4');
  lines.push(`#FNAMN ${quote(payload.company.name)}`);
  if (payload.company.org_number) {
    lines.push(`#ORGNR ${quote(payload.company.org_number)}`);
  }
  lines.push(`#VALUTA ${quote(payload.company.currency)}`);
  lines.push(
    `#RAR 0 ${fmtDate(payload.fiscal_year.start)} ${fmtDate(payload.fiscal_year.end)}`,
  );

  // Chart of accounts
  for (const acc of payload.chart) {
    lines.push(`#KONTO ${acc.account_code} ${quote(acc.account_name)}`);
    const sieType =
      acc.account_type === 'asset' ? 'T'
      : acc.account_type === 'liability' || acc.account_type === 'equity' ? 'S'
      : acc.account_type === 'income' ? 'I'
      : 'K';
    lines.push(`#KTYP ${acc.account_code} ${sieType}`);
  }

  // Opening balances
  if (payload.opening_balances) {
    for (const ob of payload.opening_balances) {
      lines.push(`#IB 0 ${ob.account_code} ${fmtAmount(ob.balance_cents)}`);
    }
  }

  // Verifications (#VER + #TRANS lines)
  let serial = 1;
  for (const entry of payload.entries) {
    if (!inDateRange(entry.entry_date, opts.date_from, opts.date_to)) continue;
    const verNo = entry.entry_number ?? serial++;
    lines.push(`#VER A ${verNo} ${fmtDate(entry.entry_date)} ${quote(entry.description)}`);
    lines.push('{');
    for (const ln of entry.lines) {
      const amount = ln.debit_cents > 0 ? ln.debit_cents : -ln.credit_cents;
      const text = ln.description ? ` ${quote(ln.description)}` : '';
      lines.push(`   #TRANS ${ln.account_code} {} ${fmtAmount(amount)}${text}`);
    }
    lines.push('}');
  }

  return lines.join('\r\n') + '\r\n';
}

export const sie4Adapter: AccountingExportAdapter = {
  id: 'sie4',
  label: 'SIE 4 (Sweden)',
  description: 'Standard Import Export — Swedish standard for auditor handoff and system migration.',
  extension: 'se',
  mime: 'text/plain',
  purpose: 'auditor_handoff',
  generate,
};
