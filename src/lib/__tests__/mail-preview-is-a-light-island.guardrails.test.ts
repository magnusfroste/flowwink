/**
 * Ett mail förhandsvisas som det dokument det är — ljust och isolerat.
 *
 * Magnus i dark theme på optic 2026-08-26: bekräftelsemailet i Communications-
 * modalen var oläsligt — mailets inline color:#333 mot temats mörka bg-card.
 * Mail-HTML författas mot antagen vit botten; ett tema den aldrig sett får
 * inte färga den. Husets renderare för detta finns (EmailTemplatePreview:
 * iframe srcDoc, bg-white, isolerad från adminens CSS) — dialogen hade byggt
 * en egen div-rendering bredvid. En renderare för mail-HTML, inte två.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIALOG = readFileSync(
  join(__dirname, '../../components/admin/communications/CommunicationDetailDialog.tsx'), 'utf-8');
const PREVIEW = readFileSync(
  join(__dirname, '../../components/admin/email/EmailTemplatePreview.tsx'), 'utf-8');

describe('mailförhandsvisningen är en ljus ö', () => {
  it('dialogen renderar mail-HTML genom husets renderare — aldrig en egen div', () => {
    expect(DIALOG).toContain('EmailTemplatePreview');
    expect(DIALOG).not.toMatch(/dangerouslySetInnerHTML=\{\{ __html: comm\.body_html/);
  });

  it('renderaren är en isolerad ljus iframe — temat når aldrig mailet', () => {
    expect(PREVIEW).toContain('srcDoc');
    expect(PREVIEW).toContain('bg-white');
  });
});
