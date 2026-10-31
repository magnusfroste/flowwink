/**
 * A post FlowChat writes opens beside the chat as the RECORD — edit, save,
 * publish there (2026-10-31). The same editor as the blog page, the person's
 * own writes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');
const page = read('src/pages/admin/FlowChatPage.tsx');
const panel = read('src/components/admin/chat/BlogPostPanel.tsx');

describe('a post FlowChat wrote is an artifact', () => {
  it('outputs come from successful write_blog_post / manage_blog_posts results with a slug', () => {
    expect(page).toMatch(/\['write_blog_post', 'manage_blog_posts'\]\.includes\(sr\.skill\)/);
    expect(page).toMatch(/if \(sr\.status !== 'success'/);
  });

  it('the newest one opens by itself, as the panel focus', () => {
    expect(page).toMatch(/useEffect\(\(\) => \{ if \(lastOutput\) setOpenOutput\(lastOutput\); \}, \[lastOutput\]\)/);
    expect(page).toMatch(/content: <BlogPostPanel slugOrId=\{openOutput\} \/>/);
  });

  it('the panel edits the record with the blog editor and the blog hooks', () => {
    expect(panel).toMatch(/<BlogContentEditor\b/);
    expect(panel).toMatch(/useUpdateBlogPost\(\)/);
    expect(panel).toMatch(/useUpdateBlogPostStatus\(\)/);
    expect(panel).toMatch(/status: published \? 'draft' : 'published'/);
  });
});
