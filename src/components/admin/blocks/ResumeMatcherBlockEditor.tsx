import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ArrowRight, FileUser, Star, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ResumeMatcherBlockData {
  title?: string;
  subtitle?: string;
  placeholder?: string;
  buttonText?: string;
}

interface ResumeMatcherBlockEditorProps {
  data: ResumeMatcherBlockData;
  onChange: (data: ResumeMatcherBlockData) => void;
  isEditing?: boolean;
}

const MOCK_MATCHES = [
  { name: 'Marcus Anderson', title: 'Cloud Architect', score: 97, skills: ['AWS', 'Terraform', 'Kubernetes'] },
  { name: 'Sofia Davis', title: 'Senior React Developer', score: 84, skills: ['React', 'TypeScript', 'Next.js'] },
  { name: 'Anna Chen', title: 'Data Engineer', score: 71, skills: ['Databricks', 'Spark', 'Python'] },
];

function ScoreBadge({ score }: { score: number }) {
  const cls = score >= 80
    ? 'text-green-700 bg-green-50 border-green-200'
    : score >= 60
    ? 'text-amber-700 bg-amber-50 border-amber-200'
    : 'text-muted-foreground bg-muted border-border';
  return (
    <span className={cn('text-xs font-bold px-2 py-0.5 rounded border', cls)}>
      {score}%
    </span>
  );
}

export function ResumeMatcherBlockEditor({ data, onChange, isEditing }: ResumeMatcherBlockEditorProps) {
  const handleChange = (key: keyof ResumeMatcherBlockData, value: string) => {
    onChange({ ...data, [key]: value });
  };

  // Preview mode — matches public ResumeMatcherBlock
  if (!isEditing) {
    const title = data.title || 'Find the Perfect Consultant';
    const subtitle = data.subtitle || 'Paste a job description and our AI will match you with the best consultant.';
    const placeholder = data.placeholder || 'Paste the job description or assignment brief here...';
    const buttonText = data.buttonText || 'Find Match';

    return (
      <section className="w-full py-12 md:py-16">
        <div className="container mx-auto px-4 max-w-4xl">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium">
              <FileUser className="w-4 h-4" />
              AI-Powered Matching
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">{title}</h2>
            <p className="text-muted-foreground text-sm max-w-2xl mx-auto">{subtitle}</p>
          </div>

          {/* Input area */}
          <div className="space-y-3 mb-8">
            <Textarea
              value=""
              readOnly
              placeholder={placeholder}
              rows={4}
              className="resize-none text-sm bg-muted/30 cursor-default"
            />
            <div className="flex justify-end">
              <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium cursor-default">
                {buttonText}
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Mock match results */}
          <div className="space-y-4">
            <p className="text-xs text-center text-muted-foreground italic">Preview: example AI match results</p>

            <div className="grid gap-3 md:grid-cols-3">
              {MOCK_MATCHES.map((match, i) => (
                <div
                  key={match.name}
                  className={cn(
                    'p-4 rounded-lg border bg-card transition-all',
                    i === 0 && 'ring-2 ring-primary shadow-md',
                  )}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        {i === 0 && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
                        <span className="font-semibold text-sm">{match.name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{match.title}</p>
                    </div>
                    <ScoreBadge score={match.score} />
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {match.skills.map(skill => (
                      <span key={skill} className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground border">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Selected match detail preview */}
            <div className="rounded-xl border overflow-hidden bg-card">
              <div className="bg-muted/50 border-b px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold">{MOCK_MATCHES[0].name}</p>
                  <p className="text-sm text-muted-foreground">{MOCK_MATCHES[0].title}</p>
                </div>
                <ScoreBadge score={MOCK_MATCHES[0].score} />
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Why This Match</p>
                  <p className="text-sm text-muted-foreground">Strong AWS expertise and proven track record leading cloud migrations at enterprise scale.</p>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-green-600" /> Matching Skills
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {['AWS', 'Terraform', 'Kubernetes', 'CI/CD'].map(s => (
                        <span key={s} className="text-xs px-2 py-0.5 rounded bg-muted border">{s}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                      <XCircle className="w-3 h-3 text-muted-foreground" /> Gaps
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {['GCP'].map(s => (
                        <span key={s} className="text-xs px-2 py-0.5 rounded border text-muted-foreground">{s}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // Edit mode
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Title</Label>
        <Input
          value={data.title || ''}
          onChange={(e) => handleChange('title', e.target.value)}
          placeholder="Find the Perfect Consultant"
        />
      </div>

      <div className="space-y-2">
        <Label>Subtitle</Label>
        <Input
          value={data.subtitle || ''}
          onChange={(e) => handleChange('subtitle', e.target.value)}
          placeholder="Paste a job description and our AI will match you with the best consultant."
        />
      </div>

      <div className="space-y-2">
        <Label>Textarea Placeholder</Label>
        <Input
          value={data.placeholder || ''}
          onChange={(e) => handleChange('placeholder', e.target.value)}
          placeholder="Paste the job description or assignment brief here..."
        />
      </div>

      <div className="space-y-2">
        <Label>Button Text</Label>
        <Input
          value={data.buttonText || ''}
          onChange={(e) => handleChange('buttonText', e.target.value)}
          placeholder="Find Match"
        />
      </div>
    </div>
  );
}
