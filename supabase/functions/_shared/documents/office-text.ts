/**
 * Text out of Office files — docx, pptx, xlsx — for the knowledge index.
 *
 * Office Open XML files are zip archives of XML. Their text is in a handful of
 * well-known parts, so no Office library is needed: unzip, read the parts,
 * keep the words. The structure that matters to a reader is kept as markdown —
 * a heading per slide and per sheet, a table row per spreadsheet row.
 *
 * Before 2026-10-19 the sweep marked every one of these `unsupported`. On
 * optic that meant a roadmap deck Hermes uploaded and three budget workbooks
 * were archived but unreadable — not by search, not by FlowPilot, not by the
 * workspace chat. "Store it anyway" was right; storing it unread was not.
 *
 * The unzip function is passed in (fflate's unzipSync — esm in the edge
 * runtime, the npm copy in tests), so this module stays free of URL imports.
 * Legacy binary formats (.doc, .ppt, .xls) are not zip archives and stay
 * unsupported.
 */

export type OfficeKind = 'docx' | 'pptx' | 'xlsx';
export type Unzip = (data: Uint8Array) => Record<string, Uint8Array>;

/** Output ceiling — the same order as upload_document's content_text limit. */
export const OFFICE_TEXT_MAX_CHARS = 400_000;
const MAX_SHEET_ROWS = 2_000;

const OFFICE_MIME: Record<OfficeKind, RegExp> = {
  docx: /wordprocessingml\.document/i,
  pptx: /presentationml\.presentation/i,
  xlsx: /spreadsheetml\.sheet/i,
};

/** Which Office kind a document row is, by type or by name. */
export function officeKind(doc: { file_type?: string | null; file_name?: string | null; file_url?: string | null }): OfficeKind | null {
  for (const kind of Object.keys(OFFICE_MIME) as OfficeKind[]) {
    if (OFFICE_MIME[kind].test(doc.file_type ?? '')) return kind;
  }
  const m = /\.(docx|pptx|xlsx)$/i.exec(doc.file_name ?? doc.file_url ?? '');
  return m ? (m[1].toLowerCase() as OfficeKind) : null;
}

/** A zip archive starts with "PK\x03\x04". A PDF starts with "%PDF". */
export function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

const decoder = new TextDecoder('utf-8');

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** The text runs of one XML fragment, for a given text tag (w:t, a:t, t). */
function runs(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>|<${tag}(?:\\s[^>]*)?/>`, 'g');
  let out = '';
  for (const m of xml.matchAll(re)) out += decodeEntities(m[1] ?? '');
  return out;
}

const naturalNumber = (path: string) => Number(/(\d+)\.xml$/.exec(path)?.[1] ?? 0);

function docxText(files: Record<string, string>): string {
  const xml = files['word/document.xml'] ?? '';
  const body = xml.replace(/<w:tab\/>/g, '<w:t>\t</w:t>').replace(/<w:br\/>/g, '<w:t>\n</w:t>');
  const out: string[] = [];
  // A table becomes one line per row, cells joined — the paragraphs inside a
  // cell would otherwise lose which row they belonged to.
  const blocks = body.split(/(<w:tbl>[\s\S]*?<\/w:tbl>)/);
  for (const block of blocks) {
    if (block.startsWith('<w:tbl>')) {
      for (const row of block.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) ?? []) {
        const cells = (row.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) ?? []).map((c) => runs(c, 'w:t').trim());
        if (cells.some(Boolean)) out.push(`| ${cells.join(' | ')} |`);
      }
      continue;
    }
    for (const p of block.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) ?? []) {
      const text = runs(p, 'w:t').trim();
      if (!text) continue;
      const level = /<w:pStyle w:val="(?:Heading|Rubrik)(\d)"/i.exec(p)?.[1];
      out.push(level ? `${'#'.repeat(Math.min(Number(level), 6))} ${text}` : text);
    }
  }
  return out.join('\n\n');
}

// A line break inside a paragraph is its own element, not a character —
// without this, "Leverantörsberoende" and "Väder" read as one word.
const pptxBreaks = (xml: string) => xml.replace(/<a:br\b[^>]*\/>|<a:br\b[^>]*>[\s\S]*?<\/a:br>/g, '<a:t>\n</a:t>');

function pptxText(files: Record<string, string>): string {
  const slides = Object.keys(files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => naturalNumber(a) - naturalNumber(b));
  const out: string[] = [];
  for (const path of slides) {
    const n = naturalNumber(path);
    const paras = (pptxBreaks(files[path]).match(/<a:p[\s>][\s\S]*?<\/a:p>/g) ?? [])
      .map((p) => runs(p, 'a:t').trim())
      .filter(Boolean);
    // Speaker notes are where a deck often keeps what it actually means. The
    // slide's own rels file says which notes part is its; numbering alone lies.
    const rels = files[`ppt/slides/_rels/slide${n}.xml.rels`] ?? '';
    const notesTarget = /Target="\.\.\/notesSlides\/(notesSlide\d+\.xml)"/.exec(rels)?.[1];
    const notes = notesTarget
      ? (pptxBreaks(files[`ppt/notesSlides/${notesTarget}`] ?? '').match(/<a:p[\s>][\s\S]*?<\/a:p>/g) ?? [])
        .map((p) => runs(p, 'a:t').trim())
        .filter((t) => t && !/^\d+$/.test(t)) // the slide-number field
      : [];
    if (!paras.length && !notes.length) continue;
    out.push(`## Slide ${n}${paras[0] ? `: ${paras[0]}` : ''}`);
    if (paras.length > 1) out.push(paras.slice(1).join('\n'));
    if (notes.length) out.push(`Notes: ${notes.join(' ')}`);
  }
  return out.join('\n\n');
}

function xlsxText(files: Record<string, string>): string {
  const shared = (files['xl/sharedStrings.xml']?.match(/<si>[\s\S]*?<\/si>/g) ?? []).map((si) => runs(si, 't'));
  const rels = files['xl/_rels/workbook.xml.rels'] ?? '';
  const target = (rId: string) => {
    const t = new RegExp(`Id="${rId}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${rId}"`).exec(rels);
    const raw = t?.[1] ?? t?.[2];
    return raw ? (raw.startsWith('/') ? raw.slice(1) : `xl/${raw}`) : null;
  };
  const sheets = [...(files['xl/workbook.xml'] ?? '').matchAll(/<sheet\s[^>]*?name="([^"]*)"[^>]*?r:id="([^"]+)"[^>]*\/>/g)]
    .map((m) => ({ name: decodeEntities(m[1]), path: target(m[2]) }));
  const out: string[] = [];
  for (const sheet of sheets) {
    const xml = sheet.path ? files[sheet.path] : undefined;
    if (!xml) continue;
    const rows: string[] = [];
    for (const row of (xml.match(/<row[\s>][\s\S]*?<\/row>/g) ?? []).slice(0, MAX_SHEET_ROWS)) {
      const cells: string[] = [];
      for (const c of row.match(/<c\s[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) ?? []) {
        // Empty cells are not written, so a sparse row would shift left — a
        // budget's December figure landing under November. Place each cell by
        // its own reference (r="D7" → column 4).
        const ref = /\sr="([A-Z]+)\d+"/.exec(c)?.[1];
        if (ref) {
          const col = [...ref].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
          while (cells.length < col && cells.length < 500) cells.push('');
        }
        const type = /\st="([^"]+)"/.exec(c)?.[1];
        const v = /<v>([\s\S]*?)<\/v>/.exec(c)?.[1];
        let text = '';
        if (type === 's' && v !== undefined) text = shared[Number(v)] ?? '';
        else if (type === 'inlineStr') text = runs(c, 't');
        else if (v !== undefined) text = decodeEntities(v);
        cells.push(text.replace(/\|/g, '/').replace(/\s+/g, ' ').trim());
      }
      if (cells.some(Boolean)) rows.push(`| ${cells.join(' | ')} |`);
    }
    if (!rows.length) continue;
    out.push(`## Sheet: ${sheet.name}`);
    out.push(rows.join('\n'));
  }
  return out.join('\n\n');
}

/**
 * The text of an Office file, as markdown. The kind is read from the archive
 * itself (which part it carries), so a misnamed file is still read right.
 */
export function extractOfficeText(bytes: Uint8Array, unzip: Unzip): { kind: OfficeKind; text: string; truncated: boolean } {
  if (!isZip(bytes)) throw new Error('Not an Office Open XML file (no zip header) — legacy .doc/.ppt/.xls are not supported');
  const raw = unzip(bytes);
  const wanted = (p: string) =>
    p === 'word/document.xml' || /^ppt\/(slides|notesSlides)\/(_rels\/)?[a-zA-Z]+\d+\.xml(\.rels)?$/.test(p) ||
    p === 'xl/workbook.xml' || p === 'xl/sharedStrings.xml' || p === 'xl/_rels/workbook.xml.rels' || /^xl\/worksheets\/[^/]+\.xml$/.test(p);
  const files: Record<string, string> = {};
  for (const [p, data] of Object.entries(raw)) if (wanted(p)) files[p] = decoder.decode(data);

  let kind: OfficeKind;
  let text: string;
  if (files['word/document.xml']) { kind = 'docx'; text = docxText(files); }
  else if (Object.keys(files).some((p) => p.startsWith('ppt/slides/'))) { kind = 'pptx'; text = pptxText(files); }
  else if (files['xl/workbook.xml']) { kind = 'xlsx'; text = xlsxText(files); }
  else throw new Error('Zip archive is not a Word, PowerPoint or Excel file');

  const truncated = text.length > OFFICE_TEXT_MAX_CHARS;
  return { kind, text: truncated ? text.slice(0, OFFICE_TEXT_MAX_CHARS) : text, truncated };
}
