/**
 * Guardrail: supabase/seed/instance-manifest.json must stay in sync with the
 * tree it describes. The manifest is the repo's desired state per layer
 * (schema head, skill-seed hash, edge-function hashes) — a stale manifest
 * would make the Instance Sync card and fleet tooling compare live instances
 * against the WRONG expectation, which is worse than no comparison at all.
 *
 * The generator is deterministic (no timestamps, no git SHA), so this is an
 * exact compare. On failure: npm run manifest:json (then commit the artifact).
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildManifest } from '../../../scripts/generate-instance-manifest';
import artifact from '../../../supabase/seed/instance-manifest.json';

describe('instance manifest freshness', () => {
  const root = join(__dirname, '../../..');
  const fresh = buildManifest(root);

  it('committed manifest matches a fresh build of the tree', () => {
    expect(artifact, '\nStale instance manifest.\nRun: npm run manifest:json (then commit supabase/seed/instance-manifest.json)')
      .toEqual(JSON.parse(JSON.stringify(fresh)));
  });

  it('covers all four layers with sane values', () => {
    expect(fresh.layers.schema.migration_head).toMatch(/^\d{14}$/);
    expect(fresh.layers.skills.seed_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(fresh.layers.skills.skill_count).toBeGreaterThan(400);
    expect(fresh.layers.edge_functions.count).toBeGreaterThan(100);
    expect(fresh.layers.edge_functions.shared_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(fresh.layers.frontend.self_describing).toBe(true);
  });
});
