/**
 * HelpCenter Template - Unified Help Center
 * 
 * Supports multiple help styles via helpStyle parameter:
 * - 'kb-classic': SEO-focused documentation without AI
 * - 'ai-hub': AI-first with prominent chat
 * - 'hybrid': Searchable KB + AI chat (default)
 */
import type { StarterTemplate, TemplatePage } from './types';
import { hybridHelpCategories } from '@/data/template-kb-articles';

const hybridHelpPages: TemplatePage[] = [
  {
    title: 'Home',
    slug: 'home',
    isHomePage: true,
    menu_order: 1,
    showInMenu: true,
    meta: {
      description: 'Welcome to our Help Center - search our knowledge base or chat with AI for instant answers.',
      showTitle: false,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'announcement-status',
        type: 'announcement-bar',
        data: {
          message: '✅ All systems operational — Check our new AI-powered search',
          linkText: 'Status Page',
          linkUrl: '/status',
          variant: 'default',
          dismissable: true,
          sticky: false,
        },
      },
      {
        id: 'tabs-help-topics',
        type: 'tabs',
        data: {
          title: '',
          orientation: 'horizontal',
          variant: 'pills',
          tabs: [
            {
              id: 'tab-getting-started',
              title: 'Getting Started',
              icon: 'Rocket',
              content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'New here? Start with our quick setup guide, connect your account, and explore the platform in under 5 minutes.' }] }] },
            },
            {
              id: 'tab-billing',
              title: 'Billing & Plans',
              icon: 'CreditCard',
              content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Manage your subscription, update payment methods, view invoices, and compare plan features.' }] }] },
            },
            {
              id: 'tab-troubleshooting',
              title: 'Troubleshooting',
              icon: 'Wrench',
              content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Having issues? Check common solutions for login problems, performance issues, and integration errors.' }] }] },
            },
          ],
        },
      },
      {
        id: 'divider-search-categories',
        type: 'section-divider',
        data: {
          shape: 'curved',
          height: 'sm',
        },
      },
      {
        id: 'kb-search-1',
        type: 'kb-search',
        data: {
          placeholder: 'Search for answers...',
          variant: 'hero',
          showPopularSearches: true,
          popularSearches: ['getting started', 'pricing', 'account', 'features'],
        },
      },
      {
        id: 'chat-1',
        type: 'chat-launcher',
        data: {
          title: 'Can\'t find what you need? Ask AI',
          subtitle: 'Get instant answers from our knowledge base',
          placeholder: 'Type your question...',
          showQuickActions: true,
          quickActionCount: 4,
          variant: 'card',
        },
      },
      {
        id: 'kb-hub-1',
        type: 'kb-hub',
        data: {
          title: 'Browse by Category',
          subtitle: '',
          showSearch: false,
          showCategories: true,
          layout: 'cards',
          showContactCta: true,
          contactCtaTitle: 'Need more help?',
          contactCtaLink: '/contact',
          contactCtaButtonText: 'Contact Support',
          showChat: true,
        },
      },
    ],
  },
  {
    title: 'Help Center',
    slug: 'help',
    menu_order: 2,
    showInMenu: true,
    meta: {
      description: 'Complete knowledge base with guides, tutorials, and answers.',
      showTitle: true,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'kb-search-1',
        type: 'kb-search',
        data: {
          placeholder: 'Search articles...',
          variant: 'compact',
          showPopularSearches: false,
        },
      },
      {
        id: 'kb-hub-1',
        type: 'kb-hub',
        data: {
          title: '',
          subtitle: '',
          showSearch: false,
          showCategories: true,
          layout: 'accordion',
          showContactCta: false,
        },
      },
    ],
  },
  {
    title: 'Contact',
    slug: 'contact',
    menu_order: 3,
    showInMenu: true,
    meta: {
      description: 'Get in touch with our support team.',
      showTitle: false,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-1',
        type: 'hero',
        data: {
          title: 'We are here to help',
          subtitle: 'Chat with AI, send us a message, or schedule a call.',
          backgroundType: 'color',
          heightMode: 'auto',
          contentAlignment: 'center',
        },
      },
      {
        id: 'chat-1',
        type: 'chat-launcher',
        data: {
          title: 'Quick Question? Ask AI',
          subtitle: 'Get instant help from our assistant',
          placeholder: 'How can we help you today?',
          showQuickActions: true,
          quickActionCount: 4,
          variant: 'card',
        },
      },
      {
        id: 'form-1',
        type: 'form',
        data: {
          title: 'Send a Message',
          description: 'For complex issues, our team will respond within 24 hours.',
          fields: [
            { id: 'name', type: 'text', label: 'Name', placeholder: 'Your name', required: true, width: 'half' },
            { id: 'email', type: 'email', label: 'Email', placeholder: 'you@example.com', required: true, width: 'half' },
            { id: 'message', type: 'textarea', label: 'How can we help?', placeholder: 'Describe your issue...', required: true, width: 'full' },
          ],
          submitButtonText: 'Send',
          successMessage: 'Thanks! We will get back to you soon.',
          variant: 'card',
        },
      },
      {
        id: 'contact-1',
        type: 'contact',
        data: {
          title: 'Other Options',
          email: 'support@example.com',
          hours: [
            { day: 'AI Assistant', time: 'Available 24/7' },
            { day: 'Human Support', time: 'Mon-Fri 9-18' },
          ],
        },
      },
    ],
  },
];

export const helpCenterTemplate: StarterTemplate = {
  id: 'helpcenter',
  name: 'HelpCenter',
  description: 'Flexible help center template with support for traditional KB, AI chat, or hybrid approach. Configure via helpStyle to match your support strategy.',
  category: 'helpcenter',
  icon: 'HelpCircle',
  tagline: 'KB + AI support made simple',
  aiChatPosition: 'Configurable via helpStyle',
  helpStyle: 'hybrid',
  pages: hybridHelpPages,
  kbCategories: hybridHelpCategories,
  requiredModules: ['knowledgeBase', 'chat', 'forms', 'bookings'],
  branding: {
    logo: '',
    organizationName: 'Help Center',
    brandTagline: 'Answers made easy',
    primaryColor: '220 70% 50%',
    headingFont: 'Outfit',
    bodyFont: 'Inter',
    borderRadius: 'md',
    shadowIntensity: 'medium',
  },
  chatSettings: {
    enabled: true,
    aiProvider: 'openai',
    landingPageEnabled: true,
    widgetEnabled: true,
    widgetPosition: 'bottom-right',
    welcomeMessage: 'Hi! Search our help center or ask me anything.',
    systemPrompt: 'You are a helpful support assistant. Help users find answers in the knowledge base or answer their questions directly. Be friendly and helpful.',
    suggestedPrompts: [
      'How do I get started?',
      'What are your pricing plans?',
      'How can I contact support?',
    ],
    includeContentAsContext: true,
    includedPageSlugs: ['*'],
    includeKbArticles: true,
    contentContextMaxTokens: 50000,
    showContextIndicator: true,
    toolCallingEnabled: true,
  },
  headerSettings: {
    variant: 'sticky',
    stickyHeader: true,
    backgroundStyle: 'blur',
    headerShadow: 'sm',
    showBorder: true,
  },
  footerSettings: {
    variant: 'minimal',
    email: 'support@example.com',
    phone: '+1 (555) 123-4567',
    showBrand: true,
    showQuickLinks: false,
    showContact: false,
    showHours: false,
    weekdayHours: 'Mon-Fri 9-18',
    weekendHours: 'AI: 24/7',
    legalLinks: [
      { id: 'privacy', label: 'Privacy', url: '/privacy-policy', enabled: true },
      { id: 'terms', label: 'Terms', url: '/terms-of-service', enabled: true },
    ],
  },
  seoSettings: {
    siteTitle: 'Help Center',
    titleTemplate: '%s | Help Center',
    defaultDescription: 'Find answers in our knowledge base or chat with AI for instant help.',
    robotsIndex: true,
    robotsFollow: true,
  },
  aeoSettings: {
    enabled: true,
    organizationName: 'Help Center',
    shortDescription: 'Find answers in our knowledge base or chat with AI for instant help.',
    schemaOrgEnabled: true,
    schemaOrgType: 'Organization',
    faqSchemaEnabled: true,
    articleSchemaEnabled: true,
    sitemapEnabled: true,
    llmsTxtEnabled: true,
    llmsFullTxtEnabled: true,
  },
  cookieBannerSettings: {
    enabled: true,
  },
  flowpilot: {
    objectives: [
      { goal: 'Build comprehensive help documentation with 30+ articles', success_criteria: { kb_articles: 30 } },
      { goal: 'Reduce repeat support questions by improving FAQ coverage', success_criteria: { chat_deflection_rate: 70 } },
    ],
    prioritySkills: ['write_blog_post', 'analyze_analytics', 'book_appointment'],
    soul: {
      purpose: 'I manage this help center — ensuring customers find answers quickly and support quality stays high.',
      tone: 'Helpful, patient, clear. Customer-first mindset.',
    },
  },
  siteSettings: {
    homepageSlug: 'home',
  },
};
