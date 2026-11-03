import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { CreateUserDialog } from '@/components/admin/CreateUserDialog';
import { InviteColleagueDialog } from '@/components/admin/InviteColleagueDialog';
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
import { Shield, User, Settings2, Trash2, KeyRound, ShieldCheck, ShieldOff } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useSecuritySettings, useUpdateSecuritySettings } from '@/hooks/useSiteSettings';
import { isStaff } from '@/lib/mfa-gate';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { AppRole } from '@/types/cms';
import { ROLE_LABELS, ROLE_DESCRIPTIONS, FUNCTIONAL_ROLES } from '@/types/cms';
import type { Json } from '@/integrations/supabase/types';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';

interface UserWithRoles {
  id: string;
  email: string;
  full_name: string | null;
  roles: AppRole[];
  created_at: string;
}

// 'customer' is included ON PURPOSE: the signup trigger fails closed to
// customer for accounts born without metadata, so an admin upgrading such an
// account to a staff role needs a way to REMOVE customer afterwards. A role
// that can be held must be manageable — an unlisted role is an unremovable
// one, which is how a salesperson ended up permanently labeled "Customer".
const ASSIGNABLE_ROLES: AppRole[] = ['admin', ...FUNCTIONAL_ROLES, 'customer'];

export default function UsersPage() {
  const { formatDateTime } = usePlatformFormat();
  const { isAdmin, user: currentUser, mfa } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Who has enrolled — read through the admin RPC (auth.mfa_factors is not a
  // public table), and the instance's dial. The dial can only be turned on by
  // an admin who has enrolled: the person flipping it must not be the first
  // one it locks out.
  const { data: security } = useSecuritySettings();
  const updateSecurity = useUpdateSecuritySettings();
  const { data: mfaStatus } = useQuery({
    queryKey: ['admin-mfa-status'],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_mfa_status' as never);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<{ user_id: string; enrolled: boolean; factors: number; last_verified_at: string | null }>;
      return Object.fromEntries(rows.map((r) => [r.user_id, r]));
    },
  });
  const resetMfa = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.rpc('admin_reset_mfa' as never, { _user_id: userId } as never);
      if (error) throw error;
      return data as unknown as { factors_removed: number };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin-mfa-status'] });
      toast({ title: 'Authenticator reset', description: `${res?.factors_removed ?? 0} factor(s) removed — the person signs in with the password next time${security?.mfaRequiredForStaff ? ' and enrolls again at once' : ''}.` });
    },
    onError: (error: Error) => toast({ title: 'Could not reset', description: error.message, variant: 'destructive' }),
  });

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

  /**
   * The way back in for a colleague who has an account but cannot sign into it:
   * invited before the activation screen existed, or simply forgot. Re-inviting
   * does nothing — an existing user is granted the role and mailed nothing —
   * so without this an admin had no move at all.
   */
  const resetPassword = useMutation({
    mutationFn: async (email: string) => {
      const { data, error } = await supabase.functions.invoke('invite-colleague', {
        body: { action: 'reset_password', email },
      });
      if (error) throw new Error(error.message);
      const res = data as { status?: string; action_link?: string; mail_problem?: string; error?: string };
      if (res?.error) throw new Error(res.error);
      return res;
    },
    onSuccess: (res) => {
      if (res.status === 'reset_sent') {
        toast({ title: 'Password link sent', description: 'They can set a new password from the email.' });
      } else {
        // Honest: the link exists, the mail did not go. Hand it over rather
        // than claim a send that never happened.
        toast({
          title: 'Email not sent — pass the link on yourself',
          description: `${res.mail_problem ?? ''} ${res.action_link ?? ''}`.trim(),
        });
      }
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      // Client cannot delete auth users — the edge function holds the service
      // key and the guards (not self, not last admin, detach references).
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { user_id: userId },
      });
      if (error) throw new Error(error.message);
      if (!(data as { success?: boolean })?.success) {
        throw new Error((data as { error?: string })?.error ?? 'Deletion failed');
      }
      return data as { deleted_email: string };
    },
    onSuccess: (data) => {
      toast({ title: 'User deleted', description: data.deleted_email });
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
          <h1 className="font-serif text-2xl font-bold text-foreground mb-2">No Access</h1>
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
          <Button variant="outline" size="sm" asChild>
            <a href="/admin/users/login-activity">Login activity</a>
          </Button>
          <InviteColleagueDialog />
          <CreateUserDialog />
        </AdminPageHeader>


        {/* The dial. Off on a new instance (its first admin must get in); on, a
            staff session without a factor reads nothing until it enrolls —
            enforced in the database (session_mfa_ok), not only here. */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Two-factor authentication</CardTitle>
            <CardDescription>
              {(() => {
                const staff = (users ?? []).filter((u) => isStaff(u.roles ?? []));
                const enrolled = staff.filter((u) => mfaStatus?.[u.id]?.enrolled).length;
                return `${enrolled} of ${staff.length} staff accounts have an authenticator app enrolled. Each person enrolls their own under Profile → Two-factor authentication.`;
              })()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-3">
              <Switch
                id="mfa-required"
                checked={security?.mfaRequiredForStaff === true}
                disabled={updateSecurity.isPending || (!security?.mfaRequiredForStaff && mfa.verifiedFactors === 0)}
                onCheckedChange={(on) => updateSecurity.mutate({ ...(security ?? { mfaRequiredForStaff: false }), mfaRequiredForStaff: on })}
              />
              <div className="space-y-1">
                <Label htmlFor="mfa-required">Require two-factor authentication for all staff</Label>
                <p className="text-xs text-muted-foreground">
                  {security?.mfaRequiredForStaff
                    ? 'On. A staff member without an authenticator is asked to enroll at the next sign-in and can do nothing else until then; one who enrolled must enter the code. Customers in the portal are not affected.'
                    : mfa.verifiedFactors === 0
                      ? 'Enroll your own authenticator first (Profile → Two-factor authentication), so the switch cannot lock out the person who flips it.'
                      : 'Off. People may enroll on their own; nobody is required to.'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

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
                    <TableHead className="w-[70px]">MFA</TableHead>
                    <TableHead className="w-[140px]">Manage</TableHead>
                    <TableHead>Registered</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
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
                          {mfaStatus?.[user.id]?.enrolled ? (
                            <Badge variant="outline" className="text-xs gap-1"><ShieldCheck className="h-3 w-3 text-emerald-500" /> on</Badge>
                          ) : isStaff(user.roles ?? []) ? (
                            <span className={`text-xs ${security?.mfaRequiredForStaff ? 'text-amber-600' : 'text-muted-foreground'}`} title={security?.mfaRequiredForStaff ? 'Required — this person enrolls at the next sign-in' : 'Not enrolled'}>—</span>
                          ) : (
                            <span className="text-xs text-muted-foreground" title="Customers are not gated">n/a</span>
                          )}
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
                                    const checked = (user.roles ?? []).includes(r);
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
                          {formatDateTime(user.created_at, { hour: undefined, minute: undefined })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={resetPassword.isPending}
                            title="Send a link to set a new password"
                            onClick={() => resetPassword.mutate(user.email)}
                          >
                            <KeyRound className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          {mfaStatus?.[user.id]?.enrolled && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" disabled={resetMfa.isPending} title="Reset authenticator (lost phone)">
                                  <ShieldOff className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Reset the authenticator for {user.email}?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    For a person who lost the phone. Their enrolled factor is removed; the next sign-in takes the password alone{security?.mfaRequiredForStaff ? ' and then asks them to enroll again before anything else' : ''}. Confirm it is really them before you do this — it is the recovery path, and so the one an attacker would ask for.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => resetMfa.mutate(user.id)}>Reset authenticator</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={isSelf || deleteUser.isPending}
                                title={isSelf ? 'You cannot delete your own account' : 'Delete user'}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete {user.email}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  The account, its profile and roles are removed permanently.
                                  Business records the user touched (leads, tasks, posts) are
                                  kept — only the link to this person is cleared. The last
                                  admin cannot be deleted.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => deleteUser.mutate(user.id)}
                                >
                                  Delete user
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
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
