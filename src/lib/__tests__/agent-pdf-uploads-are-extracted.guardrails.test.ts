import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isExtractablePdf } from '../../../supabase/functions/_shared/documents/extractable';

/**
 * An agent's PDF must take the same road to text as an admin's: queued as
 * `pending` for the extraction sweep. upload_document marked it `unsupported`,
 * the sweep only reads `pending`, and Hermes' PDF on optic was never read
 * (2026-10-07). One definition of "extractable" now serves both sides.
 */
const ROOT = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('an agent-uploaded PDF reaches the extraction sweep', () => {
  it('one definition of extractable: PDF by type or by file name', () => {
    expect(isExtractablePdf({ file_type: 'application/pdf' })).toBe(true);
    expect(isExtractablePdf({ file_type: null, file_name: 'Mall.PDF' })).toBe(true);
    expect(isExtractablePdf({ file_url: 'agent-uploads/hermes/x-mall.pdf' })).toBe(true);
    expect(isExtractablePdf({ file_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', file_name: 'deck.pptx' })).toBe(false);
  });

  it('upload_document queues a PDF as pending, and the sweep asks the same function', () => {
    const ae = read('supabase/functions/agent-execute/index.ts');
    const upload = ae.slice(ae.indexOf('async function executeUploadDocument'));
    const binary = upload.slice(upload.indexOf('Mode B'), upload.indexOf('p_extraction_status:', upload.indexOf('Mode B')));
    expect(binary).toMatch(/isExtractablePdf\([^)]*\)\)\s*\{[\s\S]{0,400}?extractionStatus = 'pending'/);
    const sweep = read('supabase/functions/_shared/retrieval/indexer.ts');
    const fn = sweep.slice(sweep.indexOf('export async function sweepPendingExtractions'));
    expect(fn).toMatch(/isExtractablePdf\(doc\)/);
    // no second, private copy of the PDF test left in the sweep
    expect(fn.slice(0, 4000)).not.toMatch(/\/pdf\/i\.test/);
  });

  it('the stuck ones are requeued — agent uploads, PDF only, the old message only', () => {
    const sql = read('supabase/migrations/20261008150000_agentens-pdf-laggs-i-kon.sql');
    expect(sql).toMatch(/SET extraction_status = 'pending'/);
    expect(sql).toMatch(/source LIKE 'agent-upload%'/);
    expect(sql).toMatch(/extraction_error LIKE 'No server-side parser for mime_type=%'/);
  });
});
