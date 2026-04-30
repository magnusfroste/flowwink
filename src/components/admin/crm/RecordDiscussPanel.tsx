import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, MessageSquare, Phone, Mail, Users, Loader2 } from 'lucide-react';
import { useLogActivity, type DiscussActivityType } from '@/hooks/useLogActivity';
import { UnifiedTimeline } from './UnifiedTimeline';

interface RecordDiscussPanelProps {
  leadId?: string;
  email?: string;
  /** Hide the timeline (e.g. when caller already renders one) */
  hideTimeline?: boolean;
}

const TABS: { value: DiscussActivityType; label: string; icon: React.ElementType; placeholder: string; needsSubject?: boolean }[] = [
  { value: 'note', label: 'Note', icon: MessageSquare, placeholder: 'Internal note — visible to your team only…' },
  { value: 'call', label: 'Call', icon: Phone, placeholder: 'What was discussed on the call?' },
  { value: 'email', label: 'Email', icon: Mail, placeholder: 'Email summary or content…', needsSubject: true },
  { value: 'meeting', label: 'Meeting', icon: Users, placeholder: 'Meeting notes, decisions, next steps…' },
];

/**
 * Discuss panel: kompakt aktivitets-composer + chronological feed.
 * Drop in på vilket lead/customer-record som helst.
 */
export function RecordDiscussPanel({ leadId, email, hideTimeline }: RecordDiscussPanelProps) {
  const [type, setType] = useState<DiscussActivityType>('note');
  const [body, setBody] = useState('');
  const [subject, setSubject] = useState('');
  const log = useLogActivity();

  const activeTab = TABS.find(t => t.value === type)!;

  const submit = () => {
    if (!body.trim()) return;
    log.mutate(
      {
        leadId,
        email,
        type,
        body: body.trim(),
        subject: activeTab.needsSubject ? subject.trim() || undefined : undefined,
      },
      {
        onSuccess: () => {
          setBody('');
          setSubject('');
        },
      }
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Log activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Tabs value={type} onValueChange={(v) => setType(v as DiscussActivityType)}>
            <TabsList className="h-9">
              {TABS.map(t => {
                const Icon = t.icon;
                return (
                  <TabsTrigger key={t.value} value={t.value} className="text-xs h-7">
                    <Icon className="h-3.5 w-3.5 mr-1.5" />
                    {t.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {TABS.map(t => (
              <TabsContent key={t.value} value={t.value} className="space-y-2 mt-3">
                {t.needsSubject && (
                  <Input
                    placeholder="Subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="text-sm"
                  />
                )}
                <Textarea
                  placeholder={t.placeholder}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={3}
                  className="text-sm resize-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                />
              </TabsContent>
            ))}
          </Tabs>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">⌘/Ctrl + Enter to send</p>
            <Button size="sm" onClick={submit} disabled={!body.trim() || log.isPending}>
              {log.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5 mr-1.5" />
              )}
              Log {activeTab.label.toLowerCase()}
            </Button>
          </div>
        </CardContent>
      </Card>

      {!hideTimeline && <UnifiedTimeline leadId={leadId} email={email} />}
    </div>
  );
}
