/**
 * FlowWink Agency Template - Agency/Consultant
 * 
 * Agency-focused template for web agencies and consultants.
 * Features ROI calculator, competitor comparisons, and white-label positioning.
 */
import type { StarterTemplate, TemplatePage } from './types';
import { agencyBlogPosts } from '@/data/template-blog-posts';
import { agencyKbCategories } from '@/data/template-kb-articles';

const flowwinkAgencyPages: TemplatePage[] = [
  {
    title: 'Home',
    slug: 'home',
    isHomePage: true,
    menu_order: 1,
    showInMenu: true,
    meta: {
      description: 'FlowWink for agencies - One platform, unlimited client sites, zero SaaS fees. Build faster, charge more, own everything.',
      showTitle: false,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'announcement-agency',
        type: 'announcement-bar',
        data: {
          message: '💰 Calculate your savings: agencies save €10,000+/year switching from Webflow',
          linkText: 'See ROI Calculator',
          linkUrl: '/roi-calculator',
          variant: 'gradient',
          dismissable: true,
          sticky: false,
        },
      },
      {
        id: 'hero-agency',
        type: 'hero',
        data: {
          title: 'One Platform. Unlimited Client Sites. Zero SaaS Fees.',
          subtitle: 'Replace Webflow, Squarespace, and Contentful with a single self-hosted CMS. Build faster. Charge more. Own everything.',
          backgroundType: 'video',
          videoUrl: 'https://videos.pexels.com/video-files/3129671/3129671-uhd_2560_1440_30fps.mp4',
          videoType: 'direct',
          videoPosterUrl: 'https://images.pexels.com/videos/3129671/free-video-3129671.jpg?auto=compress&w=1920',
          videoAutoplay: true,
          videoLoop: true,
          videoMuted: true,
          heightMode: 'viewport',
          contentAlignment: 'center',
          overlayOpacity: 50,
          titleAnimation: 'slide-up',
          showScrollIndicator: true,
          primaryButton: { text: 'Calculate Your Savings', url: '/roi-calculator' },
          secondaryButton: { text: 'See Product Demo', url: 'https://demo.flowwink.com' },
        },
      },
      {
        id: 'divider-hero-stats',
        type: 'section-divider',
        data: {
          shape: 'diagonal',
          height: 'sm',
        },
      },
      {
        id: 'stats-agency',
        type: 'stats',
        data: {
          title: '',
          stats: [
            { value: '€500+', label: 'Saved per Client/Year', icon: 'PiggyBank' },
            { value: '5 min', label: 'Deploy Time', icon: 'Zap' },
            { value: '∞', label: 'Client Sites', icon: 'Layers' },
            { value: '€0', label: 'Platform Fees', icon: 'Ban' },
          ],
        },
      },
      {
        id: 'bento-benefits',
        type: 'bento-grid',
        data: {
          eyebrow: 'WHY FLOWWINK',
          columns: 3,
          variant: 'default',
          gap: 'md',
          staggeredReveal: true,
          items: [
            { id: 'ab1', title: 'White Label', description: 'Your brand, your domain, your AI. Clients see your agency — FlowWink and FlowPilot are completely invisible.', icon: 'Palette', span: 'wide', accentColor: '#8B5CF6' },
            { id: 'ab2', title: 'Unlimited Sites', description: 'One VPS hosts 20–50 client sites, each with its own FlowPilot instance. Scale revenue without scaling costs.', icon: 'Layers', accentColor: '#3B82F6' },
            { id: 'ab3', title: 'Zero Fees', description: 'No per-site, per-user, or per-page charges. Your margins stay yours — forever.', icon: 'Ban', accentColor: '#10B981' },
            { id: 'ab4', title: 'FlowPilot per Client', description: 'Every client gets their own autonomous AI agent — managing content, leads, and campaigns. You deliver next-gen digital presence at agency scale.', icon: 'Bot', span: 'wide', accentColor: '#F59E0B' },
          ],
        },
      },
      {
        id: 'twocol-problem',
        type: 'two-column',
        data: {
          eyebrow: 'THE PROBLEM',
          title: 'The Agency',
          accentText: 'Problem',
          accentPosition: 'end',
          content: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Every tool you use charges per client. As you grow, your margins shrink.' }] },
              { type: 'bulletList', content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Webflow: €20-200 per site per month' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Contentful: €300+ per month' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'WordPress: Plugin chaos and security nightmares' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Tool sprawl: Different platforms, different logins, different workflows' }] }] },
              ]},
              { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'There is a better way.' }] },
            ],
          },
          imageSrc: 'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=800',
          imageAlt: 'Agency team frustrated with tools',
          imagePosition: 'right',
        },
      },
      {
        id: 'twocol-solution',
        type: 'two-column',
        data: {
          eyebrow: 'THE SOLUTION',
          title: 'The FlowWink',
          accentText: 'Solution',
          accentPosition: 'end',
          content: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Self-host one platform, deploy unlimited client sites. Your infrastructure, your rules, your profits.' }] },
              { type: 'bulletList', content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One €20/month VPS hosts 20+ client sites' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Same modern editor, same workflow for every client' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Full white-label: your brand, not ours' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Built-in blog, forms, newsletter, CRM, AI chat' }] }] },
              ]},
            ],
          },
          imageSrc: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=800',
          imageAlt: 'Agency team collaborating effectively',
          imagePosition: 'left',
          ctaText: 'Get Started Free →',
          ctaUrl: '/contact',
        },
      },
      {
        id: 'tabs-audience',
        type: 'tabs',
        data: {
          title: 'Built for Agencies, By Agencies',
          tabs: [
            { id: 'tab-team', title: 'For Your Team', icon: 'Users', content: '<h3>Faster Development</h3><ul><li>Visual block editor with 47+ components</li><li>Reusable templates across clients</li><li>Version history and approval workflows</li><li>One platform to learn, use everywhere</li></ul>' },
            { id: 'tab-clients', title: 'For Your Clients', icon: 'Smile', content: '<h3>Happy Clients</h3><ul><li>Simple, intuitive admin interface</li><li>Built-in blog, newsletter, and forms</li><li>AI chat widget for visitor support</li><li>Mobile-friendly editing on any device</li></ul>' },
            { id: 'tab-business', title: 'For Your Business', icon: 'TrendingUp', content: '<h3>Better Margins</h3><ul><li>Charge monthly management fees</li><li>Keep 100% of what you charge</li><li>No per-client platform costs</li><li>Build once, deploy to many clients</li></ul>' },
          ],
          orientation: 'horizontal',
          variant: 'boxed',
        },
      },
      {
        id: 'comparison-platforms',
        type: 'comparison',
        data: {
          title: 'How FlowWink Compares',
          subtitle: 'Feature comparison with popular agency platforms',
          products: [
            { id: 'p1', name: 'FlowWink', highlighted: true },
            { id: 'p2', name: 'Webflow' },
            { id: 'p3', name: 'Squarespace' },
            { id: 'p4', name: 'WordPress' },
          ],
          features: [
            { id: 'f1', name: 'Monthly Cost (20 sites)', values: ['~€20', '€400-4000', '€300-600', '€100-500'] },
            { id: 'f2', name: 'Unlimited Sites', values: [true, false, false, true] },
            { id: 'f3', name: 'White-Label', values: [true, false, false, true] },
            { id: 'f4', name: 'Visual Editor', values: [true, true, true, false] },
            { id: 'f5', name: 'Content API', values: [true, true, false, false] },
            { id: 'f6', name: 'Self-Hostable', values: [true, false, false, true] },
            { id: 'f7', name: 'Open Source', values: [true, false, false, true] },
            { id: 'f8', name: 'Autonomous AI Agent', values: [true, false, false, false] },
            { id: 'f9', name: 'Client-Friendly Admin', values: [true, false, true, false] },
          ],
          variant: 'striped',
          showPrices: false,
          stickyHeader: true,
        },
      },
      {
        id: 'testimonials-agency',
        type: 'testimonials',
        data: {
          title: 'What Agencies Say',
          testimonials: [
            { id: 't1', content: 'We manage 40 client sites on a €20/month VPS. That is €0.50 per site. Try doing that with Webflow.', author: 'Marcus Lindberg', role: 'Founder', company: 'Nordic Digital Agency', rating: 5 },
            { id: 't2', content: 'The approval workflow means clients cannot break their sites. That alone saves us hours of support every week.', author: 'Sarah Chen', role: 'Creative Director', company: 'Chen & Partners', rating: 5 },
            { id: 't3', content: 'Switched 12 clients from Squarespace. They love the simpler admin, we love the better margins.', author: 'Johan Eriksson', role: 'Agency Owner', company: 'Eriksson Web', rating: 5 },
          ],
          layout: 'carousel',
          columns: 3,
          showRating: true,
          showAvatar: false,
          variant: 'cards',
          autoplay: true,
          autoplaySpeed: 5,
        },
      },
      {
        id: 'features-suite',
        type: 'features',
        data: {
          title: 'Complete Suite Included',
          subtitle: 'Everything your clients need, nothing they do not.',
          features: [
            { id: 'f1', icon: 'Layout', title: 'Visual Page Builder', description: '47+ blocks for any layout. Clients can edit, you control what they can touch.' },
            { id: 'f2', icon: 'PenTool', title: 'Blog & Newsletter', description: 'Built-in blog with categories, tags, and email newsletter. No plugins needed.' },
            { id: 'f3', icon: 'MessageCircle', title: 'AI Chat Widget', description: 'Train on client content. Answers visitor questions 24/7.' },
            { id: 'f4', icon: 'ClipboardList', title: 'Forms & CRM', description: 'Contact forms, lead capture, and basic CRM. All data stays in your control.' },
            { id: 'f5', icon: 'BookOpen', title: 'Knowledge Base', description: 'Help center for client customers. Reduces support load.' },
            { id: 'f6', icon: 'Calendar', title: 'Booking System', description: 'Appointment scheduling built in. Perfect for service businesses.' },
          ],
          columns: 3,
          layout: 'grid',
          variant: 'cards',
          iconStyle: 'circle',
        },
      },
      {
        id: 'chat-launcher-home',
        type: 'chat-launcher',
        data: {
          title: 'Questions About FlowWink for Agencies?',
          subtitle: 'Get instant answers about pricing, deployment, and features',
          placeholder: 'Ask about white-labeling, pricing, or self-hosting...',
          showQuickActions: true,
          quickActionCount: 4,
          variant: 'card',
        },
      },
      {
        id: 'accordion-home-faq',
        type: 'accordion',
        data: {
          title: 'Agency FAQ',
          items: [
            { question: 'How much can I really save?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A single €20/month VPS can host 20-50 client sites. Compare that to €20-200 per site per month with Webflow or Squarespace. Most agencies see 90%+ cost reduction.' }] }] } },
            { question: 'Is it really white-label?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes! FlowWink runs on your domain with your branding. Your clients never see "FlowWink" anywhere. Custom logos, colors, and even custom email domains.' }] }] } },
            { question: 'How long does setup take?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'From zero to production in 5 minutes with Docker. Clone the repo, run docker-compose, and you\'re live. We also offer managed hosting if you prefer not to handle infrastructure.' }] }] } },
            { question: 'What about client support?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'FlowWink is designed for non-technical users. The admin interface is clean and intuitive. Built-in AI chat can also help your clients with common questions automatically.' }] }] } },
            { question: 'Can clients break their sites?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'No! Role-based permissions mean clients can only edit content within the blocks you allow. They cannot touch code, delete pages accidentally, or break layouts. Plus every change is versioned.' }] }] } },
          ],
        },
      },
      {
        id: 'cta-agency',
        type: 'cta',
        data: {
          title: 'Ready to 10x Your Agency Margins?',
          subtitle: 'Join hundreds of agencies building better with FlowWink.',
          buttonText: 'Calculate Your Savings',
          buttonUrl: '/roi-calculator',
          secondaryButtonText: 'Explore Product Demo',
          secondaryButtonUrl: 'https://demo.flowwink.com',
          gradient: true,
        },
      },
    ],
  },
  {
    title: 'ROI Calculator',
    slug: 'roi-calculator',
    menu_order: 2,
    showInMenu: true,
    meta: {
      description: 'Calculate how much your agency can save by switching to FlowWink. Compare costs vs Webflow, Squarespace, and other platforms.',
      showTitle: true,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-roi',
        type: 'hero',
        data: {
          title: 'Calculate Your Savings',
          subtitle: 'See how much you could save by switching to FlowWink',
          backgroundType: 'color',
          heightMode: 'auto',
          contentAlignment: 'center',
          overlayOpacity: 0,
        },
      },
      {
        id: 'stats-example',
        type: 'stats',
        data: {
          title: 'Example: 20 Client Sites',
          stats: [
            { value: '€24,000', label: 'Webflow Annual Cost', icon: 'TrendingDown' },
            { value: '€240', label: 'FlowWink Annual Cost', icon: 'TrendingUp' },
            { value: '€23,760', label: 'Your Annual Savings', icon: 'PiggyBank' },
            { value: '99%', label: 'Cost Reduction', icon: 'Percent' },
          ],
        },
      },
      {
        id: 'table-costs',
        type: 'table',
        data: {
          title: 'Annual Cost Comparison (20 Sites)',
          caption: 'Based on mid-tier plans. Actual costs vary by usage.',
          columns: [
            { id: 'platform', header: 'Platform', align: 'left' },
            { id: 'monthly', header: 'Monthly/Site', align: 'right' },
            { id: 'annual', header: 'Annual (20 sites)', align: 'right' },
            { id: 'savings', header: 'Savings vs FlowWink', align: 'right' },
          ],
          rows: [
            { platform: 'FlowWink (self-hosted)', monthly: '~€1', annual: '€240', savings: '—' },
            { platform: 'Webflow CMS', monthly: '€40-100', annual: '€9,600-24,000', savings: '€9,360-23,760' },
            { platform: 'Squarespace', monthly: '€15-25', annual: '€3,600-6,000', savings: '€3,360-5,760' },
            { platform: 'Contentful', monthly: '€15-300+', annual: '€3,600-72,000', savings: '€3,360-71,760' },
            { platform: 'Duda', monthly: '€20-50', annual: '€4,800-12,000', savings: '€4,560-11,760' },
          ],
          variant: 'striped',
          size: 'md',
          stickyHeader: false,
        },
      },
      {
        id: 'twocol-vps',
        type: 'two-column',
        data: {
          eyebrow: 'HOSTING',
          title: 'The VPS Hosting',
          accentText: 'Math',
          accentPosition: 'end',
          content: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'A single €20/month VPS from Hetzner, DigitalOcean, or similar can comfortably host 20-50 client sites.' }] },
              { type: 'bulletList', content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Docker containers for easy management' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Automatic SSL with Caddy or Traefik' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One-click deployments with Coolify' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Scale up only when you need to' }] }] },
              ]},
              { type: 'paragraph', content: [{ type: 'text', text: 'Even with a premium VPS at €50/month, you are paying €2.50 per site—not €40.' }] },
            ],
          },
          imageSrc: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800',
          imageAlt: 'Server infrastructure',
          imagePosition: 'right',
          ctaText: 'Calculate Your Savings →',
          ctaUrl: '/pricing',
        },
      },
      {
        id: 'accordion-roi-faq',
        type: 'accordion',
        data: {
          title: 'Common Questions',
          items: [
            { question: 'What do I need to self-host?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A VPS with Docker installed. We recommend starting with a €10-20/month server from Hetzner, DigitalOcean, or Vultr. The setup takes about 5 minutes with our Docker image.' }] }] } },
            { question: 'Can I charge clients monthly?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Absolutely! Most agencies charge €99-299/month for website management. Since your actual costs are near-zero, this becomes almost pure profit.' }] }] } },
            { question: 'What about support?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'FlowWink includes documentation and community support. For agencies wanting priority support, we offer managed hosting plans. But most agencies find the platform straightforward to manage.' }] }] } },
            { question: 'How does FlowPilot help agencies?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'FlowPilot is an autonomous AI agent that operates your clients\' websites — writing content, qualifying leads, sending campaigns, and managing bookings. You set objectives per client, FlowPilot executes. Plus the full Content API is available for custom React/Vue apps when clients need it.' }] }] } },
          ],
        },
      },
      {
        id: 'cta-roi',
        type: 'cta',
        data: {
          title: 'Ready to Keep More Revenue?',
          subtitle: 'Start with one client. See the difference.',
          buttonText: 'Get Started Free',
          buttonUrl: '/contact',
          secondaryButtonText: 'View Product Demo',
          secondaryButtonUrl: 'https://demo.flowwink.com',
          gradient: true,
        },
      },
    ],
  },
  {
    title: 'How It Works',
    slug: 'how-it-works',
    menu_order: 3,
    showInMenu: true,
    meta: {
      description: 'Learn how FlowWink works for agencies. From deployment to client handoff in 5 minutes.',
      showTitle: true,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-how',
        type: 'hero',
        data: {
          title: 'From Signup to Client Launch in 5 Minutes',
          subtitle: 'FlowWink is designed for speed. Here is how agencies use it.',
          backgroundType: 'color',
          heightMode: 'auto',
          contentAlignment: 'center',
          overlayOpacity: 0,
        },
      },
      {
        id: 'timeline-setup',
        type: 'timeline',
        data: {
          title: 'Setup Process',
          steps: [
            { id: 's1', icon: 'GitBranch', title: 'Clone Repository', description: 'Fork the FlowWink repo or clone directly. MIT licensed, yours to modify.', date: 'Step 1' },
            { id: 's2', icon: 'Settings', title: 'Configure Environment', description: 'Copy .env.example, set your database URL and domain. Takes 2 minutes.', date: 'Step 2' },
            { id: 's3', icon: 'Container', title: 'Deploy with Docker', description: 'Run docker-compose up -d. Your instance is live.', date: 'Step 3' },
            { id: 's4', icon: 'Palette', title: 'White-Label & Brand', description: 'Add your logo, colors, and fonts. Every client sees your brand.', date: 'Step 4' },
          ],
          variant: 'horizontal',
          showDates: true,
        },
      },
      {
        id: 'twocol-workflow',
        type: 'two-column',
        data: {
          eyebrow: 'WORKFLOW',
          title: 'The Client',
          accentText: 'Workflow',
          accentPosition: 'end',
          leftColumn: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Your team builds the site, clients get a simple admin to manage content. Clear separation of concerns.' }] },
              { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'What Your Team Does' }] },
              { type: 'bulletList', content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Design and build page layouts' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Configure site settings and branding' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Set up integrations and automations' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Review and approve client changes' }] }] },
              ]},
            ],
          },
          rightColumn: {
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'What Clients Do' }] },
              { type: 'bulletList', content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Edit text and images within blocks' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Publish blog posts and news' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Manage form submissions and leads' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Update hours, contact info, FAQs' }] }] },
              ]},
              { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Role-based permissions ensure clients cannot break critical functionality.' }] },
            ],
          },
          layout: '50-50',
        },
      },
      {
        id: 'features-whitelabel',
        type: 'features',
        data: {
          title: 'White-Label Capabilities',
          subtitle: 'Make FlowWink invisible. Only your brand shows.',
          features: [
            { id: 'wl1', icon: 'Palette', title: 'Custom Branding', description: 'Your logo, colors, and fonts across the entire admin interface.' },
            { id: 'wl2', icon: 'Globe', title: 'Custom Domains', description: 'Each client gets their own domain. No FlowWink URLs visible.' },
            { id: 'wl3', icon: 'Bot', title: 'Branded AI Chat', description: 'Train the AI on client content. It speaks as their brand.' },
            { id: 'wl4', icon: 'Mail', title: 'Custom Emails', description: 'Transactional emails come from your domain, with your styling.' },
          ],
          columns: 4,
          layout: 'grid',
          variant: 'minimal',
          iconStyle: 'outline',
        },
      },
      {
        id: 'cta-how',
        type: 'cta',
        data: {
          title: 'See It in Action',
          subtitle: 'The best way to understand FlowWink is to use it.',
          buttonText: 'Try Product Demo',
          buttonUrl: 'https://demo.flowwink.com',
          secondaryButtonText: 'View on GitHub',
          secondaryButtonUrl: 'https://github.com/magnusfroste/flowwink',
          gradient: true,
        },
      },
    ],
  },
  {
    title: 'Features',
    slug: 'features',
    menu_order: 4,
    showInMenu: true,
    meta: {
      description: 'FlowWink features for agencies - Visual editor, Content API, autonomous AI agent, blog, forms, CRM, and more.',
      showTitle: true,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-features',
        type: 'hero',
        data: {
          title: 'Everything Your Agency Needs',
          subtitle: 'One platform replaces your entire stack. No plugins, no add-ons, no surprises.',
          backgroundType: 'color',
          heightMode: 'auto',
          contentAlignment: 'center',
          overlayOpacity: 0,
        },
      },
      {
        id: 'tabs-features',
        type: 'tabs',
        data: {
          title: '',
          tabs: [
            { id: 'tab-content', title: 'Content Management', icon: 'FileText', content: '<h3>Visual Block Editor</h3><p>47+ block types for any layout. Drag-and-drop interface that clients can actually use.</p><ul><li>Hero, features, testimonials, pricing blocks</li><li>Version history with one-click restore</li><li>Approval workflow for quality control</li><li>Schedule publishing in advance</li></ul>' },
            { id: 'tab-clients', title: 'Client Sites', icon: 'Users', content: '<h3>Multi-Site Architecture</h3><p>Deploy unlimited sites from one codebase. Each client gets their own environment.</p><ul><li>White-label everything</li><li>Per-client branding and settings</li><li>Separate databases for isolation</li><li>Transfer sites between servers easily</li></ul>' },
            { id: 'tab-marketing', title: 'Marketing', icon: 'Megaphone', content: '<h3>Built-in Marketing Tools</h3><p>Everything clients need to grow their business, no plugins required.</p><ul><li>Blog with categories and tags</li><li>Newsletter with Resend integration</li><li>SEO settings per page</li><li>Forms with lead capture</li><li>AI chat widget</li></ul>' },
            { id: 'tab-integrations', title: 'Integrations', icon: 'Plug', content: '<h3>Connect to Everything</h3><p>Content API, webhooks, and native integrations for your workflow.</p><ul><li>REST and GraphQL API</li><li>Webhooks for any event</li><li>Stripe payments built-in</li><li>Zapier/Make compatible</li><li>Custom code when needed</li></ul>' },
          ],
          orientation: 'horizontal',
          variant: 'underline',
        },
      },
      {
        id: 'twocol-agent',
        type: 'two-column',
        data: {
          eyebrow: 'ARCHITECTURE',
          title: 'Autonomous Agent +',
          accentText: 'Content API',
          accentPosition: 'end',
          content: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'FlowPilot operates your clients\' websites autonomously — writing content, qualifying leads, managing campaigns. When clients need custom frontends or mobile apps, the full Content API is available.' }] },
              { type: 'bulletList', content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'FlowPilot manages standard client sites autonomously' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Content API for custom React/Vue/mobile apps' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Set per-client objectives and approval rules' }] }] },
              ]},
            ],
          },
          imageSrc: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800',
          imageAlt: 'Code editor showing API',
          imagePosition: 'right',
          ctaText: 'View API Docs →',
          ctaUrl: '/docs',
        },
      },
      {
        id: 'logos-tech',
        type: 'logos',
        data: {
          title: 'Built on Modern Technology',
          subtitle: 'Open source foundation you can trust',
          logos: [
            { id: 'l1', name: 'React', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/React-icon.svg/120px-React-icon.svg.png' },
            { id: 'l2', name: 'TypeScript', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Typescript_logo_2020.svg/120px-Typescript_logo_2020.svg.png' },
            { id: 'l3', name: 'Tailwind', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Tailwind_CSS_Logo.svg/120px-Tailwind_CSS_Logo.svg.png' },
            { id: 'l4', name: 'Supabase', logo: 'https://seeklogo.com/images/S/supabase-logo-DCC676FFE2-seeklogo.com.png' },
            { id: 'l5', name: 'Docker', logo: 'https://www.docker.com/wp-content/uploads/2022/03/vertical-logo-monochromatic.png' },
          ],
          columns: 5,
          layout: 'grid',
          variant: 'default',
          logoSize: 'md',
        },
      },
      {
        id: 'cta-features',
        type: 'cta',
        data: {
          title: 'Explore Every Feature',
          subtitle: 'The product demo has full access to all features.',
          buttonText: 'Open Product Demo',
          buttonUrl: 'https://demo.flowwink.com',
          secondaryButtonText: 'View Documentation',
          secondaryButtonUrl: 'https://demo.flowwink.com/docs',
          gradient: true,
        },
      },
    ],
  },
  {
    title: 'Pricing',
    slug: 'pricing',
    menu_order: 5,
    showInMenu: true,
    meta: {
      description: 'FlowWink pricing for agencies - Self-host free forever, or choose managed hosting with priority support.',
      showTitle: true,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-pricing',
        type: 'hero',
        data: {
          title: 'Transparent Pricing for Agencies',
          subtitle: 'No per-site fees. No per-user limits. Just results.',
          backgroundType: 'color',
          heightMode: 'auto',
          contentAlignment: 'center',
          overlayOpacity: 0,
        },
      },
      {
        id: 'pricing-agency',
        type: 'pricing',
        data: {
          tiers: [
            {
              id: 'tier-self',
              name: 'Self-Hosted',
              price: 'Free',
              period: 'forever',
              description: 'Full platform, your infrastructure.',
              features: ['Unlimited client sites', 'All 47+ block types', 'Blog, newsletter, forms, CRM', 'AI chat widget', 'Headless API access', 'Community support', 'MIT licensed, modify freely'],
              buttonText: 'Get Started',
              buttonUrl: 'https://github.com/magnusfroste/flowwink',
            },
            {
              id: 'tier-managed',
              name: 'Managed',
              price: '€49',
              period: '/site/month',
              description: 'We host, you set your markup.',
              features: ['Everything in Self-Hosted', 'We manage infrastructure', 'Automatic updates & backups', 'Priority email support', '99.9% uptime SLA', 'Custom domain included', 'SSL certificates included'],
              buttonText: 'Contact Us',
              buttonUrl: '/contact',
              highlighted: true,
              badge: 'Popular',
            },
            {
              id: 'tier-partner',
              name: 'Agency Partner',
              price: 'Custom',
              period: '',
              description: 'Volume discounts and dedicated support.',
              features: ['Everything in Managed', 'Volume pricing for 10+ sites', 'Dedicated account manager', 'Custom training sessions', 'Co-marketing opportunities', 'Early access to features', 'White-glove migration support'],
              buttonText: 'Get in Touch',
              buttonUrl: '/contact',
            },
          ],
          columns: 3,
          variant: 'cards',
        },
      },
      {
        id: 'accordion-pricing',
        type: 'accordion',
        data: {
          title: 'Pricing FAQ',
          items: [
            { question: 'Is it really free to self-host?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes. FlowWink is MIT licensed. You pay for your own infrastructure (VPS, database), but there are no licensing fees, no per-site charges, and no feature gates. Everything is included.' }] }] } },
            { question: 'What is the catch?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'No catch. Self-hosting requires technical capability to manage servers. If you do not want to manage infrastructure, choose our Managed plan. If you want us to do everything, choose Agency Partner.' }] }] } },
            { question: 'Can I upgrade later?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Absolutely. Many agencies start self-hosted, learn the platform, then move high-value clients to Managed hosting for peace of mind. Migration is seamless.' }] }] } },
            { question: 'Do you offer refunds?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Managed plans include a 30-day money-back guarantee. If FlowWink is not right for your agency, we will refund in full, no questions asked.' }] }] } },
          ],
        },
      },
      {
        id: 'cta-pricing',
        type: 'cta',
        data: {
          title: 'Start Free Today',
          subtitle: 'Clone the repo and deploy your first client site in 5 minutes.',
          buttonText: 'View on GitHub',
          buttonUrl: 'https://github.com/magnusfroste/flowwink',
          secondaryButtonText: 'Contact Sales',
          secondaryButtonUrl: '/contact',
          gradient: true,
        },
      },
    ],
  },
  {
    title: 'Contact',
    slug: 'contact',
    menu_order: 6,
    showInMenu: true,
    meta: {
      description: 'Contact the FlowWink team - demos, partnerships, and support for agencies.',
      showTitle: true,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-contact',
        type: 'hero',
        data: {
          title: 'Let\'s Talk',
          subtitle: 'Questions about FlowWink for your agency? We are here to help.',
          backgroundType: 'color',
          heightMode: 'auto',
          contentAlignment: 'center',
          overlayOpacity: 0,
        },
      },
      {
        id: 'form-agency',
        type: 'form',
        data: {
          title: 'Tell Us About Your Agency',
          fields: [
            { id: 'agency', type: 'text', label: 'Agency Name', placeholder: 'Your agency', required: true, width: 'half' },
            { id: 'email', type: 'email', label: 'Email', placeholder: 'you@agency.com', required: true, width: 'half' },
            { id: 'sites', type: 'select', label: 'How many client sites do you manage?', placeholder: 'Select...', required: true, width: 'half', options: [
              { value: '1-5', label: '1-5 sites' },
              { value: '6-20', label: '6-20 sites' },
              { value: '21-50', label: '21-50 sites' },
              { value: '50+', label: '50+ sites' },
            ]},
            { id: 'current', type: 'text', label: 'Current Platform(s)', placeholder: 'Webflow, WordPress, etc.', required: false, width: 'half' },
            { id: 'message', type: 'textarea', label: 'How can we help?', placeholder: 'Tell us about your needs...', required: true, width: 'full' },
          ],
          submitButtonText: 'Send Message',
          successMessage: 'Thanks! We will be in touch within 24 hours.',
          variant: 'card',
        },
      },
      {
        id: 'chat-agency',
        type: 'chat-launcher',
        data: {
          title: 'Quick Questions? Ask AI',
          subtitle: 'Get answers about pricing, white-labeling, and more',
          placeholder: 'Ask about FlowWink for agencies...',
          showQuickActions: true,
          quickActionCount: 4,
          variant: 'card',
        },
      },
      {
        id: 'contact-info',
        type: 'contact',
        data: {
          title: 'Other Ways to Reach Us',
          email: 'agencies@flowwink.com',
          hours: [
            { day: 'Sales & Demos', time: 'Mon-Fri 9-17 CET' },
            { day: 'GitHub Issues', time: '24/7' },
          ],
        },
      },
    ],
  },
];

export const flowwinkAgencyTemplate: StarterTemplate = {
  id: 'flowwink-agency',
  name: 'FlowWink Agency',
  description: 'Agency-focused template for web agencies and consultants. Features ROI calculator, competitor comparisons, and white-label positioning.',
  category: 'platform',
  icon: 'Building2',
  tagline: 'One Platform. Unlimited Client Sites. Zero SaaS Fees.',
  aiChatPosition: 'Widget + Page',
  helpStyle: 'hybrid',
  pages: flowwinkAgencyPages,
  blogPosts: agencyBlogPosts,
  kbCategories: agencyKbCategories,
  requiredModules: ['chat', 'blog', 'newsletter', 'forms', 'knowledgeBase'],
  branding: {
    logo: '',
    organizationName: 'FlowWink Agency',
    brandTagline: 'One Platform. Unlimited Clients.',
    primaryColor: '262 80% 50%',
    accentColor: '280 70% 50%',
    headingFont: 'Plus Jakarta Sans',
    bodyFont: 'Inter',
    borderRadius: 'lg',
    shadowIntensity: 'medium',
  },
  chatSettings: {
    enabled: true,
    aiProvider: 'openai',
    landingPageEnabled: true,
    widgetEnabled: true,
    widgetPosition: 'bottom-right',
    welcomeMessage: 'Hi! I help web agencies understand how FlowWink can save money and time. Ask me anything!',
    systemPrompt: `You are a helpful assistant for FlowWink CMS, specifically for web agencies and consultants.

Key points to emphasize:
1. Zero per-client SaaS fees with self-hosting
2. White-label capabilities for client sites
3. Faster client delivery with reusable templates
4. Unified workflow across all clients
5. Both visual editing AND headless API

When discussing pricing, highlight ROI compared to Webflow (€20-200/site/mo), Squarespace (€15-50/site/mo), and Contentful (€300+/mo).

Direct technical questions to demo.flowwink.com for hands-on exploration.`,
    suggestedPrompts: [
      'How much can I save vs Webflow?',
      'How does white-labeling work?',
      'Can I use my own server?',
      'What happens when my agency grows?',
    ],
    includeContentAsContext: true,
    includedPageSlugs: ['*'],
    includeKbArticles: true,
    contentContextMaxTokens: 50000,
    showContextIndicator: true,
  },
  headerSettings: {
    variant: 'sticky',
    stickyHeader: true,
    backgroundStyle: 'blur',
    headerShadow: 'sm',
    showBorder: false,
    showThemeToggle: true,
    customNavItems: [
      { id: 'demo', label: 'Product Demo', url: 'https://demo.flowwink.com', openInNewTab: true, enabled: true },
      { id: 'github', label: 'GitHub', url: 'https://github.com/magnusfroste/flowwink', openInNewTab: true, enabled: true },
    ],
  },
  footerSettings: {
    variant: 'full',
    email: 'agencies@flowwink.com',
    showQuickLinks: true,
    showContact: true,
    legalLinks: [
      { id: 'privacy', label: 'Privacy', url: '/privacy', enabled: true },
      { id: 'terms', label: 'Terms', url: '/terms', enabled: true },
    ],
  },
  seoSettings: {
    siteTitle: 'FlowWink Agency',
    titleTemplate: '%s | FlowWink for Agencies',
    defaultDescription: 'FlowWink for agencies - One platform, unlimited client sites, zero SaaS fees. Self-host or managed hosting.',
    robotsIndex: true,
    robotsFollow: true,
  },
  aeoSettings: {
    enabled: true,
    organizationName: 'FlowWink Agency',
    shortDescription: 'One platform, unlimited client sites, zero SaaS fees. Self-host or managed hosting.',
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
      { goal: 'Publish weekly thought-leadership blog posts', success_criteria: { posts_per_week: 1 }, constraints: { tone: 'agency-expert', quality_over_quantity: true } },
      { goal: 'Grow newsletter subscriber base to 500', success_criteria: { subscribers: 500 } },
      { goal: 'Convert website visitors into qualified leads', success_criteria: { monthly_leads: 20 } },
    ],
    prioritySkills: ['write_blog_post', 'add_lead', 'send_newsletter', 'analyze_analytics', 'search_web'],
    soul: {
      purpose: 'I run this agency\'s digital presence — creating expert content, nurturing leads, and demonstrating thought leadership.',
      tone: 'Confident, knowledgeable, results-oriented. Agency-level professionalism.',
    },
  },
  siteSettings: {
    homepageSlug: 'home',
  },
};
