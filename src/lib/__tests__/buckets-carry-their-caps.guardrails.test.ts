/**
 * A bucket's cap is the bucket's, on every instance (2026-11-24).
 *
 * The fresh-install finalizer caps `form-uploads` at 10 MB and `documents` at
 * 50 MB, but it wrote them on a fresh install only: on www, nordbrygg and
 * liteit both were uncapped, and `form-uploads` takes an upload from anyone.
 * The open-access list says the public form's uploads are "size and type
 * capped on the bucket" — this keeps that sentence true.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OPEN_BY_DESIGN } from '../../../scripts/open-access-allowlist';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const MIGRATION = 'supabase/migrations/20261124120000_hinkarna-har-tak.sql';

describe('buckets carry their caps', () => {
  it('the bucket a stranger uploads to is capped on live instances too', () => {
    const sql = read(MIGRATION);
    expect(sql).toMatch(/SET file_size_limit = 10485760\s+WHERE id = 'form-uploads'/);
    expect(sql).toMatch(/WHERE id = 'documents' AND file_size_limit IS NULL/);
  });

  it("an operator's own smaller cap is kept", () => {
    expect(read(MIGRATION)).toMatch(/file_size_limit IS NULL OR file_size_limit > 10485760/);
  });

  it('the fresh install and the live fix agree on the form cap', () => {
    const fin = read('supabase/migrations/20260812130000_fresh-install-finalizer.sql');
    expect(fin).toMatch(/\('form-uploads','form-uploads',false,10485760,/);
  });

  it('the open-access list states the cap the bucket now has', () => {
    expect(OPEN_BY_DESIGN['storage.objects INSERT form-uploads']).toMatch(/size and type capped/);
  });
});
