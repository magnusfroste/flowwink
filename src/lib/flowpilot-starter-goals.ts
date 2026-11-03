import { Headphones, Newspaper, ShoppingCart, TrendingUp, Users } from 'lucide-react';

/** Starter goals — also offered by the Goals tab when there are none. */
export const GOAL_OPTIONS = [
  {
    id: 'grow-traffic',
    icon: TrendingUp,
    title: 'Grow Website Traffic',
    description: 'Publish blog posts, optimize SEO, and improve search rankings',
    objective: 'Increase website traffic by regularly publishing optimized blog content and improving SEO across all pages.',
  },
  {
    id: 'generate-leads',
    icon: Users,
    title: 'Generate More Leads',
    description: 'Capture visitors, qualify prospects, and nurture them automatically',
    objective: 'Generate and qualify leads through forms, chat interactions, and automated follow-ups. Aim for consistent lead pipeline growth.',
  },
  {
    id: 'content-marketing',
    icon: Newspaper,
    title: 'Content Marketing',
    description: 'Create newsletters, blog content, and social media copy',
    objective: 'Build a consistent content marketing engine with weekly blog posts, monthly newsletters, and cross-channel content distribution.',
  },
  {
    id: 'sell-online',
    icon: ShoppingCart,
    title: 'Sell Products/Services',
    description: 'Drive purchases, manage orders, and grow revenue',
    objective: 'Optimize the online sales funnel by improving product pages, reducing cart abandonment, and increasing average order value.',
  },
  {
    id: 'customer-support',
    icon: Headphones,
    title: 'Improve Customer Support',
    description: 'Build a knowledge base and let AI handle common questions',
    objective: 'Improve customer support by expanding the knowledge base, increasing AI chat resolution rate, and reducing response time for escalated conversations.',
  },
];
