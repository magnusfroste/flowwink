import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowDownLeft, ArrowUpRight, AlertCircle, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { useA2AActivity, useA2APeers } from '@/hooks/useA2A';
import { formatDistanceToNow } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';

function extractMessageText(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const d = data as Record<string, unknown>;

  // Direct message field (outbound input)
  if (typeof d.message === 'string') return d.message;

  // JSON-RPC result with artifacts
  const result = (d.result ?? d) as Record<string, unknown>;
  const artifacts = (result.artifacts ?? []) as Array<Record<string, unknown>>;
  for (const artifact of artifacts) {
    const parts = (artifact.parts ?? []) as Array<Record<string, unknown>>;
    for (const part of parts) {
      if ((part.kind === 'text' || part.type === 'text') && typeof part.text === 'string') {
        return part.text;
      }
    }
  }

  // Status message parts
  const status = result.status as Record<string, unknown> | undefined;
  if (status?.message) {
    const msg = status.message as Record<string, unknown>;
    const parts = (msg.parts ?? []) as Array<Record<string, unknown>>;
    for (const part of parts) {
      if (typeof part.text === 'string') return part.text;
    }
  }

  // Simple result string
  if (typeof (result as any).result === 'string') return (result as any).result;
  if (typeof d.raw === 'string') return d.raw;

  return '';
}

export function A2AActivityLog() {
  const { data: activity, isLoading } = useA2AActivity(50);
  const { data: peers } = useA2APeers();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'inbound' | 'outbound'>('all');

  const filtered = activity?.filter(a => filter === 'all' || a.direction === filter) ?? [];

  if (isLoading) return <Skeleton className="h-48" />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(['all', 'inbound', 'outbound'] as const).map(f => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? 'default' : 'ghost'}
              className="h-7 text-xs"
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f === 'inbound' ? '↙ Inbound' : '↗ Outbound'}
            </Button>
          ))}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs gap-1"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['a2a-activity'] })}
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </Button>
      </div>

      {!filtered.length ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            No activity to show
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {filtered.map(item => {
                const peer = peers?.find(p => p.id === item.peer_id);
                const isExpanded = expandedId === item.id;
                const inputText = extractMessageText(item.input);
                const outputText = extractMessageText(item.output);

                return (
                  <div key={item.id} className="group">
                    <button
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    >
                      <div className="shrink-0">
                        {item.direction === 'inbound' ? (
                          <ArrowDownLeft className="h-4 w-4 text-primary" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4 text-accent-foreground" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{peer?.name || 'Unknown'}</span>
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{item.skill_name || '—'}</code>
                        </div>
                        {inputText && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-md">
                            {item.direction === 'outbound' ? '→ ' : '← '}
                            {inputText.slice(0, 80)}{inputText.length > 80 ? '…' : ''}
                          </p>
                        )}
                        {item.error_message && (
                          <p className="text-xs text-destructive mt-0.5 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {item.error_message}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant={item.status === 'success' ? 'default' : item.status === 'error' ? 'destructive' : 'secondary'}
                          className="text-[10px]"
                        >
                          {item.status}
                        </Badge>
                        {item.duration_ms != null && (
                          <span className="text-[10px] text-muted-foreground tabular-nums">{item.duration_ms}ms</span>
                        )}
                        <span className="text-[10px] text-muted-foreground w-16 text-right">
                          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                        </span>
                        {isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 space-y-3 bg-muted/30">
                        {/* Sent */}
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-medium">
                            {item.direction === 'outbound' ? 'Sent' : 'Received'}
                          </p>
                          {inputText ? (
                            <p className="text-sm bg-background rounded p-2 border">{inputText}</p>
                          ) : (
                            <pre className="text-[11px] font-mono bg-background rounded p-2 border overflow-auto max-h-32 text-muted-foreground">
                              {JSON.stringify(item.input, null, 2)}
                            </pre>
                          )}
                        </div>

                        {/* Response */}
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-medium">
                            {item.direction === 'outbound' ? 'Response' : 'Our reply'}
                          </p>
                          {outputText ? (
                            <p className="text-sm bg-background rounded p-2 border">{outputText}</p>
                          ) : (
                            <pre className="text-[11px] font-mono bg-background rounded p-2 border overflow-auto max-h-32 text-muted-foreground">
                              {JSON.stringify(item.output, null, 2)}
                            </pre>
                          )}
                        </div>

                        {/* Meta */}
                        <div className="flex gap-4 text-[10px] text-muted-foreground">
                          <span>ID: {item.id.slice(0, 8)}</span>
                          <span>{new Date(item.created_at).toLocaleString()}</span>
                          {item.duration_ms != null && <span>{item.duration_ms}ms</span>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
