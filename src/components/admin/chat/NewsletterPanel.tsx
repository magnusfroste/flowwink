import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Loader2, Save, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { NewsletterEditor } from '@/components/admin/NewsletterEditor';
import DOMPurify from 'dompurify';

interface NewsletterRow { id: string; subject: string; content_html: string | null; status: string }

/**
 * A newsletter draft the assistant wrote, open beside the chat — the record,
 * edited in the same editor the Newsletter page uses (CTA buttons, callouts,
 * images). Saving is the person's write. Sending is NOT here: audience, test
 * send and schedule are a deliberate step on the Newsletter page.
 */
export function NewsletterPanel({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data: row, isLoading } = useQuery({
    queryKey: ['newsletter-artifact', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('newsletters').select('id, subject, content_html, status').eq('id', id).maybeSingle();
      if (error) throw error;
      return data as NewsletterRow | null;
    },
  });
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!row) return;
    setSubject(row.subject);
    setHtml(row.content_html ?? '');
    setDirty(false);
  }, [row?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <div className="p-4 text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading the newsletter…</div>;
  if (!row) return <div className="p-4 text-xs text-muted-foreground">The newsletter could not be found — it may have been deleted.</div>;

  const editable = row.status === 'draft' || row.status === 'scheduled';
  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('newsletters').update({ subject, content_html: html } as never).eq('id', row.id);
    setSaving(false);
    if (error) { toast.error(`Save failed: ${error.message}`); return; }
    setDirty(false);
    toast.success('Newsletter saved');
    qc.invalidateQueries({ queryKey: ['newsletter-artifact', id] });
    qc.invalidateQueries({ queryKey: ['newsletters'] });
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 pt-3 pb-2 space-y-2 border-b border-border/40 shrink-0">
        <Badge variant={editable ? 'secondary' : 'default'} className="text-[10px]">{row.status}</Badge>
        <Input value={subject} onChange={(e) => { setSubject(e.target.value); setDirty(true); }} disabled={!editable} className="h-8 text-sm font-medium" aria-label="Subject" />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {editable
          ? <NewsletterEditor content={html} onChange={(h) => { setHtml(h); setDirty(true); }} />
          : <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />}
      </div>
      <div className="border-t border-border/40 px-3 py-2 flex items-center gap-2 shrink-0">
        <span className="text-[11px] text-muted-foreground flex-1 min-w-0 truncate">
          {editable ? (dirty ? 'Unsaved changes' : 'Draft — nothing is sent from here') : 'Already sent — read only'}
        </span>
        {editable && (
          <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={save} disabled={!dirty || saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
          </Button>
        )}
        <Button asChild size="sm" className="h-7 gap-1 text-xs">
          <Link to="/admin/newsletter"><Send className="h-3.5 w-3.5" /> Send… <ExternalLink className="h-3 w-3" /></Link>
        </Button>
      </div>
    </div>
  );
}
