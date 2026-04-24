import { useFederationConnections } from '@/hooks/useFederationConnections';
import { ConnectionBadges } from './ConnectionBadges';

/** Inline strip showing all directional connections for a peer. */
export function PeerConnectionRow({ peerId }: { peerId: string }) {
  const { data: connections } = useFederationConnections(peerId);
  if (!connections || connections.length === 0) return null;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground/70 font-medium uppercase tracking-wider text-[10px]">
        Channels:
      </span>
      <ConnectionBadges connections={connections} />
    </div>
  );
}
