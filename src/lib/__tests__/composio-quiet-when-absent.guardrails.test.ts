import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * An integration that is not configured is an answer, not an error.
 *
 * #624 (2026-10-03) made every integration-status reader ask Composio which
 * accounts are connected — on every admin page that shows a status. Without a
 * Composio key, composio-proxy answers 503 "Composio API key not configured";
 * the view sweep counted it on seven pages and the nightly fresh install was
 * red six nights running. The question is now asked only when check-secrets
 * says Composio has a key.
 */

const read = (p: string) => readFileSync(join(__dirname, '../../..', p), 'utf8');

describe('Composio is not asked when it is not there', () => {
  it('the connected-apps query is enabled only with a Composio key', () => {
    const hook = read('src/hooks/useComposioConnectedToolkits.ts');
    expect(hook).toMatch(/const composioConfigured = secrets\?\.integrations\?\.composio === true;/);
    expect(hook).toMatch(/enabled: composioConfigured,/);
    // a never-run query must not read as loading forever
    expect(hook).toMatch(/isLoading: isLoading && fetchStatus !== 'idle'/);
  });

  it('check-secrets reports the Composio key the gate reads', () => {
    expect(read('supabase/functions/check-secrets/index.ts')).toMatch(/composio: !!Deno\.env\.get\('COMPOSIO_API_KEY'\)/);
  });
});
