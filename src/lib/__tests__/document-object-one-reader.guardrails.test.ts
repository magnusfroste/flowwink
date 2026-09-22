import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { resolveDocumentObject, toStoragePath } from '../../../supabase/functions/_shared/storage/document-object';

/**
 * "Bucket not found" — Peter's FlowPilot diagnosis on optic, 2026-09-18, filed as a
 * Now item in his product backlog: documents could not be read or shared by an agent.
 *
 * documents.file_url holds three shapes (bucket-qualified, relative to `documents`,
 * external URL). Every row in the fleet is the relative shape — `<uuid>/x.pdf`, or
 * `agent-uploads/<key>/x.pptx` from the upload skill — and the extractor split every
 * path on its first `/` and took that as the bucket. One fact, one reader now.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('where a document lives has one answer', () => {
  it('an admin upload is a path inside documents — not a bucket named after a UUID', () => {
    expect(resolveDocumentObject('9a69085a-c7fe-4325-b97c-6a4965af5f93/1789732224831-iy4drg.pdf'))
      .toEqual({ kind: 'storage', bucket: 'documents', path: '9a69085a-c7fe-4325-b97c-6a4965af5f93/1789732224831-iy4drg.pdf' });
  });

  it('an agent upload is a folder inside documents — agent-uploads is not a bucket', () => {
    expect(resolveDocumentObject('agent-uploads/mcp-key-x/abc-Roadmap.pptx'))
      .toEqual({ kind: 'storage', bucket: 'documents', path: 'agent-uploads/mcp-key-x/abc-Roadmap.pptx' });
  });

  it('a bucket-qualified path keeps its bucket', () => {
    expect(resolveDocumentObject('cowork-uploads/u1/x.pdf')).toEqual({ kind: 'storage', bucket: 'cowork-uploads', path: 'u1/x.pdf' });
    expect(resolveDocumentObject('documents/u1/x.pdf')).toEqual({ kind: 'storage', bucket: 'documents', path: 'u1/x.pdf' });
    expect(resolveDocumentObject('/form-uploads/a/b.pdf')).toEqual({ kind: 'storage', bucket: 'form-uploads', path: 'a/b.pdf' });
  });

  it('an external file is a URL, fetched as one', () => {
    expect(resolveDocumentObject('https://example.test/x.pdf')).toEqual({ kind: 'url', url: 'https://example.test/x.pdf' });
  });

  it('the bucket-qualified string form agrees with the object form', () => {
    expect(toStoragePath('9a69/x.pdf')).toBe('documents/9a69/x.pdf');
    expect(toStoragePath('cowork-uploads/u1/x.pdf')).toBe('cowork-uploads/u1/x.pdf');
  });
});

describe('every server path that turns a document into bytes uses the reader', () => {
  it('the extractor resolves both storage_path and file_url, and accepts a document_id alone', () => {
    const src = read('supabase/functions/extract-pdf-text/index.ts');
    expect(src).toMatch(/resolveDocumentObject\(\(storage_path \?\? file_url\)!\)/);
    expect(src).not.toMatch(/storage_path\.split\('\/'\)/);
    expect(src).toMatch(/if \(!file_url && !storage_path && document_id\)/);
  });

  it('the share link signs from the bucket the file is in', () => {
    const src = read('supabase/functions/document-share/index.ts');
    expect(src).toMatch(/resolveDocumentObject\(row\.file_url as string\)/);
    expect(src).toMatch(/\.from\(target\.bucket\)\s*\.createSignedUrl\(target\.path/);
  });

  it('the indexer uses the same reader, not a copy', () => {
    const src = read('supabase/functions/_shared/retrieval/indexer.ts');
    expect(src).toMatch(/import \{ toStoragePath \} from '\.\.\/storage\/document-object\.ts'/);
    expect(src).not.toMatch(/const DOCUMENT_BUCKETS/);
  });

  // The shape of the bug: a variable called *bucket* taken from the first segment of a path.
  const BUCKET_FROM_PATH = /\b(\w*bucket\w*)\s*=\s*[^;\n]*(\.split\(\s*['"]\/['"]\s*\)\s*\[\s*0\s*\]|\bparts\s*\[\s*0\s*\])/i;

  it('the scanner recognises the original bug, and not a folder name', () => {
    const original = "const parts = storage_path.split('/');\n    const bucket = parts[0];";
    expect(BUCKET_FROM_PATH.test(original)).toBe(true);
    expect(BUCKET_FROM_PATH.test("const b = fileUrl.split('/')[0]; const bucketName = path.split('/')[0];")).toBe(true);
    expect(BUCKET_FROM_PATH.test("p_folder: folder.split('/')[0],")).toBe(false);
  });

  it('no other edge function derives a bucket from the first segment of a path', () => {
    // Discover, don't enumerate: every .ts under supabase/functions is scanned.
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts')) files.push(p);
      }
    };
    walk(join(root, 'supabase/functions'));
    expect(files.length).toBeGreaterThan(100);
    const offenders = files
      .filter((f) => !f.endsWith('document-object.ts') && BUCKET_FROM_PATH.test(readFileSync(f, 'utf8')))
      .map((f) => relative(root, f));
    expect(offenders, 'derive the bucket through _shared/storage/document-object.ts').toEqual([]);
  });

  it('the skill offers document_id and stops telling agents the path must carry the bucket', () => {
    const mod = read('src/lib/modules/documents-module.ts');
    expect(mod).toMatch(/document_id: \{ type: 'string', description: 'The document to read — preferred/);
    expect(mod).not.toMatch(/Storage path \(bucket\/path\) of the PDF in media library/);
  });
});
