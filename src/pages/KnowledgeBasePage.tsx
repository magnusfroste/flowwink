import { useState, useMemo } from "react";
import { Search, ChevronDown, ChevronRight, ThumbsUp, ThumbsDown, MessageSquare } from "lucide-react";
import { PublicNavigation } from "@/components/public/PublicNavigation";
import { PublicFooter } from "@/components/public/PublicFooter";
import { SeoHead } from "@/components/public/SeoHead";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useKbCategories, useKbArticles } from "@/hooks/useKnowledgeBase";
import { renderTiptapContent } from "@/lib/tiptap-utils";
import { Link } from "react-router-dom";
import { useIsModuleEnabled } from "@/hooks/useModules";

export default function KnowledgeBasePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedArticles, setExpandedArticles] = useState<Set<string>>(new Set());

  const { data: categories, isLoading: categoriesLoading } = useKbCategories();
  const { data: articles, isLoading: articlesLoading } = useKbArticles();
  const chatEnabled = useIsModuleEnabled("chat");

  // Filter only active categories and published articles
  const activeCategories = useMemo(() => 
    categories?.filter(c => c.is_active) || [], 
    [categories]
  );

  const publishedArticles = useMemo(() => 
    articles?.filter(a => a.is_published) || [], 
    [articles]
  );

  // Search and filter articles
  const filteredArticles = useMemo(() => {
    let result = publishedArticles;

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
  }, [publishedArticles, selectedCategory, searchQuery]);

  // Group articles by category for display
  const articlesByCategory = useMemo(() => {
    const grouped: Record<string, typeof filteredArticles> = {};
    
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

  const selectedCategoryName = activeCategories.find(c => c.id === selectedCategory)?.name;

  return (
    <>
      <SeoHead 
        title="Knowledge Base"
        description="Find answers to common questions and learn more about our services."
      />
      <PublicNavigation />
      
      <main className="min-h-screen bg-background">
        {/* Hero Section */}
        <section className="bg-gradient-to-b from-primary/5 to-background py-16 md:py-24">
          <div className="container max-w-4xl mx-auto px-4 text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              How can we help you?
            </h1>
            <p className="text-lg text-muted-foreground mb-8">
              Search our knowledge base or browse by category
            </p>
            
            {/* Search */}
            <div className="relative max-w-xl mx-auto">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search for questions or answers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-14 text-lg rounded-xl shadow-lg"
              />
            </div>
          </div>
        </section>

        {/* Categories */}
        <section className="container max-w-6xl mx-auto px-4 py-8">
          <div className="flex flex-wrap gap-2 justify-center mb-8">
            <Button
              variant={selectedCategory === null ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(null)}
              className="rounded-full"
            >
              All
            </Button>
            {categoriesLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-24 rounded-full" />
              ))
            ) : (
              activeCategories.map(category => (
                <Button
                  key={category.id}
                  variant={selectedCategory === category.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(category.id)}
                  className="rounded-full"
                >
                  {category.name}
                </Button>
              ))
            )}
          </div>

          {/* Results info */}
          {(searchQuery || selectedCategory) && (
            <div className="text-center mb-6">
              <p className="text-muted-foreground">
                {filteredArticles.length} {filteredArticles.length === 1 ? 'article' : 'articles'}
                {selectedCategoryName && ` in "${selectedCategoryName}"`}
                {searchQuery && ` for "${searchQuery}"`}
              </p>
            </div>
          )}

          {/* Articles */}
          {articlesLoading ? (
            <div className="max-w-3xl mx-auto space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : filteredArticles.length === 0 ? (
            <div className="text-center py-16">
              <Search className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
              <h2 className="text-xl font-semibold mb-2">No results found</h2>
              <p className="text-muted-foreground mb-6">
                Try different search terms or browse all categories
              </p>
              {searchQuery && (
                <Button variant="outline" onClick={() => setSearchQuery("")}>
                  Clear search
                </Button>
              )}
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-8">
              {Object.entries(articlesByCategory).map(([categoryId, categoryArticles]) => {
                const category = activeCategories.find(c => c.id === categoryId);
                if (!category) return null;

                return (
                  <div key={categoryId}>
                    {!selectedCategory && (
                      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        {category.name}
                        <Badge variant="secondary" className="font-normal">
                          {categoryArticles.length}
                        </Badge>
                      </h2>
                    )}
                    
                    <div className="space-y-2">
                      {categoryArticles.map(article => {
                        const isExpanded = expandedArticles.has(article.id);
                        
                        return (
                          <div
                            key={article.id}
                            className={cn(
                              "border rounded-xl overflow-hidden transition-all",
                              isExpanded ? "bg-card shadow-md" : "bg-card/50 hover:bg-card"
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
                                <h3 className="font-medium">{article.question}</h3>
                                {article.is_featured && (
                                  <Badge variant="outline" className="mt-1 text-xs">
                                    Popular
                                  </Badge>
                                )}
                              </div>
                            </button>

                            {isExpanded && (
                              <div className="px-5 pb-5 pl-13">
                                <div 
                                  className="prose prose-sm max-w-none text-muted-foreground"
                                  dangerouslySetInnerHTML={{ 
                                    __html: renderTiptapContent(article.answer_json as any) 
                                  }}
                                />
                                
                                {/* Feedback */}
                                <div className="flex items-center gap-4 mt-6 pt-4 border-t">
                                  <span className="text-sm text-muted-foreground">
                                    Was this helpful?
                                  </span>
                                  <div className="flex gap-2">
                                    <Button variant="ghost" size="sm" className="h-8">
                                      <ThumbsUp className="h-4 w-4 mr-1" />
                                      Yes
                                    </Button>
                                    <Button variant="ghost" size="sm" className="h-8">
                                      <ThumbsDown className="h-4 w-4 mr-1" />
                                      No
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
          )}
        </section>

        {/* Contact CTA */}
        <section className="bg-muted/50 py-16 mt-16">
          <div className="container max-w-2xl mx-auto px-4 text-center">
            <h2 className="text-2xl font-bold mb-4">
              Can't find the answer?
            </h2>
            <p className="text-muted-foreground mb-6">
              Our team is happy to help you with your questions
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {chatEnabled && (
                <Button asChild size="lg">
                  <Link to="/chat">
                    <MessageSquare className="h-5 w-5 mr-2" />
                    Chat with us
                  </Link>
                </Button>
              )}
              <Button variant="outline" size="lg" asChild>
                <Link to="/contact">
                  Contact us
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </>
  );
}
