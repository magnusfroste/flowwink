/**
 * ConsultAgency Template — IT Consulting Firm
 *
 * Premium template for IT consulting firms that place specialist consultants
 * at client companies. Think Consid, Sigma, HiQ, Knowit, Cybercom.
 *
 * Value proposition: Your website IS the consultant — an agentic web that
 * answers questions, surfaces availability, and qualifies briefs 24/7.
 * FlowPilot maintains live consultant profiles updated at every check-in,
 * giving visitors access to information that was never available before.
 *
 * A2A-ready: enterprise clients can connect their own systems directly to
 * FlowPilot via Agent-to-Agent protocol — no manual integration required.
 *
 * Key sections: consultant search (Resume block immediately below hero),
 * client logos, testimonials, agentic chat launcher, A2A integration CTA.
 */
import type { StarterTemplate } from './types';

export const consultAgencyTemplate: StarterTemplate = {
  id: 'consult-agency',
  name: 'ConsultAgency',
  description: 'Agentic consulting platform template. Your website becomes a 24/7 consultant — FlowPilot maintains live profiles, answers briefs instantly, and connects enterprise systems via A2A.',
  category: 'enterprise',
  icon: 'UserCheck',
  tagline: 'Your website is a consultant. Always on. Always current.',
  aiChatPosition: 'Agentic consultant — live roster data, answers any brief, qualifies leads, A2A-ready for enterprise integrations',
  requiredModules: ['blog', 'chat', 'leads', 'deals', 'companies', 'forms', 'bookings', 'newsletter', 'resume'],

  pages: [

    // ===== HOME PAGE =====
    {
      title: 'Home',
      slug: 'home',
      isHomePage: true,
      menu_order: 1,
      showInMenu: true,
      meta: {
        description: 'Elite IT consulting firm. We match senior specialists to the assignments that need them most — in 48 hours.',
        showTitle: false,
        titleAlignment: 'center',
      },
      blocks: [

        // ANNOUNCEMENT — urgency & relevance
        {
          id: 'announcement-openings',
          type: 'announcement-bar',
          data: {
            message: '⚡ FlowPilot has live availability for every consultant in our network — ask it anything, right now',
            linkText: 'Try it',
            linkUrl: '#chat-flowpilot',
            variant: 'gradient',
            dismissable: true,
            sticky: false,
          },
        },

        // HERO — cinematic, dark, professional
        {
          id: 'hero-main',
          type: 'hero',
          data: {
            title: 'The Consulting Firm That Never Sleeps.',
            subtitle: 'Our website is a live consultant. FlowPilot knows every profile, every assignment, every availability — updated in real time as our consultants check in. Ask it anything.',
            backgroundType: 'image',
            backgroundImage: 'https://images.unsplash.com/photo-1521737852567-6949f3f9f2b5?w=1920',
            heightMode: 'viewport',
            contentAlignment: 'center',
            overlayOpacity: 62,
            overlayColor: 'dark',
            titleAnimation: 'slide-up',
            showScrollIndicator: true,
            primaryButton: { text: 'Search Consultants', url: '#resume-matcher-consultants' },
            secondaryButton: { text: 'Join Our Network', url: '/join' },
            eyebrow: 'Agentic Consulting Platform',
            heroStats: [
              { value: '300+', label: 'Consultants' },
              { value: '24/7', label: 'Always available' },
              { value: '48h', label: 'Match guarantee' },
              { value: '98%', label: 'Happy clients' },
            ],
          },
        },

        // RESUME MATCHER — AI-powered consultant search (hero follow-up)
        {
          id: 'resume-matcher-consultants',
          type: 'resume-matcher',
          data: {
            title: 'Find the Right Consultant — Right Now',
            subtitle: 'Describe the role, tech stack, and context. FlowPilot searches our live roster — profiles updated as consultants check in — and returns the best matches with availability, scoring, and gap analysis. Information that was never accessible this fast before.',
            placeholder: 'E.g. "We need a senior backend developer with Java and Spring Boot experience for a 6-month fintech project in Stockholm. Team of 8, agile, some on-site required..."',
            buttonText: 'Find My Match',
          },
        },

        {
          id: 'quick-links-1',
          type: 'quick-links',
          data: {
            heading: 'How can we help you?',
            variant: 'dark',
            layout: 'split',
            links: [
              { id: 'ql1', label: 'Contact us', url: '/contact' },
              { id: 'ql2', label: 'Our services', url: '/services' },
              { id: 'ql3', label: 'Case studies', url: '/cases' },
              { id: 'ql4', label: 'Open positions', url: '/careers' },
            ],
          },
        },

        // CLIENT LOGOS — first trust signal, above the fold on scroll
        {
          id: 'logos-clients',
          type: 'logos',
          data: {
            title: 'Trusted by Industry Leaders',
            logos: [
              { id: 'cl1', name: 'Volvo Group', logo: '' },
              { id: 'cl2', name: 'Ericsson', logo: '' },
              { id: 'cl3', name: 'SKF', logo: '' },
              { id: 'cl4', name: 'AstraZeneca', logo: '' },
              { id: 'cl5', name: 'Scania', logo: '' },
              { id: 'cl6', name: 'ABB', logo: '' },
              { id: 'cl7', name: 'Atlas Copco', logo: '' },
              { id: 'cl8', name: 'Sandvik', logo: '' },
            ],
            layout: 'scroll',
            variant: 'grayscale',
            logoSize: 'md',
            autoplaySpeed: 4,
          },
        },

        // STATS — jaw-droppers
        {
          id: 'stats-main',
          type: 'stats',
          data: {
            items: [
              { id: 'st1', value: '300+', label: 'Senior Consultants', icon: 'Users' },
              { id: 'st2', value: '48h', label: 'Average Match Time', icon: 'Clock' },
              { id: 'st3', value: '95%', label: 'Client Retention', icon: 'TrendingUp' },
              { id: 'st4', value: '1 200+', label: 'Successful Placements', icon: 'CheckCircle' },
            ],
            columns: 4,
            variant: 'cards',
          },
        },

        // SECTION DIVIDER
        { id: 'divider-bento', type: 'section-divider', data: { shape: 'wave', height: 'sm' } },

        // BENTO — differentiation, not generic features
        {
          id: 'bento-why',
          type: 'bento-grid',
          data: {
            eyebrow: 'THE DIFFERENCE',
            title: 'Not a Website. A Consultant.',
            subtitle: 'Your first interaction isn\'t with a form or a brochure — it\'s with FlowPilot, an agentic AI that knows our entire network in real time and can answer questions no website could answer before.',
            columns: 3,
            variant: 'glass',
            gap: 'md',
            staggeredReveal: true,
            items: [
              {
                id: 'bw1',
                title: 'Live Roster, Always Current',
                description: 'Every consultant in our network checks in through FlowWink — updating their latest assignment, availability, and competencies. FlowPilot reads this in real time. When you ask about availability, the answer reflects today, not last month\'s spreadsheet.',
                icon: 'UserCheck',
                span: 'wide',
                accentColor: '#6366F1',
              },
              {
                id: 'bw2',
                title: '48-Hour Promise',
                description: 'From brief to matched consultant in 48 hours. Not weeks. If we can\'t match you, we tell you immediately — not after wasting your time.',
                icon: 'Clock',
                accentColor: '#F59E0B',
              },
              {
                id: 'bw3',
                title: 'Senior Only',
                description: 'Every consultant in our network has 5+ years of hands-on delivery experience. No juniors. No recent graduates. Specialists who own their domain.',
                icon: 'Award',
                accentColor: '#10B981',
              },
              {
                id: 'bw4',
                title: 'Transparent Pricing',
                description: 'Fixed hourly rate. Our margin is stated in the contract. No finder\'s fee buried in the invoice. No surprises at month end.',
                icon: 'Receipt',
                accentColor: '#3B82F6',
              },
              {
                id: 'bw5',
                title: 'A2A — Connect Your Systems',
                description: 'Running a resource-intensive enterprise with your own consultant database or HR systems? Connect directly to FlowPilot via Agent-to-Agent protocol. Your systems talk to ours — no manual integration, no middleware, no CSV exports.',
                icon: 'Network',
                accentColor: '#EC4899',
              },
              {
                id: 'bw6',
                title: 'An Agentic Web That Answers Everything',
                description: 'Our website doesn\'t just list consultants — it acts. FlowPilot has access to live profiles, current assignments, competencies, and availability. It answers questions that no static website ever could, 24/7, without waiting for business hours.',
                icon: 'Bot',
                span: 'wide',
                accentColor: '#8B5CF6',
              },
            ],
          },
        },

        // PARALLAX — emotional punch
        {
          id: 'parallax-punch',
          type: 'parallax-section',
          data: {
            backgroundImage: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1920',
            title: 'The Information Was Always There. Now You Can Access It.',
            subtitle: 'Live profiles. Real-time availability. Current assignments. FlowPilot makes the entire network queryable — for the first time.',
            height: 'md',
            textColor: 'light',
            overlayOpacity: 65,
            contentAlignment: 'center',
          },
        },

        // FEATURED CONSULTANTS — Resume Block (team)
        {
          id: 'sep-featured',
          type: 'separator',
          data: { variant: 'text', text: 'Featured Consultants', icon: 'UserCheck' },
        },
        {
          id: 'featured-consultants',
          type: 'team',
          data: {
            title: 'Meet Some of Our Consultants',
            subtitle: 'A small sample from a network of 300+ specialists across cloud, software, data, and tech leadership.',
            members: [
              {
                id: 'con1',
                name: 'Marcus Anderson',
                role: 'Cloud Architect — AWS & Azure',
                image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
                bio: '12 years cloud infrastructure. Led migrations for 3 Fortune 500 companies. Available from August.',
                linkedin: 'https://linkedin.com',
              },
              {
                id: 'con2',
                name: 'Sofia Bergqvist',
                role: 'Senior React Developer',
                image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
                bio: '8 years frontend. Design systems, performance, TypeScript, Next.js. Available now.',
                linkedin: 'https://linkedin.com',
              },
              {
                id: 'con3',
                name: 'Erik Thorvaldsen',
                role: 'Tech Lead & Architect',
                image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400',
                bio: '15 years. Scaled 4 startups to production. DDD, microservices, event sourcing. Available Q3.',
                linkedin: 'https://linkedin.com',
              },
              {
                id: 'con4',
                name: 'Anna Kjelberg',
                role: 'Data Engineer — Databricks & Spark',
                image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400',
                bio: '9 years data engineering. Real-time pipelines, lakehouse architecture. Available immediately.',
                linkedin: 'https://linkedin.com',
              },
            ],
            columns: 4,
            layout: 'grid',
            showBio: true,
            showSocial: true,
          },
        },
        {
          id: 'cta-see-roster',
          type: 'cta',
          data: {
            title: 'See All 300+ Consultants',
            subtitle: 'Filter by competency, tech stack, availability, and location. Or ask FlowPilot.',
            buttonText: 'Browse Full Roster',
            buttonUrl: '/consultants',
            gradient: false,
          },
        },

        // HOW IT WORKS
        { id: 'divider-how', type: 'section-divider', data: { shape: 'curved', height: 'sm' } },
        {
          id: 'timeline-how',
          type: 'timeline',
          data: {
            title: 'From Brief to Billable in 48 Hours',
            subtitle: 'A process built to respect your time. Not the most placements — the right one.',
            items: [
              { id: 'hw1', title: 'Share Your Brief', description: 'Tell us what you need: tech stack, team context, timeline, budget. 10 minutes — then we take it from here.', icon: 'FileText' },
              { id: 'hw2', title: 'Senior Review', description: 'A senior consultant on our team reads your brief personally and searches the network — not a database. We call people we know.', icon: 'Search' },
              { id: 'hw3', title: 'One Presentation', description: 'We present one consultant. Not five. The one we\'d hire ourselves. Full brief, video intro, and direct references.', icon: 'UserCheck' },
              { id: 'hw4', title: 'Contract & Start', description: 'Simple contract, transparent rate, clear terms. Your consultant is on-site — or remote — within the week.', icon: 'CheckCircle' },
            ],
            layout: 'horizontal',
            staggeredReveal: true,
          },
        },

        // CLIENT TESTIMONIALS — carousel, social proof
        { id: 'divider-testimonials', type: 'section-divider', data: { shape: 'wave', height: 'sm' } },
        {
          id: 'testimonials-clients',
          type: 'testimonials',
          data: {
            title: 'What Our Clients Say',
            subtitle: '95% of clients return for their next assignment. Here\'s why.',
            testimonials: [
              {
                id: 'tc1',
                content: 'We needed a senior cloud architect for a critical AWS migration. Within 36 hours we had Marcus on a call. He started Monday. The migration finished 3 weeks ahead of schedule.',
                author: 'Johan Eriksson',
                role: 'CTO',
                company: 'Volvo Group Digital',
                rating: 5,
              },
              {
                id: 'tc2',
                content: 'Three consultants in two years. Every single one has been exactly who they said they would be. No CV inflation, no surprises. The 48-hour promise is real.',
                author: 'Maria Lindqvist',
                role: 'Head of Engineering',
                company: 'Ericsson Software Technology',
                rating: 5,
              },
              {
                id: 'tc3',
                content: 'I asked their website "do you have React architects with healthcare experience available in Q3?" Within seconds I had three live profiles with current availability. No form, no callback, no waiting. This is information that simply wasn\'t accessible before.',
                author: 'Dr. Anders Nilsson',
                role: 'Digital Director',
                company: 'Karolinska Digital',
                rating: 5,
              },
              {
                id: 'tc4',
                content: 'The rematch guarantee is real. We used it once — culture fit issue on our side. Within 24 hours they had a new candidate. No drama, no extra cost.',
                author: 'Petra Olsson',
                role: 'VP Product & Technology',
                company: 'SSAB Digital',
                rating: 5,
              },
            ],
            layout: 'carousel',
            columns: 2,
            showRating: true,
            showAvatar: false,
            variant: 'cards',
            autoplay: true,
            autoplaySpeed: 6,
          },
        },

        // CHAT LAUNCHER — FlowPilot as the always-on consultant
        {
          id: 'chat-flowpilot',
          type: 'chat-launcher',
          data: {
            title: 'Meet Your Online Consultant.',
            subtitle: 'FlowPilot isn\'t a chatbot — it\'s an agentic AI with live access to every consultant profile, their latest assignments, and real-time availability. Ask it what you\'d ask a senior recruiter. It answers instantly, 24/7, with information that was never accessible this way before.',
            placeholder: 'Do you have senior React developers available this month with fintech experience?',
            showQuickActions: true,
            quickActionCount: 4,
            variant: 'hero-integrated',
          },
        },

        // FOR CONSULTANTS — join CTA
        {
          id: 'twocol-join',
          type: 'two-column',
          data: {
            eyebrow: 'FOR CONSULTANTS',
            title: 'Do Your Best Work.',
            accentText: 'With Us.',
            accentPosition: 'end',
            leftColumn: {
              type: 'doc',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'We don\'t place people in assignments they\'ll be bored in after six months. We match senior specialists to work where their expertise is genuinely needed — and valued.' }] },
                { type: 'bulletList', content: [
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Interesting assignments' }, { type: 'text', text: ' — complex problems with ambitious companies' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Competitive rates' }, { type: 'text', text: ' — we negotiate hard because your time is your business' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Zero downtime' }, { type: 'text', text: ' — we source your next assignment 4 weeks before your current one ends' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Real community' }, { type: 'text', text: ' — 300+ senior specialists to learn from and collaborate with' }] }] },
                ]},
              ],
            },
            rightColumn: {
              type: 'doc',
              content: [
                { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '💬 From Our Consultants' }] },
                { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: '"I\'ve been with three consulting firms. This is the first that treats me like a business partner. I haven\'t had a gap between assignments in two years."' }] },
                { type: 'paragraph', content: [{ type: 'text', text: '— Sofia Bergqvist, Senior React Developer' }] },
                { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: '"They called me 5 weeks before my assignment ended with three new briefs. All interesting. I had my pick. That\'s how it should work."' }] },
                { type: 'paragraph', content: [{ type: 'text', text: '— Marcus Anderson, Cloud Architect' }] },
              ],
            },
            imageSrc: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=800',
            imageAlt: 'Consultant working',
            imagePosition: 'right',
            ctaText: 'Join Our Network →',
            ctaUrl: '/join',
            layout: '60-40',
          },
        },

        // FINAL CTA
        {
          id: 'cta-final',
          type: 'cta',
          data: {
            title: 'Your Website is Already Answering Questions.',
            subtitle: 'Ask FlowPilot anything — or submit a brief and we\'ll match you in 48 hours. Either way, you get access to our full live network instantly.',
            buttonText: 'Ask FlowPilot',
            buttonUrl: '#chat-flowpilot',
            secondaryButtonText: 'Submit a Brief',
            secondaryButtonUrl: '/clients',
            gradient: true,
          },
        },

        // FLOATING CTA
        {
          id: 'floating-cta',
          type: 'floating-cta',
          data: {
            title: 'Ask FlowPilot',
            subtitle: 'Live roster · 24/7 · No waiting',
            buttonText: 'Submit Brief',
            buttonUrl: '/clients',
            showAfterScroll: 30,
            position: 'bottom-right',
            variant: 'card',
            size: 'md',
            showCloseButton: true,
            closePersistent: true,
            animationType: 'slide',
          },
        },
      ],
    },

    // ===== CONSULTANTS PAGE — The Roster =====
    {
      title: 'Consultants',
      slug: 'consultants',
      menu_order: 2,
      showInMenu: true,
      meta: {
        description: 'Browse our network of 300+ senior technology consultants. Filter by competency, stack, and availability.',
        showTitle: false,
        titleAlignment: 'center',
      },
      blocks: [
        {
          id: 'hero-consultants',
          type: 'hero',
          data: {
            title: '300+ Senior Specialists.',
            subtitle: 'Every consultant in our network has 5+ years of hands-on delivery experience. No juniors. No generalists. Specialists who own their domain.',
            backgroundType: 'image',
            backgroundImage: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=1920',
            heightMode: 'auto',
            contentAlignment: 'center',
            overlayOpacity: 60,
            overlayColor: 'dark',
          },
        },

        // COMPETENCIES — tabs
        {
          id: 'tabs-competencies',
          type: 'tabs',
          data: {
            title: 'Browse by Competency',
            tabs: [
              {
                id: 'tab-cloud',
                title: 'Cloud & Infrastructure',
                icon: 'Cloud',
                content: {
                  type: 'doc',
                  content: [
                    { type: 'paragraph', content: [{ type: 'text', text: 'AWS, Azure, GCP. Kubernetes, Terraform, CI/CD. Our cloud specialists have led large-scale migrations and built resilient, cost-optimized platforms for some of Scandinavia\'s largest enterprises.' }] },
                    { type: 'bulletList', content: [
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cloud Architects (AWS, Azure, GCP)' }] }] },
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'DevOps & Platform Engineers' }] }] },
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Site Reliability Engineers' }] }] },
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Security Engineers' }] }] },
                    ]},
                  ],
                },
              },
              {
                id: 'tab-software',
                title: 'Software Development',
                icon: 'Code',
                content: {
                  type: 'doc',
                  content: [
                    { type: 'paragraph', content: [{ type: 'text', text: 'React, TypeScript, Node.js, Java, .NET, Python. Senior developers and tech leads who write clean code, mentor teams, and take architectural ownership.' }] },
                    { type: 'bulletList', content: [
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Senior Frontend (React, Vue, Angular)' }] }] },
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Senior Backend (Java, .NET, Node.js, Python)' }] }] },
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Full-Stack Engineers' }] }] },
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Tech Leads & Software Architects' }] }] },
                    ]},
                  ],
                },
              },
              {
                id: 'tab-data',
                title: 'Data & AI',
                icon: 'BarChart3',
                content: {
                  type: 'doc',
                  content: [
                    { type: 'paragraph', content: [{ type: 'text', text: 'Data engineers, ML engineers, and analytics architects. Databricks, Spark, dbt, Snowflake. We have the people who build the data foundations that AI runs on.' }] },
                    { type: 'bulletList', content: [
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Data Engineers (Databricks, Spark, dbt)' }] }] },
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ML Engineers & AI Specialists' }] }] },
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Analytics Engineers & BI Developers' }] }] },
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Data Platform Architects' }] }] },
                    ]},
                  ],
                },
              },
              {
                id: 'tab-leadership',
                title: 'Tech Leadership',
                icon: 'Compass',
                content: {
                  type: 'doc',
                  content: [
                    { type: 'paragraph', content: [{ type: 'text', text: 'Interim CTOs, Engineering Managers, Program Directors. Leaders who step into complexity, stabilize, and drive outcomes — then hand off cleanly to your permanent hire.' }] },
                    { type: 'bulletList', content: [
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Interim CTO & VP Engineering' }] }] },
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Engineering Managers' }] }] },
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Program & Project Directors' }] }] },
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Agile Coaches & Scrum Masters' }] }] },
                    ]},
                  ],
                },
              },
            ],
            orientation: 'horizontal',
            variant: 'pills',
          },
        },

        // FULL ROSTER — Resume Block (team)
        {
          id: 'sep-roster',
          type: 'separator',
          data: { variant: 'text', text: 'Featured Specialists', icon: 'Users' },
        },
        {
          id: 'roster-full',
          type: 'team',
          data: {
            title: 'Available Consultants',
            subtitle: 'A curated selection. Ask FlowPilot to find consultants matching your exact requirements.',
            members: [
              { id: 'r1', name: 'Marcus Anderson', role: 'Cloud Architect — AWS & Azure', image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400', bio: '12 yrs cloud. AWS Solutions Architect, Azure Expert. Led 3 Fortune 500 migrations. Available Aug.', linkedin: 'https://linkedin.com' },
              { id: 'r2', name: 'Sofia Bergqvist', role: 'Senior React Developer', image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400', bio: '8 yrs frontend. Design systems, TypeScript, Next.js, performance. Available now.', linkedin: 'https://linkedin.com' },
              { id: 'r3', name: 'Erik Thorvaldsen', role: 'Tech Lead & Architect', image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400', bio: '15 yrs. Scaled 4 startups to production. DDD, microservices, event sourcing. Available Q3.', linkedin: 'https://linkedin.com' },
              { id: 'r4', name: 'Anna Kjelberg', role: 'Data Engineer', image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400', bio: '9 yrs. Databricks, Spark, dbt, Snowflake. Real-time pipelines, lakehouse. Available now.', linkedin: 'https://linkedin.com' },
              { id: 'r5', name: 'David Holm', role: 'DevOps & Platform Engineer', image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400', bio: '10 yrs DevOps. Kubernetes, Terraform, ArgoCD. Built platform teams at 3 scale-ups. Available Sep.', linkedin: 'https://linkedin.com' },
              { id: 'r6', name: 'Lena Magnusson', role: 'Interim CTO', image: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400', bio: 'Former CTO × 2. Specializes in scaling engineering from 5 to 50 and navigating tech debt crises. Available now.', linkedin: 'https://linkedin.com' },
              { id: 'r7', name: 'Tobias Rydén', role: 'ML Engineer & AI Specialist', image: 'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=400', bio: '7 yrs ML. LLM fine-tuning, RAG, production ML systems. PyTorch, HuggingFace. Available Q3.', linkedin: 'https://linkedin.com' },
              { id: 'r8', name: 'Maja Eriksson', role: 'Senior Backend Developer', image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400', bio: '9 yrs Java & Spring Boot. High-throughput APIs, event-driven systems. Domain: financial systems. Available now.', linkedin: 'https://linkedin.com' },
            ],
            columns: 4,
            layout: 'grid',
            showBio: true,
            showSocial: true,
          },
        },

        // CHAT — find the right match
        {
          id: 'chat-consultant-finder',
          type: 'chat-launcher',
          data: {
            title: 'Still Not Sure?',
            subtitle: 'Ask FlowPilot directly. Stack, timeline, budget — it will search the full network and walk you through the match.',
            placeholder: 'I need a senior DevOps engineer for a 6-month Kubernetes migration...',
            showQuickActions: true,
            quickActionCount: 4,
            variant: 'card',
          },
        },
        {
          id: 'cta-brief-from-consultants',
          type: 'cta',
          data: {
            title: 'Submit a Brief. Get a Match.',
            subtitle: '48 hours. One perfect consultant. Guaranteed.',
            buttonText: 'Submit a Brief',
            buttonUrl: '/clients',
            gradient: true,
          },
        },
      ],
    },

    // ===== FOR CLIENTS PAGE — Conversion =====
    {
      title: 'For Clients',
      slug: 'clients',
      menu_order: 3,
      showInMenu: true,
      meta: {
        description: 'How we match your brief to the right consultant in 48 hours. Transparent process, fixed rates, continuity guarantee.',
        showTitle: false,
        titleAlignment: 'center',
      },
      blocks: [
        {
          id: 'hero-clients',
          type: 'hero',
          data: {
            title: 'Brief Us. We\'ll Find the Person.',
            subtitle: 'A human process, not an algorithm. We read every brief. We match personally. We stand behind every placement.',
            backgroundType: 'image',
            backgroundImage: 'https://images.unsplash.com/photo-1573497620053-ea5300f94f21?w=1920',
            heightMode: 'auto',
            contentAlignment: 'center',
            overlayOpacity: 58,
            overlayColor: 'dark',
            primaryButton: { text: 'Submit a Brief', url: '#brief-form' },
            secondaryButton: { text: 'Browse Consultants', url: '/consultants' },
          },
        },

        // SOCIAL PROOF COUNTERS
        {
          id: 'social-proof-clients',
          type: 'social-proof',
          data: {
            items: [
              { id: 'spc1', type: 'counter', label: 'Successful Placements', value: 1240, icon: 'users' },
              { id: 'spc2', type: 'counter', label: 'Active Assignments', value: 87, icon: 'zap' },
              { id: 'spc3', type: 'rating', label: 'Client Satisfaction', value: 4.9, maxRating: 5 },
              { id: 'spc4', type: 'counter', label: 'Avg Hours to Match', value: 36, icon: 'clock' },
            ],
            variant: 'cards',
            layout: 'horizontal',
            size: 'lg',
            animated: true,
            showLiveIndicator: true,
          },
        },

        // PROCESS TIMELINE
        {
          id: 'timeline-process',
          type: 'timeline',
          data: {
            title: 'The Process',
            subtitle: 'No black box. No algorithm. A real process with real people at every step.',
            items: [
              { id: 'tp1', title: 'You Submit a Brief', description: 'Required skills, team context, timeline, budget. A 10-minute form — we do the rest.', icon: 'FileText' },
              { id: 'tp2', title: 'Senior Review', description: 'A senior consultant reads your brief and asks follow-up questions if needed. This is where most agencies cut corners. We don\'t.', icon: 'Eye' },
              { id: 'tp3', title: 'Network Search', description: 'We search our active network — not LinkedIn. We call the people we know. We verify availability and assess cultural fit.', icon: 'Search' },
              { id: 'tp4', title: 'One Presentation', description: 'We present one consultant profile. Not five. The one we\'d hire ourselves. Full brief, video intro, and 2 direct references.', icon: 'UserCheck' },
              { id: 'tp5', title: '30-Minute Call', description: 'You meet the consultant. No sales pitch. A direct conversation about the assignment and expectations.', icon: 'Video' },
              { id: 'tp6', title: 'Contract & Start', description: 'Transparent hourly rate, clear terms. Your consultant is on-site within the week.', icon: 'CheckCircle' },
            ],
            layout: 'vertical',
            staggeredReveal: true,
          },
        },

        // PRICING TRANSPARENCY
        {
          id: 'twocol-pricing',
          type: 'two-column',
          data: {
            eyebrow: 'TRANSPARENT PRICING',
            title: 'You Know What You\'re Paying',
            accentText: 'Before You Sign.',
            accentPosition: 'end',
            leftColumn: {
              type: 'doc',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Our pricing is simple: a fixed hourly rate for the consultant, plus our margin — stated clearly in the contract. No finder\'s fee. No success fee. No surprise invoices.' }] },
                { type: 'paragraph', content: [{ type: 'text', text: 'Our margin funds the matching process, account management, and the guarantee. If a placement doesn\'t work in the first 2 weeks, we rematch at no charge.' }] },
              ],
            },
            rightColumn: {
              type: 'doc',
              content: [
                { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '📋 Included in Every Placement' }] },
                { type: 'bulletList', content: [
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Matching & vetting process' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Dedicated account manager' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '2-week continuity guarantee' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Monthly assignment check-ins' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '4-week advance replacement pipeline' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '24/7 FlowPilot support & brief intake' }] }] },
                ]},
              ],
            },
            layout: '50-50',
          },
        },

        // CLIENT TESTIMONIALS — grid
        {
          id: 'testimonials-clients-full',
          type: 'testimonials',
          data: {
            title: 'What Our Clients Say',
            testimonials: [
              { id: 'tcf1', content: 'We needed a senior cloud architect for a critical AWS migration. Within 36 hours we had Marcus on a call. He started Monday. The migration finished 3 weeks ahead of schedule.', author: 'Johan Eriksson', role: 'CTO', company: 'Volvo Group Digital', rating: 5 },
              { id: 'tcf2', content: 'Three consultants in two years. Every single one has been exactly who they said they would be. No CV inflation, no surprises.', author: 'Maria Lindqvist', role: 'Head of Engineering', company: 'Ericsson Software Technology', rating: 5 },
              { id: 'tcf3', content: 'I asked their website AI about React architects with healthcare experience. Seconds later I had three profiles. Matched the next morning. This is what a website should do.', author: 'Dr. Anders Nilsson', role: 'Digital Director', company: 'Karolinska Digital', rating: 5 },
              { id: 'tcf4', content: 'The rematch guarantee is real. We used it — culture fit issue on our side. Within 24 hours, new candidate. No drama, no extra cost.', author: 'Petra Olsson', role: 'VP Product & Technology', company: 'SSAB Digital', rating: 5 },
            ],
            layout: 'grid',
            columns: 2,
            showRating: true,
            showAvatar: false,
            variant: 'cards',
          },
        },

        // FAQ
        {
          id: 'faq-clients',
          type: 'accordion',
          data: {
            title: 'Common Questions',
            items: [
              { question: 'How quickly can you actually deliver?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '48 hours for a matched profile. If we need more time, we tell you immediately. Most assignments start within 1 week of the match.' }] }] } },
              { question: 'Do you do fixed-price projects?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Primarily hourly for individual consultants. For larger engagements (3+ consultants, 6+ months), we can structure milestone-based delivery.' }] }] } },
              { question: 'What if the consultant doesn\'t work out?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'We offer a 2-week guarantee on every placement. Not the right fit for any reason — we rematch at no charge.' }] }] } },
              { question: 'Can I speak to references before committing?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Always. We provide 2 direct references for every consultant we present. You call them directly. No intermediary.' }] }] } },
              { question: 'Can FlowPilot receive my brief at 2am?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes. FlowPilot is available 24/7 via chat. It will intake your brief, ask clarifying questions, and have it ready for our team\'s first thing in the morning.' }] }] } },
            ],
          },
        },

        // BRIEF INTAKE FORM
        { id: 'sep-brief', type: 'separator', data: { id: 'brief-form', variant: 'text', text: 'Submit a Brief', icon: 'FileText' } },
        {
          id: 'brief-form',
          type: 'form',
          data: {
            title: 'Tell Us What You Need',
            subtitle: 'A senior consultant will review it within 2 hours on business days. FlowPilot is available around the clock.',
            formName: 'Consultant Brief',
            fields: [
              { id: 'bf-name', type: 'text', label: 'Your Name', placeholder: 'Anna Svensson', required: true },
              { id: 'bf-company', type: 'text', label: 'Company', placeholder: 'Acme AB', required: true },
              { id: 'bf-email', type: 'email', label: 'Work Email', placeholder: 'anna@acme.se', required: true },
              { id: 'bf-role', type: 'text', label: 'Role / Competency Needed', placeholder: 'Senior React Developer', required: true },
              { id: 'bf-duration', type: 'text', label: 'Assignment Duration', placeholder: '3 months, then likely extension' },
              { id: 'bf-start', type: 'text', label: 'Earliest Start', placeholder: 'ASAP / August 1st' },
              { id: 'bf-description', type: 'textarea', label: 'Assignment Description', placeholder: 'Describe the assignment, the team, and the most critical skills...', required: true },
            ],
            submitButtonText: 'Submit Brief',
            successMessage: 'Brief received. A senior consultant will follow up within 2 hours.',
          },
        },
      ],
    },

    // ===== JOIN US PAGE — Recruit consultants =====
    {
      title: 'Join Us',
      slug: 'join',
      menu_order: 4,
      showInMenu: true,
      meta: {
        description: 'Join our network of 300+ senior technology consultants. Interesting assignments, competitive rates, zero downtime between engagements.',
        showTitle: false,
        titleAlignment: 'center',
      },
      blocks: [
        {
          id: 'hero-join',
          type: 'hero',
          data: {
            title: 'Do Your Best Work.',
            subtitle: 'Join a network of 300+ senior specialists. Interesting assignments, competitive rates — and someone who lines up your next engagement before your current one ends.',
            backgroundType: 'image',
            backgroundImage: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=1920',
            heightMode: 'auto',
            contentAlignment: 'center',
            overlayOpacity: 58,
            overlayColor: 'dark',
            primaryButton: { text: 'Apply Now', url: '#apply' },
            secondaryButton: { text: 'See Open Assignments', url: '/consultants' },
          },
        },

        {
          id: 'stats-consultants',
          type: 'stats',
          data: {
            items: [
              { id: 'sc1', value: '300+', label: 'Active Consultants' },
              { id: 'sc2', value: '< 1 week', label: 'Avg Assignment Gap' },
              { id: 'sc3', value: '4 weeks', label: 'Advance Pipeline Notice' },
              { id: 'sc4', value: '4.8★', label: 'Consultant Satisfaction' },
            ],
            columns: 4,
            variant: 'minimal',
          },
        },

        {
          id: 'features-why-join',
          type: 'features',
          data: {
            title: 'We Work Differently',
            subtitle: 'Most consulting firms treat consultants as inventory. We treat them as business partners.',
            features: [
              { id: 'wj1', icon: 'Briefcase', title: 'Interesting Assignments', description: 'Complex problems. Ambitious companies. We turn down boring assignments so you don\'t have to.' },
              { id: 'wj2', icon: 'TrendingUp', title: 'Competitive Rates', description: 'We negotiate hard on your behalf and are transparent about our margin. Your rate is your business.' },
              { id: 'wj3', icon: 'Calendar', title: 'Zero Gap Policy', description: 'We start sourcing your next assignment 4 weeks before the current one ends. Your revenue stream doesn\'t pause.' },
              { id: 'wj4', icon: 'Users', title: 'Real Community', description: '300+ senior specialists. Monthly meetups, skill sessions, a Slack community where people actually help each other.' },
              { id: 'wj5', icon: 'Shield', title: 'You Own Your Clients', description: 'We won\'t poach your direct client relationships. Build something direct, we support it.' },
              { id: 'wj6', icon: 'Bot', title: 'AI-Matched Assignments', description: 'FlowPilot monitors your profile and surfaces matching assignments automatically — so the right opportunity finds you.' },
            ],
            columns: 3,
            layout: 'grid',
            variant: 'cards',
            iconStyle: 'circle',
          },
        },

        // CONSULTANT TESTIMONIALS
        {
          id: 'testimonials-consultants',
          type: 'testimonials',
          data: {
            title: 'From Our Consultants',
            testimonials: [
              { id: 'tcon1', content: 'I\'ve been with three consulting firms. This is the first that treats me like a business partner. I haven\'t had a gap between assignments in two years.', author: 'Sofia Bergqvist', role: 'Senior React Developer', company: 'Member since 2022', rating: 5 },
              { id: 'tcon2', content: 'They called me 5 weeks before my assignment ended with three new briefs. All interesting. I had my pick. That\'s how it should work.', author: 'Marcus Anderson', role: 'Cloud Architect', company: 'Member since 2021', rating: 5 },
              { id: 'tcon3', content: 'Transparent margin. I\'ve checked the market. They don\'t take a bigger cut by offering clients lower rates. They state the margin in the contract. That\'s rare.', author: 'Tobias Rydén', role: 'ML Engineer', company: 'Member since 2023', rating: 5 },
            ],
            layout: 'grid',
            columns: 3,
            showRating: true,
            showAvatar: false,
            variant: 'cards',
          },
        },

        // APPLICATION FORM
        { id: 'sep-apply', type: 'separator', data: { id: 'apply', variant: 'text', text: 'Apply to Join', icon: 'UserPlus' } },
        {
          id: 'apply-form',
          type: 'form',
          data: {
            title: 'Join the Network',
            subtitle: 'We review every application personally — no algorithm. Expect a response within 3 business days.',
            formName: 'Consultant Application',
            fields: [
              { id: 'af-name', type: 'text', label: 'Your Name', placeholder: 'Marcus Anderson', required: true },
              { id: 'af-email', type: 'email', label: 'Email', placeholder: 'marcus@gmail.com', required: true },
              { id: 'af-role', type: 'text', label: 'Your Role / Title', placeholder: 'Senior React Developer', required: true },
              { id: 'af-years', type: 'text', label: 'Years of Experience', placeholder: '8', required: true },
              { id: 'af-stack', type: 'text', label: 'Primary Tech Stack', placeholder: 'React, TypeScript, Node.js' },
              { id: 'af-linkedin', type: 'text', label: 'LinkedIn Profile', placeholder: 'linkedin.com/in/yourname' },
              { id: 'af-intro', type: 'textarea', label: 'Brief Introduction', placeholder: 'What do you do, what are you best at, and what kind of assignments are you looking for?', required: true },
            ],
            submitButtonText: 'Apply to Join',
            successMessage: 'Great — we\'ll review your profile and reach out within 3 business days.',
          },
        },
      ],
    },
  ],

  branding: {
    logo: '',
    organizationName: 'ConsultAgency',
    brandTagline: 'The right consultant. Every time.',
    primaryColor: '238 84% 67%',       // Indigo — professional, modern
    secondaryColor: '240 10% 8%',      // Near-black
    accentColor: '160 84% 39%',        // Emerald — availability/success
    headingFont: 'Plus Jakarta Sans',
    bodyFont: 'Inter',
    borderRadius: 'md',
    shadowIntensity: 'medium',
    allowThemeToggle: true,
    defaultTheme: 'light',
  },

  chatSettings: {
    enabled: true,
    landingPageEnabled: true,
    widgetEnabled: true,
    widgetPosition: 'bottom-right',
    welcomeMessage: 'Hi! I\'m FlowPilot, your always-on consultant. Tell me about your assignment — tech stack, duration, timeline — and I\'ll find the right match from our network.',
    suggestedPrompts: [
      'Do you have senior React developers available this month?',
      'What cloud architects do you have with AWS expertise?',
      'How does the matching process work?',
      'What are your typical rates?',
    ],
    includeContentAsContext: true,
    includedPageSlugs: ['*'],
    includeKbArticles: true,
    contentContextMaxTokens: 50000,
    showContextIndicator: true,
    toolCallingEnabled: true,
    allowGeneralKnowledge: true,
  },

  headerSettings: {
    variant: 'clean',
    stickyHeader: true,
    backgroundStyle: 'blur',
    headerShadow: 'sm',
    showBorder: false,
    headerHeight: 'tall',
    linkColorScheme: 'default',
  },

  footerSettings: {
    variant: 'full',
    email: 'hello@consultagency.se',
    phone: '+46 8 123 456 78',
    address: 'Stureplan 4, Stockholm',
    postalCode: '114 35',
    weekdayHours: 'Mon–Fri 08:00–18:00',
    showBrand: true,
    showQuickLinks: true,
    showContact: true,
    showHours: true,
    legalLinks: [
      { id: 'privacy', label: 'Privacy Policy', url: '/privacy-policy', enabled: true },
      { id: 'terms', label: 'Terms', url: '/terms-of-service', enabled: true },
    ],
  },

  seoSettings: {
    siteTitle: 'ConsultAgency',
    titleTemplate: '%s | ConsultAgency',
    defaultDescription: 'Elite IT consulting agency. 300+ senior specialists. 48-hour match guarantee. Your website is now the consultant.',
    robotsIndex: true,
    robotsFollow: true,
    developmentMode: false,
  },

  aeoSettings: {
    enabled: true,
    organizationName: 'ConsultAgency',
    shortDescription: 'Elite IT consulting firm matching senior specialists to technology assignments in 48 hours.',
    schemaOrgEnabled: true,
    schemaOrgType: 'ProfessionalService',
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
      {
        goal: 'Day 1: Research the IT consulting market — identify top 5 competitors, define our ICP, and document industry trends',
        success_criteria: { memory_keys: ['company_research', 'competitor_analysis'] },
        constraints: { priority: 'critical', deadline_days: 1 },
      },
      {
        goal: 'Write and publish 2 blog posts targeting our ICP: one about technology trends, one consultant hiring guide',
        success_criteria: { published_posts: 2 },
        constraints: { priority: 'high', deadline_days: 3 },
      },
      {
        goal: 'SEO audit all published pages — fix meta titles, descriptions, and heading structure',
        success_criteria: { pages_audited: 'all', seo_score_avg: 80 },
        constraints: { priority: 'high', deadline_days: 2 },
      },
      {
        goal: 'Research and build a prospect pipeline of 10 companies that need IT consulting services in the Nordics',
        success_criteria: { prospects_found: 10, leads_created: 5 },
        constraints: { priority: 'medium', deadline_days: 5 },
      },
      {
        goal: 'Create a 4-week content calendar with blog topics, newsletter themes, and social post ideas',
        success_criteria: { content_proposals: 8 },
        constraints: { priority: 'medium', deadline_days: 7 },
      },
    ],
    prioritySkills: ['add_lead', 'qualify_lead', 'lead_qualify', 'newsletter_create', 'blog_write', 'analyze_analytics'],
    soul: {
      purpose: 'I am the always-on consultant for ConsultAgency. I know our full network of 300+ specialists and can match any brief to the right person. I qualify inbound leads from both clients seeking consultants and consultants seeking assignments. I answer questions about availability, rates, process, and competencies — 24/7, without making anyone wait for business hours.',
      tone: 'Professional, direct, and confident. I don\'t oversell. I match. When a client describes an assignment, I ask smart follow-up questions and present the right profile — not a long list. I\'m a senior consultant who happens to work around the clock.',
      values: ['honesty', 'quality-over-quantity', 'respect-for-time', 'transparency', 'expertise'],
    },
  },

  consultants: [
    {
      name: 'Anna Lindqvist',
      title: 'CTO & Tech Leadership Advisor',
      summary: 'Seasoned technology executive with 18 years leading engineering organisations from scale-up to enterprise. Helps CTOs restructure teams, modernise platforms, and build tech strategies that business leaders actually understand.',
      skills: ['Tech Strategy', 'Engineering Leadership', 'OKRs', 'Platform Architecture', 'Team Building', 'M&A Tech Due Diligence'],
      experience_years: 18,
      certifications: ['Executive Leadership (INSEAD)', 'SAFe 6 SPC'],
      languages: ['English', 'German'],
      availability: 'partially_available',
      hourly_rate_cents: 195000,
      currency: 'USD',
      is_active: true,
    },
    {
      name: 'Marcus Berg',
      title: 'Cloud Architect (AWS / Azure)',
      summary: 'Specialist in large-scale cloud migrations and multi-cloud platform design. Has moved 40+ enterprise workloads from on-prem to AWS and Azure with zero production incidents. Terraform-first, cost-obsessed.',
      skills: ['AWS', 'Azure', 'Terraform', 'Kubernetes', 'CI/CD', 'FinOps', 'Security Architecture', 'DR & HA'],
      experience_years: 14,
      certifications: ['AWS Solutions Architect Professional', 'AWS Security Specialty', 'CKA'],
      languages: ['English'],
      availability: 'available',
      hourly_rate_cents: 175000,
      currency: 'USD',
      is_active: true,
    },
    {
      name: 'Sofia Eriksson',
      title: 'Senior Full Stack Developer',
      summary: 'Product-minded full stack developer who owns features end-to-end. Six years building customer-facing React applications with Node.js backends at fintech and e-commerce scale. Strong on performance and accessibility.',
      skills: ['React', 'TypeScript', 'Node.js', 'Next.js', 'PostgreSQL', 'GraphQL', 'Testing', 'Accessibility'],
      experience_years: 8,
      certifications: ['AWS Cloud Practitioner'],
      languages: ['English'],
      availability: 'available',
      hourly_rate_cents: 135000,
      currency: 'USD',
      is_active: true,
    },
    {
      name: 'Johan Petersson',
      title: 'Data Engineer & ML Platform Specialist',
      summary: 'Builds the data infrastructure that data science teams actually rely on. Databricks-certified, with a track record of taking data platforms from prototype to production at telecom and media companies.',
      skills: ['Databricks', 'Apache Spark', 'Python', 'dbt', 'Airflow', 'Snowflake', 'MLflow', 'Azure Data Factory'],
      experience_years: 11,
      certifications: ['Databricks Certified Data Engineer Professional', 'Google Cloud Professional Data Engineer'],
      languages: ['English'],
      availability: 'available',
      hourly_rate_cents: 155000,
      currency: 'USD',
      is_active: true,
    },
    {
      name: 'Emma Karlsson',
      title: 'DevOps / SRE Engineer',
      summary: 'SRE with a developer background. Brings platform engineering discipline to teams drowning in deployment pain. Cuts release cycles from weeks to hours. Obsessive about observability and on-call ergonomics.',
      skills: ['Kubernetes', 'Terraform', 'GitHub Actions', 'ArgoCD', 'Prometheus', 'Grafana', 'Go', 'Linux'],
      experience_years: 10,
      certifications: ['CKA', 'CKS', 'AWS DevOps Engineer Professional'],
      languages: ['English', 'Norwegian'],
      availability: 'available',
      hourly_rate_cents: 165000,
      currency: 'USD',
      is_active: true,
    },
    {
      name: 'Anders Nilsson',
      title: 'Senior Backend Developer (Java / Kotlin)',
      summary: 'Java and Kotlin specialist with deep experience in high-throughput financial systems. 12 years in banking and payments — knows how to build systems that handle 100k transactions per second and still sleep at night.',
      skills: ['Java', 'Kotlin', 'Spring Boot', 'Kafka', 'PostgreSQL', 'Microservices', 'REST', 'gRPC'],
      experience_years: 12,
      certifications: ['Oracle Certified Professional Java 17', 'Spring Professional'],
      languages: ['English'],
      availability: 'partially_available',
      hourly_rate_cents: 150000,
      currency: 'USD',
      is_active: true,
    },
    {
      name: 'Maja Svensson',
      title: 'Technical Project Manager / Agile Coach',
      summary: 'Former developer turned delivery lead. Bridges the gap between business ambition and engineering reality. Certified SAFe coach with a track record of taking stalled enterprise programmes and actually shipping them.',
      skills: ['SAFe', 'Scrum', 'Jira', 'Stakeholder Management', 'Risk Management', 'OKRs', 'Confluence', 'Azure DevOps'],
      experience_years: 9,
      certifications: ['SAFe 6 SPC', 'PMP', 'CSM'],
      languages: ['English', 'Finnish'],
      availability: 'available',
      hourly_rate_cents: 125000,
      currency: 'USD',
      is_active: true,
    },
    {
      name: 'Erik Johansson',
      title: 'Frontend Developer (React / TypeScript)',
      summary: 'Component-library author and design-system advocate. Builds UIs that designers actually approve and users can use. Has led frontend architecture at two scale-ups through their Series B growth phase.',
      skills: ['React', 'TypeScript', 'Storybook', 'Tailwind CSS', 'Figma', 'Vitest', 'Playwright', 'Web Performance'],
      experience_years: 6,
      languages: ['English'],
      availability: 'available',
      hourly_rate_cents: 120000,
      currency: 'USD',
      is_active: true,
    },
    {
      name: 'Lena Gustafsson',
      title: 'Cybersecurity Architect',
      summary: 'Security architect with 15 years helping regulated industries meet compliance requirements without grinding engineering to a halt. CISSP and ISO 27001 Lead Auditor. Makes security a feature, not a blocker.',
      skills: ['Zero Trust Architecture', 'ISO 27001', 'GDPR', 'Penetration Testing', 'Azure Sentinel', 'IAM', 'SIEM', 'NIS2'],
      experience_years: 15,
      certifications: ['CISSP', 'ISO 27001 Lead Auditor', 'CEH', 'CISM'],
      languages: ['English'],
      availability: 'partially_available',
      hourly_rate_cents: 185000,
      currency: 'USD',
      is_active: true,
    },
    {
      name: 'Filip Andersson',
      title: 'Mobile Developer (React Native / Flutter)',
      summary: 'Cross-platform mobile specialist who has shipped 12 apps to the App Store and Google Play. Knows the difference between an app that looks good in a demo and one that users keep installed after week two.',
      skills: ['React Native', 'Flutter', 'iOS', 'Android', 'Firebase', 'Expo', 'TypeScript', 'App Store Optimisation'],
      experience_years: 7,
      languages: ['English'],
      availability: 'available',
      hourly_rate_cents: 130000,
      currency: 'USD',
      is_active: true,
    },
  ],

  siteSettings: {
    homepageSlug: 'home',
  },
};
