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
];
