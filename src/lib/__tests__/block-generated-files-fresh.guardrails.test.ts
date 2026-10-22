import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BLOCK_REFERENCE, type BlockInfo } from '@/lib/block-reference';
import { renderBlockSchemaFiles, BLOCK_SCHEMA_PATH, BLOCK_TOOLS_PATH } from '../../../scripts/sync-block-schema';

/**
 * block-schema.ts and block-tools.ts are what the agent actually hits:
 * normalize-blocks' write gate reads its field map from block-tools.ts, and
 * describe_blocks / migrate-page read block-schema.ts — neither reads
 * block-reference.ts. A registry edit without `bun run scripts/sync-block-schema.ts`
 * is therefore invisible: every test that reads the registry is green while the
 * gate still accepts the old field. Retiring contact.showForm (#714) showed it —
 * re-adding the field to the registry alone left the refusal tests passing.
 *
 * Both files are committed by the PR (not bot-owned like the eight in
 * scripts/generated-artifacts.ts), so this is an exact compare against a fresh
 * render of the registry.
 */

const root = join(__dirname, '../../..');
const HINT = '\nStale generated block file. Run: bun run scripts/sync-block-schema.ts — and commit the result with the registry change.';

describe('generated block files match the registry', () => {
  const fresh = renderBlockSchemaFiles();

  it('block-schema.ts is a fresh render of block-reference.ts', () => {
    expect(readFileSync(join(root, BLOCK_SCHEMA_PATH), 'utf8') === fresh.schema, HINT).toBe(true);
  });

  it('block-tools.ts is a fresh render of block-reference.ts', () => {
    expect(readFileSync(join(root, BLOCK_TOOLS_PATH), 'utf8') === fresh.tools, HINT).toBe(true);
  });

  it('fails on a registry field the generated files never heard of', () => {
    // The #714 shape: a field put back on contact in the registry only.
    const planted = (BLOCK_REFERENCE as BlockInfo[]).map((b) => b.type !== 'contact' ? b : {
      ...b,
      fields: [...b.fields, { name: 'plantedGhost', type: 'boolean' as const, required: false, description: 'planted' }],
    });
    const stale = renderBlockSchemaFiles(planted);
    expect(stale.tools).toContain('plantedGhost');
    expect(stale.schema).toContain('plantedGhost');
    expect(readFileSync(join(root, BLOCK_TOOLS_PATH), 'utf8')).not.toBe(stale.tools);
    expect(readFileSync(join(root, BLOCK_SCHEMA_PATH), 'utf8')).not.toBe(stale.schema);
  });
});
