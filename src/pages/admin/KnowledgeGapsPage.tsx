import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, PenLine } from 'lucide-react';

import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { StatCardCompact } from '@/components/admin/StatCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useKnowledgeGaps, type ChatGap } from '@/hooks/useKnowledgeGaps';

/** What each state means, in the words a person writing articles needs. */
const STATE_COPY: Record<ChatGap['state'], { label: string; hint: string }> = {
  ungrounded: {
    label: 'No source',
    hint: 'The assistant answered without anything behind it. This is the queue that matters.',
  },
  unanswered: {
    label: 'No answer',
    hint: 'The visitor asked and the conversation ended before an answer was given.',
  },
  unknown: {
    label: 'Before receipts',
    hint: 'Answered before answers recorded their sources. Not evidence either way.',
  },
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function KnowledgeGapsPage() {
  const [days, setDays] = useState(14);
  const { data, isLoading, error } = useKnowledgeGaps(days);

  const chatGaps = data?.chat.gaps ?? [];
  // "No source" first: those are the ones an article actually closes.
  const ordered = [...chatGaps].sort((a, b) => {
    const rank = (g: ChatGap) => (g.state === 'ungrounded' ? 0 : g.state === 'unanswered' ? 1 : 2);
    return rank(a) - rank(b);
  });

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Unanswered questions"
          description="What visitors asked that the assistant had nothing for. Each one is an article waiting to be written."
        >
          <ToggleGroup
            type="single"
            value={String(days)}
            onValueChange={(v) => v && setDays(Number(v))}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="7">7 days</ToggleGroupItem>
            <ToggleGroupItem value="14">14 days</ToggleGroupItem>
            <ToggleGroupItem value="30">30 days</ToggleGroupItem>
          </ToggleGroup>
          <Button variant="outline" asChild>
            <Link to="/admin/knowledge-base">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Articles
            </Link>
          </Button>
        </AdminPageHeader>

        {error && (
          <Card className="mb-6 border-destructive">
            <CardContent className="pt-6 text-sm text-destructive">
              Could not read the report: {error instanceof Error ? error.message : String(error)}
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
          </div>
        ) : data ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            <StatCardCompact label="Questions asked" value={data.chat.questions} />
            <StatCardCompact label="Answered from a source" value={data.chat.grounded} variant="success" />
            <StatCardCompact label="No source" value={data.chat.ungrounded} variant="warning" />
            <StatCardCompact label="Email drafts needing a person" value={data.email.needs_person} />
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Questions to answer</CardTitle>
            <CardDescription>
              An assistant must not invent. When a question has no source, saying so is the right
              behaviour — and it is how you learn what to write. Writing the article turns the next
              visitor&rsquo;s answer into a grounded one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : ordered.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  Nothing unanswered in the last {days} days. Every question the assistant was asked
                  rested on something.
                </p>
              </div>
            ) : (
              <ul className="divide-y">
                {ordered.map((gap) => (
                  <li key={`${gap.conversation_id}-${gap.at}`} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium break-words">{gap.question}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant={gap.state === 'ungrounded' ? 'default' : 'secondary'}>
                              {STATE_COPY[gap.state]?.label ?? gap.state}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            {STATE_COPY[gap.state]?.hint}
                          </TooltipContent>
                        </Tooltip>
                        <span className="text-xs text-muted-foreground">{formatWhen(gap.at)}</span>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" asChild className="shrink-0">
                      {/* The visitor's own wording becomes the article's question —
                          a KB article is a question and an answer, so the loop
                          closes literally. */}
                      <Link to={`/admin/knowledge-base/new?question=${encodeURIComponent(gap.question)}`}>
                        <PenLine className="mr-2 h-4 w-4" />
                        Write article
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {data && data.kb.never_cited > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Articles no answer has used</CardTitle>
              <CardDescription>
                {data.kb.never_cited} of {data.kb.in_chat} chat-enabled articles were named by no
                answer in this window. Usually the article&rsquo;s question is phrased differently
                from how people ask it — a reason to rewrite the question, not to delete the article.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </AdminPageContainer>
    </AdminLayout>
  );
}
