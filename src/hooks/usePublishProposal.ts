import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ContentProposal, ChannelType, ChannelVariant } from './useContentProposals';

interface PublishResult {
  channel: ChannelType;
  success: boolean;
  resourceId?: string;
  resourceType?: 'blog_post' | 'newsletter';
  error?: string;
}

/**
 * Generates a URL-safe slug from a title
 */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 100) + '-' + Date.now().toString(36);
}

/**
 * Publish content from a proposal to the blog
 */
async function publishToBlog(
  proposal: ContentProposal,
  variant: ChannelVariant['blog'],
  userId: string | undefined
): Promise<PublishResult> {
  if (!variant) {
    return { channel: 'blog', success: false, error: 'No blog content available' };
  }

  try {
    const { data, error } = await supabase
      .from('blog_posts')
      .insert({
        title: variant.title,
        slug: generateSlug(variant.title),
        excerpt: variant.excerpt,
        content_json: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: variant.body }]
            }
          ]
        },
        meta_json: {
          keywords: variant.seo_keywords,
          proposal_id: proposal.id,
        },
        status: 'draft', // Create as draft for review
        created_by: userId,
        updated_by: userId,
      })
      .select('id, slug, title')
      .single();

    if (error) throw error;

    // Trigger webhook for blog post creation
    await supabase.functions.invoke('send-webhook', {
      body: {
        event: 'blog_post.updated',
        data: {
          id: data.id,
          slug: data.slug,
          title: data.title,
          source: 'content_proposal',
          proposal_id: proposal.id,
          created_at: new Date().toISOString(),
        },
      },
    });

    return {
      channel: 'blog',
      success: true,
      resourceId: data.id,
      resourceType: 'blog_post',
    };
  } catch (error) {
    console.error('[publishToBlog] Error:', error);
    return {
      channel: 'blog',
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create blog post',
    };
  }
}

/**
 * Publish content from a proposal to newsletter
 */
async function publishToNewsletter(
  proposal: ContentProposal,
  variant: ChannelVariant['newsletter'],
  userId: string | undefined
): Promise<PublishResult> {
  if (!variant) {
    return { channel: 'newsletter', success: false, error: 'No newsletter content available' };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase
      .from('newsletters')
      .insert({
        subject: variant.subject,
        content_json: JSON.parse(JSON.stringify({
          preview_text: variant.preview_text,
          blocks: variant.blocks || [],
          proposal_id: proposal.id,
        })),
        status: 'draft',
        created_by: userId,
      } as any) as any)
      .select('id, subject')
      .single();

    if (error) throw error;

    return {
      channel: 'newsletter',
      success: true,
      resourceId: data.id,
      resourceType: 'newsletter',
    };
  } catch (error) {
    console.error('[publishToNewsletter] Error:', error);
    return {
      channel: 'newsletter',
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create newsletter',
    };
  }
}

/**
 * Hook to publish a proposal channel to its destination
 */
export function usePublishProposalChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      proposal,
      channel,
    }: {
      proposal: ContentProposal;
      channel: ChannelType;
    }): Promise<PublishResult> => {
      const { data: { user } } = await supabase.auth.getUser();
      const variant = proposal.channel_variants?.[channel];

      // Handle internal channels (blog, newsletter)
      if (channel === 'blog') {
        const result = await publishToBlog(proposal, variant as ChannelVariant['blog'], user?.id);
        
        if (result.success) {
          // Update proposal with published channel
          const currentPublished = proposal.published_channels || [];
          await supabase
            .from('content_proposals')
            .update({
              published_channels: [...currentPublished, channel],
              status: 'published',
            })
            .eq('id', proposal.id);
        }
        
        return result;
      }

      if (channel === 'newsletter') {
        const result = await publishToNewsletter(proposal, variant as ChannelVariant['newsletter'], user?.id);
        
        if (result.success) {
          const currentPublished = proposal.published_channels || [];
          await supabase
            .from('content_proposals')
            .update({
              published_channels: [...currentPublished, channel],
              status: 'published',
            })
            .eq('id', proposal.id);
        }
        
        return result;
      }

      // Handle external channels (social media) via webhook
      // These will be sent to external systems like n8n for processing
      try {
        await supabase.functions.invoke('send-webhook', {
          body: {
            event: 'form.submitted', // Using existing event as workaround
            data: {
              form_name: `content_publish_${channel}`,
              channel,
              proposal_id: proposal.id,
              topic: proposal.topic,
              content: variant,
              published_at: new Date().toISOString(),
            },
          },
        });

        // Update proposal
        const currentPublished = proposal.published_channels || [];
        await supabase
          .from('content_proposals')
          .update({
            published_channels: [...currentPublished, channel],
          })
          .eq('id', proposal.id);

        return {
          channel,
          success: true,
        };
      } catch (error) {
        console.error(`[publishTo${channel}] Error:`, error);
        return {
          channel,
          success: false,
          error: error instanceof Error ? error.message : `Failed to publish to ${channel}`,
        };
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['content-proposals'] });
      
      if (result.success) {
        if (result.resourceType) {
          toast.success(`Created ${result.resourceType.replace('_', ' ')} draft from proposal`);
        } else {
          toast.success(`Content sent to ${result.channel} via webhook`);
        }
      } else {
        toast.error(result.error || 'Failed to publish');
      }
    },
    onError: (error) => {
      toast.error('Failed to publish: ' + (error instanceof Error ? error.message : 'Unknown error'));
    },
  });
}

/**
 * Hook to publish all channels at once
 */
export function usePublishAllChannels() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (proposal: ContentProposal): Promise<PublishResult[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      const results: PublishResult[] = [];
      const channels = Object.keys(proposal.channel_variants || {}) as ChannelType[];
      const alreadyPublished = proposal.published_channels || [];

      for (const channel of channels) {
        if (alreadyPublished.includes(channel)) continue;

        const variant = proposal.channel_variants?.[channel];
        let result: PublishResult;

        if (channel === 'blog') {
          result = await publishToBlog(proposal, variant as ChannelVariant['blog'], user?.id);
        } else if (channel === 'newsletter') {
          result = await publishToNewsletter(proposal, variant as ChannelVariant['newsletter'], user?.id);
        } else {
          // External channels via webhook
          try {
            await supabase.functions.invoke('send-webhook', {
              body: {
                event: 'form.submitted',
                data: {
                  form_name: `content_publish_${channel}`,
                  channel,
                  proposal_id: proposal.id,
                  topic: proposal.topic,
                  content: variant,
                  published_at: new Date().toISOString(),
                },
              },
            });
            result = { channel, success: true };
          } catch (error) {
            result = {
              channel,
              success: false,
              error: error instanceof Error ? error.message : 'Webhook failed',
            };
          }
        }

        results.push(result);
      }

      // Update proposal with all published channels
      const successfulChannels = results.filter(r => r.success).map(r => r.channel);
      if (successfulChannels.length > 0) {
        await supabase
          .from('content_proposals')
          .update({
            published_channels: [...alreadyPublished, ...successfulChannels],
            status: 'published',
          })
          .eq('id', proposal.id);
      }

      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ['content-proposals'] });
      
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      if (successful > 0 && failed === 0) {
        toast.success(`Published to ${successful} channel${successful > 1 ? 's' : ''}`);
      } else if (successful > 0 && failed > 0) {
        toast.warning(`Published to ${successful} channel${successful > 1 ? 's' : ''}, ${failed} failed`);
      } else {
        toast.error('Failed to publish to any channel');
      }
    },
    onError: (error) => {
      toast.error('Failed to publish: ' + (error instanceof Error ? error.message : 'Unknown error'));
    },
  });
}
