import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mediaModule } from '../modules/media-module';

/**
 * Guardrail: a media_browse call with the right action and a missing or
 * misnamed parameter is answered with the parameter, not with "Unknown
 * media action". 2026-10-21: `{ action: "delete", path: "imports/x.webp" }`
 * — `path` being what this skill's own answers call the file — fell through
 * to "Unknown media action: delete", which points at another skill, not at
 * the missing `file_path`. Self-correction needs the hint to name the gap.
 */
const root = join(__dirname, '../../..');
const ae = readFileSync(join(root, 'supabase/functions/agent-execute/index.ts'), 'utf8');
const start = ae.indexOf("const { action = 'list', folder, search, url, filename }");
const handler = ae.slice(start, ae.indexOf('Unknown media action', start));
expect(start).toBeGreaterThan(0);

describe('media_browse answers with the parameter, not "unknown action"', () => {
  it('delete and get_url without a file path say so, and the action list is in the fallthrough', () => {
    expect(handler).toMatch(/\(action === 'delete' \|\| action === 'get_url'\) && !file_path/);
    expect(handler).toMatch(/needs file_path/);
    expect(ae).toMatch(/Unknown media action: \$\{action\} — one of \$\{MEDIA_ACTIONS\.join/);
  });
  it('`path` — what the skill itself returns — is accepted as the alias of file_path', () => {
    expect(handler).toMatch(/typeof mediaArgs\.file_path === 'string' \? mediaArgs\.file_path : typeof mediaArgs\.path === 'string' \? mediaArgs\.path/);
  });
  it('the skill description tells the agent the same', () => {
    const seed = mediaModule.skillSeeds.find((s) => s.name === 'media_browse')!;
    expect(seed.instructions ?? '').toMatch(/"path" is accepted as an alias of file_path/);
  });
});
