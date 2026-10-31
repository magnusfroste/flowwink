import { useState } from 'react';
import { MessageSquare, Star } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { useAddCandidateNote, useCandidateNotes } from '@/hooks/useRecruitment';

/** The team's notes and ratings — interview feedback and assessment results land here too. */
export function CandidateNotesCard({ applicationId }: { applicationId: string }) {
  const { data: notes = [] } = useCandidateNotes(applicationId);
  const add = useAddCandidateNote();
  const { formatDateTime } = usePlatformFormat();
  const [body, setBody] = useState('');
  const [rating, setRating] = useState<number | null>(null);

  const save = () => add.mutate(
    { application_id: applicationId, body: body.trim(), rating },
    { onSuccess: () => { setBody(''); setRating(null); } },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="h-4 w-4" /> Notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Your impression, a phone screen, a question for the next interview…" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setRating(rating === n ? null : n)} aria-label={`${n} of 5`}>
                  <Star className={cn('h-4 w-4', rating && n <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground')} />
                </button>
              ))}
            </div>
            <Button size="sm" onClick={save} disabled={!body.trim() || add.isPending}>Add note</Button>
          </div>
        </div>
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        ) : (
          <ul className="space-y-3">
            {notes.map((n) => (
              <li key={n.id} className="rounded-md border border-border p-3 text-sm">
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{formatDateTime(n.created_at)}</span>
                  {n.rating != null && <span className="flex items-center gap-0.5"><Star className="h-3 w-3 fill-yellow-400 text-yellow-400" /> {n.rating}/5</span>}
                </div>
                <p className="whitespace-pre-wrap">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
