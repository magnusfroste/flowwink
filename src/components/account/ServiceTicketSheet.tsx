/**
 * Raise a support ticket about a service — the contextual, two-field way.
 *
 * The customer describes the PROBLEM (subject + what's wrong); the system
 * supplies the CONTEXT. The subscription id, the customer's email and the
 * company are bound server-side in create_ticket_from_portal, from the caller's
 * own session — never from anything typed here. So the form asks only what the
 * system cannot know, which is the whole of a modern, elegant intake.
 */
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useUiText } from '@/lib/ui-text';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscriptionId: string;
  serviceName: string;
}

export function ServiceTicketSheet({ open, onOpenChange, subscriptionId, serviceName }: Props) {
  const t = useUiText();
  const qc = useQueryClient();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!subject.trim()) { toast.error(t('account.help.needSummary', 'Please add a short summary.')); return; }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('create_ticket_from_portal' as never, {
        p_subject: subject.trim(),
        p_description: description.trim() || null,
        p_subscription_id: subscriptionId,
      } as never);
      if (error) throw error;
      const num = (data as Array<{ ticket_no: string }> | null)?.[0]?.ticket_no;
      toast.success(num ? t('account.help.createdNumbered', 'Request {number} created').replace('{number}', String(num)) : t('account.help.created', 'Request created'));
      qc.invalidateQueries({ queryKey: ['my-tickets'] });
      setSubject(''); setDescription('');
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t('account.help.title', 'Get help')}</SheetTitle>
          <SheetDescription>
            {t('account.help.about', 'About your service:')} <span className="font-medium">{serviceName}</span>.{' '}
            {t('account.help.teamSees', 'Our team will see which service this concerns.')}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="t-subject">{t('account.help.issue', 'What is the issue?')}</Label>
            <Input
              id="t-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t('account.help.issueHint', 'e.g. No connection since this morning')}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="t-desc">{t('account.help.details', 'Details (optional)')}</Label>
            <Textarea
              id="t-desc"
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('account.help.detailsHint', 'Anything that helps us understand what is happening…')}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t('account.cancel', 'Cancel')}</Button>
            <Button onClick={submit} disabled={submitting || !subject.trim()}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('account.help.send', 'Send request')}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
