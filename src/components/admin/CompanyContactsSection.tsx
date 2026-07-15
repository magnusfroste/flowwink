import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { UserPlus, Users, Trash2 } from 'lucide-react';
import { logger } from '@/lib/logger';

type Role = 'viewer' | 'buyer' | 'approver' | 'admin';
type Scope = 'company' | 'company_plus_subsidiaries';
type Status = 'active' | 'invited' | 'revoked';

interface CompanyContact {
  id: string;
  company_id: string;
  auth_user_id: string | null;
  contact_email: string | null;
  company_role: Role;
  visibility_scope: Scope;
  status: Status;
  created_at: string;
  updated_at: string;
}

const ROLE_OPTIONS: Role[] = ['viewer', 'buyer', 'approver', 'admin'];
const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: 'company', label: 'Company only' },
  { value: 'company_plus_subsidiaries', label: 'Company + subsidiaries' },
];

const STATUS_LABEL: Record<Status, string> = {
  active: 'Active',
  invited: 'Pending signup',
  revoked: 'Suspended',
};

const STATUS_VARIANT: Record<Status, 'default' | 'secondary' | 'outline'> = {
  active: 'default',
  invited: 'secondary',
  revoked: 'outline',
};

export function CompanyContactsSection({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data: contacts, isLoading } = useQuery({
    queryKey: ['company_contacts', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_contacts')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as CompanyContact[];
    },
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['company_contacts', companyId] });

  const invite = useMutation({
    mutationFn: async (input: { email: string; role: Role; scope: Scope }) => {
      const email = input.email.trim().toLowerCase();
      if (!email) throw new Error('Email required');

      // Look up existing auth user via profiles (id === auth.users.id)
      const { data: profile, error: pErr } = await supabase
        .from('profiles')
        .select('id')
        .ilike('email', email)
        .maybeSingle();
      if (pErr) throw pErr;

      const auth_user_id = profile?.id ?? null;

      const { error } = await supabase.from('company_contacts').insert({
        company_id: companyId,
        auth_user_id,
        contact_email: email,
        company_role: input.role,
        visibility_scope: input.scope,
        status: auth_user_id ? 'active' : 'invited',
      });
      if (error) throw error;
      return { linked: !!auth_user_id };
    },
    onSuccess: (res) => {
      toast.success(
        res.linked
          ? 'Contact linked to their account'
          : 'Contact added — will activate when they sign up',
      );
      setInviteOpen(false);
      invalidate();
    },
    onError: (e: Error) => {
      logger.error('invite company contact', e);
      toast.error(e.message || 'Could not add contact');
    },
  });

  const updateRow = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<CompanyContact> }) => {
      const { error } = await supabase
        .from('company_contacts')
        .update(patch)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Contact updated');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || 'Update failed'),
  });

  const removeRow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('company_contacts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Contact removed');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || 'Remove failed'),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Company Contacts ({contacts?.length ?? 0})
        </CardTitle>
        <InviteDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          onSubmit={(v) => invite.mutate(v)}
          submitting={invite.isPending}
        />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !contacts?.length ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>No portal contacts linked to this company</p>
            <p className="text-xs mt-1">
              Link a customer's login so they can see this company's orders in the portal.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{c.contact_email || '—'}</span>
                      {!c.auth_user_id && (
                        <span className="text-xs text-muted-foreground">Not signed up yet</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={c.company_role}
                      onValueChange={(v) =>
                        updateRow.mutate({ id: c.id, patch: { company_role: v as Role } })
                      }
                    >
                      <SelectTrigger className="h-8 w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map((r) => (
                          <SelectItem key={r} value={r} className="capitalize">
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.visibility_scope === 'company_plus_subsidiaries'
                      ? 'Company + subs'
                      : 'Company'}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={c.status}
                      onValueChange={(v) =>
                        updateRow.mutate({ id: c.id, patch: { status: v as Status } })
                      }
                    >
                      <SelectTrigger className="h-8 w-[150px]">
                        <SelectValue>
                          <Badge variant={STATUS_VARIANT[c.status]}>
                            {STATUS_LABEL[c.status]}
                          </Badge>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="revoked">Suspended</SelectItem>
                        {c.status === 'invited' && (
                          <SelectItem value="invited">Pending signup</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(c.created_at), 'd MMM yyyy')}
                  </TableCell>
                  <TableCell>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove company contact?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {c.contact_email} will lose portal access to this company's data.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => removeRow.mutate(c.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function InviteDialog({
  open,
  onOpenChange,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (v: { email: string; role: Role; scope: Scope }) => void;
  submitting: boolean;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [scope, setScope] = useState<Scope>('company');

  const reset = () => {
    setEmail('');
    setRole('viewer');
    setScope('company');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="h-4 w-4 mr-2" />
          Link contact
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link a portal contact</DialogTitle>
          <DialogDescription>
            Enter the customer's email. If they already have an account it will be linked
            immediately; otherwise it will activate when they sign up.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cc-email">Email</Label>
            <Input
              id="cc-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="buyer@customer.com"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r} className="capitalize">
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Visibility</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCOPE_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={submitting || !email.trim()}
            onClick={() => onSubmit({ email, role, scope })}
          >
            {submitting ? 'Linking…' : 'Link contact'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
