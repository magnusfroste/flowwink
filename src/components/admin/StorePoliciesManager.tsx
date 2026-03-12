import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Plus, ExternalLink, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

interface PolicyTemplate {
  slug: string;
  title: string;
  description: string;
  blocks: Array<{ id: string; type: string; data: Record<string, unknown> }>;
}

const POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    slug: 'return-policy',
    title: 'Return Policy',
    description: 'Standard return and refund policy page',
    blocks: [
      {
        id: 'return-hero',
        type: 'hero',
        data: {
          title: 'Return Policy',
          subtitle: 'We want you to be completely satisfied with your purchase.',
          layout: 'centered',
          size: 'sm',
        },
      },
      {
        id: 'return-content',
        type: 'text',
        data: {
          content: `## Return Window\n\nYou may return most items within **30 days** of delivery for a full refund. Items must be unused and in original packaging.\n\n## How to Return\n\n1. Contact our support team with your order number\n2. Receive a return shipping label\n3. Ship the item back to us\n4. Refund will be processed within 5–7 business days\n\n## Exceptions\n\n- Digital products are non-refundable once accessed\n- Sale items marked as "final sale" cannot be returned\n- Custom or personalized items are non-returnable\n\n## Damaged or Defective Items\n\nIf you receive a damaged or defective item, contact us within 48 hours with photos. We'll send a replacement or issue a full refund at no extra cost.\n\n## Contact Us\n\nFor return questions, reach out to our support team. We're here to help.`,
          maxWidth: 'md',
        },
      },
    ],
  },
  {
    slug: 'terms-of-service',
    title: 'Terms of Service',
    description: 'Terms and conditions for your store',
    blocks: [
      {
        id: 'terms-hero',
        type: 'hero',
        data: {
          title: 'Terms of Service',
          subtitle: 'Please read these terms carefully before using our services.',
          layout: 'centered',
          size: 'sm',
        },
      },
      {
        id: 'terms-content',
        type: 'text',
        data: {
          content: `## Agreement to Terms\n\nBy accessing our website and making purchases, you agree to be bound by these Terms of Service.\n\n## Orders and Payments\n\n- All prices are listed in the store's default currency\n- Payment is required at time of purchase\n- We reserve the right to cancel orders due to pricing errors or stock issues\n\n## Shipping\n\n- Delivery times are estimates and not guaranteed\n- Risk of loss transfers to you upon delivery\n- We are not responsible for delays caused by carriers\n\n## Intellectual Property\n\nAll content on this website — including text, images, logos, and designs — is our property and protected by copyright law.\n\n## Limitation of Liability\n\nWe are not liable for indirect, incidental, or consequential damages arising from your use of our products or services.\n\n## Changes to Terms\n\nWe may update these terms at any time. Continued use of the site after changes constitutes acceptance of the new terms.\n\n## Contact\n\nQuestions about these terms? Contact our support team.`,
          maxWidth: 'md',
        },
      },
    ],
  },
  {
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    description: 'How you collect, use, and protect customer data',
    blocks: [
      {
        id: 'privacy-hero',
        type: 'hero',
        data: {
          title: 'Privacy Policy',
          subtitle: 'Your privacy is important to us.',
          layout: 'centered',
          size: 'sm',
        },
      },
      {
        id: 'privacy-content',
        type: 'text',
        data: {
          content: `## Information We Collect\n\n- **Personal information**: Name, email, shipping address when you place an order\n- **Payment information**: Processed securely through our payment provider (we never store card details)\n- **Usage data**: Pages visited, time spent, for improving our service\n\n## How We Use Your Information\n\n- Process and fulfill your orders\n- Send order confirmations and shipping updates\n- Improve our website and product offerings\n- Send marketing emails (only with your consent)\n\n## Data Sharing\n\nWe do not sell your personal information. We share data only with:\n- Payment processors to complete transactions\n- Shipping carriers to deliver your orders\n- Analytics tools to improve our service\n\n## Your Rights\n\nYou have the right to:\n- Access your personal data\n- Request correction or deletion\n- Opt out of marketing communications\n- Request data portability\n\n## Data Security\n\nWe implement industry-standard security measures to protect your information.\n\n## Contact\n\nFor privacy-related questions, contact our support team.`,
          maxWidth: 'md',
        },
      },
    ],
  },
];

export function StorePoliciesManager() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState<string | null>(null);

  // Check which policy pages already exist
  const { data: existingPages = [] } = useQuery({
    queryKey: ['policy-pages'],
    queryFn: async () => {
      const slugs = POLICY_TEMPLATES.map(t => t.slug);
      const { data, error } = await supabase
        .from('pages')
        .select('slug, title, status')
        .in('slug', slugs);
      if (error) throw error;
      return data || [];
    },
  });

  const createPolicyPage = async (template: PolicyTemplate) => {
    setCreating(template.slug);
    try {
      const payload = {
        title: template.title,
        slug: template.slug,
        status: 'draft' as const,
        content_json: template.blocks as unknown as import('@/integrations/supabase/types').Json,
        meta_json: {
          description: template.description,
          showTitle: false,
          titleAlignment: 'center',
        } as unknown as import('@/integrations/supabase/types').Json,
        show_in_menu: false,
        menu_order: 99,
      };

      const { error } = await supabase.from('pages').insert(payload);

      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['policy-pages'] });
      queryClient.invalidateQueries({ queryKey: ['pages'] });
      toast.success(`${template.title} page created as draft`);
    } catch (err) {
      toast.error(`Could not create ${template.title}`);
    } finally {
      setCreating(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Store Policies</CardTitle>
            <CardDescription>Generate standard policy pages for your store</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {POLICY_TEMPLATES.map(template => {
          const existing = existingPages.find(p => p.slug === template.slug);

          return (
            <div
              key={template.slug}
              className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-card"
            >
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium text-sm">{template.title}</p>
                  <p className="text-xs text-muted-foreground">{template.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {existing ? (
                  <>
                    <Badge variant={existing.status === 'published' ? 'default' : 'secondary'} className="text-[10px]">
                      {existing.status}
                    </Badge>
                    <Button variant="ghost" size="sm" asChild>
                      <Link to={`/admin/pages/${existing.slug}`}>
                        <ExternalLink className="h-3.5 w-3.5 mr-1" />
                        Edit
                      </Link>
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => createPolicyPage(template)}
                    disabled={creating === template.slug}
                  >
                    {creating === template.slug ? (
                      'Creating...'
                    ) : (
                      <>
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Create
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
