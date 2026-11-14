import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * What agents actually failed on (2026-11-11).
 *
 * Read from agent_activity on four live instances, thirty days: 205 failed
 * agent calls. Most were honest answers (no purchase price known) or already
 * fixed (an unknown knowledge source). These were the platform's:
 *
 *   - manage_blog_posts answered "post_id or slug required" to an agent that
 *     HAD sent an id (as `id`, the name `get` hands it back under) and to one
 *     that had sent a slug no post on the site carries — 38 calls.
 *   - an approval that is still pending was journaled as a FAILURE, so it
 *     counted toward self-healing's disable threshold and read as a defect.
 *   - manage_approvals answered an unknown action without naming the real ones.
 */
const exec = readFileSync(join(__dirname, '../../../supabase/functions/_shared/execute/core.ts'), 'utf-8');

describe('the failures the fleet showed', () => {
  const blog = exec.slice(exec.indexOf('async function executeBlogPostsManagement('));

  it('manage_blog_posts takes the id a read handed back', () => {
    expect(blog.slice(0, 900)).toMatch(/typeof args\.id === 'string' && args\.post_id === undefined[\s\S]*args = \{ \.\.\.rest, post_id: id \};/);
  });

  it('a slug that names no post is NOT_FOUND, before any action runs', () => {
    const notFound = blog.indexOf('No blog post with slug');
    expect(notFound).toBeGreaterThan(-1);
    expect(notFound).toBeLessThan(blog.indexOf("if (action === 'update') {"));
    expect(blog.slice(notFound - 400, notFound + 400)).toMatch(/\['update', 'publish', 'unpublish', 'delete'\]\.includes\(String\(action\)\)[\s\S]*code: 'NOT_FOUND', retryable: false,/);
  });

  it('an id that names no post is NOT_FOUND too, never "Cannot coerce the result" (www, 2026-11-11)', () => {
    // Hermes sent post_id with each of nine cover updates for another site's
    // posts; the slug check above never ran, and the update's .single() threw.
    const notFound = blog.indexOf('No blog post with id');
    expect(notFound).toBeGreaterThan(-1);
    expect(notFound).toBeLessThan(blog.indexOf("if (action === 'update') {"));
    const block = blog.slice(notFound - 700, notFound + 300);
    expect(block).toMatch(/if \(post_id && \['update', 'publish', 'unpublish', 'delete'\]\.includes\(String\(action\)\)\)/);
    expect(block).toMatch(/\.from\('blog_posts'\)\.select\('id'\)\.eq\('id', post_id\)\.maybeSingle\(\)/);
    // A non-uuid id is "not found", any other lookup error is reported as it is.
    expect(block).toMatch(/idErr && idErr\.code !== '22P02'/);
    expect(block).toMatch(/code: 'NOT_FOUND', retryable: false,/);
  });

  it('a refused approval redemption is a refusal in the journal', () => {
    const at = exec.indexOf('A refused redemption leaves a trail');
    const block = exec.slice(at, exec.indexOf('claimedApprovalRequestId = verdict.requestId;', at));
    expect(block).toMatch(/status: 'refused', conversation_id/);
    expect(block).not.toMatch(/status: 'failed'/);
    expect(block).toMatch(/code: `APPROVAL_\$\{String\(verdict\.reason \?\? 'refused'\)\.toUpperCase\(\)\}`,\s+retryable: false,/);
  });

  it('an unknown approvals action names the real ones', () => {
    expect(exec).toMatch(/Unknown approvals action: \$\{action\}`,\s+code: 'INVALID_INPUT', retryable: true,\s+hint: 'Actions: list_pending/);
  });
});
