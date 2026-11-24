import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// A visitor's knowledge-base vote counted every call (2026-11-24): three
// negatives flag an article and the workflow tells an agent to rewrite it, so
// a stranger could steer what the agent rewrote.
const root = join(__dirname, '../../..');
const sql = readFileSync(join(root, 'supabase/migrations/20261124110000_en-rost-per-samtal.sql'), 'utf8');

describe('a visitor vote counts once', () => {
  it('per chat session and article, at most five articles a call', () => {
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.bump_kb_article_feedback\(text\[\], text\)/);
    expect(sql).toMatch(/\(p_slugs\)\[1:5\]/);
    expect(sql).toMatch(/v_slug = ANY \(f\.kb_counted_slugs\)/);
    expect(sql).toMatch(/array_append\(kb_counted_slugs, v_slug\)/);
  });

  it('the chat sends its session with the vote', () => {
    const chat = readFileSync(join(root, 'src/components/chat/ChatFeedback.tsx'), 'utf8');
    expect(chat).toMatch(/p_session_id: sessionId/);
  });

  it('the agent reads the questions behind a flag before rewriting', () => {
    const kb = readFileSync(join(root, 'src/lib/modules/kb-module.ts'), 'utf8');
    expect(kb).toMatch(/a flag is a lead, not a verdict/);
  });
});
