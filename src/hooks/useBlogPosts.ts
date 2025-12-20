import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { BlogPost, PageStatus, ContentBlock, BlogPostMeta, BlogCategory, BlogTag } from '@/types/cms';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from './useAuth';
import type { Json } from '@/integrations/supabase/types';
import { webhookEvents } from '@/lib/webhook-utils';

// Parse blog post from database
function parseBlogPost(data: Record<string, unknown>): BlogPost {
  return {
    id: data.id as string,
    slug: data.slug as string,
    title: data.title as string,
    excerpt: data.excerpt as string | null,
    content_json: (data.content_json || []) as unknown as ContentBlock[],
    featured_image: data.featured_image as string | null,
    featured_image_alt: data.featured_image_alt as string | null,
    author_id: data.author_id as string | null,
    reviewer_id: data.reviewer_id as string | null,
    reviewed_at: data.reviewed_at as string | null,
    status: data.status as PageStatus,
    published_at: data.published_at as string | null,
    scheduled_at: data.scheduled_at as string | null,
    meta_json: (data.meta_json || {}) as unknown as BlogPostMeta,
    is_featured: data.is_featured as boolean,
    reading_time_minutes: data.reading_time_minutes as number | null,
    created_by: data.created_by as string | null,
    updated_by: data.updated_by as string | null,
    created_at: data.created_at as string,
    updated_at: data.updated_at as string,
  };
}

// Calculate reading time from content
function calculateReadingTime(content: ContentBlock[]): number {
  let wordCount = 0;
  
  const extractText = (blocks: ContentBlock[]) => {
    blocks.forEach(block => {
      if (block.type === 'text' && block.data.content) {
        const blockContent = block.data.content;
        if (typeof blockContent === 'string') {
          wordCount += blockContent.replace(/<[^>]*>/g, '').split(/\s+/).length;
        } else if (typeof blockContent === 'object' && blockContent !== null) {
          // Tiptap JSON
          const tiptapContent = blockContent as { type?: string; content?: unknown[] };
          if (tiptapContent.content) {
            const extractFromTiptap = (nodes: unknown[]) => {
              nodes.forEach((node: unknown) => {
                const n = node as { text?: string; content?: unknown[] };
                if (n.text) wordCount += n.text.split(/\s+/).length;
                if (n.content) extractFromTiptap(n.content);
              });
            };
            extractFromTiptap(tiptapContent.content);
          }
        }
      }
    });
  };
  
  extractText(content);
  return Math.max(1, Math.ceil(wordCount / 200)); // 200 words per minute
}

export interface UseBlogPostsOptions {
  status?: PageStatus;
  categorySlug?: string;
  tagSlug?: string;
  authorId?: string;
  featured?: boolean;
  page?: number;
  limit?: number;
}

export function useBlogPosts(options: UseBlogPostsOptions = {}) {
  const { status, categorySlug, tagSlug, authorId, featured, page = 1, limit = 10 } = options;
  
  return useQuery({
    queryKey: ['blog-posts', options],
    queryFn: async () => {
      let query = supabase
        .from('blog_posts')
        .select(`
          *,
          author:profiles!blog_posts_author_id_fkey(id, email, full_name, avatar_url, bio, title),
          categories:blog_post_categories(category:blog_categories(*)),
          tags:blog_post_tags(tag:blog_tags(*))
        `, { count: 'exact' })
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
      
      if (status) {
        query = query.eq('status', status);
      }
      
      if (authorId) {
        query = query.eq('author_id', authorId);
      }
      
      if (featured !== undefined) {
        query = query.eq('is_featured', featured);
      }
      
      // Pagination
      const from = (page - 1) * limit;
      query = query.range(from, from + limit - 1);
      
      const { data, error, count } = await query;
      
      if (error) throw error;
      
      // Transform the data
      const posts = (data || []).map((post: Record<string, unknown>) => {
        const parsed = parseBlogPost(post);
        
        // Map author
        if (post.author) {
          parsed.author = post.author as BlogPost['author'];
        }
        
        // Map categories
        if (post.categories && Array.isArray(post.categories)) {
          parsed.categories = (post.categories as { category: BlogCategory }[])
            .map(c => c.category)
            .filter(Boolean);
        }
        
        // Map tags
        if (post.tags && Array.isArray(post.tags)) {
          parsed.tags = (post.tags as { tag: BlogTag }[])
            .map(t => t.tag)
            .filter(Boolean);
        }
        
        return parsed;
      });
      
      // Filter by category if needed (post-query because of junction table)
      let filteredPosts = posts;
      if (categorySlug) {
        filteredPosts = posts.filter(p => 
          p.categories?.some(c => c.slug === categorySlug)
        );
      }
      
      if (tagSlug) {
        filteredPosts = posts.filter(p => 
          p.tags?.some(t => t.slug === tagSlug)
        );
      }
      
      return {
        posts: filteredPosts,
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      };
    },
  });
}

export function useBlogPost(slugOrId: string | undefined) {
  return useQuery({
    queryKey: ['blog-post', slugOrId],
    queryFn: async () => {
      if (!slugOrId) return null;
      
      // Try by slug first, then by id
      let query = supabase
        .from('blog_posts')
        .select(`
          *,
          author:profiles!blog_posts_author_id_fkey(id, email, full_name, avatar_url, bio, title),
          reviewer:profiles!blog_posts_reviewer_id_fkey(id, email, full_name, avatar_url, bio, title),
          categories:blog_post_categories(category:blog_categories(*)),
          tags:blog_post_tags(tag:blog_tags(*))
        `);
      
      // Check if it's a UUID
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);
      
      if (isUuid) {
        query = query.eq('id', slugOrId);
      } else {
        query = query.eq('slug', slugOrId);
      }
      
      const { data, error } = await query.maybeSingle();
      
      if (error) throw error;
      if (!data) return null;
      
      const parsed = parseBlogPost(data as Record<string, unknown>);
      
      if (data.author) {
        parsed.author = data.author as BlogPost['author'];
      }
      
      if (data.reviewer) {
        parsed.reviewer = data.reviewer as BlogPost['reviewer'];
      }
      
      if (data.categories && Array.isArray(data.categories)) {
        parsed.categories = (data.categories as { category: BlogCategory }[])
          .map(c => c.category)
          .filter(Boolean);
      }
      
      if (data.tags && Array.isArray(data.tags)) {
        parsed.tags = (data.tags as { tag: BlogTag }[])
          .map(t => t.tag)
          .filter(Boolean);
      }
      
      return parsed;
    },
    enabled: !!slugOrId,
    refetchOnMount: 'always',
    staleTime: 0,
  });
}

export function useCreateBlogPost() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async ({ 
      title, 
      slug,
      content,
      excerpt,
      featured_image,
      featured_image_alt,
      author_id,
      meta,
      categories,
      tags,
    }: { 
      title: string; 
      slug: string;
      content?: ContentBlock[];
      excerpt?: string;
      featured_image?: string;
      featured_image_alt?: string;
      author_id?: string;
      meta?: Partial<BlogPostMeta>;
      categories?: string[];
      tags?: string[];
    }) => {
      const contentBlocks = content || [];
      const readingTime = calculateReadingTime(contentBlocks);
      
      const { data, error } = await supabase
        .from('blog_posts')
        .insert({
          title,
          slug,
          excerpt,
          content_json: contentBlocks as unknown as Json,
          featured_image,
          featured_image_alt,
          author_id: author_id || user?.id,
          meta_json: (meta || {}) as unknown as Json,
          reading_time_minutes: readingTime,
          created_by: user?.id,
          updated_by: user?.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Add categories
      if (categories?.length) {
        await supabase.from('blog_post_categories').insert(
          categories.map(categoryId => ({
            post_id: data.id,
            category_id: categoryId,
          }))
        );
      }
      
      // Add tags
      if (tags?.length) {
        await supabase.from('blog_post_tags').insert(
          tags.map(tagId => ({
            post_id: data.id,
            tag_id: tagId,
          }))
        );
      }
      
      // Create audit log
      await supabase.from('audit_logs').insert({
        action: 'create_blog_post',
        entity_type: 'blog_post',
        entity_id: data.id,
        user_id: user?.id,
        metadata: { title, slug } as unknown as Json,
      });
      
      return parseBlogPost(data as Record<string, unknown>);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blog-posts'] });
      toast({
        title: 'Post created',
        description: 'A new blog post has been created.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateBlogPost() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async ({ 
      id, 
      title,
      slug,
      excerpt,
      content_json,
      featured_image,
      featured_image_alt,
      author_id,
      reviewer_id,
      reviewed_at,
      meta_json,
      is_featured,
      categories,
      tags,
    }: { 
      id: string;
      title?: string;
      slug?: string;
      excerpt?: string;
      content_json?: ContentBlock[];
      featured_image?: string;
      featured_image_alt?: string;
      author_id?: string;
      reviewer_id?: string | null;
      reviewed_at?: string | null;
      meta_json?: BlogPostMeta;
      is_featured?: boolean;
      categories?: string[];
      tags?: string[];
    }) => {
      const updates: Record<string, unknown> = {
        updated_by: user?.id,
      };
      
      if (title !== undefined) updates.title = title;
      if (slug !== undefined) updates.slug = slug;
      if (excerpt !== undefined) updates.excerpt = excerpt;
      if (content_json !== undefined) {
        updates.content_json = content_json as unknown as Json;
        updates.reading_time_minutes = calculateReadingTime(content_json);
      }
      if (featured_image !== undefined) updates.featured_image = featured_image;
      if (featured_image_alt !== undefined) updates.featured_image_alt = featured_image_alt;
      if (author_id !== undefined) updates.author_id = author_id;
      if (reviewer_id !== undefined) updates.reviewer_id = reviewer_id;
      if (reviewed_at !== undefined) updates.reviewed_at = reviewed_at;
      if (meta_json !== undefined) updates.meta_json = meta_json as unknown as Json;
      if (is_featured !== undefined) updates.is_featured = is_featured;
      
      const { data, error } = await supabase
        .from('blog_posts')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      
      // Update categories if provided
      if (categories !== undefined) {
        await supabase.from('blog_post_categories').delete().eq('post_id', id);
        if (categories.length) {
          await supabase.from('blog_post_categories').insert(
            categories.map(categoryId => ({
              post_id: id,
              category_id: categoryId,
            }))
          );
        }
      }
      
      // Update tags if provided
      if (tags !== undefined) {
        await supabase.from('blog_post_tags').delete().eq('post_id', id);
        if (tags.length) {
          await supabase.from('blog_post_tags').insert(
            tags.map(tagId => ({
              post_id: id,
              tag_id: tagId,
            }))
          );
        }
      }
      
      // Create audit log
      await supabase.from('audit_logs').insert({
        action: 'update_blog_post',
        entity_type: 'blog_post',
        entity_id: id,
        user_id: user?.id,
        metadata: { 
          updated_fields: Object.keys(updates).filter(k => k !== 'updated_by'),
        } as unknown as Json,
      });
      
      return parseBlogPost(data as Record<string, unknown>);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['blog-posts'] });
      queryClient.invalidateQueries({ queryKey: ['blog-post', data.id] });
      queryClient.invalidateQueries({ queryKey: ['blog-post', data.slug] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error saving',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateBlogPostStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async ({ 
      id, 
      status,
      scheduledAt
    }: { 
      id: string; 
      status: PageStatus;
      scheduledAt?: Date | null;
    }) => {
      const updates: Record<string, unknown> = {
        status,
        updated_by: user?.id,
      };
      
      if (status === 'published') {
        updates.published_at = new Date().toISOString();
      }
      
      if (scheduledAt !== undefined) {
        updates.scheduled_at = scheduledAt ? scheduledAt.toISOString() : null;
      }
      
      const { data, error } = await supabase
        .from('blog_posts')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      
      // Create audit log
      await supabase.from('audit_logs').insert({
        action: `blog_status_change_${status}`,
        entity_type: 'blog_post',
        entity_id: id,
        user_id: user?.id,
        metadata: { new_status: status } as unknown as Json,
      });
      
      // Trigger webhook for blog post published
      if (status === 'published') {
        webhookEvents.blogPostPublished({ 
          id, 
          slug: data.slug, 
          title: data.title,
          excerpt: data.excerpt,
        });
      }
      
      return parseBlogPost(data as Record<string, unknown>);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['blog-posts'] });
      queryClient.invalidateQueries({ queryKey: ['blog-post', data.id] });
      
      const messages: Record<PageStatus, string> = {
        draft: 'Post has been returned to draft.',
        reviewing: 'Post has been sent for review.',
        published: 'Post has been published!',
        archived: 'Post has been archived.',
      };
      
      toast({
        title: 'Status updated',
        description: messages[variables.status],
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteBlogPost() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('blog_posts')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      // Create audit log
      await supabase.from('audit_logs').insert({
        action: 'delete_blog_post',
        entity_type: 'blog_post',
        entity_id: id,
        user_id: user?.id,
        metadata: {} as unknown as Json,
      });
      
      // Trigger webhook for blog post deleted
      webhookEvents.blogPostDeleted(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blog-posts'] });
      toast({
        title: 'Post deleted',
        description: 'Blog post has been permanently deleted.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Authors hook (profiles that can be assigned as authors)
// In admin context, show all profiles. For public display, filter by show_as_author.
export function useAuthors(publicOnly = false) {
  return useQuery({
    queryKey: ['authors', { publicOnly }],
    queryFn: async () => {
      let query = supabase
        .from('profiles')
        .select('*')
        .order('full_name');
      
      // Only filter by show_as_author for public-facing contexts
      if (publicOnly) {
        query = query.eq('show_as_author', true);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data;
    },
  });
}

export function useAuthor(id: string | undefined) {
  return useQuery({
    queryKey: ['author', id],
    queryFn: async () => {
      if (!id) return null;
      
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}