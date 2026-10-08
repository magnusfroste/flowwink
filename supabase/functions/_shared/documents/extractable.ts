/**
 * Which documents the extraction sweep can turn into text.
 *
 * ONE reader for both sides: the sweep (`sweepPendingExtractions`) decides
 * what to send to `extract-pdf-text`, and `upload_document` decides whether a
 * binary upload is queued (`pending`) or told the truth up front
 * (`unsupported`). They used to disagree — the MCP upload marked every PDF
 * `unsupported` ("no server-side parser"), so the sweep, which only picks up
 * `pending`, never saw it. Hermes uploaded a product-spec template PDF on
 * optic (2026-10-07) and it was never read, while the same PDF uploaded in the
 * admin UI would have been text within five minutes.
 *
 * The extractor is PDF-only; everything else (pptx, xlsx, docx) is honestly
 * unsupported until it isn't.
 */
export function isExtractablePdf(doc: { file_type?: string | null; file_name?: string | null; file_url?: string | null }): boolean {
  return /pdf/i.test(doc.file_type ?? '') || /\.pdf$/i.test(doc.file_name ?? doc.file_url ?? '');
}
