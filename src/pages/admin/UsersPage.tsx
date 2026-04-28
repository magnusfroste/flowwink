import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { CreateUserDialog } from '@/components/admin/CreateUserDialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Shield, User, Settings2 } from 'lucide-react';
import type { AppRole } from '@/types/cms';
import { ROLE_LABELS, ROLE_DESCRIPTIONS, FUNCTIONAL_ROLES } from '@/types/cms';
import type { Json } from '@/integrations/supabase/types';

interface UserWithRoles {
  id: string;
  email: string;
  full_name: string | null;
  roles: AppRole[];
  created_at: string;
}

const ASSIGNABLE_ROLES: AppRole[] = ['admin', ...FUNCTIONAL_ROLES];

export default function UsersPage() {
  const { isAdmin, user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: users, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, full_name, created_at')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      const { data: roleRows, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      const roleMap = new Map<string, AppRole[]>();
      (roleRows ?? []).forEach(r => {
        const list = roleMap.get(r.user_id) ?? [];
        list.push(r.role as AppRole);
        roleMap.set(r.user_id, list);
      });

      return (profiles || []).map(p => ({
        ...p,
        roles: roleMap.get(p.id) ?? [],
      })) as UserWithRoles[];
    },
    enabled: isAdmin,
  });



  const toggleRole = useMutation({
    mutationFn: async ({ userId, role, enabled }: { userId: string; role: AppRole; enabled: boolean }) => {
      if (enabled) {
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role });
        if (error && !String(error.message).includes('duplicate')) throw error;
      } else {
        const { error } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', userId)
          .eq('role', role);
        if (error) throw error;
      }

      await supabase.from('audit_logs').insert({
        action: enabled ? 'grant_user_role' : 'revoke_user_role',
        entity_type: 'user',
        entity_id: userId,
        user_id: currentUser?.id,
        metadata: { role } as unknown as Json,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  if (!isAdmin) {
    return (
      <AdminLayout>
        <div className="text-center">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="font-serif text-2xl font-bold mb-2">No Access</h1>
          <p className="text-muted-foreground">Only administrators can manage users.</p>
        </div>
      </AdminLayout>
    );
  }

  const roleColors: Partial<Record<AppRole, string>> = {
    admin: 'bg-primary/20 text-primary border-primary/30',
    sales: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
    hr: 'bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-500/30',
    accounting: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    support: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
    warehouse: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
    marketing: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
    purchasing: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
    projects: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
    customer: 'bg-muted text-muted-foreground',
    writer: 'bg-muted text-muted-foreground',
    approver: 'bg-warning/20 text-warning-foreground',
  };

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader 
          title="Users"
          description="Assign one or more functional roles per user. Admins see everything regardless of other roles."
        >
          <CreateUserDialog />
        </AdminPageHeader>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif">All Users</CardTitle>
            <CardDescription>
              Click <strong>Manage roles</strong> to grant or revoke access to specific business modules.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : !users?.length ? (
              <p className="text-center py-8 text-muted-foreground">No users found</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead className="w-[140px]">Manage</TableHead>
                    <TableHead>Registered</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => {
                    const isSelf = user.id === currentUser?.id;
                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                              <User className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <span className="font-medium">{user.full_name || 'Unknown'}</span>
                            {isSelf && (
                              <Badge variant="outline" className="text-xs">You</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{user.email}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(user.roles ?? []).length === 0 ? (
                              <span className="text-xs text-muted-foreground italic">No roles</span>
                            ) : (
                              (user.roles ?? []).map(r => (
                                <Badge
                                  key={r}
                                  variant="outline"
                                  className={`text-xs ${roleColors[r] ?? ''}`}
                                >
                                  {ROLE_LABELS[r] ?? r}
                                </Badge>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isSelf || toggleRole.isPending}
                              >
                                <Settings2 className="h-3.5 w-3.5 mr-1.5" />
                                Manage roles
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80" align="end">
                              <div className="space-y-3">
                                <div>
                                  <h4 className="font-medium text-sm">Assign roles</h4>
                                  <p className="text-xs text-muted-foreground">
                                    A user can have multiple roles. Admin grants access to everything.
                                  </p>
                                </div>
                                <div className="space-y-2 max-h-[320px] overflow-y-auto">
                                  {ASSIGNABLE_ROLES.map(r => {
                                    const checked = user.roles.includes(r);
                                    return (
                                      <label
                                        key={r}
                                        className="flex items-start gap-2 p-2 rounded-md hover:bg-muted cursor-pointer"
                                      >
                                        <Checkbox
                                          checked={checked}
                                          disabled={toggleRole.isPending}
                                          onCheckedChange={(v) =>
                                            toggleRole.mutate({
                                              userId: user.id,
                                              role: r,
                                              enabled: Boolean(v),
                                            })
                                          }
                                        />
                                        <div className="flex-1 min-w-0">
                                          <div className="text-sm font-medium leading-none">
                                            {ROLE_LABELS[r]}
                                          </div>
                                          <div className="text-xs text-muted-foreground mt-1">
                                            {ROLE_DESCRIPTIONS[r]}
                                          </div>
                                        </div>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(user.created_at).toLocaleDateString('en-US')}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </AdminPageContainer>
    </AdminLayout>
  );
}
