import { ContentBlock } from '@/types/cms';

// KB Category definition for templates
export interface TemplateKbCategory {
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  articles: TemplateKbArticle[];
}

// KB Article definition for templates
export interface TemplateKbArticle {
  title: string;
  slug: string;
  question: string;
  answer_text: string;
  answer_json?: ContentBlock[];
  is_featured?: boolean;
  include_in_chat?: boolean;
}

// =====================================================
// PezCMS Knowledge Base Articles
// =====================================================

export const pezcmsKbCategories: TemplateKbCategory[] = [
  // ===== GETTING STARTED =====
  {
    name: 'Getting Started',
    slug: 'getting-started',
    description: 'Learn the basics of PezCMS and get up and running quickly.',
    icon: 'Rocket',
    articles: [
      {
        title: 'What is PezCMS?',
        slug: 'what-is-pezcms',
        question: 'What is PezCMS and what can I do with it?',
        answer_text: 'PezCMS is a modern, open-source content management system built for speed, simplicity, and flexibility. It combines a visual block editor with a headless API, giving you the best of both worlds.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-intro',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'PezCMS is a modern, open-source content management system built for speed, simplicity, and flexibility. It combines a visual block editor with a headless API, giving you the best of both worlds.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Key Features' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Visual Block Editor' }, { type: 'text', text: ' – Drag-and-drop interface with 27+ block types' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Headless API' }, { type: 'text', text: ' – Full REST API for custom frontends and mobile apps' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Self-Hostable' }, { type: 'text', text: ' – Run on your own infrastructure with full control' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'AI-Powered' }, { type: 'text', text: ' – Built-in AI chat, content generation, and translation' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Built-in Modules' }, { type: 'text', text: ' – Blog, newsletter, CRM, knowledge base, and e-commerce ready to use' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Creating Your First Page',
        slug: 'creating-first-page',
        question: 'How do I create my first page in PezCMS?',
        answer_text: 'Go to Admin → Pages → New Page. Enter a title, choose a template or start blank, then add blocks using the + button. Click Save when done, then Publish to make it live.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-first-page',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Creating Your First Page' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Navigate to ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Admin → Pages' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'New Page' }, { type: 'text', text: ' in the top right' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Enter a title for your page' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click the ' }, { type: 'text', marks: [{ type: 'bold' }], text: '+ button' }, { type: 'text', text: ' to add blocks (Hero, Text, Images, etc.)' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Arrange and edit blocks as needed' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Save' }, { type: 'text', text: ' to save as draft' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Publish' }, { type: 'text', text: ' when ready to go live' }] }] },
                  ] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Tip: Every save creates a version you can restore later if needed.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Understanding User Roles',
        slug: 'user-roles',
        question: 'What are the different user roles in PezCMS?',
        answer_text: 'PezCMS has three roles: Writer (create and edit own drafts), Approver (review and publish content), and Admin (full access including settings and users).',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-roles',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'User Roles Explained' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'PezCMS uses a role-based access control system with three levels:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Writer' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Create new pages and blog posts' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Edit their own draft content' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Submit content for review' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Access the media library' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Approver' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'All Writer permissions' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Review and approve content from writers' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Publish and unpublish pages' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Manage leads and deals in CRM' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Admin' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Full access to all features' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Manage users and roles' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Configure site settings and branding' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Set up webhooks and integrations' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Delete content and manage products' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Navigation and Menu',
        slug: 'navigation-menu',
        question: 'How do I manage the navigation menu?',
        answer_text: 'Go to Admin → Menu Order to drag and reorder menu items. Pages are automatically added to the menu when created. Toggle "Show in Menu" in page settings to hide pages from navigation.',
        include_in_chat: true,
      },
    ],
  },
  
  // ===== CONTENT MANAGEMENT =====
  {
    name: 'Content Management',
    slug: 'content-management',
    description: 'Learn how to create, edit, and publish content effectively.',
    icon: 'FileText',
    articles: [
      {
        title: 'Block Types Overview',
        slug: 'block-types',
        question: 'What block types are available in PezCMS?',
        answer_text: 'PezCMS offers 27+ block types including Hero, Text, Image, Gallery, Features, Stats, Testimonials, Pricing, Forms, Newsletter, Map, YouTube, Chat, and many more. Each block is fully customizable.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-blocks',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Available Block Types' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'PezCMS provides a comprehensive library of content blocks:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Content Blocks' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Hero, Text, Image, Quote, Separator, Two-Column, Info Box' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Showcase Blocks' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Features, Stats, Timeline, Gallery, Logos, Team, Testimonials' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'E-commerce Blocks' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Pricing, Products, Cart, Comparison' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Form Blocks' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Contact, Form Builder, Newsletter, Booking' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Navigation Blocks' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Header, Footer, Link Grid, Accordion' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Media Blocks' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'YouTube, Map, Article Grid' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'AI & Interactive' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Chat Widget, Popup, CTA Buttons' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Publishing Workflow',
        slug: 'publishing-workflow',
        question: 'How does the publishing workflow work?',
        answer_text: 'Content goes through Draft → Reviewing → Published. Writers create drafts and submit for review. Approvers review and can approve, reject, or request changes. Approved content can be published immediately or scheduled.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-workflow',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Publishing Workflow' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'PezCMS uses a structured workflow to ensure content quality:' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Draft' }, { type: 'text', text: ' – Content is being created. Only visible to the author and admins.' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Reviewing' }, { type: 'text', text: ' – Submitted for approval. Approvers can review, comment, and make changes.' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Published' }, { type: 'text', text: ' – Live on the website. Visible to all visitors.' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Archived' }, { type: 'text', text: ' – Removed from the site but preserved for reference.' }] }] },
                  ] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Tip: Use the Schedule feature to publish content at a specific date and time.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Version History',
        slug: 'version-history',
        question: 'How does version history work?',
        answer_text: 'Every time you save a page, a new version is created automatically. Go to the Version History panel to see all versions, compare changes, and restore any previous version with one click.',
        include_in_chat: true,
      },
      {
        title: 'Media Library',
        slug: 'media-library',
        question: 'How do I manage images and files?',
        answer_text: 'The Media Library stores all uploaded images and files. Access it via Admin → Media. You can upload files, organize them, and reuse them across multiple pages. Images are automatically optimized for web.',
        include_in_chat: true,
      },
      {
        title: 'SEO Settings',
        slug: 'seo-settings',
        question: 'How do I configure SEO for my pages?',
        answer_text: 'Each page has SEO settings in the Page Settings dialog. Set the meta title, description, and Open Graph image. PezCMS automatically generates structured data and sitemaps for better search engine visibility.',
        include_in_chat: true,
      },
      {
        title: 'Blog Management',
        slug: 'blog-management',
        question: 'How do I manage blog posts?',
        answer_text: 'Go to Admin → Blog to manage posts, categories, and tags. Create posts with the same block editor as pages. Set featured images, excerpts, and author information. Schedule posts for future publication.',
        include_in_chat: true,
      },
    ],
  },
  
  // ===== TROUBLESHOOTING =====
  {
    name: 'Troubleshooting',
    slug: 'troubleshooting',
    description: 'Common issues and how to resolve them.',
    icon: 'Wrench',
    articles: [
      {
        title: 'Page Not Saving',
        slug: 'page-not-saving',
        question: 'Why is my page not saving?',
        answer_text: 'Check your internet connection first. If connected, try refreshing the page. Auto-save runs every few seconds, so your work should be preserved. If issues persist, check browser console for errors.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-not-saving',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Page Not Saving – Troubleshooting' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'If your page is not saving, try these steps:' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Check Internet Connection' }, { type: 'text', text: ' – Ensure you have a stable connection' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Refresh the Page' }, { type: 'text', text: ' – Sometimes a simple refresh resolves sync issues' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Check for Errors' }, { type: 'text', text: ' – Look at the browser console (F12) for error messages' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Clear Browser Cache' }, { type: 'text', text: ' – Old cached data can sometimes cause issues' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Try Another Browser' }, { type: 'text', text: ' – Rule out browser-specific issues' }] }] },
                  ] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Note: Auto-save runs continuously, so recent changes should be preserved even if you lose connection.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Images Not Loading',
        slug: 'images-not-loading',
        question: 'Why are my images not showing?',
        answer_text: 'Check if the image URL is correct and accessible. For uploaded images, verify they exist in the Media Library. Large images may take time to load. Try re-uploading if the issue persists.',
        include_in_chat: true,
      },
      {
        title: 'Cannot Publish Page',
        slug: 'cannot-publish',
        question: 'Why can I not publish my page?',
        answer_text: 'Only users with Approver or Admin roles can publish pages. Writers must submit pages for review first. Check your user role in the profile settings or contact an admin to request publishing permissions.',
        include_in_chat: true,
      },
      {
        title: 'Slow Performance',
        slug: 'slow-performance',
        question: 'Why is the admin panel slow?',
        answer_text: 'Large pages with many blocks can slow down the editor. Try breaking long pages into multiple pages. Optimize images before uploading. Clear browser cache and disable browser extensions that might interfere.',
        include_in_chat: true,
      },
      {
        title: 'Login Issues',
        slug: 'login-issues',
        question: 'I cannot log in to the admin panel',
        answer_text: 'Verify your email and password are correct. Use the "Forgot Password" link to reset if needed. Check if your account has been deactivated by an admin. Clear cookies and try again.',
        include_in_chat: true,
      },
      {
        title: 'Form Submissions Missing',
        slug: 'form-submissions-missing',
        question: 'Where are my form submissions?',
        answer_text: 'Form submissions are stored in Admin → Form Submissions. Only Admin users can view submissions. Check if the form block has a unique ID. Verify that webhooks are configured if you expect external notifications.',
        include_in_chat: true,
      },
      {
        title: 'AI Chat Not Responding',
        slug: 'ai-chat-not-responding',
        question: 'Why is the AI chat not working?',
        answer_text: 'The AI chat requires proper API configuration. Check that the AI settings are configured in Admin → Settings → Chat. Verify the API key is valid. Some features require a connected LLM provider.',
        include_in_chat: true,
      },
    ],
  },
  
  // ===== AI FEATURES =====
  {
    name: 'AI Features',
    slug: 'ai-features',
    description: 'Learn how to use AI-powered features for content creation and customer engagement.',
    icon: 'Sparkles',
    articles: [
      {
        title: 'AI Chat Widget',
        slug: 'ai-chat-widget',
        question: 'How do I add an AI chat widget to my site?',
        answer_text: 'Add the Chat block to any page or enable the global chat widget in Admin → Settings → Chat. The AI uses your Knowledge Base articles to answer visitor questions automatically.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-ai-chat',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'AI Chat Widget Setup' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'PezCMS includes a powerful AI-powered chat widget that can answer visitor questions automatically using your content.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Setup Options' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Global Widget' }, { type: 'text', text: ' – Enable in Admin → Settings → Chat to show on all pages' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Page Block' }, { type: 'text', text: ' – Add the Chat block to specific pages' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Knowledge Sources' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Knowledge Base articles marked "Include in Chat"' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Published pages and blog posts' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Custom system prompts from settings' }] }] },
                  ] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Tip: The more Knowledge Base articles you create, the smarter your chat becomes!' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'AI Text Generation',
        slug: 'ai-text-generation',
        question: 'How do I use AI to generate content?',
        answer_text: 'In any text editor, click the AI assistant icon (sparkle) to generate or improve content. You can ask AI to write, rewrite, summarize, translate, or adjust tone. Works in pages, blog posts, and newsletters.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-ai-text',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'AI Content Generation' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'PezCMS includes built-in AI writing assistance to help you create content faster.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Available AI Actions' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Generate' }, { type: 'text', text: ' – Create new content from a prompt or topic' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Improve' }, { type: 'text', text: ' – Enhance existing text for clarity and impact' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Shorten' }, { type: 'text', text: ' – Condense long text while keeping key points' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Expand' }, { type: 'text', text: ' – Add more detail and depth to your content' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Translate' }, { type: 'text', text: ' – Convert content to other languages' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Change Tone' }, { type: 'text', text: ' – Adjust from formal to casual, or professional to friendly' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'How to Use' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Open any text editor in PezCMS' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click the sparkle icon (✨) in the toolbar' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Select an action or type a custom prompt' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Review and apply the generated content' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'AI Lead Qualification',
        slug: 'ai-lead-qualification',
        question: 'How does AI lead qualification work?',
        answer_text: 'When leads are created from forms, the AI analyzes the submission and scores the lead based on quality signals. It generates a summary and identifies key interests. View AI insights on each lead\'s detail page.',
        include_in_chat: true,
      },
      {
        title: 'Brand Analysis',
        slug: 'ai-brand-analysis',
        question: 'What is AI brand analysis?',
        answer_text: 'In Admin → Settings → Branding, click "Analyze Brand" to have AI review your website and suggest brand guidelines including colors, fonts, tone of voice, and style recommendations based on your content.',
        include_in_chat: true,
      },
      {
        title: 'AEO Analyzer',
        slug: 'aeo-analyzer',
        question: 'What is the AEO (Answer Engine Optimization) analyzer?',
        answer_text: 'The AEO Analyzer reviews your content to ensure it is optimized for AI search engines and answer boxes. It suggests improvements to make your content more likely to appear as AI-generated answers in search results.',
        include_in_chat: true,
      },
    ],
  },
  
  // ===== WEBHOOKS =====
  {
    name: 'Webhooks',
    slug: 'webhooks',
    description: 'Connect PezCMS to external services with real-time event notifications.',
    icon: 'Webhook',
    articles: [
      {
        title: 'What Are Webhooks?',
        slug: 'what-are-webhooks',
        question: 'What are webhooks and how do they work?',
        answer_text: 'Webhooks send real-time HTTP notifications to external services when events occur in PezCMS. For example, when a form is submitted or a page is published, PezCMS can notify your CRM, email service, or automation tool.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-webhooks-intro',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Understanding Webhooks' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Webhooks are automated messages sent from PezCMS to external services when specific events occur. They enable real-time integrations without polling.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'How It Works' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'An event occurs in PezCMS (e.g., form submitted)' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'PezCMS sends an HTTP POST request to your webhook URL' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Your service receives the data and takes action' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Common Use Cases' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Sync form submissions to your CRM' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Trigger email sequences when someone subscribes' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Notify Slack when content is published' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Update external systems when orders are placed' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Creating a Webhook',
        slug: 'creating-webhook',
        question: 'How do I create a webhook?',
        answer_text: 'Go to Admin → Webhooks → Add Webhook. Enter a name, the destination URL, select which events to subscribe to, and optionally add custom headers and a secret for signature verification.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-create-webhook',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Creating a Webhook' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Navigate to ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Admin → Webhooks' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Add Webhook' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Enter a descriptive name (e.g., "CRM Sync")' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Paste your destination URL' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Select one or more events to trigger the webhook' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Optionally add custom headers for authentication' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Optionally add a secret for HMAC signature verification' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click Save to activate the webhook' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Webhook Events',
        slug: 'webhook-events',
        question: 'What webhook events are available?',
        answer_text: 'PezCMS supports events for pages (published, updated, deleted), blog posts (published, updated, deleted), forms (submitted), newsletter (subscribed, unsubscribed), bookings (submitted), and orders (created, paid, cancelled, refunded).',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-webhook-events',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Available Webhook Events' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Content Events' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'page.published' }, { type: 'text', text: ' – When a page is published' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'page.updated' }, { type: 'text', text: ' – When a published page is updated' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'page.deleted' }, { type: 'text', text: ' – When a page is deleted' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'blog_post.published' }, { type: 'text', text: ' – When a blog post is published' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'blog_post.updated' }, { type: 'text', text: ' – When a blog post is updated' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'blog_post.deleted' }, { type: 'text', text: ' – When a blog post is deleted' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Form & Marketing Events' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'form.submitted' }, { type: 'text', text: ' – When a form is submitted' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'newsletter.subscribed' }, { type: 'text', text: ' – When someone subscribes' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'newsletter.unsubscribed' }, { type: 'text', text: ' – When someone unsubscribes' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'booking.submitted' }, { type: 'text', text: ' – When a booking is made' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Order Events' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'order.created' }, { type: 'text', text: ' – When an order is created' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'order.paid' }, { type: 'text', text: ' – When payment is confirmed' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'order.cancelled' }, { type: 'text', text: ' – When an order is cancelled' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'order.refunded' }, { type: 'text', text: ' – When an order is refunded' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Webhook Security',
        slug: 'webhook-security',
        question: 'How do I secure my webhooks?',
        answer_text: 'Use the secret field when creating a webhook. PezCMS will include an HMAC-SHA256 signature in the X-Webhook-Signature header. Verify this signature on your server to ensure requests are authentic.',
        include_in_chat: true,
      },
      {
        title: 'Webhook Logs',
        slug: 'webhook-logs',
        question: 'How do I debug webhook issues?',
        answer_text: 'Each webhook shows delivery logs with status codes, response times, and error messages. Click on a webhook to view its history. Failed deliveries show the error and can be retried manually.',
        include_in_chat: true,
      },
      {
        title: 'n8n Integration',
        slug: 'n8n-integration',
        question: 'How do I connect PezCMS to n8n?',
        answer_text: 'n8n is a workflow automation tool. Create a webhook trigger in n8n, copy the URL, then create a webhook in PezCMS pointing to that URL. Select the events you want to trigger your n8n workflow.',
        include_in_chat: true,
      },
    ],
  },
  
  // ===== API INTEGRATION =====
  {
    name: 'API Integration',
    slug: 'api-integration',
    description: 'Use the headless API to build custom frontends and integrations.',
    icon: 'Code',
    articles: [
      {
        title: 'API Overview',
        slug: 'api-overview',
        question: 'Does PezCMS have an API?',
        answer_text: 'Yes! PezCMS is fully headless with a complete REST API. You can fetch pages, blog posts, products, and more. Use the API to build custom frontends, mobile apps, or integrate with other systems.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-api-overview',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'PezCMS Headless API' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'PezCMS provides a complete REST API for building custom experiences:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Available Endpoints' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Pages' }, { type: 'text', text: ' – Fetch published pages with full content' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Blog Posts' }, { type: 'text', text: ' – List and retrieve blog posts with categories/tags' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Products' }, { type: 'text', text: ' – Access product catalog for e-commerce' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Knowledge Base' }, { type: 'text', text: ' – Query KB categories and articles' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Settings' }, { type: 'text', text: ' – Retrieve site settings and navigation' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Use Cases' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Build a custom React/Vue/Next.js frontend' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Create native mobile apps for iOS and Android' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Integrate content into existing applications' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Generate static sites with any framework' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Content API Endpoint',
        slug: 'content-api',
        question: 'How do I fetch content from the API?',
        answer_text: 'Use the /functions/v1/content-api endpoint with query parameters for type (page, post, product), slug, and status. Returns JSON with full content blocks that can be rendered in any framework.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-content-api',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Content API Usage' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Endpoint' }] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'GET /functions/v1/content-api' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Query Parameters' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'type' }, { type: 'text', text: ' – Content type: page, post, product' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'slug' }, { type: 'text', text: ' – URL slug of the content' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'status' }, { type: 'text', text: ' – Filter by status (published, draft)' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'limit' }, { type: 'text', text: ' – Number of items to return' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'offset' }, { type: 'text', text: ' – Pagination offset' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Example Request' }] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'curl "https://your-site.com/functions/v1/content-api?type=page&slug=home"' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'RSS Feed',
        slug: 'rss-feed',
        question: 'Does PezCMS have an RSS feed?',
        answer_text: 'Yes, the blog has an automatic RSS feed at /functions/v1/blog-rss. The feed includes published posts with titles, excerpts, dates, and links. Use it for podcast apps, feed readers, or syndication.',
        include_in_chat: true,
      },
      {
        title: 'Sitemap',
        slug: 'sitemap',
        question: 'Is there an automatic sitemap?',
        answer_text: 'Yes, PezCMS generates a sitemap.xml automatically at /functions/v1/sitemap-xml. It includes all published pages, blog posts, and categories. Submit it to Google Search Console for better indexing.',
        include_in_chat: true,
      },
      {
        title: 'LLMs.txt',
        slug: 'llms-txt',
        question: 'What is LLMs.txt?',
        answer_text: 'LLMs.txt is a standard for providing AI-friendly content to large language models. PezCMS generates this automatically at /functions/v1/llms-txt, helping AI search engines understand and reference your content.',
        include_in_chat: true,
      },
      {
        title: 'Authentication',
        slug: 'api-authentication',
        question: 'How do I authenticate API requests?',
        answer_text: 'Public endpoints like content-api and blog-rss are open by default. For protected operations, include the Supabase anon key in the Authorization header. Admin operations require a logged-in user session.',
        include_in_chat: true,
      },
    ],
  },

  // ===== CRM MODULE =====
  {
    name: 'CRM Module',
    slug: 'crm-module',
    description: 'Manage leads, deals, and companies with the built-in CRM.',
    icon: 'Users',
    articles: [
      {
        title: 'CRM Overview',
        slug: 'crm-overview',
        question: 'What is the CRM module in PezCMS?',
        answer_text: 'The CRM module helps you manage your sales pipeline with leads, deals, and companies. Track interactions, qualify prospects with AI, and convert leads into customers – all from within your CMS.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-crm-overview',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'CRM Module Overview' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'PezCMS includes a built-in CRM (Customer Relationship Management) system that integrates directly with your content and forms.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Key Components' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Leads' }, { type: 'text', text: ' – Potential customers collected from forms, chat, or manual entry' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Deals' }, { type: 'text', text: ' – Sales opportunities with value, stage, and expected close date' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Companies' }, { type: 'text', text: ' – Organizations linked to leads for B2B tracking' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Activities' }, { type: 'text', text: ' – Notes, calls, meetings, and tasks tracked per deal' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'AI-Powered Features' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Automatic lead qualification and scoring' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'AI-generated lead summaries' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Company data enrichment' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Managing Leads',
        slug: 'managing-leads',
        question: 'How do I manage leads in PezCMS?',
        answer_text: 'Go to Admin → Leads to see all leads. Leads are automatically created from form submissions. You can filter by status (Lead, Opportunity, Customer, Lost), assign leads to team members, and view lead scores.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-leads',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Managing Leads' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Leads are the starting point of your sales pipeline. Here\'s how to work with them effectively.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Lead Sources' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Form submissions' }, { type: 'text', text: ' – Automatically captured from contact and booking forms' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Chat conversations' }, { type: 'text', text: ' – Captured when visitors provide their email in chat' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Newsletter signups' }, { type: 'text', text: ' – Optionally converted to leads' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Manual entry' }, { type: 'text', text: ' – Create leads directly in the CRM' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'CSV import' }, { type: 'text', text: ' – Bulk import leads from spreadsheets' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Lead Statuses' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Lead' }, { type: 'text', text: ' – New, unqualified contact' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Opportunity' }, { type: 'text', text: ' – Qualified and showing interest' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Customer' }, { type: 'text', text: ' – Converted to paying customer' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Lost' }, { type: 'text', text: ' – Did not convert' }] }] },
                  ] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Tip: Use AI qualification to automatically score and prioritize leads based on their activity and profile.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Lead Scoring',
        slug: 'lead-scoring',
        question: 'How does lead scoring work?',
        answer_text: 'Leads are scored 0-100 based on activities like page views, form submissions, email opens, and chat engagement. Higher scores indicate more engaged prospects. AI qualification can automatically analyze and summarize lead potential.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-lead-scoring',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Lead Scoring' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Lead scores help you prioritize which prospects to focus on. Scores are calculated based on engagement.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Scoring Activities' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Form submission' }, { type: 'text', text: ' – +20 points' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Chat conversation' }, { type: 'text', text: ' – +15 points' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Email opened' }, { type: 'text', text: ' – +5 points' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Link clicked' }, { type: 'text', text: ' – +10 points' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Pricing page viewed' }, { type: 'text', text: ' – +25 points' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Booking made' }, { type: 'text', text: ' – +30 points' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'AI Qualification' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Click "Qualify with AI" on any lead to get an AI-generated analysis including:' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Summary of lead activities and interests' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Recommended next actions' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Potential value assessment' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Creating Deals',
        slug: 'creating-deals',
        question: 'How do I create and manage deals?',
        answer_text: 'Deals represent sales opportunities. Create a deal from a lead by clicking "Create Deal" on the lead detail page. Set the value, expected close date, and product. Track deals through stages: Proposal → Negotiation → Closed Won/Lost.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-deals',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Managing Deals' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Deals track your sales pipeline from initial interest to closed revenue.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Creating a Deal' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Go to a lead detail page or Admin → Deals' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click "Create Deal" or "New Deal"' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Enter the deal value and currency' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Set the expected close date' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Optionally link to a product' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Add notes about the opportunity' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Deal Stages' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Proposal' }, { type: 'text', text: ' – Initial offer sent to the prospect' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Negotiation' }, { type: 'text', text: ' – Active discussions on terms' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Closed Won' }, { type: 'text', text: ' – Deal completed successfully' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Closed Lost' }, { type: 'text', text: ' – Deal did not close' }] }] },
                  ] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Tip: Use the Kanban view to drag deals between stages visually.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Deal Kanban Board',
        slug: 'deal-kanban',
        question: 'How do I use the deal Kanban board?',
        answer_text: 'The Kanban board shows deals organized by stage in columns. Drag deals between columns to update their stage. Click a deal card to view details. The board shows total pipeline value and expected revenue per stage.',
        include_in_chat: true,
      },
      {
        title: 'Deal Activities',
        slug: 'deal-activities',
        question: 'How do I track activities on deals?',
        answer_text: 'Each deal has an activity timeline. Add notes, log calls, schedule meetings, or create tasks. Activities are timestamped and linked to the user who created them. Use activities to track all interactions with the prospect.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-deal-activities',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Tracking Deal Activities' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Keep a complete history of interactions on each deal with the activity timeline.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Activity Types' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Note' }, { type: 'text', text: ' – Free-form text notes about the deal' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Call' }, { type: 'text', text: ' – Log phone calls with outcomes' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Meeting' }, { type: 'text', text: ' – Schedule and track meetings' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Email' }, { type: 'text', text: ' – Record email correspondence' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Task' }, { type: 'text', text: ' – Create follow-up tasks with due dates' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Adding Activities' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Open a deal detail page' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click "Add Activity"' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Select the activity type' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Enter details and save' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Managing Companies',
        slug: 'managing-companies',
        question: 'How do I manage companies in the CRM?',
        answer_text: 'Companies group leads from the same organization. Go to Admin → Companies to view all companies. Link leads to companies for B2B tracking. Companies can be enriched with AI to pull industry, size, and other data.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-companies',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Managing Companies' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Companies help you organize leads by organization for B2B sales tracking.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Company Information' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Name' }, { type: 'text', text: ' – Company name' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Domain' }, { type: 'text', text: ' – Website domain for matching leads' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Industry' }, { type: 'text', text: ' – Business sector' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Size' }, { type: 'text', text: ' – Number of employees' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Website' }, { type: 'text', text: ' – Full website URL' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Address' }, { type: 'text', text: ' – Physical location' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Phone' }, { type: 'text', text: ' – Contact number' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Notes' }, { type: 'text', text: ' – Internal notes about the company' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'AI Enrichment' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Click "Enrich with AI" to automatically populate company data based on the domain. This uses web scraping to find public information about the company.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Linking Leads to Companies',
        slug: 'linking-leads-companies',
        question: 'How do I link leads to companies?',
        answer_text: 'On a lead detail page, use the Company dropdown to select or create a company. Leads are automatically matched to companies based on email domain when possible. View all leads from a company on the company detail page.',
        include_in_chat: true,
      },
      {
        title: 'Importing Leads',
        slug: 'importing-leads',
        question: 'How do I import leads from a CSV file?',
        answer_text: 'Go to Admin → Leads and click "Import CSV". Upload a CSV file with columns for email, name, phone, and source. Map your columns to the correct fields and import. Duplicate emails are detected and skipped.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-csv-import',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Importing Leads from CSV' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Bulk import leads from spreadsheets or other CRM systems.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'CSV Format' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Your CSV should include these columns:' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'email' }, { type: 'text', text: ' (required) – Contact email address' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'name' }, { type: 'text', text: ' – Full name' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'phone' }, { type: 'text', text: ' – Phone number' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'source' }, { type: 'text', text: ' – Where the lead came from' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Import Steps' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Go to Admin → Leads' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click "Import CSV"' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Upload your CSV file' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Map columns to lead fields' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Review and confirm import' }] }] },
                  ] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Note: Duplicate emails are automatically detected and skipped to prevent duplicates.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Exporting CRM Data',
        slug: 'exporting-crm',
        question: 'How do I export leads, deals, or companies?',
        answer_text: 'Each CRM section has an "Export CSV" button. Click it to download all records as a CSV file. You can filter the view first to export only matching records. Use exports for backups or analysis.',
        include_in_chat: true,
      },
      {
        title: 'CRM Dashboard',
        slug: 'crm-dashboard',
        question: 'What insights does the CRM dashboard show?',
        answer_text: 'The admin dashboard shows key CRM metrics: total leads, leads needing review, pipeline value, deals by stage, and recent activities. Use it to get a quick overview of your sales pipeline health.',
        include_in_chat: true,
      },
    ],
  },
  
  // ===== BEST PRACTICES =====
  {
    name: 'Best Practices',
    slug: 'best-practices',
    description: 'Expert guidance on content strategy, SEO, and performance optimization.',
    icon: 'Award',
    articles: [
      {
        title: 'Content Strategy Fundamentals',
        slug: 'content-strategy-fundamentals',
        question: 'How do I develop an effective content strategy?',
        answer_text: 'Start by defining your audience and goals. Create a content calendar, maintain consistent publishing schedules, and measure what works. Focus on quality over quantity.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-content-strategy',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Building Your Content Strategy' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'A solid content strategy aligns your publishing efforts with business goals and audience needs.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Step 1: Define Your Audience' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Who are you writing for? Create 2-3 audience personas' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'What problems do they need solved?' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Where do they consume content? (Search, social, email)' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Step 2: Set Measurable Goals' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Traffic' }, { type: 'text', text: ' – Organic visits, page views, time on site' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Engagement' }, { type: 'text', text: ' – Comments, shares, newsletter signups' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Conversion' }, { type: 'text', text: ' – Leads generated, demos booked, sales' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Step 3: Create a Content Calendar' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Consistency matters more than volume. Start with a sustainable schedule:' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Blog posts: 1-2 per week' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Landing pages: Monthly updates' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Knowledge base: Continuous improvement based on support tickets' }] }] },
                  ] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Tip: Use the scheduled publishing feature to maintain consistency even during busy periods.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'SEO Optimization Guide',
        slug: 'seo-optimization-guide',
        question: 'How do I optimize my content for search engines?',
        answer_text: 'Focus on keyword research, compelling meta descriptions, proper heading structure, and quality content. Use the built-in SEO settings for each page and leverage the automatic sitemap generation.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-seo-guide',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'SEO Optimization in PezCMS' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Search engine optimization helps your content get discovered. Here are the key practices.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'On-Page SEO Essentials' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Title Tags' }, { type: 'text', text: ' – Include your primary keyword, keep under 60 characters' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Meta Descriptions' }, { type: 'text', text: ' – Compelling summary under 160 characters with a call to action' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Heading Structure' }, { type: 'text', text: ' – Use H1 for title, H2 for sections, H3 for subsections' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Image Alt Text' }, { type: 'text', text: ' – Describe images for accessibility and search engines' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'URL Best Practices' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep URLs short and descriptive' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Use hyphens, not underscores' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Include your target keyword' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Avoid unnecessary words (the, a, and)' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Technical SEO (Automatic)' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'PezCMS handles these automatically:' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'XML sitemap at /functions/v1/sitemap-xml' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'RSS feed for blog posts' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Canonical URLs to prevent duplicate content' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Mobile-responsive design' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'LLMs.txt for AI search engines' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'AEO: Optimizing for AI Search',
        slug: 'aeo-ai-search-optimization',
        question: 'What is Answer Engine Optimization (AEO)?',
        answer_text: 'AEO optimizes content for AI-powered search engines that provide direct answers. Write clear, question-based content, use structured data, and ensure your knowledge base is comprehensive.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-aeo',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Answer Engine Optimization (AEO)' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'AI search engines like ChatGPT, Perplexity, and Google SGE provide direct answers instead of links. AEO ensures your content gets cited.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Why AEO Matters' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Traditional SEO optimizes for rankings. AEO optimizes for being the answer. When AI cites your content, you get qualified traffic from users who already trust you.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'AEO Best Practices' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Question-Based Content' }, { type: 'text', text: ' – Structure articles around specific questions' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Clear, Concise Answers' }, { type: 'text', text: ' – Provide direct answers in the first paragraph' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Authoritative Depth' }, { type: 'text', text: ' – Follow with detailed explanations and examples' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Structured Data' }, { type: 'text', text: ' – Use proper headings, lists, and formatting' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'PezCMS AEO Features' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'AEO Analyzer reviews your content and suggests improvements' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'LLMs.txt endpoint provides AI-friendly content summaries' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Knowledge Base structure is already AEO-optimized' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Performance Optimization',
        slug: 'performance-optimization',
        question: 'How do I make my website faster?',
        answer_text: 'Optimize images before uploading, use lazy loading for below-the-fold content, minimize the number of blocks per page, and leverage browser caching. PezCMS automatically optimizes images on upload.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-performance',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Performance Optimization Tips' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Fast websites rank better, convert more, and provide better user experiences.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Image Optimization' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Right Size' }, { type: 'text', text: ' – Upload images at the size they will be displayed' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Format' }, { type: 'text', text: ' – Use WebP or JPEG for photos, PNG for graphics with transparency' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Compression' }, { type: 'text', text: ' – PezCMS automatically compresses uploads' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Alt Text' }, { type: 'text', text: ' – Always add descriptive alt text for accessibility' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Page Structure' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep pages focused – avoid cramming everything onto one page' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Use pagination for long lists (blog, products)' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Lazy load images and videos below the fold' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Monitoring Performance' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Use these free tools to measure your site speed:' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Google PageSpeed Insights' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'GTmetrix' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'WebPageTest' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Writing for the Web',
        slug: 'writing-for-web',
        question: 'How should I write content for my website?',
        answer_text: 'Use short paragraphs, clear headings, and scannable formatting. Write at an 8th-grade reading level. Front-load important information and break up text with lists, images, and white space.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-web-writing',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Writing Effective Web Content' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'People read differently online. They scan, skip, and skim. Write accordingly.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'The Inverted Pyramid' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Put the most important information first. Many readers only see the first paragraph – make it count.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Formatting for Scanners' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Short Paragraphs' }, { type: 'text', text: ' – 2-3 sentences maximum' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Descriptive Headings' }, { type: 'text', text: ' – Tell readers what the section contains' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Bullet Lists' }, { type: 'text', text: ' – Break up complex information' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Bold Key Points' }, { type: 'text', text: ' – Help scanners find important information' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'White Space' }, { type: 'text', text: ' – Give content room to breathe' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Voice and Tone' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Write like you speak – conversational, not formal' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Use "you" to address the reader directly' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Avoid jargon unless your audience expects it' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Be specific – "5 minutes" beats "quick"' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Conversion Optimization',
        slug: 'conversion-optimization',
        question: 'How do I get more visitors to take action?',
        answer_text: 'Use clear calls-to-action, reduce friction in forms, build trust with testimonials, and ensure fast page loads. Test different headlines, button text, and layouts to see what works best.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-conversion',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Conversion Rate Optimization' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Getting traffic is only half the battle. Converting visitors into leads and customers requires intentional design.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Clear Calls-to-Action' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One primary CTA per page – make the desired action obvious' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Use action words: "Get Started," "Book Demo," "Download Guide"' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Make buttons stand out with contrasting colors' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Repeat CTAs on long pages' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Reduce Form Friction' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ask only for essential information' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Use smart defaults and autofill when possible' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Show progress for multi-step forms' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Explain why you need each field' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Build Trust' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Display testimonials and case studies' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Show logos of customers or media mentions' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Include team photos and bios' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Be transparent about pricing' }] }] },
                  ] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Tip: Use the Stats and Testimonials blocks to build social proof throughout your pages.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Content Maintenance',
        slug: 'content-maintenance',
        question: 'How often should I update my content?',
        answer_text: 'Review cornerstone content quarterly. Update blog posts with new information annually. Remove or redirect outdated pages. Fresh content signals relevance to search engines and builds trust with visitors.',
        include_in_chat: true,
      },
      {
        title: 'Accessibility Guidelines',
        slug: 'accessibility-guidelines',
        question: 'How do I make my content accessible?',
        answer_text: 'Use descriptive alt text for images, ensure sufficient color contrast, write clear link text, and use proper heading hierarchy. Accessible content reaches more people and improves SEO.',
        include_in_chat: true,
      },
    ],
  },
];
