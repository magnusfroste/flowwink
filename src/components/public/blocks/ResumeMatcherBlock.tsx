import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileUser, Star, ArrowRight, CheckCircle2, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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

export function ResumeMatcherBlock({ data }: ResumeMatcherBlockProps) {
  const [jobDescription, setJobDescription] = useState('');
  const [matches, setMatches] = useState<ConsultantMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<ConsultantMatch | null>(null);
  const { toast } = useToast();

  const title = data.title || 'Find the Perfect Consultant';
  const subtitle = data.subtitle || 'Paste a job description or assignment brief and our AI will match you with the best consultant, complete with a tailored CV and cover letter.';
  const placeholder = data.placeholder || 'Paste the job description or assignment brief here...';
  const buttonText = data.buttonText || 'Find Match';

  const handleMatch = async () => {
    if (!jobDescription.trim() || jobDescription.trim().length < 10) {
      toast({ title: 'Too short', description: 'Please provide a more detailed job description.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    setSelectedMatch(null);

    try {
      // Use publishable key directly — same pattern as chat-completion.
      // supabase.functions.invoke() sends the user JWT which fails for anonymous visitors.
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resume-match`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ job_description: jobDescription.trim(), max_results: 3 }),
        }
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();

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
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50 border-green-200';
    if (score >= 60) return 'text-amber-600 bg-amber-50 border-amber-200';
    return 'text-muted-foreground bg-muted border-border';
  };

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
            {/* Match cards */}
            <div className="grid gap-3 md:grid-cols-3">
              {matches.map((match, i) => (
                <Card
                  key={match.consultant_id}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    selectedMatch?.consultant_id === match.consultant_id
                      ? 'ring-2 ring-primary shadow-md'
                      : ''
                  }`}
                  onClick={() => setSelectedMatch(match)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          {i === 0 && <Star className="w-4 h-4 text-amber-500 fill-amber-500" />}
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
              ))}
            </div>

            {/* Selected match detail */}
            {selectedMatch && (
              <Card className="overflow-hidden">
                <CardHeader className="bg-muted/50 border-b">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-xl">{selectedMatch.name}</CardTitle>
                      {selectedMatch.title && (
                        <p className="text-muted-foreground mt-1">{selectedMatch.title}</p>
                      )}
                    </div>
                    <Badge className={`text-lg px-3 py-1 ${getScoreColor(selectedMatch.score)}`}>
                      {selectedMatch.score}% Match
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  {/* Reasoning */}
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Why This Match</h4>
                    <p className="text-foreground">{selectedMatch.reasoning}</p>
                  </div>

                  {/* Skills overview */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> Matching Skills
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedMatch.matching_skills.map(s => (
                          <Badge key={s} variant="secondary">{s}</Badge>
                        ))}
                      </div>
                    </div>
                    {selectedMatch.missing_skills.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                          <XCircle className="w-3.5 h-3.5 text-muted-foreground" /> Gaps
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedMatch.missing_skills.map(s => (
                            <Badge key={s} variant="outline" className="text-muted-foreground">{s}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Tailored summary */}
                  {selectedMatch.tailored_summary && (
                    <div>
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Tailored Summary</h4>
                      <div className="bg-muted/30 rounded-lg p-4 text-foreground whitespace-pre-wrap">
                        {selectedMatch.tailored_summary}
                      </div>
                    </div>
                  )}

                  {/* Cover letter */}
                  {selectedMatch.cover_letter && (
                    <div>
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Cover Letter</h4>
                      <div className="bg-background border rounded-lg p-6 text-foreground whitespace-pre-wrap leading-relaxed">
                        {selectedMatch.cover_letter}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
