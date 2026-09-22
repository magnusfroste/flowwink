/**
 * Where a document's bytes live — ONE reader for `documents.file_url`.
 *
 * `file_url` holds three different things depending on who wrote it:
 *   - a bucket-qualified path            `cowork-uploads/x/y.pdf`  (cowork attachments)
 *   - a path RELATIVE to `documents`     `<uuid>/y.pdf`             (admin documents page)
 *                                        `agent-uploads/…/y.pptx`   (upload_document skill)
 *   - an external URL                    `https://…`
 *
 * Each writer is internally consistent, which is why none of them noticed. The
 * readers were not: the extractor split every path on its first `/` and took
 * that as the bucket, so an admin upload made it look for a bucket named after
 * a UUID, and an agent upload for a bucket called `agent-uploads` — "Bucket not
 * found" (Peter's FlowPilot diagnosis on optic, 2026-09-18, filed as a Now item
 * in his product backlog). The share link did the reverse and read every path
 * from `documents`, so a cowork attachment could not be shared.
 *
 * Pure (no Deno, no client) so it is unit-tested. Every edge function that
 * turns a document row into bytes goes through here.
 */

/** Buckets a document row may point into. Anything else is a folder inside `documents`. */
export const DOCUMENT_BUCKETS = ['cowork-uploads', 'form-uploads', 'documents'] as const;

export type DocumentObject =
  | { kind: 'storage'; bucket: string; path: string }
  | { kind: 'url'; url: string };

export function resolveDocumentObject(fileUrl: string): DocumentObject {
  const value = fileUrl.trim();
  if (/^https?:\/\//i.test(value)) return { kind: 'url', url: value };
  const clean = value.replace(/^\/+/, '');
  const [first, ...rest] = clean.split('/');
  if ((DOCUMENT_BUCKETS as readonly string[]).includes(first) && rest.length > 0) {
    return { kind: 'storage', bucket: first, path: rest.join('/') };
  }
  return { kind: 'storage', bucket: 'documents', path: clean };
}

/** The same answer as one bucket-qualified string — the form `extract-pdf-text` accepts. */
export function toStoragePath(fileUrl: string): string {
  const o = resolveDocumentObject(fileUrl);
  return o.kind === 'url' ? o.url : `${o.bucket}/${o.path}`;
}
