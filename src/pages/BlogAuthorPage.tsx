import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { PublicNavigation } from '@/components/public/PublicNavigation';
import { PublicFooter } from '@/components/public/PublicFooter';
import { SeoHead } from '@/components/public/SeoHead';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BlogPostCard } from '@/components/public/BlogPostCard';
import NotFound from './NotFound';

interface AuthorProfile {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  bio: string | null;
  title: string | null;
  show_as_author?: boolean | null;
}

function slugify(v: string): string {
  return v
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function useAuthorBySlug(slug: string | undefined) {
  return useQuery({
    queryKey: ['blog-author', slug],
    enabled: !!slug,
    queryFn: async () => {
      // Try uuid direct lookup first
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (slug && uuidRe.test(slug)) {
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name, email, avatar_url, bio, title, show_as_author')
          .eq('id', slug)
          .maybeSingle();
        if (data) return data as AuthorProfile;
      }
      // Otherwise fetch candidates and match slugified full_name
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url, bio, title, show_as_author')
        .not('full_name', 'is', null);
      if (error) throw error;
      const match = (data ?? []).find(
        (p) => p.full_name && slugify(p.full_name) === slug,
      );
      return (match ?? null) as AuthorProfile | null;
    },
  });
}

function useAuthorPosts(authorId: string | undefined) {
  return useQuery({
    queryKey: ['blog-author-posts', authorId],
    enabled: !!authorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blog_posts')
        .select('id, slug, title, excerpt, featured_image, published_at, created_at, reading_time_minutes, author_id')
        .eq('author_id', authorId!)
        .eq('status', 'published')
        .order('published_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export default function BlogAuthorPage() {
  const { slug } = useParams();
  const { data: author, isLoading } = useAuthorBySlug(slug);
  const { data: posts = [] } = useAuthorPosts(author?.id);

  const initials = useMemo(
    () =>
      (author?.full_name || author?.email || '?')
        .split(' ')
        .map((s) => s[0])
        .join('')
        .toUpperCase()
        .slice(0, 2),
    [author],
  );

  if (isLoading) {
    return (
      <>
        <PublicNavigation />
        <main className="min-h-screen bg-background">
          <div className="container mx-auto px-4 py-12">
            <p className="text-center text-muted-foreground">Loading author…</p>
          </div>
        </main>
        <PublicFooter />
      </>
    );
  }

  if (!author) return <NotFound />;

  const displayName = author.full_name || author.email;
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const canonicalUrl = `${baseUrl}/blog/author/${slug}`;

  return (
    <>
      <SeoHead
        title={`${displayName} — Author`}
        description={author.bio || `Posts by ${displayName}`}
        canonicalUrl={canonicalUrl}
        ogImage={author.avatar_url || undefined}
      />
      <PublicNavigation />
      <main className="min-h-screen bg-background">
        <section className="container mx-auto px-4 py-12 max-w-4xl">
          <div className="flex items-start gap-6 mb-10">
            <Avatar className="h-24 w-24">
              <AvatarImage src={author.avatar_url || undefined} alt={displayName} />
              <AvatarFallback className="text-xl">{initials}</AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-3xl font-bold">{displayName}</h1>
              {author.title && <p className="text-muted-foreground">{author.title}</p>}
              {author.bio && <p className="mt-3 text-sm text-muted-foreground max-w-2xl">{author.bio}</p>}
            </div>
          </div>

          <h2 className="text-xl font-semibold mb-4">Posts by {displayName}</h2>
          {posts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No published posts yet.</p>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {posts.map((p) => (
                <BlogPostCard key={p.id} post={p as never} />
              ))}
            </div>
          )}

          <div className="mt-10">
            <Link to="/blog" className="text-sm text-muted-foreground hover:text-foreground">
              ← Back to blog
            </Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
