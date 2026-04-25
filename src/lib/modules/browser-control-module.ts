import { defineModule } from '@/lib/module-def';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { z } from 'zod';

export const browserControlInputSchema = z.object({
  action: z.enum(['check_status', 'set_extension_id']),
  extension_id: z.string().optional(),
});

export const browserControlOutputSchema = z.object({
  success: z.boolean(),
  installed: z.boolean().optional(),
  version: z.string().optional(),
  error: z.string().optional(),
});

export type BrowserControlInput = z.infer<typeof browserControlInputSchema>;
export type BrowserControlOutput = z.infer<typeof browserControlOutputSchema>;

// ── Bundled skill definitions (migrated from setup-flowpilot) ──
const BROWSERCONTROL_SKILLS: SkillSeed[] = [
  {
    name: 'browser_fetch',
    description: "Fetch content from any URL — auto-picks strategy. For login-walled sites uses Chrome Extension relay; for public URLs uses Firecrawl. PRIMARY tool for reading web pages. Use when: needing content from any webpage; accessing data behind a login; performing web research. NOT for: scraping public URLs only (scrape_url); searching the web (search_web).'s real browser session, ToS-safe). For public URLs, uses Firecrawl server-side scraping. This is the PRIMARY tool for reading web pages.",
    category: 'search',
    handler: 'edge:browser-fetch',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'browser_fetch',
        description: 'Fetch content from any URL — auto-picks strategy. For login-walled sites uses Chrome Extension relay; for public URLs uses Firecrawl. PRIMARY tool for reading web pages. Use when: needing content from any webpage; accessing data behind a login; performing web research. NOT for: scraping public URLs only (scrape_url); searching the web (search_web).',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL to fetch',
            },
            force_relay: {
              type: 'boolean',
              description: 'Force Chrome Extension relay even for public URLs (default false)',
            },
          },
          required: [
            'url',
          ],
        },
      },
    },
    instructions: `## When to use
- ALWAYS prefer browser_fetch over scrape_url — it handles routing automatically
- User says "fetch/read/check/look at [URL]"
- User asks about someone's LinkedIn post or profile
- You need to read any web page for content creation or research

## How it works
1. You call browser_fetch with a URL
2. If the URL is login-walled (LinkedIn, X, etc.), you'll get back { action: 'relay_required' }
   - The admin panel's Chrome Extension relay handles this automatically
   - The extension opens the page in the user's real browser (their session, their cookies)
   - Content comes back clean — no ToS violation
3. If the URL is public, it goes through Firecrawl (fast server-side scraping)

## Chaining examples
1. "Read Magnus Froste's latest LinkedIn post and write a blog post" →
   search_web (find LinkedIn URL) → browser_fetch (read it via relay) → write_blog_post (IMPORTANT: pass the full blog content in the 'content' field as markdown)
   
## CRITICAL: write_blog_post content
When calling write_blog_post, ALWAYS provide the 'content' parameter with the full blog post body as markdown.
- If you have source material (from browser_fetch, search, etc.), write the blog post yourself based on that material and pass it as 'content'.
- Do NOT call write_blog_post without content — it will create an empty draft.
- The content should be 600-1200 words of well-structured markdown with ## headings and paragraphs.
2. "Summarize this article" → browser_fetch → respond with summary
3. "Research this company" → browser_fetch (their website) → enrich_company

## Important
- For LinkedIn: ALWAYS use browser_fetch, never scrape_url directly
- The relay only works when the admin has the Chrome Extension installed
- If relay fails, the response will include a fallback suggestion
- You can force relay mode with force_relay=true for any URL`,
  },
];

export const browserControlModule = defineModule<BrowserControlInput, BrowserControlOutput>({
  id: 'browserControl',
  name: 'Browser Control',
  version: '1.0.0',
  description: 'Chrome Extension relay for authenticated web browsing — enables FlowPilot to read login-walled sites (LinkedIn, X) using your browser session',
  capabilities: ['data:read'],
  inputSchema: browserControlInputSchema,
  outputSchema: browserControlOutputSchema,

  skills: [
    // browser_fetch is cross-cutting, kept as core
  ],
  skillSeeds: BROWSERCONTROL_SKILLS,

  async publish(input: BrowserControlInput): Promise<BrowserControlOutput> {
    return { success: true, installed: false };
  },
});
