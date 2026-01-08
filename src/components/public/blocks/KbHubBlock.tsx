import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { Search, ChevronDown, ChevronRight, ThumbsUp, ThumbsDown, MessageSquare, HelpCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { renderTiptapContent } from '@/lib/tiptap-utils';
import { useIsModuleEnabled } from '@/hooks/useModules';
import { useLocation } from 'react-router-dom';

export interface KbHubBlockData {
  title?: string;
  subtitle?: string;
  searchPlaceholder?: string;
  showSearch?: boolean;
  showCategories?: boolean;
  showContactCta?: boolean;
  contactTitle?: string;
  contactSubtitle?: string;
  contactButtonText?: string;
  contactLink?: string;
  emptyStateTitle?: string;
  emptyStateSubtitle?: string;
  layout?: 'accordion' | 'cards';
}

interface KbHubBlockProps {
  data: KbHubBlockData;
}

interface KbCategory {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  description: string | null;
  is_active: boolean;
}

interface KbArticle {
  id: string;
  title: string;
  slug: string;
  question: string;
  answer_json: unknown;
  answer_text: string | null;
  category_id: string;
  is_published: boolean;
  is_featured: boolean;
  category?: KbCategory;
}

export function KbHubBlock({ data }: KbHubBlockProps) {
  const {
    title = 'Hur kan vi hjälpa dig?',
    subtitle = 'Sök i vår kunskapsbas eller bläddra efter kategori',
    searchPlaceholder = 'Sök efter frågor eller svar...',
    showSearch = true,
    showCategories = true,
    showContactCta = true,
    contactTitle = 'Hittar du inte svaret?',
    contactSubtitle = 'Vårt team hjälper dig gärna med dina frågor',
    contactButtonText = 'Kontakta oss',
    contactLink = '/kontakt',
    emptyStateTitle = 'Inga resultat hittades',
    emptyStateSubtitle = 'Försök med andra söktermer eller bläddra i alla kategorier',
    layout = 'accordion',
  } = data;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedArticles, setExpandedArticles] = useState<Set<string>>(new Set());

  const chatEnabled = useIsModuleEnabled('chat');
  const location = useLocation();
  // Derive KB slug from current page URL (e.g., /help -> help)
  const kbSlug = location.pathname.split('/')[1] || 'help';

  // Fetch categories
  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ['kb-hub-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kb_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return data as KbCategory[];
    },
  });

  // Fetch articles
  const { data: articles, isLoading: articlesLoading } = useQuery({
    queryKey: ['kb-hub-articles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kb_articles')
        .select(`
          id,
          title,
          slug,
          question,
          answer_json,
          answer_text,
          category_id,
          is_published,
          is_featured,
          category:kb_categories!inner(id, name, slug, icon, description, is_active)
        `)
        .eq('is_published', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return data as KbArticle[];
    },
  });

  // Filter articles
  const filteredArticles = useMemo(() => {
    let result = articles || [];

    if (selectedCategory) {
      result = result.filter(a => a.category_id === selectedCategory);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(a =>
        a.title.toLowerCase().includes(query) ||
        a.question.toLowerCase().includes(query) ||
        a.answer_text?.toLowerCase().includes(query)
      );
    }

    return result;
  }, [articles, selectedCategory, searchQuery]);

  // Group articles by category
  const articlesByCategory = useMemo(() => {
    const grouped: Record<string, KbArticle[]> = {};

    filteredArticles.forEach(article => {
      const catId = article.category_id;
      if (!grouped[catId]) grouped[catId] = [];
      grouped[catId].push(article);
    });

    return grouped;
  }, [filteredArticles]);

  const toggleArticle = (id: string) => {
    setExpandedArticles(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectedCategoryName = categories?.find(c => c.id === selectedCategory)?.name;
  const isLoading = categoriesLoading || articlesLoading;

  return (
    <section className="py-16 px-4">
      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        {(title || subtitle) && (
          <div className="text-center mb-10">
            {title && (
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                {subtitle}
              </p>
            )}
          </div>
        )}

        {/* Search */}
        {showSearch && (
          <div className="relative max-w-xl mx-auto mb-8">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="search"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 h-14 text-lg rounded-xl shadow-sm border-2 focus:border-primary"
            />
          </div>
        )}

        {/* Categories */}
        {showCategories && categories && categories.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center mb-8">
            <Button
              variant={selectedCategory === null ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(null)}
              className="rounded-full"
            >
              Alla
            </Button>
            {categoriesLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-24 rounded-full" />
              ))
            ) : (
              categories.map(category => (
                <Button
                  key={category.id}
                  variant={selectedCategory === category.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedCategory(category.id)}
                  className="rounded-full"
                >
                  {category.name}
                </Button>
              ))
            )}
          </div>
        )}

        {/* Results info */}
        {(searchQuery || selectedCategory) && !isLoading && (
          <div className="text-center mb-6">
            <p className="text-muted-foreground">
              {filteredArticles.length} {filteredArticles.length === 1 ? 'artikel' : 'artiklar'}
              {selectedCategoryName && ` i "${selectedCategoryName}"`}
              {searchQuery && ` för "${searchQuery}"`}
            </p>
          </div>
        )}

        {/* Articles */}
        {isLoading ? (
          <div className="max-w-3xl mx-auto space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : filteredArticles.length === 0 ? (
          <div className="text-center py-16">
            <HelpCircle className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-xl font-semibold mb-2">{emptyStateTitle}</h3>
            <p className="text-muted-foreground mb-6">{emptyStateSubtitle}</p>
            {searchQuery && (
              <Button variant="outline" onClick={() => setSearchQuery('')}>
                Rensa sökning
              </Button>
            )}
          </div>
        ) : layout === 'accordion' ? (
          <div className="max-w-3xl mx-auto space-y-8">
            {Object.entries(articlesByCategory).map(([categoryId, categoryArticles]) => {
              const category = categories?.find(c => c.id === categoryId);
              if (!category) return null;

              return (
                <div key={categoryId}>
                  {!selectedCategory && (
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      {category.name}
                      <Badge variant="secondary" className="font-normal">
                        {categoryArticles.length}
                      </Badge>
                    </h3>
                  )}

                  <div className="space-y-2">
                    {categoryArticles.map(article => {
                      const isExpanded = expandedArticles.has(article.id);

                      return (
                        <div
                          key={article.id}
                          className={cn(
                            'border rounded-xl overflow-hidden transition-all',
                            isExpanded ? 'bg-card shadow-md' : 'bg-card/50 hover:bg-card'
                          )}
                        >
                          <button
                            onClick={() => toggleArticle(article.id)}
                            className="w-full px-5 py-4 flex items-start gap-3 text-left"
                          >
                            <span className="mt-0.5 shrink-0">
                              {isExpanded ? (
                                <ChevronDown className="h-5 w-5 text-primary" />
                              ) : (
                                <ChevronRight className="h-5 w-5 text-muted-foreground" />
                              )}
                            </span>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium">{article.question}</h4>
                              {article.is_featured && (
                                <Badge variant="outline" className="mt-1 text-xs">
                                  Populär
                                </Badge>
                              )}
                            </div>
                          </button>

                          {isExpanded && (
                            <div className="px-5 pb-5 ml-8">
                              <div
                                className="prose prose-sm max-w-none text-muted-foreground"
                                dangerouslySetInnerHTML={{
                                  __html: renderTiptapContent(article.answer_json as any)
                                }}
                              />

                              {/* Feedback */}
                              <div className="flex items-center gap-4 mt-6 pt-4 border-t">
                                <span className="text-sm text-muted-foreground">
                                  Var detta till hjälp?
                                </span>
                                <div className="flex gap-2">
                                  <Button variant="ghost" size="sm" className="h-8">
                                    <ThumbsUp className="h-4 w-4 mr-1" />
                                    Ja
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-8">
                                    <ThumbsDown className="h-4 w-4 mr-1" />
                                    Nej
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Cards layout */
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
            {filteredArticles.map(article => (
              <Link
                key={article.id}
                to={`/${kbSlug}/${article.slug}`}
                className="group block"
              >
                <div className="h-full p-5 rounded-xl border bg-card hover:shadow-lg hover:border-primary/50 transition-all group-hover:-translate-y-1">
                  {article.category && (
                    <Badge variant="secondary" className="mb-3 text-xs">
                      {article.category.name}
                    </Badge>
                  )}
                  <h4 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 mb-2">
                    {article.question}
                  </h4>
                  {article.is_featured && (
                    <Badge variant="outline" className="text-xs">
                      Populär
                    </Badge>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Contact CTA */}
        {showContactCta && (
          <div className="bg-muted/50 rounded-2xl p-8 md:p-12 mt-16 text-center">
            <h3 className="text-2xl font-bold mb-4">{contactTitle}</h3>
            <p className="text-muted-foreground mb-6">{contactSubtitle}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {chatEnabled && (
                <Button asChild size="lg">
                  <Link to="/chat">
                    <MessageSquare className="h-5 w-5 mr-2" />
                    Chatta med oss
                  </Link>
                </Button>
              )}
              <Button variant="outline" size="lg" asChild>
                <Link to={contactLink}>
                  {contactButtonText}
                </Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
