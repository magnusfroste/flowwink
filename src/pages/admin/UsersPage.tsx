import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { CreateUserDialog } from '@/components/admin/CreateUserDialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Shield, User, CheckCircle } from 'lucide-react';
import type { AppRole } from '@/types/cms';
import { ROLE_LABELS } from '@/types/cms';
import type { Json } from '@/integrations/supabase/types';

interface UserWithRole {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  created_at: string;
}

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

      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      const roleMap = new Map(roles?.map(r => [r.user_id, r.role as AppRole]) || []);

      return (profiles || []).map(p => ({
        ...p,
        role: roleMap.get(p.id) || 'writer',
      })) as UserWithRole[];
    },
    enabled: isAdmin,
  });

  const updateRole = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: AppRole }) => {
      const { error } = await supabase
        .from('user_roles')
        .update({ role: newRole })
        .eq('user_id', userId);

      if (error) throw error;

      await supabase.from('audit_logs').insert({
        action: 'update_user_role',
        entity_type: 'user',
        entity_id: userId,
        user_id: currentUser?.id,
        metadata: { new_role: newRole } as unknown as Json,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: 'Roll uppdaterad', description: 'Användarens roll har ändrats.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Fel', description: error.message, variant: 'destructive' });
    },
  });

  if (!isAdmin) {
    return (
      <AdminLayout>
        <div className="text-center">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="font-serif text-2xl font-bold mb-2">Ingen åtkomst</h1>
          <p className="text-muted-foreground">Endast administratörer kan hantera användare.</p>
        </div>
      </AdminLayout>
    );
  }

  const roleColors: Record<AppRole, string> = {
    writer: 'bg-muted text-muted-foreground',
    approver: 'bg-warning/20 text-warning-foreground',
    admin: 'bg-primary/20 text-primary',
  };

  return (
    <AdminLayout>
      <div>
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="font-serif text-3xl font-bold text-foreground">Användare</h1>
            <p className="text-muted-foreground mt-1">Hantera användare och deras roller</p>
          </div>
          <CreateUserDialog />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif">Alla användare</CardTitle>
            <CardDescription>
              Ändra roller genom att välja i dropdown-menyn
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : !users?.length ? (
              <p className="text-center py-8 text-muted-foreground">Inga användare hittades</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Användare</TableHead>
                    <TableHead>E-post</TableHead>
                    <TableHead>Roll</TableHead>
                    <TableHead>Registrerad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                            <User className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <span className="font-medium">{user.full_name || 'Okänd'}</span>
                          {user.id === currentUser?.id && (
                            <Badge variant="outline" className="text-xs">Du</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{user.email}</TableCell>
                      <TableCell>
                        {user.id === currentUser?.id ? (
                          <Badge className={roleColors[user.role]}>{ROLE_LABELS[user.role]}</Badge>
                        ) : (
                          <Select
                            value={user.role}
                            onValueChange={(value: AppRole) => 
                              updateRole.mutate({ userId: user.id, newRole: value })
                            }
                            disabled={updateRole.isPending}
                          >
                            <SelectTrigger className="w-[140px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="writer">Skribent</SelectItem>
                              <SelectItem value="approver">Granskare</SelectItem>
                              <SelectItem value="admin">Administratör</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(user.created_at).toLocaleDateString('sv-SE')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
