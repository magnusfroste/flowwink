import { useState, useCallback, memo } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileUser, Star, ArrowRight, Sparkles, Type } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ConsultantMatch {
  id: string;
  name: string;
  title?: string;
  skills?: string[];
  experience_years?: number;
  availability?: string;
  summary?: string;
  semantic_score: number;
  text_score: number;
  semantic_rank: number | null;
  text_rank: number | null;
  hybrid_score: number;
}

interface ResumeMatcherBlockData {
  title?: string;
  subtitle?: string;
  placeholder?: string;
  buttonText?: string;
}

interface ResumeMatcherBlockProps {
  data: ResumeMatcherBlockData;
}

type Strength = 'strong' | 'good' | 'fair';

/**
 * Match strength comes from retrieval signals, not from raw RRF scores
 * (RRF values are tiny absolute numbers — only meaningful relative to
 * each other inside the same result set).
 *
 * - strong: retrieved by BOTH semantic and keyword search
 * - good:   one signal but ranked #1-2 in that signal
 * - fair:   one signal, lower rank
 */
function strengthOf(m: ConsultantMatch): Strength {
  const inSem = m.semantic_rank != null;
  const inText = m.text_rank != null;
  if (inSem && inText) return 'strong';
  const bestRank = Math.min(m.semantic_rank ?? 99, m.text_rank ?? 99);
  return bestRank <= 2 ? 'good' : 'fair';
}

const strengthLabel: Record<Strength, string> = {
  strong: 'Strong match',
  good: 'Good match',
  fair: 'Possible match',
};

const strengthClass: Record<Strength, string> = {
  strong:
    'text-green-700 bg-green-50 border-green-200 dark:text-green-300 dark:bg-green-950/40 dark:border-green-900',
  good: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-900',
  fair: 'text-muted-foreground bg-muted border-border',
};

/** Extract keywords from query to highlight matching skills in results. */
function extractKeywords(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9åäö+#.\s-]/gi, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 3),
    ),
  );
}

const MatchCard = memo(function MatchCard({
  match,
  index,
  isSelected,
  onSelect,
  queryKeywords,
}: {
  match: ConsultantMatch;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  queryKeywords: string[];
}) {
  const strength = strengthOf(match);
  const skills = match.skills || [];
  const matchingSkills = skills.filter((s) =>
    queryKeywords.some((k) => s.toLowerCase().includes(k)),
  );
  const visibleSkills = matchingSkills.length > 0 ? matchingSkills : skills.slice(0, 4);

  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md ${
        isSelected ? 'ring-2 ring-primary shadow-md' : ''
      }`}
      onClick={onSelect}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2 gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {index === 0 && <Star className="w-4 h-4 text-amber-500 fill-amber-500 shrink-0" />}
              <span className="text-xs text-muted-foreground">#{index + 1}</span>
              <span className="font-semibold text-foreground truncate">{match.name}</span>
            </div>
            {match.title && (
              <p className="text-sm text-muted-foreground truncate">{match.title}</p>
            )}
          </div>
          <Badge
            variant="outline"
            className={`text-xs font-semibold shrink-0 ${strengthClass[strength]}`}
          >
            {strengthLabel[strength]}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-1 mt-2">
          {visibleSkills.slice(0, 4).map((skill) => (
            <Badge key={skill} variant="secondary" className="text-xs">
              {skill}
            </Badge>
          ))}
          {skills.length > 4 && (
            <Badge variant="outline" className="text-xs">
              +{skills.length - 4}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
});

const MatchDetail = memo(function MatchDetail({
  match,
  queryKeywords,
}: {
  match: ConsultantMatch;
  queryKeywords: string[];
}) {
  const strength = strengthOf(match);
  const skills = match.skills || [];
  const matchingSkills = skills.filter((s) =>
    queryKeywords.some((k) => s.toLowerCase().includes(k)),
  );
  const otherSkills = skills.filter((s) => !matchingSkills.includes(s));

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-muted/50 border-b">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-xl truncate">{match.name}</CardTitle>
            {match.title && <p className="text-muted-foreground mt-1 truncate">{match.title}</p>}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
              {match.experience_years != null && (
                <span>{match.experience_years} yrs experience</span>
              )}
              {match.availability && <span>Availability: {match.availability}</span>}
            </div>
          </div>
          <Badge className={`text-sm px-3 py-1 shrink-0 ${strengthClass[strength]}`}>
            {strengthLabel[strength]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground mb-1">
              <Sparkles className="w-3.5 h-3.5" /> Semantic
            </div>
            <div className="text-2xl font-semibold text-foreground">
              {match.semantic_rank != null ? `#${match.semantic_rank}` : '—'}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {match.semantic_rank != null
                ? `cosine ${match.semantic_score.toFixed(3)}`
                : 'Not in top semantic results'}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground mb-1">
              <Type className="w-3.5 h-3.5" /> Keyword
            </div>
            <div className="text-2xl font-semibold text-foreground">
              {match.text_rank != null ? `#${match.text_rank}` : '—'}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {match.text_rank != null
                ? `BM25 ${match.text_score.toFixed(2)}`
                : 'No keyword overlap'}
            </p>
          </div>
        </div>

        {match.summary && (
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Summary
            </h4>
            <p className="text-foreground whitespace-pre-wrap">{match.summary}</p>
          </div>
        )}

        {matchingSkills.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Skills matching your brief
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {matchingSkills.map((s) => (
                <Badge key={s} variant="default">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {otherSkills.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Other skills
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {otherSkills.map((s) => (
                <Badge key={s} variant="secondary">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

export function ResumeMatcherBlock({ data }: ResumeMatcherBlockProps) {
  const [jobDescription, setJobDescription] = useState('');
  const [matches, setMatches] = useState<ConsultantMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<ConsultantMatch | null>(null);
  const [mode, setMode] = useState<'hybrid' | 'text_only' | null>(null);
  const [queryKeywords, setQueryKeywords] = useState<string[]>([]);
  const { toast } = useToast();

  const title = data.title || 'Find the Perfect Consultant';
  const subtitle =
    data.subtitle ||
    'Paste a job description or assignment brief. We rank consultants using hybrid semantic + keyword search.';
  const placeholder = data.placeholder || 'Paste the job description or assignment brief here...';
  const buttonText = data.buttonText || 'Find Match';

  const handleMatch = useCallback(async () => {
    const query = jobDescription.trim();
    if (query.length < 10) {
      toast({
        title: 'Too short',
        description: 'Please provide a more detailed job description.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    setSelectedMatch(null);
    setQueryKeywords(extractKeywords(query));

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resume-match`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ job_description: query, max_results: 6 }),
        },
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();

      if (!result?.success) {
        throw new Error(result?.error || 'Search failed');
      }

      const raw: ConsultantMatch[] = result.matches || [];

      // RPC returns scores but not ranks — derive ranks client-side so the
      // Semantic / Keyword detail panels show #1, #2, … instead of "—".
      const semOrder = [...raw]
        .filter((m) => (m.semantic_score ?? 0) > 0)
        .sort((a, b) => (b.semantic_score ?? 0) - (a.semantic_score ?? 0))
        .map((m) => m.id);
      const txtOrder = [...raw]
        .filter((m) => (m.text_score ?? 0) > 0)
        .sort((a, b) => (b.text_score ?? 0) - (a.text_score ?? 0))
        .map((m) => m.id);

      const list: ConsultantMatch[] = raw.map((m) => {
        const sIdx = semOrder.indexOf(m.id);
        const tIdx = txtOrder.indexOf(m.id);
        return {
          ...m,
          semantic_rank: sIdx >= 0 ? sIdx + 1 : null,
          text_rank: tIdx >= 0 ? tIdx + 1 : null,
        };
      });

      setMatches(list);
      setMode(result.mode || null);

      if (list.length > 0) {
        setSelectedMatch(list[0]);
      } else {
        toast({
          title: 'No matches found',
          description: 'No consultants matched your requirements. Try a broader description.',
        });
      }
    } catch (err) {
      console.error('Match error:', err);
      toast({
        title: 'Error',
        description: 'Failed to process your request. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [jobDescription, toast]);

  return (
    <section className="w-full py-16 md:py-24">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium">
            <FileUser className="w-4 h-4" />
            Hybrid Semantic + Keyword Search
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-3">{title}</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">{subtitle}</p>
        </div>

        <div className="space-y-4 mb-10">
          <Textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder={placeholder}
            rows={6}
            className="resize-none text-base"
            disabled={loading}
          />
          <div className="flex justify-end">
            <Button
              onClick={handleMatch}
              disabled={loading || jobDescription.trim().length < 10}
              size="lg"
              className="gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  {buttonText}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </div>

        {matches.length > 0 && (
          <div className="space-y-6">
            {mode === 'text_only' && (
              <div className="text-xs text-muted-foreground text-center">
                Running in keyword-only mode — no embedding provider configured yet.
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-3">
              {matches.map((match, i) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  index={i}
                  isSelected={selectedMatch?.id === match.id}
                  onSelect={() => setSelectedMatch(match)}
                  queryKeywords={queryKeywords}
                />
              ))}
            </div>

            {selectedMatch && (
              <MatchDetail match={selectedMatch} queryKeywords={queryKeywords} />
            )}
          </div>
        )}
      </div>
    </section>
  );
}
