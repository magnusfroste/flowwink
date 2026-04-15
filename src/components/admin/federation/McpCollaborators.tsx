import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Cpu, Clock, KeyRound, ShieldCheck, Copy } from 'lucide-react';
import { useApiKeys } from '@/hooks/useApiKeys';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

export function McpCollaborators() {
  const { data: allKeys, isLoading } = useApiKeys();

  // Filter to MCP-scoped keys only
  const mcpKeys = allKeys?.filter(k =>
    k.scopes?.some(s => s.startsWith('mcp:'))
  ) || [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (mcpKeys.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="pt-6 text-center">
          <Cpu className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            No MCP collaborators yet. Use <strong>Agent Invites</strong> to generate an invite prompt with an API key.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Cpu className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{mcpKeys.length}</p>
                <p className="text-sm text-muted-foreground">MCP collaborators</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                <Clock className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {mcpKeys.filter(k => k.last_used_at).length}
                </p>
                <p className="text-sm text-muted-foreground">active (used)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                <ShieldCheck className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {mcpKeys.filter(k => !k.expires_at || new Date(k.expires_at) > new Date()).length}
                </p>
                <p className="text-sm text-muted-foreground">valid keys</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Key list */}
      <div className="space-y-3">
        {mcpKeys.map(key => {
          const isExpired = key.expires_at && new Date(key.expires_at) < new Date();
          const missionMatch = key.name.match(/—\s*(.+)$/);
          const mission = missionMatch ? missionMatch[1] : null;
          const agentName = key.name.replace(/^MCP Agent:\s*/, '').replace(/\s*—.*$/, '');

          return (
            <Card key={key.id} className={isExpired ? 'opacity-60' : ''}>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Cpu className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{agentName || 'Unnamed Agent'}</p>
                        {mission && (
                          <Badge variant="secondary" className="text-[10px]">{mission}</Badge>
                        )}
                        {isExpired && (
                          <Badge variant="destructive" className="text-[10px]">Expired</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <KeyRound className="h-3 w-3" />
                          <code className="bg-muted px-1 rounded select-all">
                            {key.key_raw || `${key.key_prefix}...`}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 ml-0.5"
                            onClick={() => {
                              navigator.clipboard.writeText(key.key_raw || key.key_prefix);
                              toast.info(key.key_raw ? 'Full API key copied' : 'Key prefix copied — full key is only available at creation time');
                            }}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </span>
                        <span>
                          Created {formatDistanceToNow(new Date(key.created_at), { addSuffix: true })}
                        </span>
                        {key.last_used_at && (
                          <span className="text-foreground/70">
                            Last active {formatDistanceToNow(new Date(key.last_used_at), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {key.scopes?.map(scope => (
                      <Badge key={scope} variant="outline" className="text-[10px] font-mono">
                        {scope}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="bg-muted/30 border-dashed">
        <CardContent className="pt-5 pb-4">
          <p className="text-xs text-muted-foreground text-center">
            MCP keys are managed in <strong>Developer → MCP Keys</strong>. Use <strong>Agent Invites</strong> to create new collaborator invites with scoped access.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
