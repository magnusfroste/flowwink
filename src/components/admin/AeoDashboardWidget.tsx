import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, TrendingUp, TrendingDown, Minus, ArrowRight, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { usePages } from '@/hooks/usePages';
import { useAeoSettings } from '@/hooks/useSiteSettings';
import type { ContentBlock, PageMeta } from '@/types/cms';

interface PageScore {
  id: string;
  title: string;
  slug: string;
  score: number;
}

function calculatePageScore(
  title: string,
  blocks: ContentBlock[],
  meta: PageMeta,
  slug: string,
  aeoSettings: {
    enabled?: boolean;
    organizationName?: string;
    shortDescription?: string;
    llmsTxtEnabled?: boolean;
    llmsTxtExcludedSlugs?: string[];
  } | null
): number {
  let totalPoints = 0;
  let maxPoints = 0;
  
  // 1. AEO enabled (20 points)
  const aeoEnabled = aeoSettings?.enabled ?? false;
  totalPoints += aeoEnabled ? 20 : 0;
  maxPoints += 20;
  
  // 2. Organization configured (15 points)
  const hasOrg = !!(aeoSettings?.organizationName && aeoSettings?.shortDescription);
  totalPoints += hasOrg ? 15 : 0;
  maxPoints += 15;
  
  // 3. Meta description (15 points)
  const descLength = meta.description?.length || 0;
  const hasDescription = descLength >= 50;
  totalPoints += hasDescription ? (descLength >= 120 && descLength <= 160 ? 15 : 10) : 0;
  maxPoints += 15;
  
  // 4. FAQ content (20 points)
  let faqCount = 0;
  for (const block of blocks) {
    if (block.type === 'accordion' && block.data) {
      const items = block.data.items as Array<{ title?: string; content?: string }> | undefined;
      if (Array.isArray(items)) {
        faqCount += items.filter(item => item.title && item.content).length;
      }
    }
  }
  totalPoints += faqCount >= 3 ? 20 : Math.min(faqCount * 5, 15);
  maxPoints += 20;
  
  // 5. Content depth (15 points)
  let wordCount = 0;
  for (const block of blocks) {
    if (block.type === 'text' && block.data?.content) {
      const text = String(block.data.content).replace(/<[^>]*>/g, ' ');
      wordCount += text.split(/\s+/).filter(w => w.length > 0).length;
    }
    if (block.type === 'hero' && block.data) {
      if (block.data.title) wordCount += String(block.data.title).split(/\s+/).length;
      if (block.data.subtitle) wordCount += String(block.data.subtitle).split(/\s+/).length;
    }
  }
  totalPoints += wordCount >= 300 ? 15 : (wordCount >= 100 ? 8 : 0);
  maxPoints += 15;
  
  // 6. Heading structure (10 points)
  let hasHeadings = false;
  for (const block of blocks) {
    if (block.type === 'text' && block.data?.content) {
      if (/<h[1-6][^>]*>/i.test(String(block.data.content))) hasHeadings = true;
    }
    if (block.type === 'hero') hasHeadings = true;
  }
  totalPoints += hasHeadings ? 10 : 0;
  maxPoints += 10;
  
  // 7. llms.txt inclusion (5 points)
  const inLlmsTxt = aeoSettings?.llmsTxtEnabled && 
    !aeoSettings?.llmsTxtExcludedSlugs?.includes(slug);
  totalPoints += inLlmsTxt ? 5 : 0;
  maxPoints += 5;
  
  return Math.round((totalPoints / maxPoints) * 100);
}

export function AeoDashboardWidget() {
  const { data: pages, isLoading: pagesLoading } = usePages();
  const { data: aeoSettings, isLoading: aeoLoading } = useAeoSettings();
  
  const isLoading = pagesLoading || aeoLoading;
  
  const analysis = useMemo(() => {
    if (!pages || !aeoSettings) return null;
    
    const publishedPages = pages.filter(p => p.status === 'published');
    
    if (publishedPages.length === 0) {
      return {
        averageScore: 0,
        pageScores: [],
        excellent: 0,
        good: 0,
        needsWork: 0,
        weak: 0,
        totalPages: 0,
      };
    }
    
    const pageScores: PageScore[] = publishedPages.map(page => ({
      id: page.id,
      title: page.title,
      slug: page.slug,
      score: calculatePageScore(
        page.title,
        (page.content_json || []) as ContentBlock[],
        (page.meta_json || {}) as PageMeta,
        page.slug,
        aeoSettings
      ),
    }));
    
    const averageScore = Math.round(
      pageScores.reduce((sum, p) => sum + p.score, 0) / pageScores.length
    );
    
    // Sort by score ascending (worst first for "needs attention")
    const sortedByScore = [...pageScores].sort((a, b) => a.score - b.score);
    
    return {
      averageScore,
      pageScores: sortedByScore,
      excellent: pageScores.filter(p => p.score >= 80).length,
      good: pageScores.filter(p => p.score >= 60 && p.score < 80).length,
      needsWork: pageScores.filter(p => p.score >= 40 && p.score < 60).length,
      weak: pageScores.filter(p => p.score < 40).length,
      totalPages: pageScores.length,
    };
  }, [pages, aeoSettings]);
  
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400';
    if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
    if (score >= 40) return 'text-orange-600 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  };
  
  const getScoreIcon = (score: number) => {
    if (score >= 80) return <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />;
    if (score >= 60) return <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />;
    return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />;
  };
  
  const getTrendIcon = (score: number) => {
    if (score >= 70) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (score >= 50) return <Minus className="h-4 w-4 text-muted-foreground" />;
    return <TrendingDown className="h-4 w-4 text-red-600" />;
  };
  
  if (!aeoSettings?.enabled) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle className="font-serif">AEO Optimization</CardTitle>
          </div>
          <CardDescription>Answer Engine Optimization for AI search engines</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <Sparkles className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">
              AEO is not enabled. Enable to optimize your pages for AI search engines.
            </p>
            <Button asChild variant="outline">
              <Link to="/admin/settings">
                Enable AEO
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle className="font-serif">AEO Optimization</CardTitle>
            </div>
            <CardDescription>Answer Engine Optimization for AI search engines</CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/settings">
              Settings
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !analysis || analysis.totalPages === 0 ? (
          <div className="text-center py-6">
            <p className="text-muted-foreground">
              No published pages to analyze.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Average Score */}
            <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  {getTrendIcon(analysis.averageScore)}
                  <span className="text-sm font-medium">Average AEO Score</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className={`text-3xl font-bold ${getScoreColor(analysis.averageScore)}`}>
                    {analysis.averageScore}%
                  </span>
                  <span className="text-sm text-muted-foreground">
                    of {analysis.totalPages} published pages
                  </span>
                </div>
                <Progress value={analysis.averageScore} className="mt-2 h-2" />
              </div>
            </div>
            
            {/* Score Distribution */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-2 rounded-lg bg-green-500/10">
                <p className="text-lg font-bold text-green-600 dark:text-green-400">{analysis.excellent}</p>
                <p className="text-xs text-muted-foreground">Excellent</p>
              </div>
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <p className="text-lg font-bold text-yellow-600 dark:text-yellow-400">{analysis.good}</p>
                <p className="text-xs text-muted-foreground">Good</p>
              </div>
              <div className="p-2 rounded-lg bg-orange-500/10">
                <p className="text-lg font-bold text-orange-600 dark:text-orange-400">{analysis.needsWork}</p>
                <p className="text-xs text-muted-foreground">Improve</p>
              </div>
              <div className="p-2 rounded-lg bg-red-500/10">
                <p className="text-lg font-bold text-red-600 dark:text-red-400">{analysis.weak}</p>
                <p className="text-xs text-muted-foreground">Weak</p>
              </div>
            </div>
            
            {/* Pages needing attention */}
            {analysis.pageScores.filter(p => p.score < 60).length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Needs attention</h4>
                <div className="space-y-2">
                  {analysis.pageScores
                    .filter(p => p.score < 60)
                    .slice(0, 3)
                    .map((page) => (
                      <Link
                        key={page.id}
                        to={`/admin/pages/${page.id}`}
                        className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          {getScoreIcon(page.score)}
                          <span className="text-sm truncate max-w-[180px]">{page.title}</span>
                        </div>
                        <span className={`text-sm font-medium ${getScoreColor(page.score)}`}>
                          {page.score}%
                        </span>
                      </Link>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}