import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * A verification must be able to hold what it rests on.
 *
 * Bokföringslagen 5:7 requires a verification to identify its underlying
 * documents. FlowWink could not express that at all: journal_entries had
 * nineteen columns and none was an attachment. New Entry had nowhere to put a
 * receipt, the detail view showed none, and manage_journal_entry could not take
 * one from an agent.
 *
 * Receipts DID get uploaded — expenses.receipt_url, with AI extraction — but the
 * ledger link ran expense → expense_report → journal_entry, so the evidence
 * reached the REPORT and stopped. From a verification there was no path to it.
 *
 * These tests hold the seam closed at all four surfaces, because a register only
 * one of them writes to is a register nobody trusts.
 */

const ROOT = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');

const migration = read('supabase/migrations/20260810120000_verification-underlying-documents.sql');
const expenseFix = read('supabase/migrations/20260810130000_expense-receipts-follow-the-money.sql');

describe('the register holds documents, not intentions', () => {
  it('two kinds — an uploaded artifact, or a row in the archive', () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS public\.journal_entry_documents/);
    expect(migration).toMatch(/CHECK \(kind IN \('file', 'document'\)\)/);
    // Referenced, never copied: one annual report can underlie many entries.
    expect(migration).toMatch(/document_id uuid REFERENCES public\.documents\(id\)/);
  });

  it('refuses a row that points at nothing', () => {
    // A row claiming to be underlying documentation while holding neither a file
    // nor a document reads as evidence in every listing. That is worse than an
    // empty list, which at least tells the truth.
    expect(migration).toMatch(/journal_entry_documents_content_chk/);
    expect(migration).toMatch(/kind = 'file' AND coalesce\(trim\(file_url\), ''\) <> ''/);
    expect(migration).toMatch(/kind = 'document' AND document_id IS NOT NULL/);
  });

  it('deletes with its entry, and survives the archive', () => {
    expect(migration).toMatch(/journal_entry_id uuid NOT NULL REFERENCES public\.journal_entries\(id\) ON DELETE CASCADE/);
    // Unlinking an archived document must never delete the document.
    expect(migration).toMatch(/REFERENCES public\.documents\(id\) ON DELETE SET NULL/);
    expect(migration).toMatch(/only removed the LINK/);
  });

  it('says plainly when a verification rests on nothing', () => {
    expect(migration).toMatch(/This verification carries no underlying documentation/);
    expect(migration).toMatch(/BFL 5:7/);
  });
});

describe('every path that creates a verification can attach its evidence', () => {
  it('the agent attaches in the SAME call as the entry', () => {
    // A second call is a second chance to forget.
    const ae = read('supabase/functions/agent-execute/index.ts');
    expect(ae).toMatch(/Array\.isArray\(\(args as any\)\.documents\)/);
    expect(ae).toMatch(/journal_entry_documents'\)\.insert\(\{/);
    expect(ae).toMatch(/documents_attached,/);
    expect(ae).toMatch(/a second call is a second\s*\/\/ chance to forget/);
  });

  it('the form attaches in the same call too', () => {
    const hook = read('src/hooks/useAccounting.ts');
    expect(hook).toMatch(/documents\?: Array<\{ kind\?: 'file' \| 'document'/);
    expect(hook).toMatch(/from\('journal_entry_documents' as never\)\s*\n\s*\.insert/);
    const dialog = read('src/components/admin/accounting/NewJournalEntryDialog.tsx');
    expect(dialog).toMatch(/Underlying documents/);
    expect(dialog).toMatch(/documents: docs\.map/);
  });

  it('the receipt follows the money instead of stopping at the report', () => {
    expect(expenseFix).toMatch(/attach_expense_receipts_to_entry\(p_report_id, v_entry_id\)/);
    expect(expenseFix).toMatch(/'receipts_attached', v_receipts/);
    expect(migration).toMatch(/FROM public\.expenses e\s*\n\s*WHERE e\.report_id = p_report_id/);
    // Re-booking must not duplicate the same receipt onto the same entry.
    expect(migration).toMatch(/NOT EXISTS \(\s*\n\s*SELECT 1 FROM public\.journal_entry_documents d/);
  });

  it('and the detail view shows the absence, not just the presence', () => {
    // Silence reads as "nothing to see" rather than "nothing attached".
    const detail = read('src/components/admin/accounting/JournalEntryDetail.tsx');
    expect(detail).toMatch(/No underlying documentation attached/);
    expect(detail).toMatch(/useJournalEntryDocuments\(entryId\)/);
  });
});

describe('the skill tells an agent what the register is for', () => {
  const seed = read('src/lib/modules/accounting-module.ts');

  it('the DESCRIPTION carries the rule, not just the arguments', () => {
    expect(seed).toMatch(/BFL 5:7\) requires a verification to identify its underlying documents/);
    expect(seed).toMatch(/Attaching never changes a figure/);
    expect(seed).toMatch(/NOT for:/);
  });

  it('manage_journal_entry accepts documents on create', () => {
    expect(seed).toMatch(/documents: \{ type: 'array'/);
    expect(seed).toMatch(/you are the one who just read it/);
  });

  it('and the instructions say which kind to use, in the words of the choice', () => {
    expect(seed).toMatch(/underlies SEVERAL\s*\n\s*verifications/);
    expect(seed).toMatch(/"Kvitto" tells nobody which one/);
  });
});
