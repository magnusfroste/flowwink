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
 * Since 2026-10-19 the extractor also reads Office Open XML (docx, pptx, xlsx —
 * see office-text.ts); legacy binary Office formats and everything else stay
 * honestly unsupported.
 */
import { officeKind } from './office-text.ts';

export function isExtractablePdf(doc: { file_type?: string | null; file_name?: string | null; file_url?: string | null }): boolean {
  return /pdf/i.test(doc.file_type ?? '') || /\.pdf$/i.test(doc.file_name ?? doc.file_url ?? '');
}

/** What the sweep can read: a PDF, or a Word/PowerPoint/Excel file. */
export function isExtractable(doc: { file_type?: string | null; file_name?: string | null; file_url?: string | null }): boolean {
  return isExtractablePdf(doc) || officeKind(doc) !== null;
}
