// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { extractOfficeText, isZip, officeKind } from '../../../supabase/functions/_shared/documents/office-text';

/**
 * Guardrail: a Word, PowerPoint or Excel file becomes text the index can read.
 *
 * Live finding (optic, 2026-10-19): Hermes' roadmap deck and three budget
 * workbooks had been "stored anyway" since September — the right instinct —
 * and sat as `unsupported`: archived, unreadable by search, FlowPilot and the
 * workspace chat. The extractor was PDF-only. It now reads Office Open XML.
 *
 * The archives below are built the way Office writes them (a zip of XML parts)
 * and run through the same function the extractor calls.
 */
const ROOT = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const zip = (parts: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, strToU8(v)])));

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';

describe('Office files are read', () => {
  it('docx: headings, paragraphs and table rows, entities decoded', () => {
    const doc = zip({
      '[Content_Types].xml': '<Types/>',
      'word/document.xml': `<w:document ${W}><w:body>
        <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Tunnelprojekt</w:t></w:r></w:p>
        <w:p><w:r><w:t xml:space="preserve">Fas 1 &amp; fas 2 </w:t></w:r><w:r><w:t>klara.</w:t></w:r></w:p>
        <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Etapp</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Km</w:t></w:r></w:p></w:tc></w:tr>
        <w:tr><w:tc><w:p><w:r><w:t>Norr</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>412</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
      </w:body></w:document>`,
    });
    const r = extractOfficeText(doc, unzipSync);
    expect(r.kind).toBe('docx');
    expect(r.text).toContain('# Tunnelprojekt');
    expect(r.text).toContain('Fas 1 & fas 2 klara.');
    expect(r.text).toContain('| Norr | 412 |');
  });

  it('pptx: one heading per slide in slide order, with its own speaker notes', () => {
    const deck = zip({
      'ppt/slides/slide10.xml': `<p:sld ${A}><a:p><a:r><a:t>Risker</a:t></a:r></a:p><a:p><a:r><a:t>Leverantörsberoende</a:t></a:r><a:br><a:rPr lang="sv-SE"/></a:br><a:r><a:t>Väder</a:t></a:r></a:p></p:sld>`,
      'ppt/slides/slide2.xml': `<p:sld ${A}><a:p><a:r><a:t>Roadmap Q4</a:t></a:r></a:p></p:sld>`,
      'ppt/slides/_rels/slide2.xml.rels': '<Relationships><Relationship Id="rId2" Target="../notesSlides/notesSlide7.xml"/></Relationships>',
      'ppt/notesSlides/notesSlide7.xml': `<p:notes ${A}><a:p><a:r><a:t>Säg att Q4 hänger på leveransen.</a:t></a:r></a:p><a:p><a:fld type="slidenum"><a:t>2</a:t></a:fld></a:p></p:notes>`,
    });
    const r = extractOfficeText(deck, unzipSync);
    expect(r.kind).toBe('pptx');
    expect(r.text.indexOf('## Slide 2: Roadmap Q4')).toBeLessThan(r.text.indexOf('## Slide 10: Risker'));
    expect(r.text).toContain('Notes: Säg att Q4 hänger på leveransen.');
    expect(r.text).not.toMatch(/Notes: .* 2$/m);
    expect(r.text).toContain('Leverantörsberoende\nVäder');
  });

  it('xlsx: one table per sheet, shared strings, inline strings and numbers', () => {
    const book = zip({
      'xl/workbook.xml': '<workbook xmlns:r="r"><sheets><sheet name="Resultat budget" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/sharedStrings.xml': '<sst><si><t>Intäkter</t></si><si><r><t>Kost</t></r><r><t>nader</t></r></si></sst>',
      'xl/worksheets/sheet1.xml': `<worksheet><sheetData>
        <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>1250000</v></c></row>
        <row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>-830000.5</v></c></row>
        <row r="3"><c r="A3" t="inlineStr"><is><t>Not</t></is></c></row>
        <row r="4"><c r="A4" t="s"><v>0</v></c><c r="D4"><v>99</v></c></row>
      </sheetData></worksheet>`,
    });
    const r = extractOfficeText(book, unzipSync);
    expect(r.kind).toBe('xlsx');
    expect(r.text).toContain('## Sheet: Resultat budget');
    expect(r.text).toContain('| Intäkter | 1250000 |');
    expect(r.text).toContain('| Kostnader | -830000.5 |');
    expect(r.text).toContain('| Not |');
    // a sparse row keeps its columns: D4 lands in the fourth cell, not the second
    expect(r.text).toContain('| Intäkter |  |  | 99 |');
  });

  it('a legacy binary or a PDF is not mistaken for an Office file', () => {
    expect(isZip(strToU8('%PDF-1.7 …'))).toBe(false);
    expect(() => extractOfficeText(strToU8('\xD0\xCF\x11\xE0 old .ppt'), unzipSync)).toThrow(/legacy/);
    expect(officeKind({ file_name: 'Optic-Tunnels-Execution-Roadmap-v5.pptx' })).toBe('pptx');
    expect(officeKind({ file_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })).toBe('xlsx');
    expect(officeKind({ file_name: 'gammal.doc' })).toBeNull();
  });

  it('the extractor routes a zip to the Office reader before the PDF road, and the stuck files are requeued', () => {
    const fn = read('supabase/functions/extract-pdf-text/index.ts');
    expect(fn).toMatch(/if \(isZip\(pdfBytes\)\) \{[\s\S]{0,200}extractOfficeText\(pdfBytes, unzipSync\)/);
    expect(fn.indexOf('isZip(pdfBytes)')).toBeLessThan(fn.indexOf("resolveAiConfig(supabase, 'multimodal')"));
    const sql = read('supabase/migrations/20261019090000_kontorsfilerna-lases.sql');
    expect(sql).toMatch(/SET extraction_status = 'pending'/);
    expect(sql).toMatch(/WHERE extraction_status = 'unsupported'/);
    expect(sql).toMatch(/\\\.\(docx\|pptx\|xlsx\)\$/);
  });
});
