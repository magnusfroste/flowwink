import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Block types schema for AI import.
 * 
 * IMPORTANT: Keep this in sync with src/lib/block-reference.ts
 * When adding new blocks, update both files!
 * 
 * Excluded from import (require dynamic data):
 * - products, cart, kb-featured, kb-hub, kb-search, kb-accordion, smart-booking
 */
const BLOCK_TYPES_SCHEMA = `
Available CMS block types:

1. hero - Hero section with title, subtitle, background image, optional CTA button
   Data: { title: string, subtitle?: string, backgroundImage?: string, primaryButton?: { text: string, url: string } }

2. text - Rich text content block
   Data: { content: string } // HTML content

3. image - Single image block
   Data: { src: string, alt?: string, caption?: string }

4. two-column - Two column layout with text and image
   Data: { content: string, imageSrc?: string, imageAlt?: string, imagePosition: 'left' | 'right' }

5. cta - Call to action block
   Data: { title: string, subtitle?: string, buttonText: string, buttonUrl: string }

6. link-grid - Grid of link cards with icons
   Data: { links: [{ title: string, description?: string, url: string, icon?: string }], columns: 2 | 3 | 4 }

7. article-grid - Grid of article cards
   Data: { title?: string, articles: [{ title: string, excerpt?: string, url: string, image?: string }], columns: 2 | 3 | 4 }

8. accordion - FAQ/Accordion sections
   Data: { title?: string, items: [{ question: string, answer: string, image?: string, imageAlt?: string }] }

9. info-box - Highlighted info box
   Data: { title?: string, content: string, variant: 'info' | 'warning' | 'success' | 'error' }

10. quote - Blockquote with attribution
    Data: { quote: string, author?: string, role?: string }

11. stats - Statistics display
    Data: { title?: string, stats: [{ value: string, label: string }] }

12. contact - Contact information block
    Data: { title?: string, phone?: string, email?: string, address?: string, hours?: string }

13. separator - Visual separator
    Data: { style: 'line' | 'dots' | 'space' }

14. youtube - YouTube video embed
    Data: { videoId: string, title?: string } // Extract video ID from URL

15. embed - Generic embed/iframe (for Vimeo, maps, widgets, etc.)
    Data: { url: string, title?: string }

16. gallery - Image gallery
    Data: { images: [{ src: string, alt?: string, caption?: string }], columns: 2 | 3 | 4 }

17. testimonials - Customer testimonials
    Data: { title?: string, testimonials: [{ content: string, author: string, role?: string, avatar?: string }] }

18. team - Team member cards
    Data: { title?: string, members: [{ name: string, role?: string, image?: string, bio?: string, email?: string, phone?: string }] }

19. features - Feature grid
    Data: { title?: string, features: [{ title: string, description: string, icon?: string }], columns: 2 | 3 | 4 }

20. pricing - Pricing table
    Data: { tiers: [{ name: string, price: string, features: string[], buttonText?: string, buttonUrl?: string, highlighted?: boolean }] }

21. logos - Logo showcase
    Data: { title?: string, logos: [{ name: string, logo: string }] }

22. map - Google Maps embed
    Data: { address: string }

23. form - Contact form
    Data: { title?: string, fields: [{ type: 'text' | 'email' | 'textarea', label: string, required?: boolean }], submitButtonText?: string }

24. newsletter - Email signup
    Data: { title?: string, description?: string, buttonText?: string }

25. timeline - Step-by-step or chronological content
    Data: { title?: string, steps: [{ title: string, description: string }] }

26. comparison - Feature comparison table
    Data: { title?: string, products: [{ name: string }], features: [{ name: string, values: string[] }] }

27. tabs - Tabbed content sections
    Data: { tabs: [{ title: string, content: string }] }

28. table - Data table
    Data: { title?: string, columns: [{ header: string }], rows: [{ [columnId]: value }] }

29. countdown - Countdown timer
    Data: { title?: string, targetDate: string }

30. badge - Certification/trust badges
    Data: { title?: string, badges: [{ title: string, image?: string }] }

31. announcement-bar - Top banner for announcements
    Data: { message: string, link?: string, linkText?: string }

32. marquee - Scrolling text ticker
    Data: { items: [{ text: string }] }

33. social-proof - Social proof metrics
    Data: { items: [{ label: string, value: string }] }
`;

// Detect platform from HTML/metadata
function detectPlatform(html: string, metadata: Record<string, unknown>): string {
  const htmlLower = html.toLowerCase();
  const generator = String(metadata.generator || '').toLowerCase();
  
  if (generator.includes('wordpress') || htmlLower.includes('wp-content') || htmlLower.includes('wp-includes')) {
    return 'wordpress';
  }
  if (htmlLower.includes('wix.com') || htmlLower.includes('wixsite') || htmlLower.includes('_wix')) {
    return 'wix';
  }
  if (htmlLower.includes('squarespace') || htmlLower.includes('sqsp')) {
    return 'squarespace';
  }
  if (htmlLower.includes('shopify') || htmlLower.includes('cdn.shopify')) {
    return 'shopify';
  }
  if (htmlLower.includes('webflow.com') || htmlLower.includes('w-') && htmlLower.includes('data-w-id')) {
    return 'webflow';
  }
  if (htmlLower.includes('ghost.io') || generator.includes('ghost')) {
    return 'ghost';
  }
  if (htmlLower.includes('hubspot') || htmlLower.includes('hs-sites')) {
    return 'hubspot';
  }
  if (htmlLower.includes('drupal') || generator.includes('drupal')) {
    return 'drupal';
  }
  if (htmlLower.includes('sitevision') || htmlLower.includes('sv-') && htmlLower.includes('sv-portlet')) {
    return 'sitevision';
  }
  if (htmlLower.includes('episerver') || htmlLower.includes('optimizely')) {
    return 'episerver';
  }
  
  return 'unknown';
}

// Extract video URLs from HTML
function extractVideos(html: string): { type: string; url: string; id?: string }[] {
  const videos: { type: string; url: string; id?: string }[] = [];
  
  // YouTube patterns
  const youtubePatterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube-nocookie\.com\/embed\/)([a-zA-Z0-9_-]{11})/gi,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/gi,
  ];
  
  for (const pattern of youtubePatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const videoId = match[1];
      if (!videos.find(v => v.id === videoId && v.type === 'youtube')) {
        videos.push({ 
          type: 'youtube', 
          url: `https://www.youtube.com/watch?v=${videoId}`,
          id: videoId 
        });
      }
    }
  }
  
  // Vimeo patterns
  const vimeoPatterns = [
    /vimeo\.com\/(\d+)/gi,
    /player\.vimeo\.com\/video\/(\d+)/gi,
  ];
  
  for (const pattern of vimeoPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const videoId = match[1];
      if (!videos.find(v => v.id === videoId && v.type === 'vimeo')) {
        videos.push({ 
          type: 'vimeo', 
          url: `https://vimeo.com/${videoId}`,
          id: videoId 
        });
      }
    }
  }
  
  return videos;
}

// Extract images from HTML with better pattern matching
function extractImagesFromHtml(html: string): { src: string; alt?: string }[] {
  const images: { src: string; alt?: string }[] = [];
  const seenUrls = new Set<string>();
  
  // Match img tags
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?[^>]*>/gi;
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    const src = match[1];
    if (src.startsWith('http') && !seenUrls.has(src)) {
      seenUrls.add(src);
      images.push({ src, alt: match[2] || undefined });
    }
  }
  
  // Match background-image in style
  const bgRegex = /background(?:-image)?:\s*url\(['"]?([^'")\s]+)['"]?\)/gi;
  while ((match = bgRegex.exec(html)) !== null) {
    const src = match[1];
    if (src.startsWith('http') && !seenUrls.has(src)) {
      seenUrls.add(src);
      images.push({ src });
    }
  }
  
  // Match data-src (lazy loading)
  const dataSrcRegex = /data-src=["']([^"']+)["']/gi;
  while ((match = dataSrcRegex.exec(html)) !== null) {
    const src = match[1];
    if (src.startsWith('http') && !seenUrls.has(src)) {
      seenUrls.add(src);
      images.push({ src });
    }
  }
  
  return images;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    const geminiKey = Deno.env.get('GEMINI_API_KEY');

    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'FIRECRAWL_API_KEY is missing. Add it in Settings → Integrations.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!openaiKey && !geminiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'AI API key missing. Add OPENAI_API_KEY or GEMINI_API_KEY in Settings → Integrations.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const useGemini = !openaiKey && geminiKey;

    // Format URL
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    console.log('Step 1: Scraping URL with Firecrawl (enhanced):', formattedUrl);

    // Step 1: Scrape with Firecrawl - enhanced options
    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: ['markdown', 'html', 'rawHtml', 'screenshot'],
        onlyMainContent: false, // Get full page for better extraction
        waitFor: 3000, // Wait for JS to load
        includeTags: ['main', 'article', 'section', 'header', 'footer', 'aside', 'figure', 'video', 'iframe'],
        excludeTags: ['script', 'noscript', 'style'],
      }),
    });

    const scrapeData = await scrapeResponse.json();

    if (!scrapeResponse.ok) {
      console.error('Firecrawl error:', scrapeData);
      return new Response(
        JSON.stringify({ success: false, error: `Could not scrape page: ${scrapeData.error || scrapeResponse.status}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const markdown = scrapeData.data?.markdown || scrapeData.markdown || '';
    const html = scrapeData.data?.html || scrapeData.html || '';
    const rawHtml = scrapeData.data?.rawHtml || scrapeData.rawHtml || html;
    const screenshot = scrapeData.data?.screenshot || scrapeData.screenshot || null;
    const metadata = scrapeData.data?.metadata || scrapeData.metadata || {};

    console.log('Step 2: Scraped content - Markdown:', markdown.length, 'chars, HTML:', html.length, 'chars');
    console.log('Screenshot available:', !!screenshot);
    console.log('Metadata:', JSON.stringify(metadata));

    // Detect platform
    const platform = detectPlatform(rawHtml, metadata);
    console.log('Detected platform:', platform);

    // Extract videos from HTML
    const extractedVideos = extractVideos(rawHtml);
    console.log('Extracted videos:', extractedVideos.length);

    // Extract images from HTML
    const extractedImages = extractImagesFromHtml(rawHtml);
    console.log('Extracted images:', extractedImages.length);

    // Step 2: Use AI to map content to blocks
    console.log('Step 3: Mapping content to CMS blocks with AI...');

    // Build enhanced context
    const platformHints = {
      wordpress: 'This is a WordPress site. Look for wp-content patterns, post content, and featured images.',
      wix: 'This is a Wix site. Content may be heavily nested in divs. Focus on visible text and images.',
      squarespace: 'This is a Squarespace site. Look for section blocks and full-bleed images.',
      shopify: 'This is a Shopify site. Look for product info, prices, and collection layouts.',
      webflow: 'This is a Webflow site. Look for rich interactions and custom layouts.',
      sitevision: 'This is a SiteVision CMS (Swedish). Content structure follows Swedish conventions.',
      episerver: 'This is an Episerver/Optimizely site. Look for structured content blocks.',
      unknown: 'Platform unknown. Use general extraction logic.',
    };

    const platformHint = platformHints[platform as keyof typeof platformHints] || platformHints.unknown;

    let aiResponse: Response;

    const systemPrompt = `You are an expert at analyzing web pages and mapping content to CMS blocks.
Your task is to take content from a scraped web page and transform it into structured CMS blocks.

${BLOCK_TYPES_SCHEMA}

=== PLATFORM CONTEXT ===
${platformHint}

=== CRITICAL RULES ===

CONTENT FILTERING - IGNORE:
- Navigation menus (topbar, sidebar, footer links)
- Breadcrumbs
- "Back" links and navigation links
- Cookie banners and popup messages
- Sidebars with related links (unless main content)
- Repeated menu structures
- Login/signup forms
Focus ONLY on main content (typically in <main> or article area).

HERO BLOCK - CRITICAL:
- If the page has a clear hero/banner section, create a "hero" block
- ALWAYS use the OG image (Open Graph image) as backgroundImage for hero block
- Hero block should have: title (main heading), subtitle (subheading if present), backgroundImage (OG image)

IMAGES - PRESERVE ALL:
- Extract and preserve ALL images from the page
- Use original image URLs (full http/https URLs)
- Include image alt text when available
- Create gallery blocks for image collections

VIDEO CONTENT - CRITICAL:
- Create "youtube" blocks for YouTube videos
- Create "embed" blocks for Vimeo and other video embeds
- Extract video URLs from iframes and embed codes
- Pre-extracted videos are provided below

TEAM/CONTACT PERSONS - CRITICAL:
Identify and include ALL contact persons on the page.
Look for patterns:
- Name + title/role + contact info (email/phone)
- Profile pictures with names
- "Contact", "Team", "About us" sections

For team members, create "team" block with members array.
For single contacts, create "two-column" block with content and imageSrc.

STATISTICS AND FACTS:
Look for sections with:
- Key facts, quick facts, highlights
- Numbers with labels

Create "stats" blocks for numerical facts:
{ value: "180", label: "Credits" }
{ value: "3", label: "Years" }

QUOTES AND TESTIMONIALS:
Look for patterns:
- Quoted text with attribution
- Customer reviews, testimonials
- Blockquotes

Create "quote" or "testimonials" blocks.

=== RESPONSE FORMAT ===
Respond ONLY with valid JSON, no other text:
{
  "title": "Page main title",
  "blocks": [
    { "id": "block-1", "type": "hero", "data": { "title": "...", "subtitle": "...", "backgroundImage": "OG image URL" } },
    { "id": "block-2", "type": "text", "data": { "content": "<p>...</p>" } }
  ]
}`;

    const userPrompt = `Analyze this web page and create CMS blocks:

URL: ${formattedUrl}
Platform: ${platform}
Title: ${metadata.title || 'Unknown'}
Description: ${metadata.description || 'None'}

=== OG IMAGE (USE AS HERO BACKGROUND) ===
${metadata['og:image'] || metadata.ogImage || 'No OG image available'}

=== PRE-EXTRACTED VIDEOS ===
${extractedVideos.length > 0 ? extractedVideos.map(v => `- ${v.type}: ${v.url}`).join('\n') : 'No videos found'}

=== PRE-EXTRACTED IMAGES (${extractedImages.length} total) ===
${extractedImages.slice(0, 20).map(img => `- ${img.src}${img.alt ? ` (alt: ${img.alt})` : ''}`).join('\n')}
${extractedImages.length > 20 ? `\n... and ${extractedImages.length - 20} more images` : ''}

=== MAIN CONTENT (Markdown) ===
${markdown.substring(0, 40000)}
${markdown.length > 40000 ? '\n... (content truncated)' : ''}

=== HTML FOR STRUCTURE ANALYSIS ===
${html.substring(0, 20000)}

=== INSTRUCTIONS ===
1. Create HERO block with OG image as backgroundImage
2. Create VIDEO blocks for all pre-extracted videos
3. Include ALL images appropriately (gallery, two-column, article-grid, etc.)
4. Identify team members and create team block
5. Create stats blocks for numerical facts
6. Identify quotes and testimonials
7. Group related content into appropriate block types

Respond only with JSON.`;

    if (useGemini) {
      // Use Google Gemini API
      const model = 'gemini-2.0-flash-exp';
      
      aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 16384,
          }
        }),
      });
    } else {
      // Use OpenAI API - upgraded to gpt-4o for better analysis
      const model = 'gpt-4o';
      aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: 16384,
          temperature: 0.2,
        }),
      });
    }

    if (!aiResponse.ok) {
      const aiError = await aiResponse.text();
      console.error('AI error:', aiResponse.status, aiError);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: 'AI credits depleted. Check your API account.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ success: false, error: 'AI analysis failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    
    // Parse response based on provider
    let aiContent = '';
    if (useGemini) {
      aiContent = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
      aiContent = aiData.choices?.[0]?.message?.content || '';
    }
    
    console.log('Step 4: AI response received, parsing...');

    // Parse AI response - extract JSON from possible markdown code blocks
    let parsedBlocks;
    try {
      // Try to extract JSON from code blocks first
      const jsonMatch = aiContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonString = jsonMatch ? jsonMatch[1].trim() : aiContent.trim();
      parsedBlocks = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiContent.substring(0, 1000));
      
      // Try to find JSON object directly
      const jsonStart = aiContent.indexOf('{');
      const jsonEnd = aiContent.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        try {
          parsedBlocks = JSON.parse(aiContent.substring(jsonStart, jsonEnd + 1));
        } catch {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'Could not parse AI response',
              rawResponse: aiContent.substring(0, 1000)
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Could not parse AI response',
            rawResponse: aiContent.substring(0, 1000)
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Ensure blocks have unique IDs
    const blocks = (parsedBlocks.blocks || []).map((block: Record<string, unknown>, index: number) => ({
      ...block,
      id: block.id || `block-${Date.now()}-${index}`,
    }));

    console.log('Step 5: Successfully mapped', blocks.length, 'blocks');
    console.log('Block types:', blocks.map((b: Record<string, unknown>) => b.type).join(', '));

    return new Response(
      JSON.stringify({
        success: true,
        sourceUrl: formattedUrl,
        title: parsedBlocks.title || metadata.title || 'Imported page',
        blocks,
        metadata: {
          originalTitle: metadata.title,
          originalDescription: metadata.description,
          platform,
          videosFound: extractedVideos.length,
          imagesFound: extractedImages.length,
          screenshotAvailable: !!screenshot,
          scrapedAt: new Date().toISOString(),
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Migration error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
