import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { summarise, sameExceptDate, migrationBelongsTo } from '../../../scripts/generate-module-docs';

/**
 * Module docs have one writer.
 *
 * scripts/generate-module-docs.ts wrote the frontmatter without `description`;
 * scripts/normalize-doc-frontmatter.ts added it afterwards from the lead line.
 * Every regeneration deleted it again and bumped `generated_at` on every file,
 * so renaming one module produced a 57-file diff (2026-10-02). Now the
 * generator writes `description` itself, with the normaliser's own reduction,
 * and keeps a page untouched when only the date would change.
 */
const root = join(__dirname, '../../..');
const dir = join(root, 'docs/modules');

describe('module docs have one writer', () => {
  it('every generated module page carries a description the portal can read', () => {
    const missing = readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .filter((f) => {
        const fm = readFileSync(join(dir, f), 'utf-8').match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
        return /^generated: true$/m.test(fm) && !/^description: .+$/m.test(fm);
      });
    expect(missing).toEqual([]);
  });

  it('summarise() is the normaliser\'s clean(): markdown stripped, first sentence, capped, no double quotes', () => {
    expect(summarise('Create and publish **website** pages, [header](x) and `footer`')).toBe('Create and publish website pages, header and footer');
    expect(summarise('A first sentence that is comfortably longer than forty chars. A second one.')).toBe('A first sentence that is comfortably longer than forty chars.');
    expect(summarise('Say "hi"')).toBe("Say 'hi'");
    expect(summarise('x'.repeat(200)).length).toBeLessThanOrEqual(180);
  });

  it('a page whose only difference is the date is left alone', () => {
    const a = '---\ngenerated_at: "2026-09-30"\ndescription: x\n---\n# A\n';
    const b = a.replace('2026-09-30', '2026-10-02');
    expect(sameExceptDate(a, b)).toBe(true);
    expect(sameExceptDate(a, b.replace('# A', '# B'))).toBe(false);
  });

  it('a migration is the module\'s by whole words, never by substring', () => {
    expect(migrationBelongsTo('20260708030000_sla-parity-r6.sql', 'sla')).toBe(true);
    expect(migrationBelongsTo('20261002200000_villkorslanken-far-ett-engelskt-standardvarde.sql', 'sla')).toBe(false);
    expect(migrationBelongsTo('20260901000000_field_service-dispatch.sql', 'field-service')).toBe(true);
    expect(migrationBelongsTo('20260901000000_positions.sql', 'pos')).toBe(false);
  });

  it('the generator writes the description itself', () => {
    const src = readFileSync(join(root, 'scripts/generate-module-docs.ts'), 'utf-8');
    expect(src).toMatch(/lines\.push\(`description: \$\{summarise\(lead\)\}`\)/);
    expect(src).toMatch(/writeUnlessUnchanged\(outFile, markdown\)/);
  });
});
