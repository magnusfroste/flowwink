import { useMemo } from 'react';
import { 
  Bot, 
  CheckCircle2, 
  AlertCircle, 
  XCircle, 
  ChevronDown,
  FileText,
  HelpCircle,
  Building2,
  List,
  Sparkles
} from 'lucide-react';
import { useAeoSettings } from '@/hooks/useSiteSettings';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ContentBlock, PageMeta } from '@/types/cms';

interface AeoAnalyzerProps {
  title: string;
  blocks: ContentBlock[];
  meta: PageMeta;
  slug: string;
}

interface AnalysisItem {
  id: string;
  label: string;
  description: string;
  status: 'pass' | 'warn' | 'fail';
  points: number;
  maxPoints: number;
  icon: React.ReactNode;
}

function extractFaqCount(blocks: ContentBlock[]): number {
  let count = 0;
  for (const block of blocks) {
    if (block.type === 'accordion' && block.data) {
      const items = block.data.items as Array<{ title?: string; content?: string }> | undefined;
      if (Array.isArray(items)) {
        count += items.filter(item => item.title && item.content).length;
      }
    }
  }
  return count;
}

function countWords(blocks: ContentBlock[]): number {
  let wordCount = 0;
  
  for (const block of blocks) {
    if (block.type === 'text' && block.data?.content) {
      // Strip HTML and count words
      const text = String(block.data.content).replace(/<[^>]*>/g, ' ');
      wordCount += text.split(/\s+/).filter(w => w.length > 0).length;
    }
    if (block.type === 'hero' && block.data) {
      if (block.data.title) wordCount += String(block.data.title).split(/\s+/).length;
      if (block.data.subtitle) wordCount += String(block.data.subtitle).split(/\s+/).length;
    }
  }
  
  return wordCount;
}

function hasHeadings(blocks: ContentBlock[]): boolean {
  for (const block of blocks) {
    if (block.type === 'text' && block.data?.content) {
      const content = String(block.data.content);
      if (/<h[1-6][^>]*>/i.test(content)) return true;
    }
    if (block.type === 'hero') return true;
  }
  return false;
}

export function AeoAnalyzer({ title, blocks, meta, slug }: AeoAnalyzerProps) {
  const { data: aeoSettings } = useAeoSettings();
  
  const analysis = useMemo(() => {
    const items: AnalysisItem[] = [];
    let totalPoints = 0;
    let maxPoints = 0;
    
    // 1. AEO enabled globally (20 points)
    const aeoEnabled = aeoSettings?.enabled ?? false;
    items.push({
      id: 'aeo-enabled',
      label: 'AEO enabled',
      description: aeoEnabled 
        ? 'Structured data is generated automatically' 
        : 'Enable AEO in site settings',
      status: aeoEnabled ? 'pass' : 'fail',
      points: aeoEnabled ? 20 : 0,
      maxPoints: 20,
      icon: <Bot className="h-4 w-4" />,
    });
    totalPoints += aeoEnabled ? 20 : 0;
    maxPoints += 20;
    
    // 2. Organization configured (15 points)
    const hasOrg = !!(aeoSettings?.organizationName && aeoSettings?.shortDescription);
    items.push({
      id: 'organization',
      label: 'Organization configured',
      description: hasOrg 
        ? `${aeoSettings?.organizationName}` 
        : 'Add organization info in AEO settings',
      status: hasOrg ? 'pass' : 'warn',
      points: hasOrg ? 15 : 0,
      maxPoints: 15,
      icon: <Building2 className="h-4 w-4" />,
    });
    totalPoints += hasOrg ? 15 : 0;
    maxPoints += 15;
    
    // 3. Meta description (15 points)
    const hasDescription = !!(meta.description && meta.description.length >= 50);
    const descLength = meta.description?.length || 0;
    items.push({
      id: 'meta-description',
      label: 'Meta description',
      description: hasDescription 
        ? `${descLength} characters (recommended: 120-160)` 
        : 'Add a descriptive meta text (at least 50 characters)',
      status: hasDescription 
        ? (descLength >= 120 && descLength <= 160 ? 'pass' : 'warn') 
        : 'fail',
      points: hasDescription ? (descLength >= 120 && descLength <= 160 ? 15 : 10) : 0,
      maxPoints: 15,
      icon: <FileText className="h-4 w-4" />,
    });
    totalPoints += hasDescription ? (descLength >= 120 && descLength <= 160 ? 15 : 10) : 0;
    maxPoints += 15;
    
    // 4. FAQ content (20 points)
    const faqCount = extractFaqCount(blocks);
    const hasFaq = faqCount >= 3;
    items.push({
      id: 'faq-content',
      label: 'FAQ content',
      description: faqCount > 0 
        ? `${faqCount} questions found (recommended: at least 3)` 
        : 'Add accordion block with frequently asked questions',
      status: hasFaq ? 'pass' : (faqCount > 0 ? 'warn' : 'fail'),
      points: hasFaq ? 20 : (faqCount > 0 ? faqCount * 5 : 0),
      maxPoints: 20,
      icon: <HelpCircle className="h-4 w-4" />,
    });
    totalPoints += hasFaq ? 20 : (faqCount > 0 ? Math.min(faqCount * 5, 15) : 0);
    maxPoints += 20;
    
    // 5. Content depth (15 points)
    const wordCount = countWords(blocks);
    const hasGoodContent = wordCount >= 300;
    items.push({
      id: 'content-depth',
      label: 'Content depth',
      description: `${wordCount} words (recommended: at least 300)`,
      status: hasGoodContent ? 'pass' : (wordCount >= 100 ? 'warn' : 'fail'),
      points: hasGoodContent ? 15 : (wordCount >= 100 ? 8 : 0),
      maxPoints: 15,
      icon: <FileText className="h-4 w-4" />,
    });
    totalPoints += hasGoodContent ? 15 : (wordCount >= 100 ? 8 : 0);
    maxPoints += 15;
    
    // 6. Heading structure (10 points)
    const hasHeadingStructure = hasHeadings(blocks);
    items.push({
      id: 'headings',
      label: 'Heading structure',
      description: hasHeadingStructure 
        ? 'Headings found for better structure' 
        : 'Add headings (H1-H6) for clear structure',
      status: hasHeadingStructure ? 'pass' : 'warn',
      points: hasHeadingStructure ? 10 : 0,
      maxPoints: 10,
      icon: <List className="h-4 w-4" />,
    });
    totalPoints += hasHeadingStructure ? 10 : 0;
    maxPoints += 10;
    
    // 7. llms.txt inclusion (5 points)
    const inLlmsTxt = aeoSettings?.llmsTxtEnabled && 
      !aeoSettings?.llmsTxtExcludedSlugs?.includes(slug);
    items.push({
      id: 'llms-txt',
      label: 'llms.txt',
      description: inLlmsTxt
        ? 'Page is included in llms.txt' 
        : 'Page is excluded or llms.txt is disabled',
      status: inLlmsTxt ? 'pass' : 'warn',
      points: inLlmsTxt ? 5 : 0,
      maxPoints: 5,
      icon: <Bot className="h-4 w-4" />,
    });
    totalPoints += inLlmsTxt ? 5 : 0;
    maxPoints += 5;
    
    const score = Math.round((totalPoints / maxPoints) * 100);
    
    return { items, score, totalPoints, maxPoints };
  }, [aeoSettings, blocks, meta, slug]);
  
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400';
    if (score >= 50) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };
  
  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Needs improvement';
    return 'Weak';
  };
  
  const getStatusIcon = (status: 'pass' | 'warn' | 'fail') => {
    switch (status) {
      case 'pass':
        return <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />;
      case 'warn':
        return <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />;
      case 'fail':
        return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />;
    }
  };
  
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Sparkles className="h-4 w-4" />
          <span>AEO</span>
          <span className={`font-bold ${getScoreColor(analysis.score)}`}>
            {analysis.score}%
          </span>
          <ChevronDown className="h-3 w-3 transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="absolute right-0 top-full mt-2 z-50">
        <div className="bg-popover border rounded-lg shadow-lg p-4 w-80">
        <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="font-medium">AEO Analysis</span>
            </div>
            <div className={`text-lg font-bold ${getScoreColor(analysis.score)}`}>
              {analysis.score}% - {getScoreLabel(analysis.score)}
            </div>
          </div>
          
          <Progress 
            value={analysis.score} 
            className="h-2 mb-4"
          />
          
          <div className="space-y-2">
            {analysis.items.map((item) => (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 cursor-help">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(item.status)}
                      <span className="text-sm">{item.label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {item.points}/{item.maxPoints}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">
                  <p>{item.description}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
          
          <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
            <p>Optimize for AI search engines like Perplexity, ChatGPT, and Google AI Overviews.</p>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}