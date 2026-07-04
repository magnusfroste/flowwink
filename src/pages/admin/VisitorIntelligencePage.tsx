/**
 * Visitor Intelligence — settings page
 * Manages the rules (session_count, url_visits, page_view_count, reawakening)
 * and notification email that the `score-visitor-intent` edge function reads
 * from `site_settings.visitor_intelligence_rules`.
 */
import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Trash2, Plus, Save, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type RuleType = 'session_count' | 'url_visits' | 'page_view_count' | 'reawakening';

interface Rule {
  id: string;
  name: string;
  type: RuleType;
  window_days?: number;
  threshold?: number;
  url_pattern?: string;
  silence_days?: number;
  score: number;
}

interface Notify {
  enabled: boolean;
  email: string;
  min_score?: number;
}

interface Config {
  enabled: boolean;
  rules: Rule[];
  notify?: Notify;
}

const DEFAULT_CONFIG: Config = {
  enabled: true,
  rules: [
    { id: 'return_visitor', name: 'Return visitor', type: 'session_count', window_days: 7, threshold: 3, score: 10 },
    { id: 'pricing_interest', name: 'Pricing interest', type: 'url_visits', url_pattern: '/pricing', window_days: 14, threshold: 2, score: 20 },
    { id: 'deep_engagement', name: 'Deep engagement', type: 'page_view_count', window_days: 30, threshold: 10, score: 15 },
    { id: 'reawakening', name: 'Reawakening', type: 'reawakening', silence_days: 14, score: 12 },
  ],
  notify: { enabled: false, email: '', min_score: 10 },
};

export default function VisitorIntelligencePage() {
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'visitor_intelligence_rules')
        .maybeSingle();
      if (data?.value) {
        const v = data.value as unknown as Config;
        setConfig({ ...DEFAULT_CONFIG, ...v, notify: { ...DEFAULT_CONFIG.notify!, ...(v.notify || {}) } });
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('site_settings')
      .upsert([{ key: 'visitor_intelligence_rules', value: config as unknown as Record<string, unknown> }], { onConflict: 'key' });
    setSaving(false);
    if (error) return toast.error('Save failed: ' + error.message);
    toast.success('Settings saved');
  };

  const runNow = async () => {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke('score-visitor-intent', { body: {} });
    setRunning(false);
    if (error) return toast.error('Run failed: ' + error.message);
    toast.success(`Evaluated ${(data as any)?.leads_evaluated ?? 0} leads, fired ${(data as any)?.signals_fired ?? 0} signals`);
  };

  const updateRule = (i: number, patch: Partial<Rule>) => {
    setConfig((c) => ({ ...c, rules: c.rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) }));
  };
  const deleteRule = (i: number) => setConfig((c) => ({ ...c, rules: c.rules.filter((_, idx) => idx !== i) }));
  const addRule = () => setConfig((c) => ({
    ...c,
    rules: [...c.rules, { id: `rule_${Date.now()}`, name: 'New rule', type: 'page_view_count', window_days: 7, threshold: 5, score: 5 }],
  }));

  if (loading) {
    return <AdminLayout><AdminPageContainer><div className="p-8 text-muted-foreground">Loading…</div></AdminPageContainer></AdminLayout>;
  }

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Visitor Intelligence"
          description="Rules that turn anonymous browsing into scored signals against identified leads."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={runNow} disabled={running}>
                <Play className="h-4 w-4 mr-2" />{running ? 'Running…' : 'Run now'}
              </Button>
              <Button onClick={save} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />{saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          }
        />

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Module</CardTitle></CardHeader>
            <CardContent className="flex items-center gap-3">
              <Switch checked={config.enabled} onCheckedChange={(v) => setConfig((c) => ({ ...c, enabled: v }))} />
              <div>
                <div className="font-medium">Scoring enabled</div>
                <div className="text-sm text-muted-foreground">When off, the cron job runs but fires no signals.</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Email notification</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Switch
                  checked={!!config.notify?.enabled}
                  onCheckedChange={(v) => setConfig((c) => ({ ...c, notify: { ...c.notify!, enabled: v } }))}
                />
                <div>
                  <div className="font-medium">Email me when a signal fires</div>
                  <div className="text-sm text-muted-foreground">Uses the platform email-send router (SMTP or Resend).</div>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Recipient email</Label>
                  <Input
                    type="email"
                    value={config.notify?.email || ''}
                    onChange={(e) => setConfig((c) => ({ ...c, notify: { ...c.notify!, email: e.target.value } }))}
                    placeholder="sales@company.com"
                  />
                </div>
                <div>
                  <Label>Min score to notify</Label>
                  <Input
                    type="number"
                    value={config.notify?.min_score ?? 0}
                    onChange={(e) => setConfig((c) => ({ ...c, notify: { ...c.notify!, min_score: Number(e.target.value) } }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Rules ({config.rules.length})</CardTitle>
              <Button size="sm" variant="outline" onClick={addRule}><Plus className="h-4 w-4 mr-1" />Add rule</Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {config.rules.map((rule, i) => (
                <div key={rule.id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Input className="max-w-xs font-medium" value={rule.name} onChange={(e) => updateRule(i, { name: e.target.value })} />
                    <Select value={rule.type} onValueChange={(v) => updateRule(i, { type: v as RuleType })}>
                      <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="session_count">Session count</SelectItem>
                        <SelectItem value="url_visits">URL visits</SelectItem>
                        <SelectItem value="page_view_count">Page view count</SelectItem>
                        <SelectItem value="reawakening">Reawakening</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="ml-auto flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground">Score</Label>
                      <Input type="number" className="w-20" value={rule.score} onChange={(e) => updateRule(i, { score: Number(e.target.value) })} />
                      <Button size="icon" variant="ghost" onClick={() => deleteRule(i)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  <Separator />
                  <div className="grid gap-3 sm:grid-cols-3">
                    {rule.type !== 'reawakening' && (
                      <>
                        <div>
                          <Label className="text-xs">Window (days)</Label>
                          <Input type="number" value={rule.window_days ?? ''} onChange={(e) => updateRule(i, { window_days: Number(e.target.value) })} />
                        </div>
                        <div>
                          <Label className="text-xs">Threshold</Label>
                          <Input type="number" value={rule.threshold ?? ''} onChange={(e) => updateRule(i, { threshold: Number(e.target.value) })} />
                        </div>
                      </>
                    )}
                    {rule.type === 'url_visits' && (
                      <div>
                        <Label className="text-xs">URL pattern (contains)</Label>
                        <Input value={rule.url_pattern ?? ''} onChange={(e) => updateRule(i, { url_pattern: e.target.value })} placeholder="/pricing" />
                      </div>
                    )}
                    {rule.type === 'reawakening' && (
                      <div>
                        <Label className="text-xs">Silence days</Label>
                        <Input type="number" value={rule.silence_days ?? ''} onChange={(e) => updateRule(i, { silence_days: Number(e.target.value) })} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {config.rules.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-8">No rules — click "Add rule" to create one.</div>
              )}
            </CardContent>
          </Card>
        </div>
      </AdminPageContainer>
    </AdminLayout>
  );
}
