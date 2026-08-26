import { Badge } from '@/components/ui/badge';
import { ArrowLeftRight, ArrowRight, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConnectionDirection, ConnectionTransport, FederationConnectionWithPeer } from '@/hooks/useFederationConnections';

const TRANSPORT_LABEL: Record<ConnectionTransport, string> = {
  a2a: 'A2A',
  openresponses: '/v1/responses',
  mcp: 'MCP',
};

const DIRECTION_ICON: Record<ConnectionDirection, typeof ArrowLeftRight> = {
  bidirectional: ArrowLeftRight,
  outbound: ArrowRight,
  inbound: ArrowLeft,
};

const DIRECTION_TONE: Record<ConnectionDirection, string> = {
  bidirectional: 'border-primary/40 text-primary bg-primary/5',
  outbound: 'border-emerald-500/40 text-success bg-emerald-500/5',
  inbound: 'border-blue-500/40 text-blue-600 dark:text-blue-400 bg-blue-500/5',
};

export function ConnectionBadge({
  direction,
  transport,
  className,
}: {
  direction: ConnectionDirection;
  transport: ConnectionTransport;
  className?: string;
}) {
  const Icon = DIRECTION_ICON[direction];
  return (
    <Badge
      variant="outline"
      className={cn('gap-1 font-mono text-[10px]', DIRECTION_TONE[direction], className)}
      title={`${direction} ${transport}`}
    >
      <Icon className="h-3 w-3" />
      {TRANSPORT_LABEL[transport]}
    </Badge>
  );
}

export function ConnectionBadges({
  connections,
}: {
  connections: Pick<FederationConnectionWithPeer, 'id' | 'direction' | 'transport'>[];
}) {
  if (!connections.length) {
    return (
      <Badge variant="outline" className="text-[10px] text-muted-foreground">
        no connections
      </Badge>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {connections.map(c => (
        <ConnectionBadge key={c.id} direction={c.direction} transport={c.transport} />
      ))}
    </div>
  );
}
