import { logger } from '@/lib/logger';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ContentProposal, ChannelType, ChannelVariant, getChannelImage } from './useContentProposals';
import { moduleRegistry } from '@/lib/module-registry';
import type { BlogModuleInput, BlogModuleOutput, NewsletterModuleInput, NewsletterModuleOutput } from '@/types/module-contracts';

interface PublishResult {
  channel: ChannelType;
  success: boolean;
  resourceId?: string;
  resourceType?: 'blog_post' | 'newsletter';
  error?: string;
}

/**
 * Publish content from a proposal to the blog using Module Registry
 */
async function publishToBlog(
  proposal: ContentProposal,
  variant: ChannelVariant['blog'],
  _userId: string | undefined
): Promise<PublishResult> {
  if (!variant) {
    return { channel: 'blog', success: false, error: 'No blog content available' };
  }

  try {
    // Get the effective image for this channel (respects overrides)
    const channelImage = getChannelImage(proposal, 'blog');
    
    // Use Module Registry for validated, consistent publishing
    const input: BlogModuleInput = {
      title: variant.title,
      content: variant.body, // Module will wrap in Tiptap format
      excerpt: variant.excerpt,
      featured_image: channelImage || undefined,
      meta: {
        source_module: 'content-campaign',
        source_id: proposal.id,
        keywords: variant.seo_keywords,
      },
      options: {
        status: 'published',
      },
    };

    const result = await moduleRegistry.publish<BlogModuleInput, BlogModuleOutput>('blog', input);

    if (!result.success) {
      return {
        channel: 'blog',
        success: false,
        error: result.error || 'Failed to create blog post',
      };
    }

    return {
      channel: 'blog',
      success: true,
      resourceId: result.id,
      resourceType: 'blog_post',
    };
  } catch (error) {
    logger.error('[publishToBlog] Error:', error);
    return {
      channel: 'blog',
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create blog post',
    };
  }
}

/**
 * Convert newsletter blocks to HTML for content_html field
 */
function newsletterBlocksToHtml(blocks: unknown[], previewText?: string): string {
  if (!blocks || blocks.length === 0) {
    return previewText ? `<p>${previewText}</p>` : '';
  }

  const htmlParts: string[] = [];
  
  for (const block of blocks) {
    const b = block as Record<string, unknown>;
    const type = b.type as string;
    
    switch (type) {
      case 'heading':
        htmlParts.push(`<h2 style="margin: 0 0 16px 0; font-size: 24px; font-weight: bold;">${b.content || ''}</h2>`);
        break;
      case 'paragraph':
      case 'text':
        htmlParts.push(`<p style="margin: 0 0 16px 0; line-height: 1.6;">${b.content || ''}</p>`);
        break;
      case 'image':
        if (b.url || b.src) {
          htmlParts.push(`<img src="${b.url || b.src}" alt="${b.alt || ''}" style="max-width: 100%; height: auto; margin: 16px 0;" />`);
        }
        break;
      case 'button':
      case 'cta':
        htmlParts.push(`<p style="margin: 24px 0;"><a href="${b.url || b.href || '#'}" style="display: inline-block; padding: 12px 24px; background-color: #000; color: #fff; text-decoration: none; border-radius: 4px;">${b.text || b.label || 'Click here'}</a></p>`);
        break;
      case 'divider':
        htmlParts.push('<hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />');
        break;
      case 'spacer':
        htmlParts.push('<div style="height: 24px;"></div>');
        break;
      default:
        // For unknown block types, try to extract content
        if (b.content && typeof b.content === 'string') {
          htmlParts.push(`<p style="margin: 0 0 16px 0;">${b.content}</p>`);
        }
    }
  }
  
  return htmlParts.join('\n');
}

/**
 * Publish content from a proposal to newsletter using Module Registry
 */
async function publishToNewsletter(
  proposal: ContentProposal,
  variant: ChannelVariant['newsletter'],
  _userId: string | undefined
): Promise<PublishResult> {
  if (!variant) {
    return { channel: 'newsletter', success: false, error: 'No newsletter content available' };
  }

  try {
    // Convert blocks to HTML for proper rendering
    const contentHtml = newsletterBlocksToHtml(variant.blocks || [], variant.preview_text);
    
    // Use Module Registry for validated, consistent publishing
    const input: NewsletterModuleInput = {
      subject: variant.subject,
      content_html: contentHtml,
      preview_text: variant.preview_text,
      meta: {
        source_module: 'content-campaign',
        source_id: proposal.id,
      },
      options: {
        status: 'draft',
      },
    };

    const result = await moduleRegistry.publish<NewsletterModuleInput, NewsletterModuleOutput>('newsletter', input);

    if (!result.success) {
      return {
        channel: 'newsletter',
        success: false,
        error: result.error || 'Failed to create newsletter',
      };
    }

    return {
      channel: 'newsletter',
      success: true,
      resourceId: result.id,
      resourceType: 'newsletter',
    };
  } catch (error) {
    logger.error('[publishToNewsletter] Error:', error);
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
        // Get the effective image for this channel
        const channelImage = getChannelImage(proposal, channel);
        
        await supabase.functions.invoke('send-webhook', {
          body: {
            event: 'form.submitted', // Using existing event as workaround
            data: {
              form_name: `content_publish_${channel}`,
              channel,
              proposal_id: proposal.id,
              topic: proposal.topic,
              content: variant,
              image_url: channelImage,
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
        logger.error(`[publishTo${channel}] Error:`, error);
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
            // Get the effective image for this channel
            const channelImage = getChannelImage(proposal, channel);
            
            await supabase.functions.invoke('send-webhook', {
              body: {
                event: 'form.submitted',
                data: {
                  form_name: `content_publish_${channel}`,
                  channel,
                  proposal_id: proposal.id,
                  topic: proposal.topic,
                  content: variant,
                  image_url: channelImage,
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
