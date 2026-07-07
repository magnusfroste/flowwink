import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';

const STATUSES = ['lead', 'opportunity', 'customer'] as const;

interface BlastResult {
  dry_run: boolean;
  targeted: number;
  sent: number;
  excluded_unsubscribed: number;
  excluded_consent_revoked: number;
  sample?: Array<{ email: string; name: string | null }>;
  blast_id?: string;
}

/**
 * Bulk email to a lead segment (crm parity: bulk_email).
 * Same backend as the send_bulk_lead_email skill — dry-run preview first,
 * unsubscribe + consent exclusions applied server-side.
 */
export function BulkLeadEmailDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [statuses, setStatuses] = useState<string[]>(['lead', 'opportunity']);
  const [minScore, setMinScore] = useState('');
  const [preview, setPreview] = useState<BlastResult | null>(null);

  const run = useMutation({
    mutationFn: async (dryRun: boolean): Promise<BlastResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.rpc('send_bulk_lead_email' as any, {
        p_subject: subject,
        p_body_html: bodyHtml.split('\n').map((l) => `<p>${l}</p>`).join(''),
        p_statuses: statuses.length ? statuses : null,
        p_min_score: minScore ? Number(minScore) : null,
        p_dry_run: dryRun,
      });
      if (error) throw error;
      return data as unknown as BlastResult;
    },
    onSuccess: (data, dryRun) => {
      if (dryRun) {
        setPreview(data);
      } else {
        toast.success(`Sent to ${data.sent} recipients (${data.excluded_unsubscribed + data.excluded_consent_revoked} excluded)`);
        setPreview(null);
        onOpenChange(false);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleStatus = (s: string) =>
    setStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Bulk email to leads
          </DialogTitle>
          <DialogDescription>
            Unsubscribed contacts and revoked consents are excluded automatically. An unsubscribe
            link is appended to every email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="blast-subject">Subject</Label>
            <Input id="blast-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="blast-body">Message</Label>
            <Textarea
              id="blast-body"
              rows={6}
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              placeholder="Write your message (plain text, one paragraph per line)"
            />
          </div>
          <div className="flex items-center gap-4">
            {STATUSES.map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm capitalize">
                <Checkbox checked={statuses.includes(s)} onCheckedChange={() => toggleStatus(s)} />
                {s}
              </label>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <Label htmlFor="blast-min-score" className="text-sm whitespace-nowrap">Min score</Label>
              <Input
                id="blast-min-score"
                type="number"
                className="w-20"
                value={minScore}
                onChange={(e) => setMinScore(e.target.value)}
              />
            </div>
          </div>

          {preview && (
            <div className="rounded-md border p-3 text-sm space-y-1">
              <p>
                <strong>{preview.sent}</strong> will receive this email
                ({preview.targeted} targeted, {preview.excluded_unsubscribed} unsubscribed,{' '}
                {preview.excluded_consent_revoked} consent revoked)
              </p>
              {preview.sample && preview.sample.length > 0 && (
                <p className="text-xs text-muted-foreground truncate">
                  {preview.sample.map((s) => s.email).join(', ')}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={!subject || !bodyHtml || run.isPending}
            onClick={() => run.mutate(true)}
          >
            {run.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Preview audience
          </Button>
          <Button
            disabled={!preview || preview.sent === 0 || run.isPending}
            onClick={() => run.mutate(false)}
          >
            Send to {preview?.sent ?? 0}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
