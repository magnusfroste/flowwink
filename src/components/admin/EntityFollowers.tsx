import { useEffect } from 'react';
import { Bell, BellOff, Users } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const sb = supabase as unknown as { from: (t: string) => any; auth: typeof supabase.auth };

interface Follower {
  id: string;
  user_id: string;
  reason: string | null;
  profile?: { display_name: string | null; email: string | null } | null;
}

export interface EntityFollowersProps {
  entityType: string;
  entityId: string;
  compact?: boolean;
}

const followersKey = (t: string, id: string) => ['entity-followers', t, id] as const;

export function EntityFollowers({ entityType, entityId, compact }: EntityFollowersProps) {
  const qc = useQueryClient();

  const { data: meId } = useQuery({
    queryKey: ['auth-uid'],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
    staleTime: Infinity,
  });

  const { data: followers = [] } = useQuery({
    queryKey: followersKey(entityType, entityId),
    queryFn: async () => {
      const { data, error } = await sb
        .from('entity_followers')
        .select('id, user_id, reason, profile:profiles(display_name, email)')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId);
      if (error) throw error;
      return (data ?? []) as Follower[];
    },
  });

  const isFollowing = !!followers.find((f) => f.user_id === meId);

  const follow = useMutation({
    mutationFn: async () => {
      if (!meId) return;
      const { error } = await sb
        .from('entity_followers')
        .insert({ entity_type: entityType, entity_id: entityId, user_id: meId });
      if (error && !`${error.message}`.includes('duplicate')) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: followersKey(entityType, entityId) }),
  });

  const unfollow = useMutation({
    mutationFn: async () => {
      if (!meId) return;
      const row = followers.find((f) => f.user_id === meId);
      if (!row) return;
      const { error } = await sb.from('entity_followers').delete().eq('id', row.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: followersKey(entityType, entityId) }),
  });

  // Auto-follow creator on mount (subtle Odoo-default)
  useEffect(() => {
    if (meId && followers.length === 0) {
      follow.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meId, entityId]);

  const initials = (s?: string | null) =>
    (s || '?').split(/\s+|@/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';

  return (
    <div className={`flex items-center gap-2 ${compact ? '' : 'py-1'}`}>
      <Users className="h-3.5 w-3.5 text-muted-foreground" />
      <div className="flex -space-x-2">
        {followers.slice(0, 5).map((f) => {
          const name = f.profile?.display_name || f.profile?.email || 'User';
          return (
            <Tooltip key={f.id}>
              <TooltipTrigger asChild>
                <Avatar className="h-6 w-6 border-2 border-background">
                  <AvatarFallback className="text-[10px]">{initials(name)}</AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent>{name}{f.reason ? ` · ${f.reason}` : ''}</TooltipContent>
            </Tooltip>
          );
        })}
        {followers.length > 5 && (
          <div className="h-6 w-6 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[10px] font-medium">
            +{followers.length - 5}
          </div>
        )}
      </div>
      <Button
        variant={isFollowing ? 'outline' : 'default'}
        size="sm"
        className="h-7 px-2 text-xs gap-1"
        onClick={() => (isFollowing ? unfollow.mutate() : follow.mutate())}
        disabled={!meId}
      >
        {isFollowing ? <BellOff className="h-3 w-3" /> : <Bell className="h-3 w-3" />}
        {isFollowing ? 'Following' : 'Follow'}
      </Button>
    </div>
  );
}
