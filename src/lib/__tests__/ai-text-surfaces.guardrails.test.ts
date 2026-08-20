import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AI text-transform surface guardrails.
 *
 * Two content-eating defects shipped in the shared Tiptap toolbar and were
 * fixed 2026-08-20 (harmonized with the wiki's AIMarkdownToolbar):
 *  1. No selection → the WHOLE document was transformed, and setContent()
 *     flattened every heading/list into one paragraph.
 *  2. 'continue' REPLACED the selection with only the continuation.
 *
 * These pins keep all three surfaces honest: the two selection-based toolbars
 * require a selection and insert (not replace) on continue; the whole-field
 * assistant appends on continue.
 */
const read = (rel: string) => readFileSync(join(__dirname, '../../', rel), 'utf8');

describe('AI text surfaces: selection required, continue inserts', () => {
  it('AITiptapToolbar requires a selection and never replaces the whole doc', () => {
    const src = read('components/admin/AITiptapToolbar.tsx');
    expect(src).not.toMatch(/\.setContent\(/);
    expect(src).toMatch(/disabled=\{!hasSelection\}/);
    expect(src).toMatch(/Select text in the editor first/);
  });

  it('AITiptapToolbar inserts after the selection on continue', () => {
    const src = read('components/admin/AITiptapToolbar.tsx');
    expect(src).toMatch(/pendingAction === 'continue'/);
    expect(src).toMatch(/insertContentAt\(to/);
  });

  it('AIMarkdownToolbar (wiki) requires a selection and inserts on continue', () => {
    const src = read('components/admin/AIMarkdownToolbar.tsx');
    expect(src).toMatch(/disabled=\{!hasSelection\}/);
    expect(src).toMatch(/pendingAction === 'continue'/);
    // continue splices AFTER selection end — both halves of the original kept
    expect(src).toMatch(/value\.slice\(0, end\).*preview.*value\.slice\(end\)/s);
  });

  it('AITextAssistant (whole-field) appends on continue instead of replacing', () => {
    const src = read('components/admin/AITextAssistant.tsx');
    expect(src).toMatch(/pendingAction === 'continue' \? `\$\{value\} \$\{preview\}` : preview/);
  });

  it('all three surfaces route through the shared hook — no parallel pipelines', () => {
    for (const f of ['components/admin/AITiptapToolbar.tsx', 'components/admin/AIMarkdownToolbar.tsx', 'components/admin/AITextAssistant.tsx']) {
      expect(read(f)).toMatch(/useAITextGeneration/);
    }
  });
});
