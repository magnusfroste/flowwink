/**
 * Generic accounting export adapters.
 *
 * - OECD SAF-T (Standard Audit File for Tax): International XML baseline
 *   used by tax authorities in Norway, Portugal, France (FEC variant),
 *   Poland, Lithuania and others. We emit a minimal subset that's valid
 *   for system migration / general audit handoff.
 * - Generic CSV: One row per journal line — universally readable in Excel,
 *   QuickBooks, Xero, Sage import wizards.
 */
import type { AccountingExportAdapter, AccountingExportPayload, AccountingExportOptions } from '../types';

function inDateRange(date: string, from?: string, to?: string): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function xmlEscape(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[,"\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function generateSaftOecd(payload: AccountingExportPayload, opts: AccountingExportOptions = {}): string {
  const today = new Date().toISOString().slice(0, 10);
  const program = opts.generated_by ?? 'FlowWink';
  const out: string[] = [];

  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push('<AuditFile xmlns="urn:OECD:StandardAuditFile-Tax:1.0">');
  out.push('  <Header>');
  out.push('    <AuditFileVersion>1.0</AuditFileVersion>');
  out.push(`    <CompanyName>${xmlEscape(payload.company.name)}</CompanyName>`);
  if (payload.company.org_number) {
    out.push(`    <TaxRegistrationNumber>${xmlEscape(payload.company.org_number)}</TaxRegistrationNumber>`);
  }
  out.push(`    <DefaultCurrencyCode>${xmlEscape(payload.company.currency)}</DefaultCurrencyCode>`);
  out.push(`    <FiscalYearStartDate>${payload.fiscal_year.start}</FiscalYearStartDate>`);
  out.push(`    <FiscalYearEndDate>${payload.fiscal_year.end}</FiscalYearEndDate>`);
  out.push(`    <DateCreated>${today}</DateCreated>`);
  out.push(`    <ProductID>${xmlEscape(program)}</ProductID>`);
  out.push('  </Header>');

  // MasterFiles — chart of accounts
  out.push('  <MasterFiles>');
  out.push('    <GeneralLedgerAccounts>');
  for (const acc of payload.chart) {
    out.push('      <Account>');
    out.push(`        <AccountID>${xmlEscape(acc.account_code)}</AccountID>`);
    out.push(`        <AccountDescription>${xmlEscape(acc.account_name)}</AccountDescription>`);
    out.push(`        <AccountType>${xmlEscape(acc.account_type)}</AccountType>`);
    out.push('      </Account>');
  }
  out.push('    </GeneralLedgerAccounts>');
  out.push('  </MasterFiles>');

  // GeneralLedgerEntries
  out.push('  <GeneralLedgerEntries>');
  let included = 0;
  let totalDebit = 0;
  let totalCredit = 0;
  const entryXml: string[] = [];
  for (const entry of payload.entries) {
    if (!inDateRange(entry.entry_date, opts.date_from, opts.date_to)) continue;
    included++;
    entryXml.push('    <Journal>');
    entryXml.push(`      <TransactionID>${xmlEscape(String(entry.entry_number))}</TransactionID>`);
    entryXml.push(`      <TransactionDate>${entry.entry_date}</TransactionDate>`);
    entryXml.push(`      <Description>${xmlEscape(entry.description)}</Description>`);
    for (const ln of entry.lines) {
      totalDebit += ln.debit_cents;
      totalCredit += ln.credit_cents;
      entryXml.push('      <Line>');
      entryXml.push(`        <AccountID>${xmlEscape(ln.account_code)}</AccountID>`);
      if (ln.debit_cents > 0) {
        entryXml.push(`        <DebitAmount>${fmtAmount(ln.debit_cents)}</DebitAmount>`);
      }
      if (ln.credit_cents > 0) {
        entryXml.push(`        <CreditAmount>${fmtAmount(ln.credit_cents)}</CreditAmount>`);
      }
      if (ln.description) {
        entryXml.push(`        <Description>${xmlEscape(ln.description)}</Description>`);
      }
      entryXml.push('      </Line>');
    }
    entryXml.push('    </Journal>');
  }
  out.push(`    <NumberOfEntries>${included}</NumberOfEntries>`);
  out.push(`    <TotalDebit>${fmtAmount(totalDebit)}</TotalDebit>`);
  out.push(`    <TotalCredit>${fmtAmount(totalCredit)}</TotalCredit>`);
  out.push(...entryXml);
  out.push('  </GeneralLedgerEntries>');
  out.push('</AuditFile>');

  return out.join('\n');
}

function generateGenericCsv(payload: AccountingExportPayload, opts: AccountingExportOptions = {}): string {
  const headers = [
    'EntryNumber', 'EntryDate', 'EntryDescription',
    'AccountCode', 'AccountName', 'Debit', 'Credit', 'LineDescription', 'Currency',
  ];
  const rows: string[] = [headers.join(',')];
  const accountIdx = new Map(payload.chart.map((a) => [a.account_code, a.account_name]));

  for (const entry of payload.entries) {
    if (!inDateRange(entry.entry_date, opts.date_from, opts.date_to)) continue;
    for (const ln of entry.lines) {
      rows.push([
        csvEscape(entry.entry_number),
        csvEscape(entry.entry_date),
        csvEscape(entry.description),
        csvEscape(ln.account_code),
        csvEscape(accountIdx.get(ln.account_code) ?? ''),
        csvEscape(fmtAmount(ln.debit_cents)),
        csvEscape(fmtAmount(ln.credit_cents)),
        csvEscape(ln.description ?? ''),
        csvEscape(payload.company.currency),
      ].join(','));
    }
  }
  return rows.join('\r\n');
}

export const saftOecdAdapter: AccountingExportAdapter = {
  id: 'saft-oecd',
  label: 'SAF-T (OECD baseline)',
  description: 'OECD Standard Audit File for Tax — international XML baseline used by NO/PT/FR/PL tax authorities and for system migration.',
  extension: 'xml',
  mime: 'application/xml',
  purpose: 'auditor_handoff',
  generate: generateSaftOecd,
};

export const genericCsvExportAdapter: AccountingExportAdapter = {
  id: 'csv-generic',
  label: 'Generic CSV (one row per line)',
  description: 'Universal CSV — imports cleanly into Excel, QuickBooks, Xero, Sage.',
  extension: 'csv',
  mime: 'text/csv',
  purpose: 'system_migration',
  generate: generateGenericCsv,
};
