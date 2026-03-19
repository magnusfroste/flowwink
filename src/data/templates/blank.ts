/**
 * Blank Template - Starting point for new templates
 * See docs/TEMPLATE-AUTHORING.md for complete documentation.
 */
import type { StarterTemplate } from './types';

export const BLANK_TEMPLATE: StarterTemplate = {
  id: 'blank',
  name: 'Blank Template',
  description: 'A minimal starting point for creating your own template.',
  category: 'startup',
  icon: 'FileText',
  tagline: 'Start from scratch',
  aiChatPosition: 'bottom-right',
  pages: [
    {
      title: 'Home',
      slug: 'home',
      isHomePage: true,
      menu_order: 1,
      showInMenu: true,
      meta: { description: 'Welcome to our website', showTitle: false, titleAlignment: 'center' },
      blocks: [
        {
          id: 'hero-1', type: 'hero',
          data: {
            title: 'Your Headline Here',
            subtitle: 'Add a compelling subtitle that explains your value proposition.',
            backgroundType: 'color', heightMode: 'viewport', contentAlignment: 'center',
            primaryButton: { text: 'Get Started', url: '/contact' },
          },
        },
        {
          id: 'text-1', type: 'text',
          data: {
            content: { type: 'doc', content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'About Us' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Add your content here.' }] },
            ]},
          },
        },
        {
          id: 'cta-1', type: 'cta',
          data: { title: 'Ready to Start?', subtitle: 'Contact us today.', buttonText: 'Contact Us', buttonUrl: '/contact', gradient: true },
        },
      ],
    },
    {
      title: 'Contact', slug: 'contact', menu_order: 2, showInMenu: true,
      meta: { description: 'Get in touch with us', showTitle: false, titleAlignment: 'center' },
      blocks: [
        { id: 'hero-1', type: 'hero', data: { title: 'Contact Us', subtitle: 'We\'d love to hear from you.', backgroundType: 'color', heightMode: 'auto', contentAlignment: 'center' } },
        { id: 'form-1', type: 'form', data: { title: 'Send us a message', submitButtonText: 'Send', successMessage: 'Thanks! We\'ll be in touch soon.', fields: [
          { id: 'name', type: 'text', label: 'Name', required: true },
          { id: 'email', type: 'email', label: 'Email', required: true },
          { id: 'message', type: 'textarea', label: 'Message', required: true },
        ]}},
      ],
    },
  ],
  branding: { organizationName: 'My Site', brandTagline: 'Your tagline here', primaryColor: '217 91% 60%', headingFont: 'Inter', bodyFont: 'Inter', borderRadius: 'md' },
  chatSettings: { enabled: true, landingPageEnabled: true, widgetPosition: 'bottom-right', welcomeMessage: 'Hi! How can I help you today?', systemPrompt: 'You are a helpful assistant.', suggestedPrompts: ['What services do you offer?', 'How can I get started?'], includeContentAsContext: true, includedPageSlugs: ['*'], includeKbArticles: true, contentContextMaxTokens: 50000, showContextIndicator: true },
  headerSettings: { variant: 'sticky', stickyHeader: true, backgroundStyle: 'blur', headerShadow: 'sm', showBorder: true },
  footerSettings: { variant: 'full', email: 'hello@example.com', showBrand: true, showQuickLinks: true, showContact: true, showHours: false },
  seoSettings: { siteTitle: 'My Site', titleTemplate: '%s | My Site', defaultDescription: 'Welcome to our website.', robotsIndex: true, robotsFollow: true },
  aeoSettings: { enabled: true, organizationName: 'My Site', shortDescription: 'Welcome to our website.', schemaOrgEnabled: true, schemaOrgType: 'Organization', faqSchemaEnabled: true, articleSchemaEnabled: true, sitemapEnabled: true, llmsTxtEnabled: true, llmsFullTxtEnabled: true },
  cookieBannerSettings: { enabled: false },
  flowpilot: {
    objectives: [],
    prioritySkills: ['write_blog_post', 'analyze_analytics'],
    soul: {
      purpose: 'I help build and grow this new website from scratch.',
      tone: 'Helpful, adaptive. Ready to learn what this site needs.',
    },

    automations: [
      {
        name: 'Weekly Business Digest',
        description: 'Every Friday afternoon, analyze performance and generate a business digest with key metrics, wins, and next week priorities.',
        trigger_type: 'cron',
        trigger_config: { cron: '0 16 * * 5', timezone: 'UTC' },
        skill_name: 'weekly_business_digest',
        skill_arguments: {},
        enabled: true,
      },
    ],
    workflows: [
      {
        name: 'Content Pipeline',
        description: 'Research a topic, generate a blog post proposal, write and publish. Run manually or trigger from objectives.',
        steps: [
          { id: 'step-1', skill_name: 'research_content', skill_args: { query: '{{topic}}' } },
          { id: 'step-2', skill_name: 'generate_content_proposal', skill_args: { research_context: '{{step-1.output}}' } },
          { id: 'step-3', skill_name: 'write_blog_post', skill_args: { proposal: '{{step-2.output}}' }, on_failure: 'stop' },
        ],
        trigger_type: 'manual',
        enabled: true,
      },
    ],
  },
  siteSettings: { homepageSlug: 'home' },
};
