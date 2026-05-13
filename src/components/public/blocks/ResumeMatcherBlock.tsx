import { useState, useCallback, memo } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileUser, Star, ArrowRight, CheckCircle2, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useChatSettings } from '@/hooks/useSiteSettings';

interface ConsultantMatch {
  consultant_id: string;
  name: string;
  title?: string;
  score: number;
  reasoning: string;
  tailored_summary?: string;
  cover_letter?: string;
  matching_skills: string[];
  missing_skills: string[];
  avatar_url?: string;
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

const MATCH_SYSTEM_PROMPT = `You are a consultant matching assistant. When given a job description or assignment brief, ALWAYS call the match_consultant tool to find the best matching consultants from this organization's roster. After calling the tool, respond with ONLY the raw JSON object returned by the tool — no prose, no explanation, no markdown. Output only valid JSON.`;

/** Parse SSE stream into accumulated text content */
async function consumeSSEStream(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') continue;
      try {
        const parsed = JSON.parse(payload);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) chunks.push(delta);
      } catch { /* skip malformed frames */ }
    }
  }

  return chunks.join('');
}

const getScoreColor = (score: number) => {
  if (score >= 80) return 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/30 dark:border-green-800';
  if (score >= 60) return 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/30 dark:border-amber-800';
  return 'text-muted-foreground bg-muted border-border';
};

// Memoized match card to avoid re-renders when selecting a different card
const MatchCard = memo(function MatchCard({
  match,
  index,
  isSelected,
  onSelect,
}: {
  match: ConsultantMatch;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md ${
        isSelected ? 'ring-2 ring-primary shadow-md' : ''
      }`}
      onClick={onSelect}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <div className="flex items-center gap-1.5">
              {index === 0 && <Star className="w-4 h-4 text-amber-500 fill-amber-500" />}
              <span className="font-semibold text-foreground">{match.name}</span>
            </div>
            {match.title && (
              <p className="text-sm text-muted-foreground">{match.title}</p>
            )}
          </div>
          <Badge variant="outline" className={`text-sm font-bold ${getScoreColor(match.score)}`}>
            {match.score}%
          </Badge>
        </div>
        <div className="flex flex-wrap gap-1 mt-2">
          {match.matching_skills.slice(0, 4).map(skill => (
            <Badge key={skill} variant="secondary" className="text-xs">
              {skill}
            </Badge>
          ))}
          {match.matching_skills.length > 4 && (
            <Badge variant="outline" className="text-xs">
              +{match.matching_skills.length - 4}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
});

// Memoized detail panel
const MatchDetail = memo(function MatchDetail({ match }: { match: ConsultantMatch }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-muted/50 border-b">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl">{match.name}</CardTitle>
            {match.title && (
              <p className="text-muted-foreground mt-1">{match.title}</p>
            )}
          </div>
          <Badge className={`text-lg px-3 py-1 ${getScoreColor(match.score)}`}>
            {match.score}% Match
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Why This Match</h4>
          <p className="text-foreground">{match.reasoning}</p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> Matching Skills
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {match.matching_skills.map(s => (
                <Badge key={s} variant="secondary">{s}</Badge>
              ))}
            </div>
          </div>
          {match.missing_skills.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5 text-muted-foreground" /> Gaps
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {match.missing_skills.map(s => (
                  <Badge key={s} variant="outline" className="text-muted-foreground">{s}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {match.tailored_summary && (
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Tailored Summary</h4>
            <div className="bg-muted/30 rounded-lg p-4 text-foreground whitespace-pre-wrap">
              {match.tailored_summary}
            </div>
          </div>
        )}

        {match.cover_letter && (
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Cover Letter</h4>
            <div className="bg-background border rounded-lg p-6 text-foreground whitespace-pre-wrap leading-relaxed">
              {match.cover_letter}
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
  const { toast } = useToast();
  const { data: chatSettings } = useChatSettings();

  const title = data.title || 'Find the Perfect Consultant';
  const subtitle = data.subtitle || 'Paste a job description or assignment brief and our AI will match you with the best consultant, complete with a tailored CV and cover letter.';
  const placeholder = data.placeholder || 'Paste the job description or assignment brief here...';
  const buttonText = data.buttonText || 'Find Match';

  const handleMatch = useCallback(async () => {
    if (!jobDescription.trim() || jobDescription.trim().length < 10) {
      toast({ title: 'Too short', description: 'Please provide a more detailed job description.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    setSelectedMatch(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-completion`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            messages: [{ role: 'user', content: jobDescription.trim() }],
            settings: {
              aiProvider: chatSettings?.aiProvider || 'openai',
              systemPrompt: MATCH_SYSTEM_PROMPT,
              toolCallingEnabled: true,
              allowGeneralKnowledge: false,
              includeContentAsContext: false,
            },
          }),
        }
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const fullContent = await consumeSSEStream(response);
      const jsonStr = fullContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const result = JSON.parse(jsonStr);

      if (result?.success && result.matches?.length > 0) {
        setMatches(result.matches);
        setSelectedMatch(result.matches[0]);
      } else {
        setMatches([]);
        toast({ title: 'No matches found', description: 'No consultants matched your requirements. Try a broader description.' });
      }
    } catch (err) {
      console.error('Match error:', err);
      toast({ title: 'Error', description: 'Failed to process your request. Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [jobDescription, chatSettings?.aiProvider, toast]);

  return (
    <section className="w-full py-16 md:py-24">
      <div className="container mx-auto px-4 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium">
            <FileUser className="w-4 h-4" />
            AI-Powered Matching
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-3">{title}</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">{subtitle}</p>
        </div>

        {/* Input */}
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
                  Analyzing...
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

        {/* Results */}
        {matches.length > 0 && (
          <div className="space-y-6">
            <div className="grid gap-3 md:grid-cols-3">
              {matches.map((match, i) => (
                <MatchCard
                  key={match.consultant_id}
                  match={match}
                  index={i}
                  isSelected={selectedMatch?.consultant_id === match.consultant_id}
                  onSelect={() => setSelectedMatch(match)}
                />
              ))}
            </div>

            {selectedMatch && <MatchDetail match={selectedMatch} />}
          </div>
        )}
      </div>
    </section>
  );
}
