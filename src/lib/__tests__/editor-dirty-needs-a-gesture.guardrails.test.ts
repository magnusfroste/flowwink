/**
 * "Unsaved changes" kräver en gest.
 *
 * 2026-08-25, optic: öppna en sida, rör ingenting, stäng — och dialogen frågar
 * om osparade ändringar. Tiptap normaliserar lagrat innehåll vid initiering
 * (schema-lagningar, especially agent-written pages via markdownToTiptap), och
 * normaliseringen fyrar samma onUpdate → onChange-väg som ett tangenttryck.
 * En latchad hasChanges kan inte skilja dem åt.
 *
 * Regeln: allt som händer FÖRE första användargesten är per definition ingen
 * redigering. Grinden (userInteracted-ref, armerad av pointer/key i
 * editorplanen) absorberar init-skrivningar i state utan att märka smutsigt.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(
  join(__dirname, '../../pages/admin/PageEditorPage.tsx'),
  'utf-8',
);

describe('editor-dirty kräver en gest', () => {
  it('block- och metaändringar latchar bara EFTER interaktion', () => {
    // Båda handlarna ska vara grindade — en ovillkorlig setHasChanges(true) i
    // någon av dem återinför falsklarmet för varje Tiptap-bärande sida.
    const blocks = SRC.match(/handleBlocksChange[\s\S]{0,220}?\}, \[\]\)/)?.[0] ?? '';
    const meta = SRC.match(/handleMetaChange[\s\S]{0,220}?\}, \[\]\)/)?.[0] ?? '';
    for (const [name, body] of [['handleBlocksChange', blocks], ['handleMetaChange', meta]] as const) {
      expect(body, `${name} hittades inte`).not.toBe('');
      expect(body, `${name} latchar utan interaktionsgrind`).toContain('userInteracted.current');
      expect(body).not.toMatch(/^\s*setHasChanges\(true\);\s*$/m);
    }
  });

  it('grinden armeras av gester i editorplanen — capture, så inget stoppas', () => {
    expect(SRC).toContain('onPointerDownCapture={armDirtyTracking}');
    expect(SRC).toContain('onKeyDownCapture={armDirtyTracking}');
  });

  it('en ny sidladdning nollställer grinden — nästa sidas init-normalisering absorberas också', () => {
    expect(SRC).toMatch(/setHasChanges\(false\);\s*\n\s*userInteracted\.current = false/);
  });
});
