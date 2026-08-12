import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  documentIndexTier,
  toStoragePath,
} from '../../../supabase/functions/_shared/retrieval/indexer.ts';

/**
 * An uploaded file is the one knowledge source with no purpose of its own.
 *
 * Every other source declares what it is by existing — a KB article is written
 * to be read, a published page is published. `documents` holds a product sheet,
 * an employment contract, a receipt and a CV in the same table. The upload
 * dialog therefore asks the only question the uploader can answer honestly
 * ("who can see this": shared / role / private), and how far the text travels
 * in the index is a CONSEQUENCE of that answer — never a second switch the
 * uploader has to get right twice.
 *
 * Until 2026-08-12 the indexer selected neither column and stamped every
 * document 'internal'. Nothing had leaked only because nothing was ever
 * extracted (see the sweeper tests below) — the fleet's single uploaded file
 * sat at extraction_status='pending' for two days. Both halves of that near
 * miss are nailed down here.
 */

const ROOT = join(__dirname, '../../..');
const INDEXER = join(ROOT, 'supabase/functions/_shared/retrieval/indexer.ts');
const EXTRACTOR = join(ROOT, 'supabase/functions/extract-pdf-text/index.ts');

const codeOnly = (path: string) => readFileSync(path, 'utf-8').replace(/\/\/[^\n]*/g, '');

describe('a document reaches only as far as its own visibility answer', () => {
  it('indexes shared documents at the staff tier', () => {
    expect(documentIndexTier('shared')).toBe('internal');
  });

  it('never indexes a private document', () => {
    // The employment-contract case the upload dialog exists for.
    expect(documentIndexTier('private')).toBeNull();
  });

  it('never indexes a role-restricted document', () => {
    // `knowledge_chunks` has two tiers, and its "internal" policy grants read
    // to every staff role. Indexing an HR-only file as 'internal' would show it
    // to warehouse and support — strictly wider than what the uploader chose.
    // Until the chunk tier can carry a role, the honest answer is to stay out.
    expect(documentIndexTier('role')).toBeNull();
  });

  it('treats a missing visibility as the column default', () => {
    // documents.visibility DEFAULT 'shared' — a row written before the column
    // existed means "shared", not "unknown, therefore hide".
    expect(documentIndexTier(null)).toBe('internal');
    expect(documentIndexTier(undefined)).toBe('internal');
  });

  it('can never put an uploaded file in the anon-readable tier', () => {
    // "Anyone can read public chunks" is an RLS policy on knowledge_chunks and
    // search_knowledge_chunks is EXECUTE-granted to anon, so 'public' here
    // would hand uploads to the visitor chat with a key that ships in the JS
    // bundle. This is the docs_pages incident's exact shape (7,959 chunks,
    // 2026-08-12) — a file is uploaded because it belongs to the business, not
    // because someone published it.
    for (const v of ['shared', 'private', 'role', 'public', '', null, undefined, 'nonsense']) {
      expect(documentIndexTier(v as string | null)).not.toBe('public');
    }
  });

  it('reads the column it branches on', () => {
    // A rule that selects nothing evaluates undefined for every row — which
    // here would silently mean "shared", i.e. exactly the bug being fixed.
    const branch = codeOnly(INDEXER).match(/case 'documents': \{[\s\S]*?\n    \}/)?.[0] ?? '';
    expect(branch, 'the documents branch must exist to be checked').not.toBe('');
    expect(branch).toMatch(/\.select\([^)]*visibility/);
    expect(branch).toMatch(/documentIndexTier\(/);
    expect(branch, 'the tier must be derived, not hardcoded').not.toMatch(/visibility:\s*'internal'/);
  });
});

describe('the extractor writes back to whoever uploaded', () => {
  it('does not scope the write to a single upload path', () => {
    // Scoped to source='cowork-upload' until 2026-08-12: the extractor would
    // download the PDF, spend the multimodal call, answer success — and update
    // zero rows for admin ('manual') or agent uploads. Whose upload it was is
    // not a property of whether its text may be stored.
    const src = codeOnly(EXTRACTOR);
    const fn = src.match(/async function updateDocumentExtraction[\s\S]*?\n\}/)?.[0] ?? '';
    expect(fn, 'updateDocumentExtraction must exist').not.toBe('');
    expect(fn).toMatch(/\.eq\('id', documentId\)/);
    expect(fn, "the write must not be filtered by source").not.toMatch(/\.eq\('source'/);
  });
});

describe('the sweeper picks up pending documents', () => {
  const src = codeOnly(INDEXER);
  const sweep = src.match(/export async function sweepPendingExtractions[\s\S]*?\n\}\n/)?.[0] ?? '';

  it('exists and claims work before dispatching it', () => {
    expect(sweep, 'sweepPendingExtractions must exist').not.toBe('');
    // Without the claim, a 5-minute cron pays for the same PDF again every tick
    // for as long as extraction takes.
    expect(sweep).toMatch(/extraction_status:\s*'processing'/);
    expect(sweep).toMatch(/\.eq\('extraction_status', 'pending'\)/);
  });

  it('reclaims documents whose extractor died', () => {
    // Claiming without a reclaim converts a crashed extractor into a document
    // that is stuck forever — a worse failure than the one being fixed.
    expect(sweep).toMatch(/EXTRACTION_STALE_MS/);
    expect(sweep).toMatch(/\.eq\('extraction_status', 'processing'\)/);
  });

  it('does not retry failures on a loop', () => {
    // 'failed' means the extractor read it and could not parse it. Re-running
    // that on a cron is an unbounded AI bill against a file that will not
    // improve; retrying is a deliberate act.
    expect(sweep).not.toMatch(/'failed'/);
  });

  it('spends nothing when the documents module is off', () => {
    expect(sweep).toMatch(/loadEnabledSources\(service\)/);
    expect(sweep).toMatch(/if\s*\(!enabled\.has\('documents'\)\)\s*return result/);
  });

  it('is wired into the indexer cron run', () => {
    // A sweeper nobody calls is the bug it was written to fix.
    const fn = readFileSync(join(ROOT, 'supabase/functions/knowledge-indexer/index.ts'), 'utf-8');
    expect(fn).toMatch(/sweepPendingExtractions\(/);
  });
});

describe('storage paths survive both upload formats', () => {
  it('leaves a bucket-qualified path alone', () => {
    expect(toStoragePath('cowork-uploads/abc/x.pdf')).toBe('cowork-uploads/abc/x.pdf');
    expect(toStoragePath('form-uploads/abc/x.pdf')).toBe('form-uploads/abc/x.pdf');
    expect(toStoragePath('documents/abc/x.pdf')).toBe('documents/abc/x.pdf');
  });

  it('qualifies an admin upload against the documents bucket', () => {
    // AddDocumentDialog uploads to the `documents` bucket but stores the path
    // relative to it, re-attaching the bucket at read time
    // (createSignedUrl(file_url)). The extractor splits on the first '/' to
    // find the bucket, so the raw value sent it looking for a bucket named
    // after a UUID.
    expect(toStoragePath('d824ec45-34dc-4276-92d6-0a32f9a3076c/1786401408522-q7zddz.pdf')).toBe(
      'documents/d824ec45-34dc-4276-92d6-0a32f9a3076c/1786401408522-q7zddz.pdf',
    );
  });
});
