import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, CheckCircle2, CircleAlert, CircleSlash, Globe, Loader2, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { logger } from '@/lib/logger';
import type { WebCapability, WebProviderId } from '../../../../supabase/functions/_shared/web/order';
import { useWebLayer } from '@/hooks/useWebLayer';

const CAP_LABEL: Record<WebCapability, { title: string; hint: string }> = {
  search: { title: 'Search', hint: 'A question → web results. The chat, Flowwork, FlowPilot and research skills.' },
  read: { title: 'Reading a page', hint: 'A URL → the page as text. Company enrichment, research, page migration.' },
};

/**
 * Integrations → Web search & reading. FlowWink is search-agnostic: one web
 * layer (supabase/functions/_shared/web) answers every search and page read
 * from the providers here, in this order. What you set is what the chat,
 * Flowwork, FlowPilot and an agent over MCP use.
 */
export function WebLayerCard() {
  const qc = useQueryClient();
  const { formatDateTime } = usePlatformFormat();
  const { data, isLoading, isError } = useWebLayer();
  const [order, setOrder] = useState<Record<WebCapability, WebProviderId[]> | null>(null);
  useEffect(() => { if (data) setOrder({ search: data.search.order, read: data.read.order }); }, [data]);
  const builtin = data?.providers.find((p) => p.id === 'builtin');

  const save = useMutation({
    mutationFn: async (patch: { search_order?: WebProviderId[]; read_order?: WebProviderId[]; builtin_enabled?: boolean }) => {
      const { data: row, error: readErr } = await supabase.from('site_settings').select('value').eq('key', 'web_layer').maybeSingle();
      if (readErr) throw readErr;
      const value = { ...((row?.value as Record<string, unknown>) ?? {}), ...patch };
      const { error } = await supabase.from('site_settings').upsert({ key: 'web_layer', value: value as never }, { onConflict: 'key' });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Saved — the next search uses it'); qc.invalidateQueries({ queryKey: ['web-layer'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: async ({ cap, id }: { cap: WebCapability; id: WebProviderId }) => {
      const fn = cap === 'search' ? 'web-search' : 'web-scrape';
      const body = cap === 'search' ? { query: 'FlowWink open source business operating system', limit: 3, preferred_provider: id } : { url: 'https://example.com', preferred_provider: id, max_length: 2000 };
      const { data: res, error } = await supabase.functions.invoke(fn, { body });
      if (error) throw error;
      return res as { success?: boolean; provider?: string; results?: unknown[]; content?: string; attempts?: Array<{ error?: string }>; error?: string };
    },
    onSuccess: (res, v) => {
      const ok = v.cap === 'search' ? (res.results?.length ?? 0) > 0 : !!res.content;
      if (ok) toast.success(`${v.id}: answered${v.cap === 'search' ? ` with ${res.results?.length} results` : ` (${res.content?.length} characters)`}`);
      else toast.error(`${v.id}: ${res.attempts?.[0]?.error ?? res.error ?? 'no answer'}`);
      qc.invalidateQueries({ queryKey: ['web-layer'] });
    },
    onError: (e: Error, v) => { logger.error('[web-layer] test failed', e); toast.error(`${v.id}: ${e.message}`); },
  });

  const move = (cap: WebCapability, i: number, d: -1 | 1) => {
    if (!order) return;
    const list = [...order[cap]];
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setOrder({ ...order, [cap]: list });
    save.mutate(cap === 'search' ? { search_order: list } : { read_order: list });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Globe className="h-5 w-5 text-primary" /> Web search &amp; reading</CardTitle>
        <CardDescription>
          FlowWink is not tied to one search service. Every web search and page read — the chat, Flowwork, FlowPilot, research and enrichment,
          an agent over MCP — goes through the providers below, in this order; when one fails the next is tried, and one that just failed waits five minutes at the back.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading || !order ? (
          isError ? <p className="text-sm text-destructive">Could not read the web layer.</p> : <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {(['search', 'read'] as WebCapability[]).map((cap) => (
              <div key={cap} className="space-y-2">
                <div>
                  <div className="text-sm font-semibold">{CAP_LABEL[cap].title}</div>
                  <p className="text-xs text-muted-foreground">{CAP_LABEL[cap].hint}</p>
                </div>
                <ol className="space-y-1.5">
                  {order[cap].map((id, i) => {
                    const p = data?.providers.find((x) => x.id === id);
                    if (!p) return null;
                    const failing = !!p.last_error_at && (!p.last_ok_at || p.last_ok_at < p.last_error_at);
                    return (
                      <li key={id} className="flex items-start gap-2 rounded-md border border-border p-2">
                        <span className="mt-0.5 w-4 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                        {!p.available ? <CircleSlash className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-label="Not in use" />
                          : failing ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-label="Failing" />
                            : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label="In use" />}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                            {p.label}
                            {p.self_hosted && <Badge variant="outline" className="font-normal">self-hosted</Badge>}
                            {id === 'builtin' && <Badge variant="outline" className="font-normal">no key</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {!p.available ? p.reason
                              : failing ? `Failed ${formatDateTime(p.last_error_at!)}: ${p.last_error}`
                                : p.last_ok_at ? `Answered ${formatDateTime(p.last_ok_at)}` : 'Ready — not used yet'}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center">
                          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0 || save.isPending} onClick={() => move(cap, i, -1)} aria-label="Earlier"><ArrowUp className="h-3.5 w-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === order[cap].length - 1 || save.isPending} onClick={() => move(cap, i, 1)} aria-label="Later"><ArrowDown className="h-3.5 w-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!p.available || test.isPending} onClick={() => test.mutate({ cap, id })} aria-label={`Test ${p.label}`} title="Test this provider alone">
                            {test.isPending && test.variables?.id === id && test.variables?.cap === cap ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
                {cap === 'read' && builtin && (
                  <label className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                    <Switch checked={builtin.available} onCheckedChange={(v) => save.mutate({ builtin_enabled: v })} />
                    Built-in reader as a last resort — reads plain HTML without a service, but not pages that need JavaScript.
                  </label>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          A provider is set up on its own card below: SearXNG takes a URL, Firecrawl an API key (or the URL of a self-hosted Firecrawl), Jina works without a key and goes further with one.
          Brand analysis and page migration still need Firecrawl, the only provider that extracts colours, fonts and screenshots.
        </p>
      </CardContent>
    </Card>
  );
}
