import { ChannelType, ChannelVariant } from '@/hooks/useContentProposals';
import { cn } from '@/lib/utils';
import { 
  Heart, 
  MessageCircle, 
  Send, 
  Bookmark,
  ThumbsUp,
  Share2,
  Repeat2,
  MoreHorizontal
} from 'lucide-react';

interface ChannelMockupProps {
  channel: ChannelType;
  variant: ChannelVariant[ChannelType];
  className?: string;
}

export function ChannelMockup({ channel, variant, className }: ChannelMockupProps) {
  if (!variant) {
    return (
      <div className={cn('flex items-center justify-center h-64 bg-muted rounded-lg', className)}>
        <p className="text-muted-foreground">No content for this channel</p>
      </div>
    );
  }

  switch (channel) {
    case 'blog':
      return <BlogMockup variant={variant as ChannelVariant['blog']} className={className} />;
    case 'newsletter':
      return <NewsletterMockup variant={variant as ChannelVariant['newsletter']} className={className} />;
    case 'linkedin':
      return <LinkedInMockup variant={variant as ChannelVariant['linkedin']} className={className} />;
    case 'instagram':
      return <InstagramMockup variant={variant as ChannelVariant['instagram']} className={className} />;
    case 'twitter':
      return <TwitterMockup variant={variant as ChannelVariant['twitter']} className={className} />;
    case 'facebook':
      return <FacebookMockup variant={variant as ChannelVariant['facebook']} className={className} />;
    case 'print':
      return <PrintMockup variant={variant as ChannelVariant['print']} className={className} />;
    default:
      return null;
  }
}

function BlogMockup({ variant, className }: { variant: ChannelVariant['blog']; className?: string }) {
  if (!variant) return null;
  
  return (
    <div className={cn('bg-background border rounded-lg overflow-hidden shadow-sm', className)}>
      {/* Browser chrome */}
      <div className="bg-muted px-3 py-2 border-b flex items-center gap-2">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <div className="w-3 h-3 rounded-full bg-yellow-400" />
          <div className="w-3 h-3 rounded-full bg-green-400" />
        </div>
        <div className="flex-1 bg-background rounded px-3 py-1 text-xs text-muted-foreground">
          yourblog.com/article
        </div>
      </div>
      
      {/* Content */}
      <div className="p-6 max-h-80 overflow-y-auto">
        <h1 className="text-2xl font-bold mb-2">{variant.title}</h1>
        <p className="text-muted-foreground mb-4">{variant.excerpt}</p>
        <div className="prose prose-sm dark:prose-invert">
          <p>{variant.body?.slice(0, 300)}...</p>
        </div>
        {variant.seo_keywords?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-4">
            {variant.seo_keywords.map((kw, i) => (
              <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded">{kw}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NewsletterBlockPreview({ block }: { block: unknown }) {
  const b = block as Record<string, unknown>;
  
  switch (b.type) {
    case 'heading':
      return <h2 className="text-lg font-bold text-foreground">{b.content as string}</h2>;
      
    case 'paragraph':
      return <p className="text-sm text-foreground/90">{b.content as string}</p>;
      
    case 'bullet-list':
      return (
        <ul className="text-sm list-disc pl-5 space-y-1 text-foreground/90">
          {(b.items as string[])?.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
      
    case 'callout':
      return (
        <div className="bg-primary/10 border-l-4 border-primary p-3 text-sm text-foreground/90 rounded-r">
          {b.content as string}
        </div>
      );
      
    case 'cta':
      return (
        <div className="text-center py-2">
          <span className="inline-block bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-medium">
            {b.text as string}
          </span>
        </div>
      );
      
    case 'divider':
      return <hr className="border-border my-2" />;
      
    default:
      return <div className="text-xs text-muted-foreground italic">[{String(b.type)}]</div>;
  }
}

function NewsletterMockup({ variant, className }: { variant: ChannelVariant['newsletter']; className?: string }) {
  if (!variant) return null;
  
  return (
    <div className={cn('bg-background border rounded-lg overflow-hidden shadow-sm', className)}>
      {/* Email header */}
      <div className="bg-muted px-4 py-3 border-b">
        <div className="text-xs text-muted-foreground mb-1">From: Your Company</div>
        <div className="font-semibold">{variant.subject}</div>
        <div className="text-xs text-muted-foreground mt-1">{variant.preview_text}</div>
      </div>
      
      {/* Email body - render actual blocks */}
      <div className="p-6 max-h-80 overflow-y-auto space-y-3">
        {variant.blocks && variant.blocks.length > 0 ? (
          variant.blocks.map((block, i) => (
            <NewsletterBlockPreview key={i} block={block} />
          ))
        ) : (
          <div className="text-sm text-muted-foreground">No content blocks</div>
        )}
      </div>
    </div>
  );
}

function LinkedInMockup({ variant, className }: { variant: ChannelVariant['linkedin']; className?: string }) {
  if (!variant) return null;
  
  return (
    <div className={cn('bg-background border rounded-lg overflow-hidden shadow-sm', className)}>
      {/* Post header */}
      <div className="p-4 flex items-start gap-3">
        <div className="w-12 h-12 rounded-full bg-[#0A66C2]/20 flex items-center justify-center text-[#0A66C2] font-bold">
          YC
        </div>
        <div>
          <div className="font-semibold">Your Company</div>
          <div className="text-xs text-muted-foreground">1,234 followers</div>
          <div className="text-xs text-muted-foreground">Just now • 🌐</div>
        </div>
      </div>
      
      {/* Post content */}
      <div className="px-4 pb-3">
        <p className="text-sm whitespace-pre-wrap">{variant.text}</p>
        {variant.hashtags?.length > 0 && (
          <p className="text-sm text-[#0A66C2] mt-2">
            {variant.hashtags.map(h => `#${h}`).join(' ')}
          </p>
        )}
      </div>
      
      {/* Engagement */}
      <div className="px-4 py-2 border-t flex items-center gap-6 text-muted-foreground">
        <button className="flex items-center gap-1 text-sm hover:text-foreground">
          <ThumbsUp className="h-4 w-4" /> Like
        </button>
        <button className="flex items-center gap-1 text-sm hover:text-foreground">
          <MessageCircle className="h-4 w-4" /> Comment
        </button>
        <button className="flex items-center gap-1 text-sm hover:text-foreground">
          <Share2 className="h-4 w-4" /> Share
        </button>
      </div>
    </div>
  );
}

function InstagramMockup({ variant, className }: { variant: ChannelVariant['instagram']; className?: string }) {
  if (!variant) return null;
  
  return (
    <div className={cn('bg-background border rounded-lg overflow-hidden shadow-sm max-w-sm', className)}>
      {/* Header */}
      <div className="p-3 flex items-center gap-3 border-b">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF]" />
        <span className="font-semibold text-sm">yourcompany</span>
        <MoreHorizontal className="h-4 w-4 ml-auto" />
      </div>
      
      {/* Image placeholder */}
      <div className="aspect-square bg-gradient-to-br from-[#F58529]/20 via-[#DD2A7B]/20 to-[#8134AF]/20 flex items-center justify-center">
        <p className="text-xs text-muted-foreground text-center px-4">
          {variant.suggested_image_prompt || 'Image placeholder'}
        </p>
      </div>
      
      {/* Actions */}
      <div className="p-3 flex items-center gap-4">
        <Heart className="h-6 w-6" />
        <MessageCircle className="h-6 w-6" />
        <Send className="h-6 w-6" />
        <Bookmark className="h-6 w-6 ml-auto" />
      </div>
      
      {/* Caption */}
      <div className="px-3 pb-3">
        <p className="text-sm">
          <span className="font-semibold">yourcompany </span>
          {variant.caption}
        </p>
        {variant.hashtags?.length > 0 && (
          <p className="text-sm text-[#00376B] dark:text-blue-400 mt-1">
            {variant.hashtags.map(h => `#${h}`).join(' ')}
          </p>
        )}
      </div>
    </div>
  );
}

function TwitterMockup({ variant, className }: { variant: ChannelVariant['twitter']; className?: string }) {
  if (!variant) return null;
  
  return (
    <div className={cn('bg-background border rounded-lg overflow-hidden shadow-sm', className)}>
      {variant.thread?.map((tweet, i) => (
        <div key={i} className={cn('p-4', i > 0 && 'border-t')}>
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-full bg-muted" />
            <div className="flex-1">
              <div className="flex items-center gap-1 mb-1">
                <span className="font-bold text-sm">Your Company</span>
                <span className="text-muted-foreground text-sm">@yourco</span>
                <span className="text-muted-foreground text-sm">· Just now</span>
              </div>
              <p className="text-sm">{tweet}</p>
              <div className="flex items-center gap-8 mt-3 text-muted-foreground">
                <MessageCircle className="h-4 w-4" />
                <Repeat2 className="h-4 w-4" />
                <Heart className="h-4 w-4" />
                <Share2 className="h-4 w-4" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function FacebookMockup({ variant, className }: { variant: ChannelVariant['facebook']; className?: string }) {
  if (!variant) return null;
  
  return (
    <div className={cn('bg-background border rounded-lg overflow-hidden shadow-sm', className)}>
      <div className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[#1877F2]/20" />
        <div>
          <div className="font-semibold text-sm">Your Company</div>
          <div className="text-xs text-muted-foreground">Just now · 🌐</div>
        </div>
      </div>
      <div className="px-4 pb-4">
        <p className="text-sm">{variant.text}</p>
      </div>
      <div className="px-4 py-2 border-t flex items-center justify-around text-muted-foreground">
        <button className="flex items-center gap-2 text-sm">
          <ThumbsUp className="h-4 w-4" /> Like
        </button>
        <button className="flex items-center gap-2 text-sm">
          <MessageCircle className="h-4 w-4" /> Comment
        </button>
        <button className="flex items-center gap-2 text-sm">
          <Share2 className="h-4 w-4" /> Share
        </button>
      </div>
    </div>
  );
}

function PrintMockup({ variant, className }: { variant: ChannelVariant['print']; className?: string }) {
  if (!variant) return null;
  
  return (
    <div className={cn('bg-white border rounded-lg overflow-hidden shadow-lg', className)}>
      <div className="aspect-[1/1.414] p-8 flex flex-col">
        <div className="text-xs text-gray-400 mb-4">{variant.format || 'A4'} Format</div>
        <div className="flex-1 prose prose-sm">
          <p className="text-gray-800">{variant.content?.slice(0, 500)}...</p>
        </div>
      </div>
    </div>
  );
}
